import { NextRequest, NextResponse } from "next/server";
import { CITIES } from "@/lib/bot/cities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toF(c: number): number {
  return c * 9 / 5 + 32;
}

export async function GET(request: NextRequest) {
  const city = (request.nextUrl.searchParams.get("city") ?? "").toLowerCase();
  const date = request.nextUrl.searchParams.get("date") ?? "";

  if (!city || !date) {
    return NextResponse.json(
      { error: "city and date are required query params" },
      { status: 400 },
    );
  }

  const cfg = CITIES[city];
  if (!cfg) {
    return NextResponse.json({ error: "unknown city" }, { status: 404 });
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(cfg.lat));
  url.searchParams.set("longitude", String(cfg.lon));
  url.searchParams.set("hourly", "temperature_2m");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("timezone", "UTC");

  try {
    const started = Date.now();
    const res = await fetch(url.toString(), { cache: "no-store" });
    const latencyMs = Date.now() - started;
    const json = (await res.json()) as {
      hourly?: { time?: string[]; temperature_2m?: number[] };
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: `Open-Meteo request failed (${res.status})` },
        { status: 502 },
      );
    }

    const hourlyTimes = json.hourly?.time ?? [];
    const hourlyRaw = json.hourly?.temperature_2m ?? [];
    const hourly =
      cfg.tempUnit === "F"
        ? hourlyRaw.map((t) => toF(t))
        : hourlyRaw;

    const min = hourly.length ? Math.min(...hourly) : null;
    const max = hourly.length ? Math.max(...hourly) : null;

    return NextResponse.json({
      city: cfg.name,
      citySlug: city,
      targetDate: date,
      source: "open-meteo",
      requestUrl: url.toString(),
      latencyMs,
      unit: cfg.tempUnit,
      summary: {
        points: hourly.length,
        min,
        max,
      },
      hourly: hourly.map((temp, i) => ({
        time: hourlyTimes[i] ?? null,
        temp,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "forecast request failed" },
      { status: 500 },
    );
  }
}

