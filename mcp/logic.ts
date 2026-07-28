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
  windsurf: {
    good: [5, 6.9],
    very: 7,
    label: "Windsurf: good 5–6.9, very good ≥7 m/s",
  },
  kitesurf: {
    good: [6, 8.9],
    very: 9,
    label: "Kitesurf: good 6–8.9, very good ≥9 m/s",
  },
  kitefoil: {
    good: [3, 5.9],
    very: 6,
    label: "Kitefoil: good 3–5.9, very good ≥6 m/s",
  },
  wingfoil: {
    good: [4, 6.9],
    very: 7,
    label: "Wingfoil: good 4–6.9, very good ≥7 m/s",
  },
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
    if (bestDirs.length >= 4)
      dScore = Math.max(dScore, ev(bestDirs[2], bestDirs[3]));
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
  if (spotsCache && Date.now() - spotsCache.at < SPOTS_TTL)
    return spotsCache.value;
  const res = await fetch(SPOTS_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok)
    throw new Error(`Failed to load spots (${res.status}) from ${SPOTS_URL}`);
  const geo = (await res.json()) as { features?: any[] };
  const spots: Spot[] = (geo.features ?? [])
    .filter(
      (f) =>
        f.geometry?.type === "Point" &&
        Array.isArray(f.properties?.best_wind_dir),
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

// --- forecast providers (ported 1:1 from index.html) ------------------------
// Every source is normalized to the same Hour shape so the scoring below never
// sees provider-specific JSON. "consensus" scores each model separately and
// takes the median, so model disagreement lowers the score.

export type ProviderId =
  | "metno"
  | "om:ecmwf_ifs025"
  | "om:dmi_harmonie_arome_europe"
  | "consensus";

interface ProviderConf {
  label: string;
  source: "metno" | "om";
  models?: string[];
  days?: number;
  consensus?: boolean;
}

// Open-Meteo model id -> short display name
const OM_MODELS: Record<string, string> = {
  metno_seamless: "Yr",
  ecmwf_ifs025: "ECMWF",
  dmi_harmonie_arome_europe: "Harmonie",
};

export const PROVIDERS: Record<ProviderId, ProviderConf> = {
  metno: { label: "Yr (met.no)", source: "metno" },
  "om:ecmwf_ifs025": {
    label: "ECMWF",
    source: "om",
    models: ["ecmwf_ifs025"],
    days: 7,
  },
  "om:dmi_harmonie_arome_europe": {
    // 2 km resolution but only reaches ~66 h ahead
    label: "Harmonie 2 km",
    source: "om",
    models: ["dmi_harmonie_arome_europe"],
    days: 3,
  },
  consensus: {
    label: "Consensus",
    source: "om",
    models: ["metno_seamless", "ecmwf_ifs025", "dmi_harmonie_arome_europe"],
    days: 7,
    consensus: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export interface Member {
  model: string;
  wind: number;
  gust: number | null;
  dir: number;
  temp: number | null;
}

export interface Hour {
  time: string;
  wind: number;
  gust: number | null;
  dir: number;
  temp: number | null;
  members: Member[] | null;
  spread: number | null;
}

export interface Forecast {
  hours: Hour[];
  models: string[];
  provider: ProviderId;
}

const median = (nums: number[]): number => {
  const a = [...nums].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
};

/** Mean of directions on the circle: 350° and 10° average to 0°, not 180°. */
function circularMean(degs: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  if (sx === 0 && sy === 0) return degs[0]!;
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
}

/** Drop past hours: met.no starts at "now", Open-Meteo at midnight UTC. */
function trimPast(hours: Hour[]): Hour[] {
  const cutoff = Date.now() - 3600 * 1000;
  const i = hours.findIndex((h) => new Date(h.time).getTime() >= cutoff);
  return i < 0 ? [] : hours.slice(i);
}

function combineMembers(
  time: string,
  members: Member[],
  consensus: boolean,
): Hour {
  if (members.length === 1) {
    const m = members[0]!;
    return {
      time,
      wind: m.wind,
      gust: m.gust,
      dir: m.dir,
      temp: m.temp,
      members: consensus ? members : null,
      spread: consensus ? 0 : null,
    };
  }
  const winds = members.map((m) => m.wind);
  const gusts = members
    .map((m) => m.gust)
    .filter((g): g is number => Number.isFinite(g as number));
  const temps = members
    .map((m) => m.temp)
    .filter((t): t is number => Number.isFinite(t as number));
  return {
    time,
    wind: median(winds),
    gust: gusts.length ? median(gusts) : null,
    dir: circularMean(members.map((m) => m.dir)),
    temp: temps.length ? median(temps) : null,
    members,
    spread: Math.max(...winds) - Math.min(...winds),
  };
}

function normalizeMetNo(data: any): Forecast {
  const series: any[] = data?.properties?.timeseries ?? [];
  const hours: Hour[] = [];
  for (const e of series) {
    const det = e?.data?.instant?.details;
    if (!det) continue;
    if (
      !Number.isFinite(det.wind_speed) ||
      !Number.isFinite(det.wind_from_direction)
    )
      continue;
    hours.push({
      time: e.time,
      wind: det.wind_speed,
      gust: Number.isFinite(det.wind_speed_of_gust)
        ? det.wind_speed_of_gust
        : null,
      dir: det.wind_from_direction,
      temp: Number.isFinite(det.air_temperature) ? det.air_temperature : null,
      members: null,
      spread: null,
    });
  }
  return { hours: trimPast(hours), models: ["Yr"], provider: "metno" };
}

function normalizeOpenMeteo(
  loc: any,
  models: string[],
  consensus: boolean,
  provider: ProviderId,
): Forecast {
  const h = loc?.hourly ?? {};
  const times: string[] = h.time ?? [];
  // Open-Meteo only suffixes variables with the model name when more than one
  // model is requested; with a single model the column is plain "wind_speed_10m".
  const at = (name: string, model: string, i: number) => {
    const col = h[`${name}_${model}`] ?? h[name];
    return col ? col[i] : undefined;
  };
  const hours: Hour[] = [];
  for (let i = 0; i < times.length; i++) {
    const members: Member[] = [];
    for (const m of models) {
      const wind = at("wind_speed_10m", m, i);
      const dir = at("wind_direction_10m", m, i);
      // null = this model does not reach this far (e.g. Harmonie past ~66 h)
      if (!Number.isFinite(wind) || !Number.isFinite(dir)) continue;
      const gust = at("wind_gusts_10m", m, i);
      const temp = at("temperature_2m", m, i);
      members.push({
        model: OM_MODELS[m] ?? m,
        wind,
        dir,
        gust: Number.isFinite(gust) ? gust : null,
        temp: Number.isFinite(temp) ? temp : null,
      });
    }
    if (!members.length) continue;
    // Open-Meteo times are UTC without the Z suffix ("2026-07-28T12:00")
    hours.push(combineMembers(`${times[i]}:00Z`, members, consensus));
  }
  return {
    hours: trimPast(hours),
    models: models.map((m) => OM_MODELS[m] ?? m),
    provider,
  };
}

const forecastCache = new Map<string, Cached<Forecast>>();
const FORECAST_TTL = 30 * 60 * 1000;

export async function fetchForecast(
  lat: number,
  lon: number,
  provider: ProviderId = "metno",
): Promise<Forecast> {
  // met.no asks clients to truncate coordinates to 4 decimals.
  const rlat = Number(lat.toFixed(4));
  const rlon = Number(lon.toFixed(4));
  const key = `${provider}|${rlat},${rlon}`;
  const hit = forecastCache.get(key);
  if (hit && Date.now() - hit.at < FORECAST_TTL) return hit.value;

  const conf = PROVIDERS[provider] ?? PROVIDERS.metno;
  let value: Forecast;

  if (conf.source === "metno") {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${rlat}&lon=${rlon}`;
    // met.no 403s without an identifying User-Agent.
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`met.no request failed (${res.status})`);
    value = normalizeMetNo(await res.json());
  } else {
    const models = conf.models!;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${rlat}&longitude=${rlon}` +
      `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m` +
      `&wind_speed_unit=ms&timezone=UTC&forecast_days=${conf.days}` +
      `&cell_selection=sea&models=${models.join(",")}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
    const data = await res.json();
    const loc = Array.isArray(data) ? data[0] : data;
    value = normalizeOpenMeteo(loc, models, !!conf.consensus, provider);
  }

  forecastCache.set(key, { value, at: Date.now() });
  return value;
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
  tempC: number | null;
  score: number;
  /** Consensus mode only: per-model wind (m/s), spread and agreement level. */
  models?: Record<string, number>;
  spreadMs?: number;
  agreement?: "ok" | "mid" | "low";
}

export interface SpotConditions {
  spot: string;
  sport: Sport;
  provider: ProviderId;
  models: string[];
  bestWindDir: number[];
  current: HourScore;
  best: HourScore | null;
  horizonHours: number;
}

// Model agreement, same thresholds as the web app.
const CONF_OK_MS = 1.5;
const CONF_MID_MS = 3;

/**
 * Score one normalized hour. In consensus mode every model is scored on its own
 * and the median is taken, so disagreement about direction counts too.
 */
export function hourScore(
  hour: Hour,
  bestDirs: number[],
  thr: Threshold,
): number {
  const g = (w: number, gu: number | null) =>
    Number.isFinite(gu as number) ? (gu as number) : w;
  if (hour.members && hour.members.length > 1) {
    return Math.round(
      median(
        hour.members.map((m) =>
          surfabilityScore(m.wind, g(m.wind, m.gust), m.dir, bestDirs, thr),
        ),
      ),
    );
  }
  return surfabilityScore(
    hour.wind,
    g(hour.wind, hour.gust),
    hour.dir,
    bestDirs,
    thr,
  );
}

function rowFrom(hour: Hour, bestDirs: number[], thr: Threshold): HourScore {
  const row: HourScore = {
    time: hour.time,
    localTime: formatHelsinki(hour.time),
    windMs: round1(hour.wind),
    gustMs: round1(
      Number.isFinite(hour.gust as number) ? (hour.gust as number) : hour.wind,
    ),
    dirDeg: Math.round(hour.dir),
    tempC: Number.isFinite(hour.temp as number)
      ? round1(hour.temp as number)
      : null,
    score: hourScore(hour, bestDirs, thr),
  };
  if (hour.members && hour.members.length > 1) {
    row.models = Object.fromEntries(
      hour.members.map((m) => [m.model, round1(m.wind)]),
    );
    row.spreadMs = round1(hour.spread as number);
    row.agreement =
      (hour.spread as number) <= CONF_OK_MS
        ? "ok"
        : (hour.spread as number) <= CONF_MID_MS
          ? "mid"
          : "low";
  }
  return row;
}

export async function scoreSpot(
  spot: Spot,
  sport: Sport,
  horizonHours: number,
  provider: ProviderId = "metno",
): Promise<SpotConditions> {
  const thr = SPORT_THRESHOLDS[sport];
  const forecast = await fetchForecast(spot.lat, spot.lon, provider);
  const hours = forecast.hours;
  if (!hours.length) throw new Error(`No forecast data for ${spot.name}`);
  const cutoff = Date.now() + horizonHours * 3600 * 1000;

  const current = rowFrom(hours[0]!, spot.bestWindDir, thr);
  let best: HourScore | null = null;
  for (const hour of hours) {
    if (new Date(hour.time).getTime() > cutoff) break;
    const row = rowFrom(hour, spot.bestWindDir, thr);
    if (!best || row.score > best.score) best = row;
  }
  return {
    spot: spot.name,
    sport,
    provider,
    models: forecast.models,
    bestWindDir: spot.bestWindDir,
    current,
    best,
    horizonHours,
  };
}

export async function spotHourly(
  spot: Spot,
  sport: Sport,
  hours: number,
  provider: ProviderId = "metno",
): Promise<HourScore[]> {
  const thr = SPORT_THRESHOLDS[sport];
  const forecast = await fetchForecast(spot.lat, spot.lon, provider);
  return forecast.hours
    .slice(0, hours)
    .map((h) => rowFrom(h, spot.bestWindDir, thr));
}
