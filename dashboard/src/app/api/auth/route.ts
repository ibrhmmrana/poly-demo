import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const pin = String(body?.pin ?? "").trim();
  const expected = (process.env.DASHBOARD_PIN ?? "").trim();

  if (!expected || pin !== expected) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("dash_session", expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
