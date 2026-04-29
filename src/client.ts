import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { DEFAULT_CONFIG } from "./types.js";
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  McpToolResult,
  MiniMaxMcpConfig,
  UnderstandImageParams,
  WebSearchParams,
} from "./types.js";

interface PendingRequest {
  resolve: (value: JsonRpcResponse) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
  abortHandler?: () => void;
  signal?: AbortSignal;
}

const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "pi-minimax-mcp", version: "2.0.0" };

/**
 * Persistent stdio MCP client for the MiniMax coding-plan MCP server.
 *
 * One subprocess is spawned and reused across calls. An idle timer reaps it;
 * the next call lazily restarts. Aborts cancel in-flight requests immediately.
 */
export class MiniMaxMcpClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: ReadlineInterface | null = null;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private connecting: Promise<void> | null = null;
  private toolsCache: Map<string, McpTool> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private readonly cfg: Required<Omit<MiniMaxMcpConfig, "apiKey" | "basePath">> & {
    apiKey?: string;
    basePath?: string;
  };

  constructor(config: MiniMaxMcpConfig) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureConnected();
    if (this.toolsCache) return [...this.toolsCache.values()];
    const res = await this.request("tools/list", {});
    if (res.error) throw new Error(`tools/list failed: ${res.error.message}`);
    const tools = ((res.result as { tools?: McpTool[] } | undefined)?.tools ?? []) as McpTool[];
    this.toolsCache = new Map(tools.map((t) => [t.name, t]));
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolResult> {
    await this.ensureConnected();
    const res = await this.request("tools/call", { name, arguments: args }, signal);
    if (res.error) throw new Error(`MCP tool '${name}' failed: ${res.error.message}`);
    return (res.result as McpToolResult) ?? { content: [] };
  }

  webSearch(params: WebSearchParams, signal?: AbortSignal): Promise<McpToolResult> {
    const args: Record<string, unknown> = { query: params.query };
    if (params.numResults != null) args.num_results = params.numResults;
    if (params.recencyDays != null) args.recency_days = params.recencyDays;
    return this.callTool("web_search", args, signal);
  }

  understandImage(params: UnderstandImageParams, signal?: AbortSignal): Promise<McpToolResult> {
    return this.callTool(
      "understand_image",
      {
        image_source: params.imagePath,
        prompt: params.prompt ?? "Describe this image in detail",
      },
      signal,
    );
  }

  /** Graceful shutdown. Resolves once the subprocess has exited. */
  async shutdown(): Promise<void> {
    this.clearIdleTimer();
    const proc = this.proc;
    if (!proc) return;
    this.failPending(new Error("Client shutting down"));
    return new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      try {
        proc.stdin.end();
      } catch {
        // ignore
      }
      proc.kill("SIGTERM");
      const force = setTimeout(() => {
        if (proc.exitCode == null && proc.signalCode == null) {
          try {
            proc.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
      }, 2_000);
      force.unref();
    });
  }

  /** Synchronous fire-and-forget shutdown; safe inside `process.on('exit')`. */
  disconnect(): void {
    this.clearIdleTimer();
    this.failPending(new Error("Client disconnected"));
    if (this.proc) {
      try {
        this.proc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    this.teardown();
  }

  private async ensureConnected(): Promise<void> {
    this.touch();
    if (this.proc && !this.proc.killed && this.proc.exitCode == null) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    if (!this.cfg.apiKey) {
      throw new Error(
        "MiniMax API key is required. Set MINIMAX_API_KEY or configure 'apiKey'. " +
          "Get one at https://platform.minimax.io/subscribe/coding-plan",
      );
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MINIMAX_API_KEY: this.cfg.apiKey,
      MINIMAX_API_HOST: this.cfg.apiHost,
      MINIMAX_API_RESOURCE_MODE: this.cfg.resourceMode,
    };
    if (this.cfg.basePath) env.MINIMAX_MCP_BASE_PATH = this.cfg.basePath;

    const proc = spawn("uvx", ["minimax-coding-plan-mcp", "-y"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    this.proc = proc;
    this.toolsCache = null;

    proc.on("error", (err) => this.failPending(err));
    proc.on("exit", () => {
      this.failPending(new Error("MCP subprocess exited"));
      this.teardown();
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      process.stderr.write(`[pi-minimax-mcp] ${chunk}`);
    });

    this.rl = createInterface({ input: proc.stdout });
    this.rl.on("line", (line) => this.handleLine(line));

    await this.initialize();
  }

  private async initialize(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const startupTimeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`MCP startup timeout after ${this.cfg.startupTimeoutMs}ms`)),
        this.cfg.startupTimeoutMs,
      );
      timer.unref();
    });
    try {
      const res = await Promise.race([
        this.request("initialize", {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: CLIENT_INFO,
        }),
        startupTimeout,
      ]);
      if (res.error) throw new Error(`MCP initialize failed: ${res.error.message}`);
      this.notify("notifications/initialized", {});
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private teardown(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.proc = null;
    this.toolsCache = null;
    this.clearIdleTimer();
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<JsonRpcResponse> {
    const proc = this.proc;
    if (!proc?.stdin.writable) return Promise.reject(new Error("MCP process not connected"));
    if (signal?.aborted) return Promise.reject(new Error("Aborted"));

    const id = ++this.requestId;
    const payload: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${this.cfg.timeoutMs}ms`));
      }, this.cfg.timeoutMs);
      timer.unref();

      const entry: PendingRequest = { resolve, reject, timer, signal };
      if (signal) {
        const onAbort = () => {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(new Error("Aborted"));
        };
        entry.abortHandler = onAbort;
        signal.addEventListener("abort", onAbort, { once: true });
      }
      this.pending.set(id, entry);
      this.touch();

      try {
        proc.stdin.write(`${JSON.stringify(payload)}\n`);
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        if (entry.abortHandler && signal) signal.removeEventListener("abort", entry.abortHandler);
        reject(err as Error);
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    const proc = this.proc;
    if (!proc?.stdin.writable) return;
    const payload: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(trimmed) as JsonRpcResponse;
    } catch {
      process.stderr.write(`[pi-minimax-mcp] non-JSON stdout: ${trimmed}\n`);
      return;
    }
    if (msg.id == null) return;
    const entry = this.pending.get(msg.id as number);
    if (!entry) return;
    this.pending.delete(msg.id as number);
    clearTimeout(entry.timer);
    if (entry.abortHandler && entry.signal) {
      entry.signal.removeEventListener("abort", entry.abortHandler);
    }
    entry.resolve(msg);
  }

  private failPending(err: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      if (entry.abortHandler && entry.signal) {
        entry.signal.removeEventListener("abort", entry.abortHandler);
      }
      entry.reject(err);
    }
    this.pending.clear();
  }

  private touch(): void {
    if (!this.cfg.idleShutdownMs) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) void this.shutdown();
    }, this.cfg.idleShutdownMs);
    this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
