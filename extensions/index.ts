/**
 * MiniMax MCP Pi Extension
 *
 * Tools:
 *   - web_search: real-time web search
 *   - understand_image: image analysis
 *
 * The MCP subprocess is started lazily on first use and reused across all
 * subsequent calls. An idle timer reaps it; the next call relaunches.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { MiniMaxMcpClient } from "../dist/client.js";
import { loadConfig, mergeConfig, redactConfig, validateConfig } from "../dist/config.js";
import { formatToolOutput, formatWebSearchOutput } from "../dist/utils.js";
import type { MiniMaxMcpConfig } from "../dist/types.js";

const FLAGS = {
  apiKey: "--minimax-api-key",
  apiHost: "--minimax-api-host",
  config: "--minimax-mcp-config",
  maxBytes: "--minimax-mcp-max-bytes",
  maxLines: "--minimax-mcp-max-lines",
} as const;

export default function minimaxMcp(pi: ExtensionAPI) {
  pi.registerFlag(FLAGS.apiKey, { description: "MiniMax API key", type: "string" });
  pi.registerFlag(FLAGS.apiHost, { description: "MiniMax API host", type: "string" });
  pi.registerFlag(FLAGS.config, { description: "Path to JSON config file", type: "string" });
  pi.registerFlag(FLAGS.maxBytes, { description: "Max bytes of tool output", type: "string" });
  pi.registerFlag(FLAGS.maxLines, { description: "Max lines of tool output", type: "string" });

  let cachedClient: MiniMaxMcpClient | null = null;
  let cachedConfigKey = "";

  const flagStr = (name: string): string | undefined => {
    const v = pi.getFlag(name);
    return typeof v === "string" ? v : undefined;
  };
  const flagInt = (name: string): number | undefined => {
    const s = flagStr(name);
    if (!s) return undefined;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const resolveConfig = (): MiniMaxMcpConfig =>
    mergeConfig(loadConfig(flagStr(FLAGS.config)), {
      apiKey: flagStr(FLAGS.apiKey),
      apiHost: flagStr(FLAGS.apiHost),
      maxBytes: flagInt(FLAGS.maxBytes),
      maxLines: flagInt(FLAGS.maxLines),
    });

  const getClient = (config: MiniMaxMcpConfig): MiniMaxMcpClient => {
    // Re-create only if config materially changed (e.g. new key).
    const key = `${config.apiKey ?? ""}|${config.apiHost ?? ""}|${config.basePath ?? ""}|${config.resourceMode ?? ""}`;
    if (cachedClient && key === cachedConfigKey) return cachedClient;
    if (cachedClient) cachedClient.disconnect();
    cachedClient = new MiniMaxMcpClient(config);
    cachedConfigKey = key;
    return cachedClient;
  };

  const shutdown = () => {
    if (cachedClient) {
      cachedClient.disconnect();
      cachedClient = null;
    }
  };
  process.once("exit", shutdown);
  process.once("SIGINT", () => {
    shutdown();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    shutdown();
    process.exit(143);
  });

  const errorResult = (message: string) => ({
    content: [{ type: "text" as const, text: message }],
    isError: true,
  });

  const runTool = async <T>(
    label: string,
    params: T,
    onUpdate: ((u: unknown) => void) | undefined,
    signal: AbortSignal | undefined,
    invoke: (client: MiniMaxMcpClient, signal?: AbortSignal) => Promise<import("../dist/types.js").McpToolResult>,
    pendingMessage: string,
    format: typeof formatToolOutput = formatToolOutput,
  ) => {
    const config = resolveConfig();
    try {
      validateConfig(config);
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : `${label} configuration error`);
    }
    if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled" }] };

    onUpdate?.({
      content: [{ type: "text", text: pendingMessage }],
      details: { status: "pending" },
    });

    const client = getClient(config);
    try {
      const result = await invoke(client, signal);
      const formatted = format(result, {
        maxBytes: config.maxBytes,
        maxLines: config.maxLines,
      });
      return {
        content: [{ type: "text" as const, text: formatted.text }],
        details: { ...formatted.details, config: redactConfig(config) },
        isError: result.isError,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `MiniMax MCP error: ${message}` }],
        isError: true,
        details: { error: message, config: redactConfig(config) },
      };
    }
  };

  pi.registerTool({
    name: "web_search",
    label: "MiniMax Web Search",
    description: "Real-time web search via MiniMax. Best for current information, news, docs, and facts.",
    parameters: Type.Object(
      {
        query: Type.String({ description: "Search query" }),
        numResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, description: "Results to return (default 5)" })),
        recencyDays: Type.Optional(Type.Integer({ minimum: 1, description: "Limit to recent N days" })),
      },
      { additionalProperties: false },
    ),
    execute: (_id, params, signal, onUpdate, _ctx) =>
      runTool(
        "web_search",
        params,
        onUpdate,
        signal,
        (client, sig) =>
          client.webSearch(
            { query: params.query, numResults: params.numResults, recencyDays: params.recencyDays },
            sig,
          ),
        `Searching: "${params.query}"...`,
        formatWebSearchOutput,
      ),
  });

  pi.registerTool({
    name: "understand_image",
    label: "MiniMax Image Understanding",
    description: "Analyze and describe image content via MiniMax. Best for screenshots, diagrams, and photos.",
    parameters: Type.Object(
      {
        imagePath: Type.String({ description: "Path to image file (relative or absolute) or URL" }),
        prompt: Type.Optional(Type.String({ description: "Optional question to guide analysis" })),
      },
      { additionalProperties: false },
    ),
    execute: (_id, params, signal, onUpdate, _ctx) =>
      runTool(
        "understand_image",
        params,
        onUpdate,
        signal,
        (client, sig) => client.understandImage({ imagePath: params.imagePath, prompt: params.prompt }, sig),
        "Analyzing image...",
      ),
  });
}
