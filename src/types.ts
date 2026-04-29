export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MiniMaxMcpConfig {
  apiKey?: string;
  apiHost?: string;
  basePath?: string;
  resourceMode?: "url" | "local";
  timeoutMs?: number;
  startupTimeoutMs?: number;
  /** Auto-shutdown the subprocess after this many ms of inactivity. 0 disables. */
  idleShutdownMs?: number;
  maxBytes?: number;
  maxLines?: number;
}

export interface WebSearchParams {
  query: string;
  numResults?: number;
  recencyDays?: number;
}

export interface UnderstandImageParams {
  imagePath: string;
  prompt?: string;
}

export const DEFAULT_CONFIG: Required<Omit<MiniMaxMcpConfig, "apiKey" | "basePath">> = {
  apiHost: "https://api.minimax.io",
  resourceMode: "url",
  timeoutMs: 60_000,
  startupTimeoutMs: 10_000,
  idleShutdownMs: 5 * 60_000,
  maxBytes: 51_200,
  maxLines: 2_000,
};
