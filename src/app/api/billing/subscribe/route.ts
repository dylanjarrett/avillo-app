import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

type Body = {
  plan: "STARTER" | "PRO" | "FOUNDING_PRO";
  interval: "month" | "year";
};

function getBasePriceId(plan: Body["plan"], interval: Body["interval"]) {
  if (plan === "STARTER") {
    return interval === "year"
      ? process.env.STRIPE_STARTER_ANNUAL_PRICE_ID
      : process.env.STRIPE_STARTER_MONTHLY_PRICE_ID;
  }
  if (plan === "PRO") {
    return interval === "year"
      ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
      : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  }
  return interval === "year"
    ? process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID
    : process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID;
}

export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const basePriceId = getBasePriceId(body.plan, body.interval);
  if (!basePriceId) return NextResponse.json({ error: "Missing price id(s)." }, { status: 500 });

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

  // If a subscription exists, cancel it first (simple + hands-free)
  if (ws.stripeSubscriptionId) {
    await stripe.subscriptions.cancel(ws.stripeSubscriptionId).catch(() => null);
  }

  // Create new subscription
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: basePriceId, quantity: 1 }],
    metadata: { workspaceId: ws.id },
  });

  // Update workspace immediately; webhook will reconcile status/dates
  await prisma.workspace.update({
    where: { id: ws.id },
    data: {
      plan: body.plan as any,
      stripeSubscriptionId: subscription.id,
      stripeBasePriceId: basePriceId,
      stripeSeatPriceId: null,
      includedSeats: 1,
      seatLimit: 1,
    } as any,
  });

  return NextResponse.json({ success: true });
}