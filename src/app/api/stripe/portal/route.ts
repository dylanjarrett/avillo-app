// src/app/api/stripe/portal/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

type Body = {
  returnTo?: string;
  // Admin-only overrides (optional)
  customerId?: string;
  workspaceId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const { userId, workspaceId, workspaceRole } = ctx;

    let body: Body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const return_url = `${baseUrl}${body.returnTo || "/billing"}`;

    // Requester role (platform role) only needed for admin overrides
    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!requester) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    let stripeCustomerId: string | null = null;

    const wantsOverride = !!body.customerId || !!body.workspaceId;
    if (wantsOverride) {
      if (requester.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      if (body.customerId) {
        stripeCustomerId = body.customerId;
      } else if (body.workspaceId) {
        const ws = await prisma.workspace.findUnique({
          where: { id: body.workspaceId },
          select: { stripeCustomerId: true },
        });
        stripeCustomerId = ws?.stripeCustomerId ?? null;
      }
    } else {
      // Normal: use current workspace’s customer
      if (workspaceRole !== "OWNER" && workspaceRole !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { stripeCustomerId: true },
      });
      stripeCustomerId = ws?.stripeCustomerId ?? null;
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "Billing portal is not available yet for this workspace." },
        { status: 400 }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[stripe-portal] error", err);
    return NextResponse.json({ error: "Unable to open billing portal right now." }, { status: 500 });
  }
}