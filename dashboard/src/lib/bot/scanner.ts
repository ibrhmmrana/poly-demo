import { CITIES } from "./cities";
import type { Bracket, Market } from "./types";

const GAMMA_API = "https://gamma-api.polymarket.com";

const SLUG_RE =
  /highest-temperature-in-(?<city>[a-z-]+)-on-(?<month>[a-z]+)-(?<day>\d+)(?:-(?<year>\d{4}))?/;

const TITLE_RE =
  /Highest temperature in (?<city>.+?) on (?<date>.+?)\?/i;

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

const BRACKET_RANGE = /(\d+)-(\d+)/;
const BRACKET_SINGLE = /^(\d+)$/;
const BRACKET_ABOVE = /(\d+)\s*(?:or\s*(?:higher|above|more)|\+)/i;
const BRACKET_BELOW = /(\d+)\s*(?:or\s*(?:lower|below|less))/i;

interface GammaEvent {
  slug?: string;
  title?: string;
  negRiskRequestID?: string;
  markets?: GammaSubMarket[];
}

interface GammaSubMarket {
  conditionId?: string;
  active?: boolean;
  closed?: boolean;
  clobTokenIds?: string | string[];
  outcomePrices?: string | number[];
  groupItemTitle?: string;
  question?: string;
  endDate?: string;
}

function resolveCity(raw: string): string | null {
  const lower = raw.toLowerCase().replace(/-/g, " ").trim();
  for (const [slug, city] of Object.entries(CITIES)) {
    if (lower === slug || lower === city.name.toLowerCase() || city.name.toLowerCase().includes(lower)) {
      return slug;
    }
  }
  return null;
}

function parseBracket(
  label: string,
  tokenId: string,
  price: number,
): Bracket | null {
  const clean = label.trim();

  let m = BRACKET_ABOVE.exec(clean);
  if (m) return { tokenId, label: clean, low: +m[1], high: null, marketPrice: price };

  m = BRACKET_BELOW.exec(clean);
  if (m) return { tokenId, label: clean, low: null, high: +m[1], marketPrice: price };

  m = BRACKET_RANGE.exec(clean);
  if (m) return { tokenId, label: clean, low: +m[1], high: +m[2], marketPrice: price };

  m = BRACKET_SINGLE.exec(clean);
  if (m) return { tokenId, label: clean, low: +m[1], high: +m[1], marketPrice: price };

  const nums = clean.match(/\d+/g);
  if (nums?.length === 1) {
    return { tokenId, label: clean, low: +nums[0], high: +nums[0], marketPrice: price };
  }

  return null;
}

function extractCityDate(slug: string, title: string): { citySlug: string; targetDate: Date } | null {
  const sm = SLUG_RE.exec(slug);
  if (sm?.groups) {
    const rawCity = sm.groups.city.replace(/-/g, " ");
    const month = MONTH_MAP[sm.groups.month.toLowerCase()];
    const day = +sm.groups.day;
    const year = sm.groups.year ? +sm.groups.year : new Date().getFullYear();
    const citySlug = resolveCity(rawCity);
    if (citySlug && month) {
      return { citySlug, targetDate: new Date(year, month - 1, day) };
    }
  }

  const tm = TITLE_RE.exec(title);
  if (tm?.groups) {
    const citySlug = resolveCity(tm.groups.city);
    if (!citySlug) return null;
    const dateStr = tm.groups.date.replace("?", "").trim();
    const parsed = new Date(`${dateStr}, ${new Date().getFullYear()}`);
    if (!isNaN(parsed.getTime())) {
      return { citySlug, targetDate: parsed };
    }
  }

  return null;
}

function parseEvent(ev: GammaEvent): Market | null {
  const slug = ev.slug ?? "";
  const title = ev.title ?? "";
  const info = extractCityDate(slug, title);
  if (!info) return null;
  if (!CITIES[info.citySlug]) return null;

  const subMarkets = ev.markets ?? [];
  if (!subMarkets.length) return null;

  const brackets: Bracket[] = [];
  let firstConditionId = "";
  let endDate: string | null = null;

  for (const sm of subMarkets) {
    if (!sm.active || sm.closed) continue;
    if (!firstConditionId && sm.conditionId) firstConditionId = sm.conditionId;

    let tokenIds: string[] = [];
    try {
      tokenIds =
        typeof sm.clobTokenIds === "string"
          ? JSON.parse(sm.clobTokenIds)
          : sm.clobTokenIds ?? [];
    } catch { /* empty */ }

    const yesToken = tokenIds[0] ?? "";

    let prices: number[] = [];
    try {
      prices =
        typeof sm.outcomePrices === "string"
          ? JSON.parse(sm.outcomePrices)
          : sm.outcomePrices ?? [];
    } catch { /* empty */ }

    const yesPrice = prices[0] ? +prices[0] : 0;
    const label = sm.groupItemTitle || sm.question || "";
    const bracket = parseBracket(label, yesToken, yesPrice);
    if (bracket) brackets.push(bracket);

    if (!endDate && sm.endDate) endDate = sm.endDate;
  }

  if (!brackets.length || !firstConditionId) return null;

  const conditionId = ev.negRiskRequestID || firstConditionId;
  const ed = endDate ? new Date(endDate) : new Date(info.targetDate.getTime() + 86400000);
  const hoursToRes = Math.max((ed.getTime() - Date.now()) / 3600000, 0);

  return {
    conditionId,
    question: title,
    citySlug: info.citySlug,
    targetDate: info.targetDate.toISOString().slice(0, 10),
    endDate: ed.toISOString(),
    brackets,
    hoursToResolution: hoursToRes,
  };
}

async function fetchBySlug(slug: string): Promise<GammaEvent[]> {
  try {
    const res = await fetch(`${GAMMA_API}/events?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function discoverMarkets(
  minHours = 2,
  maxHours = 72,
): Promise<Market[]> {
  const now = new Date();
  const year = now.getFullYear();
  const slugs = new Set<string>();

  for (let d = 0; d < 5; d++) {
    const dt = new Date(now.getTime() + d * 86400000);
    const monthName = dt.toLocaleString("en-US", { month: "long" }).toLowerCase();
    const day = dt.getDate();
    for (const citySlug of Object.keys(CITIES)) {
      slugs.add(`highest-temperature-in-${citySlug}-on-${monthName}-${day}-${year}`);
    }
  }

  const BATCH = 15;
  const allEvents: GammaEvent[] = [];
  const slugArr = Array.from(slugs);

  for (let i = 0; i < slugArr.length; i += BATCH) {
    const batch = slugArr.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(fetchBySlug));
    for (const evts of results) allEvents.push(...evts);
  }

  const seen = new Set<string>();
  const markets: Market[] = [];
  for (const ev of allEvents) {
    const m = parseEvent(ev);
    if (!m) continue;
    if (seen.has(m.conditionId)) continue;
    seen.add(m.conditionId);
    if (m.hoursToResolution >= minHours && m.hoursToResolution <= maxHours) {
      markets.push(m);
    }
  }

  return markets;
}
