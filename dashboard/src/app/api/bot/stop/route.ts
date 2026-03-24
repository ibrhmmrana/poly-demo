import { NextResponse } from "next/server";
import { stopBotProcess } from "@/lib/bot-process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { ok: false, message: "Bot process management is not available on cloud deployments." },
      { status: 400 }
    );
  }
  const result = stopBotProcess();
  if (result.ok) {
    return NextResponse.json(result);
  }
  return NextResponse.json(result, { status: 400 });
}
