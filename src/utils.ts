import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpToolResult } from "./types.js";

export interface FormatOptions {
  maxBytes?: number;
  maxLines?: number;
  /** When true, spill the full output to a temp file if truncated. Defaults to true. */
  spillOnTruncate?: boolean;
}

export interface FormattedOutput {
  text: string;
  details: {
    truncated: boolean;
    totalLines: number;
    totalBytes: number;
    outputLines: number;
    outputBytes: number;
    tempFile?: string;
  };
}

const DEFAULT_MAX_BYTES = 51_200;
const DEFAULT_MAX_LINES = 2_000;

export function extractText(result: McpToolResult): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const text = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n\n");
  return text || JSON.stringify(result, null, 2);
}

/**
 * Truncate text from the head, keeping the tail. Combined byte + line caps.
 * If a temp file spill is requested and truncation occurs, the full output is
 * written and a marker is appended.
 */
export function truncateTail(
  text: string,
  options: FormatOptions = {},
): FormattedOutput {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const spill = options.spillOnTruncate !== false;

  const totalBytes = Buffer.byteLength(text, "utf-8");
  const totalLines = text.length === 0 ? 0 : text.split("\n").length;
  const overLines = totalLines > maxLines;
  const overBytes = totalBytes > maxBytes;

  if (!overLines && !overBytes) {
    return {
      text,
      details: {
        truncated: false,
        totalLines,
        totalBytes,
        outputLines: totalLines,
        outputBytes: totalBytes,
      },
    };
  }

  let kept = text;
  if (overLines) {
    kept = kept.split("\n").slice(-maxLines).join("\n");
  }
  if (Buffer.byteLength(kept, "utf-8") > maxBytes) {
    const buf = Buffer.from(kept, "utf-8").subarray(-maxBytes);
    let str = buf.toString("utf-8");
    const nl = str.indexOf("\n");
    if (nl > 0) str = str.slice(nl + 1);
    kept = str;
  }

  let tempFile: string | undefined;
  if (spill) {
    tempFile = writeTempFile(text);
    kept += `\n\n[Output truncated: showing tail. Full output: ${tempFile}]`;
  } else {
    kept += `\n\n[Output truncated: ${formatBytes(totalBytes)}, ${totalLines} lines]`;
  }

  return {
    text: kept,
    details: {
      truncated: true,
      totalLines,
      totalBytes,
      outputLines: kept.split("\n").length,
      outputBytes: Buffer.byteLength(kept, "utf-8"),
      tempFile,
    },
  };
}

export function formatToolOutput(result: McpToolResult, options: FormatOptions = {}): FormattedOutput {
  return truncateTail(extractText(result), options);
}

interface WebSearchOrganic {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
}

/**
 * Extract a compact markdown summary from a MiniMax web_search payload.
 * Falls back to the raw text if the payload isn't the expected shape.
 */
export function extractWebSearchText(result: McpToolResult): string {
  const raw = extractText(result);
  let parsed: { organic?: WebSearchOrganic[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const organic = Array.isArray(parsed.organic) ? parsed.organic : null;
  if (!organic || organic.length === 0) return raw;
  return organic
    .map((r, i) => {
      const title = r.title?.trim() || "(untitled)";
      const link = r.link?.trim() ?? "";
      const date = r.date?.trim();
      const snippet = r.snippet?.trim().replace(/\s+/g, " ") ?? "";
      const header = date ? `${i + 1}. ${title} — ${date}` : `${i + 1}. ${title}`;
      return [header, link, snippet].filter(Boolean).join("\n   ");
    })
    .join("\n\n");
}

export function formatWebSearchOutput(result: McpToolResult, options: FormatOptions = {}): FormattedOutput {
  return truncateTail(extractWebSearchText(result), options);
}

export function writeTempFile(content: string): string {
  const path = join(tmpdir(), `pi-minimax-mcp-${Date.now()}-${process.pid}.txt`);
  writeFileSync(path, content, "utf-8");
  return path;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
