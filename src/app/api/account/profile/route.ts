// src/app/api/account/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(json: any, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function jsonError(message: string, status = 400) {
  return noStore({ ok: false, error: message }, status);
}

function cleanStr(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

export async function GET(_req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return noStore(ws.error, ws.status);

    const [workspace, user] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: ws.workspaceId },
        select: {
          id: true,
          name: true,
          type: true,
          plan: true,
          subscriptionStatus: true,
          accessLevel: true,
          seatLimit: true,
          includedSeats: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: ws.userId },
        select: {
          id: true,
          name: true,
          email: true,
          brokerage: true,
          phone: true,
          createdAt: true,
        },
      }),
    ]);

    if (!workspace) return jsonError("Workspace not found.", 404);
    if (!user) return jsonError("User not found.", 404);

    return noStore({ ok: true, workspace, user });
  } catch (err) {
    console.error("PROFILE GET ERROR →", err);
    return jsonError("Failed to load profile.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return noStore(ws.error, ws.status);

    const body = (await req.json().catch(() => null)) as
      | { name?: unknown; brokerage?: unknown; phone?: unknown; workspaceName?: unknown }
      | null;

    if (!body) return jsonError("Invalid request body.", 400);

    const name = cleanStr(body.name);
    const brokerage = cleanStr(body.brokerage);
    const phone = cleanStr(body.phone);
    const workspaceName = cleanStr(body.workspaceName);

    const [updatedWorkspace, updatedUser] = await Promise.all([
      workspaceName
        ? prisma.workspace.update({
            where: { id: ws.workspaceId },
            data: { name: workspaceName },
            select: {
              id: true,
              name: true,
              type: true,
              plan: true,
              subscriptionStatus: true,
              accessLevel: true,
              seatLimit: true,
              includedSeats: true,
            },
          })
        : prisma.workspace.findUnique({
            where: { id: ws.workspaceId },
            select: {
              id: true,
              name: true,
              type: true,
              plan: true,
              subscriptionStatus: true,
              accessLevel: true,
              seatLimit: true,
              includedSeats: true,
            },
          }),
      prisma.user.update({
        where: { id: ws.userId },
        data: {
          name: name || null,
          brokerage: brokerage || null,
          phone: phone || null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          brokerage: true,
          phone: true,
          createdAt: true,
        },
      }),
    ]);

    if (!updatedWorkspace) return jsonError("Workspace not found.", 404);

    return noStore({ ok: true, workspace: updatedWorkspace, user: updatedUser });
  } catch (err) {
    console.error("PROFILE POST ERROR →", err);
    return jsonError("Failed to update profile.", 500);
  }
}