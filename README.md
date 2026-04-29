# pi-minimax-mcp

MiniMax MCP tools for [Pi](https://github.com/mariozechner/pi) - Web search and image understanding via MiniMax's Model Context Protocol.

[![Pi Extension](https://img.shields.io/badge/Pi-Extension-blue)](https://github.com/mariozechner/pi)
[![MiniMax](https://img.shields.io/badge/MiniMax-MCP-green)](https://platform.minimax.io)

## Features

- 🔍 **Web Search** - Real-time web search for current information
- 🖼️ **Image Understanding** - Analyze and describe image content
- ⚡ **Pi Native** - Works as Pi extension or standalone CLI
- 🔧 **Configurable** - Environment variables, config files, or CLI flags

## Prerequisites

1. **Get MiniMax API Key**
   - Visit [MiniMax Coding Plan](https://platform.minimax.io/subscribe/coding-plan)
   - Subscribe and get your API key

2. **Install uvx**
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

## Installation

### As Pi Extension

```bash
pi install npm:@jayjanii/pi-minimax-mcp
```

### As Standalone CLI

```bash
npm install -g @jayjanii/pi-minimax-mcp
# or
pnpm add -g @jayjanii/pi-minimax-mcp
```

## Configuration

### Environment Variables

```bash
export MINIMAX_API_KEY="your-api-key"
export MINIMAX_API_HOST="https://api.minimax.io"  # optional
export MINIMAX_MCP_BASE_PATH="/tmp/minimax"        # optional
export MINIMAX_API_RESOURCE_MODE="url"             # optional: url | local
```

### Config File

Create `~/.pi/agent/extensions/minimax-mcp.json`:

```json
{
  "apiKey": "your-api-key",
  "apiHost": "https://api.minimax.io",
  "basePath": "/tmp/minimax-output",
  "resourceMode": "url",
  "timeoutMs": 60000,
  "maxBytes": 51200,
  "maxLines": 2000
}
```

Or project-specific `.pi/extensions/minimax-mcp.json`.

## Usage

### In Pi

```
Search the web for "latest React server components"
```

```
What does this screenshot show? ./screenshot.png
```

### CLI

```bash
# Web search
pi-minimax-mcp search "quantum computing breakthroughs"
pi-minimax-mcp search "Rust async patterns" --num-results 10

# Image analysis
pi-minimax-mcp understand ./error.png
pi-minimax-mcp understand ./chart.png --prompt "What trends?"

# Configuration
pi-minimax-mcp config
pi-minimax-mcp init
```

### Programmatic

```typescript
import { MiniMaxMcpClient } from "@jayjanii/pi-minimax-mcp";

const client = new MiniMaxMcpClient({
  apiKey: process.env.MINIMAX_API_KEY!,
});

// Web search
const searchResults = await client.webSearch({
  query: "TypeScript 5.5 features",
  numResults: 5,
});

// Image understanding
const imageAnalysis = await client.understandImage({
  imagePath: "./diagram.png",
  prompt: "Explain this architecture",
});

client.disconnect();
```

## Pi Extension Flags

```bash
pi --minimax-api-key=<key> --minimax-api-host=<host>
```

| Flag | Description |
|------|-------------|
| `--minimax-api-key` | Override API key |
| `--minimax-api-host` | Override API host |
| `--minimax-mcp-config` | Custom config file path |
| `--minimax-mcp-max-bytes` | Max output bytes |
| `--minimax-mcp-max-lines` | Max output lines |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Pi Agent      │────▶│  pi-minimax-mcp  │────▶│  uvx minimax-   │
│   Extension     │◄────│   Extension      │◄────│  coding-plan-mcp│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                   ┌─────────┐
                                                   │ MiniMax │
                                                   │  API    │
                                                   └─────────┘
```

## Tools Reference

### `web_search`

Search the web for current information.

**Parameters:**
- `query` (string, required): Search query
- `numResults` (number, optional): Results to return (1-10, default: 5)
- `recencyDays` (number, optional): Limit to recent days

### `understand_image`

Analyze image content.

**Parameters:**
- `imagePath` (string, required): Path to image file
- `prompt` (string, optional): Guiding question/prompt

## Development

```bash
# Clone
git clone https://github.com/jayjanii/pi-minimax-mcp.git
cd pi-minimax-mcp

# Install dependencies
pnpm install

# Build
pnpm run build

# Test
pnpm test
```

## License

MIT

## Acknowledgments

- Inspired by [@benvargas/pi-exa-mcp](https://github.com/ben-vargas/pi-packages)
- Powered by [MiniMax](https://minimax.io)
