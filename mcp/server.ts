#!/usr/bin/env bun
// Crater Weather MCP server (stdio).
// Exposes the app's surfability logic as tools: list spots, score a spot,
// rank spots by the best upcoming window, and per-hour forecast with scores.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  SPORTS,
  PROVIDER_IDS,
  loadSpots,
  findSpot,
  scoreSpot,
  spotHourly,
} from "./logic.ts";

const sportArg = z
  .enum(SPORTS as [string, ...string[]])
  .default("windsurf")
  .describe("Sport profile; sets the wind-speed thresholds used for scoring.");

const providerArg = z
  .enum(PROVIDER_IDS as [string, ...string[]])
  .default("metno")
  .describe(
    "Forecast source. 'metno' = Yr (~10 days), 'om:ecmwf_ifs025' = ECMWF, " +
      "'om:dmi_harmonie_arome_europe' = Harmonie 2 km (only ~66 h), " +
      "'consensus' = median of all three plus a model-agreement indicator.",
  );

const server = new McpServer({ name: "crater-weather", version: "1.0.0" });

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

server.tool(
  "list_spots",
  "List all Crater Weather surf spots (name, coordinates, optimal wind-direction sectors, notes).",
  {},
  async () => json(await loadSpots()),
);

server.tool(
  "spot_conditions",
  "Current and best-upcoming surfability for one spot: the current hour plus the best-scoring hour within the horizon.",
  {
    spot: z.string().describe("Spot name (full or partial, case-insensitive)."),
    sport: sportArg,
    provider: providerArg,
    horizonHours: z
      .number()
      .int()
      .positive()
      .max(240)
      .default(72)
      .describe("How far ahead to search for the best window."),
  },
  async ({ spot, sport, provider, horizonHours }) => {
    const found = findSpot(await loadSpots(), spot);
    if (!found) return fail(`No spot matching "${spot}". Try list_spots.`);
    return json(
      await scoreSpot(found, sport as any, horizonHours, provider as any),
    );
  },
);

server.tool(
  "rank_spots",
  "Rank all spots by their best upcoming surfability score for a sport — answers 'where is the best surf coming up?'",
  {
    sport: sportArg,
    provider: providerArg,
    horizonHours: z.number().int().positive().max(240).default(72),
    limit: z.number().int().positive().max(50).default(10),
    minScore: z
      .number()
      .int()
      .min(0)
      .max(100)
      .default(0)
      .describe("Only include spots whose best score is at least this."),
  },
  async ({ sport, provider, horizonHours, limit, minScore }) => {
    const spots = await loadSpots();
    const scored = await Promise.all(
      spots.map((s) =>
        scoreSpot(s, sport as any, horizonHours, provider as any).catch(
          () => null,
        ),
      ),
    );
    const ranked = scored
      .filter(
        (c): c is NonNullable<typeof c> =>
          !!c?.best && c.best.score >= minScore,
      )
      .sort((a, b) => b.best!.score - a.best!.score)
      .slice(0, limit)
      .map((c) => ({
        spot: c.spot,
        bestScore: c.best!.score,
        bestWhen: c.best!.localTime,
        bestWindMs: c.best!.windMs,
        bestGustMs: c.best!.gustMs,
        bestDirDeg: c.best!.dirDeg,
        currentScore: c.current.score,
        // consensus only
        agreement: c.best!.agreement,
        spreadMs: c.best!.spreadMs,
      }));
    return json({
      sport,
      provider,
      horizonHours,
      count: ranked.length,
      ranked,
    });
  },
);

server.tool(
  "spot_forecast",
  "Hourly forecast for a spot with a surfability score per hour.",
  {
    spot: z.string(),
    sport: sportArg,
    provider: providerArg,
    hours: z.number().int().positive().max(96).default(24),
  },
  async ({ spot, sport, provider, hours }) => {
    const found = findSpot(await loadSpots(), spot);
    if (!found) return fail(`No spot matching "${spot}". Try list_spots.`);
    return json({
      spot: found.name,
      sport,
      provider,
      hours,
      forecast: await spotHourly(found, sport as any, hours, provider as any),
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is reserved for the MCP protocol — log to stderr.
console.error("Crater Weather MCP server running on stdio");
