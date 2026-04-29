---
name: minimax-mcp
description: MiniMax Web Search & Image Understanding MCP for Pi
author: Jay Jani
tags: [search, image, mcp, minimax]
---

# MiniMax MCP Skill

Web search and image understanding via MiniMax's Model Context Protocol.

## Tools

### web_search
Real-time web search for up-to-date information.

**Usage:**
```
Search for latest React server components documentation
```

### understand_image
Analyze and describe image content.

**Usage:**
```
What does this image show? [path/to/image.png]
```

## Setup

1. Get API key from https://platform.minimax.io/subscribe/coding-plan
2. Set environment variable:
   ```bash
   export MINIMAX_API_KEY="your-api-key"
   export MINIMAX_API_HOST="https://api.minimax.io"  # optional
   ```

## Configuration

Config file: `~/.pi/agent/extensions/minimax-mcp.json`

```json
{
  "apiKey": "your-api-key",
  "apiHost": "https://api.minimax.io",
  "basePath": "/tmp/minimax-output",
  "resourceMode": "url"
}
```

## CLI Usage

```bash
# Direct search
pi-minimax-mcp search "quantum computing latest breakthroughs"

# Image understanding
pi-minimax-mcp understand ./screenshot.png

# Interactive mode
pi-minimax-mcp interactive
```