# Crater Weather MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes Crater Weather's surfability logic as tools an LLM can call. It reuses
the exact scoring from the web app (`mcp/logic.ts` is ported from
`index.html` / `surfseeker.js`), pulls spots from the published
`spots.geojson`, and fetches live forecasts from met.no.

> GitHub Pages is static hosting and **cannot run an MCP server**. This runs
> locally (stdio transport); only the spot data is served from Pages.

## Tools

| Tool | What it does |
|------|--------------|
| `list_spots` | All spots: name, coordinates, optimal wind sectors, notes. |
| `spot_conditions` | Current + best-upcoming surfability for one spot. |
| `rank_spots` | Ranks every spot by best upcoming score — "where's the best surf coming up?" |
| `spot_forecast` | Hourly forecast for a spot with a score per hour. |

All scoring tools take a `sport` (`windsurf` \| `kitesurf` \| `kitefoil` \| `wingfoil`).

## Run / test

```bash
bun install
bun run mcp        # starts the stdio server (waits for an MCP client)
```

## Use with Claude Code

This repo ships a `.mcp.json`, so opening the project in Claude Code offers the
`crater-weather` server automatically. Or add it explicitly:

```bash
claude mcp add crater-weather -- bun run mcp/server.ts
```

## Use with Claude Desktop

Add to `claude_desktop_config.json` (use an absolute path):

```json
{
  "mcpServers": {
    "crater-weather": {
      "command": "bun",
      "args": ["run", "C:/Users/viida/dev/crater2/mcp/server.ts"]
    }
  }
}
```

## Configuration (env vars)

| Variable | Default | Purpose |
|----------|---------|---------|
| `CRATER_SPOTS_URL` | published `spots.geojson` on Pages | Where to load spots from (use a local path/URL for dev). |
| `MET_USER_AGENT` | `CraterWeatherMCP/1.0 (github.com/naapurinpojat/CraterWeather)` | Identifying User-Agent — **met.no returns 403 without one**. |

Spots are cached for 10 min and forecasts for 30 min to stay polite to met.no.
