# pi-minimax-mcp

Web search and image understanding for [Pi](https://github.com/mariozechner/pi) via MiniMax MCP.

## Quick Start

**1. Get a MiniMax API key** at [platform.minimax.io/subscribe/coding-plan](https://platform.minimax.io/subscribe/coding-plan)

**2. Install uvx** (required to run the MiniMax MCP server):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**3. Install the extension:**

```bash
pi install npm:@jayjanii/pi-minimax-mcp
```

**4. Set your API key:**

```bash
export MINIMAX_API_KEY="your-api-key"
```

That's it. Start Pi and the `web_search` and `understand_image` tools are available automatically.

## Usage in Pi

```
Search for the latest TypeScript release notes
```

```
What does this screenshot show? ./error.png
```

Dropping an image path (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) into the prompt attaches it automatically.

## CLI

```bash
# Web search
pi-minimax-mcp search "quantum computing breakthroughs"
pi-minimax-mcp search "Rust async patterns" --num-results 10 --recency-days 30

# Image analysis
pi-minimax-mcp understand ./diagram.png
pi-minimax-mcp understand ./chart.png --prompt "What trends does this show?"

# Utilities
pi-minimax-mcp config   # show active config (API key redacted)
pi-minimax-mcp init     # create default config file
pi-minimax-mcp tools    # list tools from the MiniMax MCP server
```

## Configuration

Priority order: **CLI flags > env vars > config file > defaults**

### Environment variables

| Variable | Required | Default |
|----------|----------|---------|
| `MINIMAX_API_KEY` | Yes | — |
| `MINIMAX_API_HOST` | No | `https://api.minimax.io` |
| `MINIMAX_MCP_BASE_PATH` | No | — |
| `MINIMAX_API_RESOURCE_MODE` | No | `url` |
| `MINIMAX_MCP_UV_PATH` | No | `uvx` |
| `MINIMAX_MCP_TIMEOUT_MS` | No | `60000` |
| `MINIMAX_MCP_MAX_BYTES` | No | `51200` |
| `MINIMAX_MCP_MAX_LINES` | No | `2000` |

### Config file

`~/.pi/agent/extensions/minimax-mcp.json` (global) or `.pi/extensions/minimax-mcp.json` (project):

```json
{
  "apiKey": "your-api-key",
  "apiHost": "https://api.minimax.io",
  "resourceMode": "url",
  "timeoutMs": 60000,
  "maxBytes": 51200,
  "maxLines": 2000
}
```

Run `pi-minimax-mcp init` to create this file automatically.

### Pi flags

```bash
pi --minimax-api-key=<key> --minimax-api-host=<host> --minimax-mcp-config=<path>
```

## Troubleshooting

**`uvx: command not found`**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# Restart your shell, then verify:
which uvx
```

If uvx is installed but not on PATH, point directly to it:
```bash
export MINIMAX_MCP_UV_PATH="$HOME/.local/bin/uvx"
```

**`MiniMax API key is required`**
```bash
export MINIMAX_API_KEY="your-key"
# or run: pi-minimax-mcp init  (then edit the generated file)
```

## Programmatic usage

```typescript
import { MiniMaxMcpClient } from "@jayjanii/pi-minimax-mcp";

const client = new MiniMaxMcpClient({ apiKey: process.env.MINIMAX_API_KEY! });

const search = await client.webSearch({ query: "TypeScript 5.5 features", numResults: 5 });
const image  = await client.understandImage({ imagePath: "./diagram.png", prompt: "Explain this" });

client.disconnect();
```

## License

MIT
