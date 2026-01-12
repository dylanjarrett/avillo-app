import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

export async function PATCH(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const body = await req.json().catch(() => null);
  const seatLimitRaw = Number(body?.seatLimit);
  if (!Number.isFinite(seatLimitRaw)) {
    return NextResponse.json({ error: "seatLimit must be a number." }, { status: 400 });
  }

  const newSeatLimit = Math.max(5, Math.floor(seatLimitRaw));

  const ws = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      id: true,
      plan: true,
      stripeSubscriptionId: true,
      stripeSeatPriceId: true,
      includedSeats: true,
    },
  });

  if (!ws) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (ws.plan !== "ENTERPRISE") {
    return NextResponse.json({ error: "Not an enterprise workspace." }, { status: 409 });
  }
  if (!ws.stripeSubscriptionId) {
    return NextResponse.json({ error: "No Stripe subscription found." }, { status: 409 });
  }
  if (!ws.stripeSeatPriceId) {
    return NextResponse.json({ error: "No seat price configured." }, { status: 409 });
  }

  const included = ws.includedSeats ?? 5;
  const extraSeats = Math.max(0, newSeatLimit - included);

  const sub = await stripe.subscriptions.retrieve(ws.stripeSubscriptionId);

  // Find the subscription item that matches the enterprise seat price
  const seatItem = sub.items.data.find((i) => i.price?.id === ws.stripeSeatPriceId);
  if (!seatItem) {
    return NextResponse.json({ error: "Seat item not found on subscription." }, { status: 500 });
  }

  await stripe.subscriptionItems.update(seatItem.id, {
    quantity: extraSeats,
    proration_behavior: "create_prorations",
  });

  await prisma.workspace.update({
    where: { id: ws.id },
    data: { seatLimit: newSeatLimit },
  });

  return NextResponse.json({ success: true, seatLimit: newSeatLimit, includedSeats: included });
}