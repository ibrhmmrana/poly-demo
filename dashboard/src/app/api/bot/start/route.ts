import { NextResponse } from "next/server";
import { startBotProcess } from "@/lib/bot-process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { ok: false, message: "Bot process management is not available on cloud deployments. Run the Python bot separately on your own server." },
      { status: 400 }
    );
  }
  const result = startBotProcess();
  if (result.ok) {
    return NextResponse.json(result);
  }
  return NextResponse.json(result, { status: 400 });
}
