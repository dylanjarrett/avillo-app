import { NextResponse } from "next/server";
import { runHubRetentionOnce } from "@/lib/chat/retention";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!secret || token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const res = await runHubRetentionOnce();
  return NextResponse.json(res);
}
