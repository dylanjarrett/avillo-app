import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const body = await req.json().catch(() => null);
  const seatLimitRaw = Number(body?.seatLimit ?? 5);
  const seatLimit = Number.isFinite(seatLimitRaw) ? Math.max(5, Math.floor(seatLimitRaw)) : 5;

  const basePriceId = process.env.STRIPE_ENTERPRISE_BASE_MONTHLY_PRICE_ID;
  const seatPriceId = process.env.STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID;
  if (!basePriceId || !seatPriceId) {
    return NextResponse.json({ error: "Missing enterprise Stripe price ids." }, { status: 500 });
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { id: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  // Ensure Stripe customer exists
  let customerId = ws.stripeCustomerId;
  if (!customerId) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });

    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      metadata: { workspaceId: ws.id },
    });

    customerId = customer.id;
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { stripeCustomerId: customerId },
    });
  }

  // Cancel any existing subscription (simple, hands-free)
  if (ws.stripeSubscriptionId) {
    await stripe.subscriptions.cancel(ws.stripeSubscriptionId).catch(() => null);
  }

  const includedSeats = 5;
  const extraSeats = Math.max(0, seatLimit - includedSeats);

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [
      { price: basePriceId, quantity: 1 },
      { price: seatPriceId, quantity: extraSeats },
    ],
    metadata: {
      workspaceId: ws.id,
      seatPriceId, // your webhook reads this into workspace.stripeSeatPriceId
    },
  });

  await prisma.workspace.update({
    where: { id: ws.id },
    data: {
      plan: "ENTERPRISE" as any,
      stripeSubscriptionId: subscription.id,
      stripeBasePriceId: basePriceId,
      stripeSeatPriceId: seatPriceId,
      includedSeats,
      seatLimit,
    } as any,
  });

  return NextResponse.json({ success: true, seatLimit, includedSeats });
}