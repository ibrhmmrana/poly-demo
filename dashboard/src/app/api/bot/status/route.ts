import { NextResponse } from "next/server";
import { getBotStatus } from "@/lib/bot-process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hosted = !!process.env.VERCEL;
  const status = getBotStatus();
  return NextResponse.json({ ...status, hosted });
}
