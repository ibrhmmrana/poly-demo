import { NextRequest, NextResponse } from "next/server";
import { runResolveCycle } from "@/lib/bot/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const apiKey = (process.env.BOT_API_KEY ?? "").trim();
  if (!apiKey) return false;
  const provided =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return provided === apiKey;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  try {
    const summary = await runResolveCycle();
    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

