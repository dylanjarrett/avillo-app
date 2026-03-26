// src/app/api/auth/check/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(json: any, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();

    if (!ctx.ok) {
      return noStore(
        {
          ok: false,
          error: ctx.error?.error || "Unauthorized",
        },
        ctx.status
      );
    }

    return noStore({
      ok: true,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      workspaceRole: ctx.workspaceRole,
    });
  } catch (err) {
    console.error("/api/auth/check GET error:", err);
    return noStore(
      {
        ok: false,
        error: "Failed to validate session.",
      },
      500
    );
  }
}