#!/usr/bin/env node
import { MiniMaxMcpClient } from "../dist/client.js";
import { ensureDefaultConfig, loadConfig, redactConfig, validateConfig } from "../dist/config.js";
import { formatToolOutput } from "../dist/utils.js";

const USAGE = `Usage: pi-minimax-mcp <command> [options]

Commands:
  search <query>      Web search
  understand <path>   Analyze image (path or URL)
  tools               List tools exposed by the MiniMax MCP server
  config              Show current configuration (redacted)
  init                Create default config file (~/.pi/agent/extensions/minimax-mcp.json)
  --help, -h          Show this help
  --version, -v       Show version

Options:
  --num-results N     Number of search results (1-10)
  --recency-days N    Limit search to recent N days
  --prompt "..."      Question to guide image analysis
  --config <path>     Use specific config file

Environment:
  MINIMAX_API_KEY (required), MINIMAX_API_HOST, MINIMAX_MCP_BASE_PATH,
  MINIMAX_API_RESOURCE_MODE (url|local), MINIMAX_MCP_TIMEOUT_MS,
  MINIMAX_MCP_MAX_BYTES, MINIMAX_MCP_MAX_LINES
`;

const VERSION = "2.0.0";

/**
 * Minimal arg parser: collects --flag <value> pairs (booleans for trailing
 * flags), the rest is positional. Supports --flag=value too.
 */
function parseArgs(argv) {
  const command = argv[0];
  const options = {};
  const positional = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    let key, value;
    if (eq !== -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }
    options[key.replace(/-/g, "")] = value;
  }
  return { command, options, positional };
}

function intOpt(opts, ...names) {
  for (const n of names) {
    if (opts[n] != null && opts[n] !== true) {
      const v = Number.parseInt(opts[n], 10);
      if (Number.isFinite(v)) return v;
    }
  }
  return undefined;
}

async function main() {
  const { command, options, positional } = parseArgs(process.argv.slice(2));

  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (command === "init") {
    const path = ensureDefaultConfig();
    process.stdout.write(`Config at ${path}\n`);
    return 0;
  }

  const config = loadConfig(options.config);

  if (command === "config") {
    process.stdout.write(`${JSON.stringify(redactConfig(config), null, 2)}\n`);
    return 0;
  }

  try {
    validateConfig(config);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }

  const client = new MiniMaxMcpClient(config);
  const ctrl = new AbortController();
  const onSig = () => ctrl.abort();
  process.once("SIGINT", onSig);
  process.once("SIGTERM", onSig);

  try {
    if (command === "tools") {
      const tools = await client.listTools();
      for (const t of tools) {
        process.stdout.write(`${t.name}\t${t.description ?? ""}\n`);
      }
      return 0;
    }

    if (command === "search") {
      const query = positional[0];
      if (!query) {
        process.stderr.write("Error: search query required\n");
        return 1;
      }
      const result = await client.webSearch(
        {
          query,
          numResults: intOpt(options, "numresults"),
          recencyDays: intOpt(options, "recencydays"),
        },
        ctrl.signal,
      );
      const out = formatToolOutput(result, { maxBytes: config.maxBytes, maxLines: config.maxLines });
      process.stdout.write(`${out.text}\n`);
      if (out.details.tempFile) process.stderr.write(`[full output: ${out.details.tempFile}]\n`);
      return result.isError ? 2 : 0;
    }

    if (command === "understand" || command === "image") {
      const imagePath = positional[0];
      if (!imagePath) {
        process.stderr.write("Error: image path required\n");
        return 1;
      }
      const result = await client.understandImage(
        { imagePath, prompt: typeof options.prompt === "string" ? options.prompt : undefined },
        ctrl.signal,
      );
      const out = formatToolOutput(result, { maxBytes: config.maxBytes, maxLines: config.maxLines });
      process.stdout.write(`${out.text}\n`);
      if (out.details.tempFile) process.stderr.write(`[full output: ${out.details.tempFile}]\n`);
      return result.isError ? 2 : 0;
    }

    process.stderr.write(`Unknown command: ${command}\n${USAGE}`);
    return 1;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  } finally {
    process.removeListener("SIGINT", onSig);
    process.removeListener("SIGTERM", onSig);
    await client.shutdown();
  }
}

main().then((code) => process.exit(code ?? 0));
