// Crater Weather – business logic shared by the MCP server.
// The surfability scoring is ported 1:1 from index.html / surfseeker.js so the
// MCP tools return exactly what the map and popups show.

export type Sport = "windsurf" | "kitesurf" | "kitefoil" | "wingfoil";

export interface Threshold {
  good: [number, number];
  very: number;
  label: string;
}

export const SPORT_THRESHOLDS: Record<Sport, Threshold> = {
  windsurf: { good: [5, 6.9], very: 7, label: "Windsurf: good 5–6.9, very good ≥7 m/s" },
  kitesurf: { good: [6, 8.9], very: 9, label: "Kitesurf: good 6–8.9, very good ≥9 m/s" },
  kitefoil: { good: [3, 5.9], very: 6, label: "Kitefoil: good 3–5.9, very good ≥6 m/s" },
  wingfoil: { good: [4, 6.9], very: 7, label: "Wingfoil: good 4–6.9, very good ≥7 m/s" },
};

export const SPORTS = Object.keys(SPORT_THRESHOLDS) as Sport[];

export interface Spot {
  name: string;
  lat: number;
  lon: number;
  bestWindDir: number[];
  notes?: string;
  information?: string;
}

const SPOTS_URL =
  process.env.CRATER_SPOTS_URL ??
  "https://naapurinpojat.github.io/CraterWeather/spots.geojson";

// met.no requires an identifying User-Agent; requests without one get 403.
const USER_AGENT =
  process.env.MET_USER_AGENT ??
  "CraterWeatherMCP/1.0 (github.com/naapurinpojat/CraterWeather)";

// --- scoring (identical maths to the web app) -------------------------------

function angDistToSector(dir: number, a: number, b: number): number {
  const n = (x: number) => ((x % 360) + 360) % 360;
  dir = n(dir);
  a = n(a);
  b = n(b);
  const inside = a <= b ? dir >= a && dir <= b : dir >= a || dir <= b;
  if (inside) return 0;
  const d = (x: number, y: number) => {
    const t = Math.abs(x - y);
    return Math.min(t, 360 - t);
  };
  return Math.min(d(dir, a), d(dir, b));
}

/** Surfability 0..100 = direction × speed × gust. */
export function surfabilityScore(
  wind: number,
  gust: number,
  dir: number,
  bestDirs: number[],
  thr: Threshold,
): number {
  const lo = thr.good[0];
  const ideal = thr.very;

  let dScore = 0;
  if (bestDirs && bestDirs.length >= 2) {
    const margin = 45;
    const ev = (a: number, b: number) =>
      Math.max(0, 1 - angDistToSector(dir, a, b) / margin);
    dScore = ev(bestDirs[0], bestDirs[1]);
    if (bestDirs.length >= 4) dScore = Math.max(dScore, ev(bestDirs[2], bestDirs[3]));
  }

  let sScore: number;
  if (wind <= 0) sScore = 0;
  else if (wind < lo) sScore = 0.55 * (wind / lo);
  else if (wind < ideal) sScore = 0.55 + 0.45 * ((wind - lo) / (ideal - lo));
  else {
    const over = wind - ideal;
    sScore = Math.max(0.4, 1 - (over / (ideal * 1.5)) * 0.6);
  }

  const gap = Math.max(0, gust - wind);
  const gFactor = Math.max(0.6, 1 - Math.max(0, gap - 2) * 0.05);

  return Math.round(dScore * sScore * gFactor * 100);
}

// --- data loading (with light in-memory caching) ----------------------------

interface Cached<T> {
  value: T;
  at: number;
}

let spotsCache: Cached<Spot[]> | null = null;
const SPOTS_TTL = 10 * 60 * 1000;

export async function loadSpots(): Promise<Spot[]> {
  if (spotsCache && Date.now() - spotsCache.at < SPOTS_TTL) return spotsCache.value;
  const res = await fetch(SPOTS_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to load spots (${res.status}) from ${SPOTS_URL}`);
  const geo = (await res.json()) as { features?: any[] };
  const spots: Spot[] = (geo.features ?? [])
    .filter(
      (f) =>
        f.geometry?.type === "Point" && Array.isArray(f.properties?.best_wind_dir),
    )
    .map((f) => ({
      name: f.properties.name,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      bestWindDir: f.properties.best_wind_dir,
      notes: f.properties.notes,
      information: f.properties.information,
    }));
  spotsCache = { value: spots, at: Date.now() };
  return spots;
}

export function findSpot(spots: Spot[], query: string): Spot | undefined {
  const q = query.trim().toLowerCase();
  return (
    spots.find((s) => s.name.toLowerCase() === q) ??
    spots.find((s) => s.name.toLowerCase().includes(q))
  );
}

// --- forecast (met.no) with caching + required User-Agent -------------------

const forecastCache = new Map<string, Cached<any>>();
const FORECAST_TTL = 30 * 60 * 1000;

export async function fetchForecast(lat: number, lon: number): Promise<any> {
  // met.no asks clients to truncate coordinates to 4 decimals.
  const rlat = Number(lat.toFixed(4));
  const rlon = Number(lon.toFixed(4));
  const key = `${rlat},${rlon}`;
  const hit = forecastCache.get(key);
  if (hit && Date.now() - hit.at < FORECAST_TTL) return hit.value;

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${rlat}&lon=${rlon}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`met.no request failed (${res.status})`);
  const data = await res.json();
  forecastCache.set(key, { value: data, at: Date.now() });
  return data;
}

// --- per-spot scoring summary ----------------------------------------------

const round1 = (x: number) => Math.round(x * 10) / 10;

export function formatHelsinki(iso: string): string {
  return new Date(iso).toLocaleString("fi-FI", {
    timeZone: "Europe/Helsinki",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface HourScore {
  time: string;
  localTime: string;
  windMs: number;
  gustMs: number;
  dirDeg: number;
  tempC: number;
  score: number;
}

export interface SpotConditions {
  spot: string;
  sport: Sport;
  bestWindDir: number[];
  current: HourScore;
  best: HourScore | null;
  horizonHours: number;
}

function rowFrom(entry: any, bestDirs: number[], thr: Threshold): HourScore {
  const det = entry.data.instant.details;
  const wind = det.wind_speed;
  const gust =
    typeof det.wind_speed_of_gust === "number" ? det.wind_speed_of_gust : wind;
  const dir = det.wind_from_direction;
  return {
    time: entry.time,
    localTime: formatHelsinki(entry.time),
    windMs: round1(wind),
    gustMs: round1(gust),
    dirDeg: Math.round(dir),
    tempC: round1(det.air_temperature),
    score: surfabilityScore(wind, gust, dir, bestDirs, thr),
  };
}

export async function scoreSpot(
  spot: Spot,
  sport: Sport,
  horizonHours: number,
): Promise<SpotConditions> {
  const thr = SPORT_THRESHOLDS[sport];
  const data = await fetchForecast(spot.lat, spot.lon);
  const series: any[] = data.properties.timeseries ?? [];
  const cutoff = Date.now() + horizonHours * 3600 * 1000;

  const current = rowFrom(series[0], spot.bestWindDir, thr);
  let best: HourScore | null = null;
  for (const entry of series) {
    if (new Date(entry.time).getTime() > cutoff) break;
    const row = rowFrom(entry, spot.bestWindDir, thr);
    if (!best || row.score > best.score) best = row;
  }
  return { spot: spot.name, sport, bestWindDir: spot.bestWindDir, current, best, horizonHours };
}

export async function spotHourly(
  spot: Spot,
  sport: Sport,
  hours: number,
): Promise<HourScore[]> {
  const thr = SPORT_THRESHOLDS[sport];
  const data = await fetchForecast(spot.lat, spot.lon);
  const series: any[] = data.properties.timeseries ?? [];
  return series.slice(0, hours).map((e) => rowFrom(e, spot.bestWindDir, thr));
}
