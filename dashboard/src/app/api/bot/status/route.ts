import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const sb = createClient(url, key);

    const { data: settingsRows } = await sb.from("bot_settings").select("key, value");
    const settings: Record<string, string> = {};
    (settingsRows ?? []).forEach((r: { key: string; value: string }) => {
      settings[r.key] = r.value;
    });

    const { data: lastScan } = await sb
      .from("scan_cycles")
      .select("id, triggered_at, status, duration_ms, markets_found, edges_found, trades_placed")
      .order("triggered_at", { ascending: false })
      .limit(1)
      .single();

    const today = new Date().toISOString().slice(0, 10);
    const { count } = await sb
      .from("scan_cycles")
      .select("id", { count: "exact", head: true })
      .gte("triggered_at", `${today}T00:00:00Z`);

    return NextResponse.json({
      mode: settings.mode ?? "paper",
      paused: settings.bot_paused === "true",
      lastScan: lastScan ?? null,
      scansToday: count ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
