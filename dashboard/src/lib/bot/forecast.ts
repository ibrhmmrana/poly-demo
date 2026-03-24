import { CITIES } from "./cities";
import type { Bracket, Forecast, Market } from "./types";

const OPENMETEO = "https://api.open-meteo.com/v1/forecast";

// Forecast standard-deviation widens with forecast horizon (empirical)
const STD_BY_HOURS: [number, number][] = [
  [6, 1.5], [12, 2.0], [24, 2.5], [36, 3.0], [48, 3.5], [72, 4.5],
];

function interpolateStd(hoursOut: number): number {
  if (hoursOut <= STD_BY_HOURS[0][0]) return STD_BY_HOURS[0][1];
  if (hoursOut >= STD_BY_HOURS[STD_BY_HOURS.length - 1][0])
    return STD_BY_HOURS[STD_BY_HOURS.length - 1][1];
  for (let i = 0; i < STD_BY_HOURS.length - 1; i++) {
    const [h0, s0] = STD_BY_HOURS[i];
    const [h1, s1] = STD_BY_HOURS[i + 1];
    if (hoursOut >= h0 && hoursOut <= h1) {
      const t = (hoursOut - h0) / (h1 - h0);
      return s0 + t * (s1 - s0);
    }
  }
  return 3.0;
}

// Abramowitz & Stegun approximation of the normal CDF, accurate to ~1e-7
function normalCDF(x: number): number {
  const a1 = 0.31938153, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const L = Math.abs(x);
  const k = 1.0 / (1.0 + 0.2316419 * L);
  const w =
    1.0 -
    (1.0 / Math.sqrt(2.0 * Math.PI)) *
      Math.exp(-L * L / 2.0) *
      (a1 * k + a2 * k ** 2 + a3 * k ** 3 + a4 * k ** 4 + a5 * k ** 5);
  return x < 0 ? 1.0 - w : w;
}

function bracketProb(
  bracket: Bracket,
  mu: number,
  sigma: number,
): number {
  if (sigma <= 0) return 0;
  if (bracket.low !== null && bracket.high !== null) {
    const lo = bracket.low === bracket.high ? bracket.low - 0.5 : bracket.low - 0.5;
    const hi = bracket.high + 0.5;
    return normalCDF((hi - mu) / sigma) - normalCDF((lo - mu) / sigma);
  }
  if (bracket.low !== null) {
    // "X or higher"
    return 1 - normalCDF((bracket.low - 0.5 - mu) / sigma);
  }
  if (bracket.high !== null) {
    // "X or lower"
    return normalCDF((bracket.high + 0.5 - mu) / sigma);
  }
  return 0;
}

function buildDistribution(
  pointForecast: number,
  rawHourly: number[],
  hoursOut: number,
  brackets: Bracket[],
): Record<string, number> {
  let sigma = interpolateStd(hoursOut);

  if (rawHourly.length >= 4) {
    const top4 = [...rawHourly].sort((a, b) => b - a).slice(0, 4);
    const spread = top4[0] - top4[top4.length - 1];
    sigma = Math.max(sigma, spread / 2);
  }

  const raw: Record<string, number> = {};
  let total = 0;
  for (const b of brackets) {
    const p = bracketProb(b, pointForecast, sigma);
    raw[b.label] = p;
    total += p;
  }

  if (total > 0) {
    for (const k of Object.keys(raw)) raw[k] /= total;
  }
  return raw;
}

async function fetchOpenMeteo(
  lat: number,
  lon: number,
  dateStr: string,
  tempUnit: "F" | "C",
): Promise<{ high: number; hourly: number[] } | null> {
  try {
    const url = new URL(OPENMETEO);
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("hourly", "temperature_2m");
    url.searchParams.set("start_date", dateStr);
    url.searchParams.set("end_date", dateStr);
    url.searchParams.set("timezone", "UTC");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();

    const temps: number[] = (data?.hourly?.temperature_2m ?? []).filter(
      (t: unknown) => t !== null && t !== undefined,
    );
    if (!temps.length) return null;

    const converted =
      tempUnit === "F" ? temps.map((t: number) => t * 9 / 5 + 32) : temps;

    return { high: Math.max(...converted), hourly: converted };
  } catch {
    return null;
  }
}

export async function getForecasts(
  markets: Market[],
): Promise<Map<string, Forecast>> {
  const cityDates = new Map<string, { citySlug: string; targetDate: string }>();
  for (const m of markets) {
    const key = `${m.citySlug}:${m.targetDate}`;
    if (!cityDates.has(key)) {
      cityDates.set(key, { citySlug: m.citySlug, targetDate: m.targetDate });
    }
  }

  const results = new Map<string, Forecast>();

  const entries = Array.from(cityDates.entries());
  const BATCH = 10;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const fetches = batch.map(async ([key, { citySlug, targetDate }]) => {
      const city = CITIES[citySlug];
      if (!city) return;
      const data = await fetchOpenMeteo(city.lat, city.lon, targetDate, city.tempUnit);
      if (!data) return;

      const hoursOut = Math.max(
        (new Date(targetDate).getTime() - Date.now()) / 3600000,
        1,
      );

      const matchingMarket = markets.find(
        (m) => m.citySlug === citySlug && m.targetDate === targetDate,
      );
      const brackets = matchingMarket?.brackets ?? [];

      const probabilities = buildDistribution(
        data.high,
        data.hourly,
        hoursOut,
        brackets,
      );

      results.set(key, {
        citySlug,
        targetDate,
        pointForecast: data.high,
        source: "openmeteo",
        probabilities,
        rawHourly: data.hourly,
        fetchedAt: new Date(),
      });
    });
    await Promise.all(fetches);
  }

  return results;
}
