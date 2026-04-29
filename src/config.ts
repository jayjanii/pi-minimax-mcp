import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG, type MiniMaxMcpConfig } from "./types.js";

const PROJECT_CONFIG = () => join(process.cwd(), ".pi", "extensions", "minimax-mcp.json");
const GLOBAL_CONFIG = () => join(homedir(), ".pi", "agent", "extensions", "minimax-mcp.json");

function expand(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

function readJson(path: string): Partial<MiniMaxMcpConfig> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Partial<MiniMaxMcpConfig>;
  } catch (err) {
    process.stderr.write(`[pi-minimax-mcp] failed to parse ${path}: ${(err as Error).message}\n`);
    return null;
  }
}

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve config from (in order of precedence): explicit overrides, env vars,
 * project config file, global config file, built-in defaults.
 */
export function loadConfig(customPath?: string, overrides: Partial<MiniMaxMcpConfig> = {}): MiniMaxMcpConfig {
  const fileConfig: Partial<MiniMaxMcpConfig> =
    (customPath ? readJson(expand(customPath)) : null) ??
    readJson(PROJECT_CONFIG()) ??
    readJson(GLOBAL_CONFIG()) ??
    {};

  const env: Partial<MiniMaxMcpConfig> = {
    apiKey: process.env.MINIMAX_API_KEY,
    apiHost: process.env.MINIMAX_API_HOST,
    basePath: process.env.MINIMAX_MCP_BASE_PATH,
    resourceMode: process.env.MINIMAX_API_RESOURCE_MODE as "url" | "local" | undefined,
    timeoutMs: envInt("MINIMAX_MCP_TIMEOUT_MS"),
    startupTimeoutMs: envInt("MINIMAX_MCP_STARTUP_TIMEOUT_MS"),
    idleShutdownMs: envInt("MINIMAX_MCP_IDLE_SHUTDOWN_MS"),
    maxBytes: envInt("MINIMAX_MCP_MAX_BYTES"),
    maxLines: envInt("MINIMAX_MCP_MAX_LINES"),
  };

  return mergeConfig(fileConfig, env, overrides);
}

/** Right-most wins; `undefined` is ignored at every layer. */
export function mergeConfig(...layers: Array<Partial<MiniMaxMcpConfig> | undefined>): MiniMaxMcpConfig {
  const out: MiniMaxMcpConfig = { ...DEFAULT_CONFIG };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export function validateConfig(config: MiniMaxMcpConfig): void {
  if (!config.apiKey) {
    throw new Error(
      "MiniMax API key is required. Set MINIMAX_API_KEY or add 'apiKey' to your config file. " +
        "Get one at https://platform.minimax.io/subscribe/coding-plan",
    );
  }
}

/** Write a default config file if none exists. Only call from explicit `init` flows. */
export function ensureDefaultConfig(): string {
  const path = GLOBAL_CONFIG();
  if (existsSync(path)) return path;
  mkdirSync(dirname(path), { recursive: true });
  const seed = {
    apiKey: null,
    apiHost: DEFAULT_CONFIG.apiHost,
    basePath: null,
    resourceMode: DEFAULT_CONFIG.resourceMode,
    timeoutMs: DEFAULT_CONFIG.timeoutMs,
    maxBytes: DEFAULT_CONFIG.maxBytes,
    maxLines: DEFAULT_CONFIG.maxLines,
  };
  writeFileSync(path, `${JSON.stringify(seed, null, 2)}\n`, "utf-8");
  return path;
}

export function redactConfig(config: MiniMaxMcpConfig): MiniMaxMcpConfig {
  return { ...config, apiKey: config.apiKey ? "***REDACTED***" : undefined };
}
