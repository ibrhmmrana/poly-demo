import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
};

async function timedFetch(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; latencyMs: number; json: unknown }> {
  const start = Date.now();
  const res = await fetch(url, init);
  const latencyMs = Date.now() - start;
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, latencyMs, json };
}

function firstClobTokenId(m: Record<string, unknown>): string {
  const raw = m.clobTokenIds;
  try {
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw) as string[];
      return parsed?.[0] ?? "";
    }
    if (Array.isArray(raw) && typeof raw[0] === "string") {
      return raw[0];
    }
  } catch {
    /* ignore */
  }
  return "";
}

function isWeatherGammaEvent(ev: Record<string, unknown>): boolean {
  const title = String(ev.title ?? "").toLowerCase();
  const slug = String(ev.slug ?? "").toLowerCase();
  return (
    title.includes("highest temperature") || slug.includes("highest-temperature")
  );
}

async function testGamma(): Promise<TestResult & { tokenId?: string }> {
  try {
    const gamma = await timedFetch(
      "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100",
    );
    if (!gamma.ok || !Array.isArray(gamma.json)) {
      return {
        ok: false,
        latencyMs: gamma.latencyMs,
        message: `Gamma API failed (${gamma.status})`,
      };
    }

    const weatherEvent = gamma.json.find((event) =>
      isWeatherGammaEvent(event as Record<string, unknown>),
    ) as Record<string, unknown> | undefined;

    const markets = Array.isArray(weatherEvent?.markets)
      ? (weatherEvent.markets as Array<Record<string, unknown>>)
      : [];
    let tokenId = "";
    let source: "weather" | "markets_fallback" | "none" = "none";

    for (const m of markets) {
      tokenId = firstClobTokenId(m);
      if (tokenId) {
        source = "weather";
        break;
      }
    }

    if (!tokenId) {
      const mk = await timedFetch(
        "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=40",
      );
      if (mk.ok && Array.isArray(mk.json)) {
        for (const row of mk.json as Array<Record<string, unknown>>) {
          tokenId = firstClobTokenId(row);
          if (tokenId) {
            source = "markets_fallback";
            break;
          }
        }
      }
    }

    let message = "Gamma API reachable";
    if (weatherEvent && source === "weather") {
      message += "; weather market token for CLOB probe";
    } else if (source === "markets_fallback") {
      message +=
        "; no weather token in events sample — using active market for CLOB probe";
    } else if (weatherEvent) {
      message += "; weather event found but no clobTokenIds on nested markets";
    } else {
      message += "; no weather market in events sample";
    }

    return {
      ok: true,
      latencyMs: gamma.latencyMs,
      message,
      tokenId: tokenId || undefined,
      details: {
        sampledEvents: gamma.json.length,
        weatherEventTitle: weatherEvent?.title ?? null,
        clobProbeSource: source,
      },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: 0,
      message: error instanceof Error ? error.message : "Gamma request failed",
    };
  }
}

async function testClob(tokenId?: string): Promise<TestResult> {
  if (!tokenId) {
    return {
      ok: false,
      latencyMs: 0,
      message: "No token id available from Gamma sample",
    };
  }

  try {
    const clob = await timedFetch(
      `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,
    );
    if (!clob.ok) {
      return {
        ok: false,
        latencyMs: clob.latencyMs,
        message: `CLOB book lookup failed (${clob.status})`,
      };
    }

    const payload = clob.json as Record<string, unknown> | null;
    const bids = Array.isArray(payload?.bids) ? payload.bids.length : 0;
    const asks = Array.isArray(payload?.asks) ? payload.asks.length : 0;
    return {
      ok: true,
      latencyMs: clob.latencyMs,
      message: "CLOB API reachable",
      details: { tokenId, bids, asks },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: 0,
      message: error instanceof Error ? error.message : "CLOB request failed",
    };
  }
}

async function testOpenMeteo(): Promise<TestResult> {
  try {
    const om = await timedFetch(
      "https://api.open-meteo.com/v1/forecast?latitude=40.7769&longitude=-73.8740&hourly=temperature_2m&forecast_days=1&timezone=UTC",
    );
    const hourly = (om.json as Record<string, unknown> | null)?.hourly as
      | Record<string, unknown>
      | undefined;
    const temps = Array.isArray(hourly?.temperature_2m)
      ? hourly?.temperature_2m
      : [];

    return {
      ok: om.ok && temps.length > 0,
      latencyMs: om.latencyMs,
      message:
        om.ok && temps.length > 0
          ? "Open-Meteo reachable with temperature data"
          : `Open-Meteo failed (${om.status})`,
      details: { hourlyPoints: temps.length },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: 0,
      message: error instanceof Error ? error.message : "Open-Meteo request failed",
    };
  }
}

async function testNoaa(): Promise<TestResult> {
  try {
    const nws = await timedFetch("https://api.weather.gov/points/40.7769,-73.8740", {
      headers: {
        "User-Agent": "WeatherBotDiagnostics/1.0 (ops@example.com)",
        Accept: "application/geo+json",
      },
    });

    const forecastHourly = (
      (nws.json as Record<string, unknown> | null)?.properties as
        | Record<string, unknown>
        | undefined
    )?.forecastHourly;

    return {
      ok: nws.ok && typeof forecastHourly === "string",
      latencyMs: nws.latencyMs,
      message:
        nws.ok && typeof forecastHourly === "string"
          ? "NOAA reachable with forecast endpoint"
          : `NOAA failed (${nws.status})`,
      details: { hasForecastHourly: typeof forecastHourly === "string" },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: 0,
      message: error instanceof Error ? error.message : "NOAA request failed",
    };
  }
}

export async function GET() {
  const gamma = await testGamma();
  const clob = await testClob(gamma.tokenId);
  const openMeteo = await testOpenMeteo();
  const noaa = await testNoaa();

  const tests = { gamma, clob, openMeteo, noaa };
  const okCount = Object.values(tests).filter((t) => t.ok).length;

  return NextResponse.json({
    ok: okCount === Object.keys(tests).length,
    okCount,
    total: Object.keys(tests).length,
    testedAt: new Date().toISOString(),
    tests,
  });
}
