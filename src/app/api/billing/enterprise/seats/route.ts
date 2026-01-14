// src/app/api/billing/enterprise/seats/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
const stripe = new Stripe(stripeSecretKey);

const ENTERPRISE_BASE = process.env.STRIPE_ENTERPRISE_BASE_MONTHLY_PRICE_ID;
const ENTERPRISE_SEAT = process.env.STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID;

function clampInt(n: unknown, min: number, max: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function getCustomerId(x: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id ?? null;
}

function priceIdOf(price: unknown): string | null {
  if (!price) return null;
  if (typeof price === "string") return price;
  if (typeof price === "object" && (price as any).id) return String((price as any).id);
  return null;
}

function isEnterpriseSub(sub: Stripe.Subscription) {
  const ids = (sub.items?.data ?? [])
    .map((i) => priceIdOf((i as any).price))
    .filter(Boolean) as string[];
  return !!ENTERPRISE_BASE && ids.includes(ENTERPRISE_BASE);
}

function findSeatItem(sub: Stripe.Subscription, seatPriceId: string) {
  return (sub.items?.data ?? []).find((i) => priceIdOf((i as any).price) === seatPriceId) ?? null;
}

async function fetchExpandedSubscription(subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
}

/**
 * Creates & finalizes invoice then pays only if amount_due > 0.
 * If payment fails (no PM, requires action, etc.), throws Stripe error.
 */
async function invoiceNowIfNeeded(subscriptionId: string, customerId: string) {
  const inv = await stripe.invoices.create({
    customer: customerId,
    subscription: subscriptionId,
    auto_advance: true,
  });

  const finalized = await stripe.invoices.finalizeInvoice(inv.id);
  const amountDue = Number((finalized as any).amount_due ?? 0);

  if (amountDue <= 0) {
    return { chargedNow: false, invoiceId: finalized.id, amountDue };
  }

  const paid = await stripe.invoices.pay(finalized.id);
  return { chargedNow: paid.status === "paid", invoiceId: paid.id, amountDue };
}

export async function PATCH(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

  if (ctx.workspaceRole !== "OWNER" && ctx.workspaceRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const newSeatLimit = clampInt(body?.seatLimit, 5, 500);

  const seatPriceId = ENTERPRISE_SEAT ?? null;
  if (!seatPriceId) {
    return NextResponse.json({ error: "Missing STRIPE_ENTERPRISE_SEAT_MONTHLY_PRICE_ID." }, { status: 500 });
  }

  const seatsUsed = await prisma.workspaceUser.count({ where: { workspaceId: ctx.workspaceId } });
  if (newSeatLimit < Math.max(5, seatsUsed)) {
    return NextResponse.json(
      { error: `Seat limit can’t be less than seats in use. Seats used: ${seatsUsed}.`, seatsUsed },
      { status: 400 }
    );
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      id: true,
      plan: true,
      stripeSubscriptionId: true,
      includedSeats: true,
      seatLimit: true,
    },
  });

  if (!ws) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (ws.plan !== "ENTERPRISE") return NextResponse.json({ error: "Not an enterprise workspace." }, { status: 409 });
  if (!ws.stripeSubscriptionId) return NextResponse.json({ error: "No Stripe subscription found." }, { status: 409 });

  const included = Math.max(5, Number(ws.includedSeats ?? 5));
  const desiredExtraSeats = Math.max(0, newSeatLimit - included);

  const sub0 = await fetchExpandedSubscription(ws.stripeSubscriptionId);

  if (!isEnterpriseSub(sub0)) {
    return NextResponse.json(
      { error: "Stripe subscription is not Enterprise (missing enterprise base item)." },
      { status: 409 }
    );
  }

  const isTrialing = sub0.status === "trialing";

  const seatItem0 = findSeatItem(sub0, seatPriceId);
  const currentExtraSeats = Math.max(0, Number(seatItem0?.quantity ?? 0));
  const currentSeatLimitStripe = included + currentExtraSeats;

  const delta = newSeatLimit - currentSeatLimitStripe;
  if (delta === 0) {
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { seatLimit: currentSeatLimitStripe, includedSeats: included, updatedAt: new Date() } as any,
    });

    return NextResponse.json({
      success: true,
      seatLimit: currentSeatLimitStripe,
      includedSeats: included,
      seatsUsed,
      chargedNow: false,
      appliedNextCycle: false,
      source: "stripe",
      trialing: isTrialing,
    });
  }

  const isIncrease = delta > 0;

  const idempotencyKey = `ws_${ws.id}_sub_${sub0.id}_seatlimit_${newSeatLimit}`;

  // Persist desired limit in Stripe metadata (observability + reconciliation)
  try {
    await stripe.subscriptions.update(
      sub0.id,
      {
        metadata: {
          ...sub0.metadata,
          enterpriseRequestedSeatLimit: String(newSeatLimit),
        },
      },
      { idempotencyKey: `${idempotencyKey}_meta` }
    );
  } catch {
    // non-fatal
  }

  // ✅ Proration rules:
  // - During TRIAL: always "none" (seats are free during trial)
  // - After trial: increase => "create_prorations", decrease => "none"
  const proration_behavior: Stripe.SubscriptionItemUpdateParams.ProrationBehavior = isTrialing
    ? "none"
    : isIncrease
      ? "create_prorations"
      : "none";

    try {
      if (!seatItem0) {
        // No seat item yet — only create if we actually need extras
        if (desiredExtraSeats > 0) {
          await stripe.subscriptionItems.create(
            {
              subscription: sub0.id,
              price: seatPriceId,
              quantity: desiredExtraSeats,
              proration_behavior,
            },
            { idempotencyKey: `${idempotencyKey}_create_item` }
          );
        }
      } else {
        // Seat item exists — if extras go to 0, delete the item (Stripe often disallows quantity=0)
        if (desiredExtraSeats <= 0) {
          await stripe.subscriptionItems.del(seatItem0.id, {
            idempotencyKey: `${idempotencyKey}_delete_item`,
          } as any);
        } else {
          await stripe.subscriptionItems.update(
            seatItem0.id,
            {
              quantity: desiredExtraSeats,
              proration_behavior,
            },
            { idempotencyKey: `${idempotencyKey}_update_item` }
          );
        }
      }
    } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to update seats on Stripe." }, { status: 500 });
  }

  let chargedNow = false;
  let invoiceId: string | null = null;
  let amountDue: number | null = null;

  // ✅ Only attempt immediate invoice/payment if:
  // - increase
  // - NOT trialing (trial should remain free)
  if (isIncrease && !isTrialing) {
    const customerId = getCustomerId(sub0.customer as any);
    if (!customerId) return NextResponse.json({ error: "Missing customer on subscription." }, { status: 500 });

    try {
      const res = await invoiceNowIfNeeded(sub0.id, customerId);
      chargedNow = res.chargedNow;
      invoiceId = res.invoiceId;
      amountDue = res.amountDue;
    } catch (e: any) {
      return NextResponse.json(
        {
          error:
            e?.message ||
            "Seats updated, but we couldn’t charge the prorated difference. Please update your payment method in the billing portal and try again.",
          needsPaymentMethod: true,
        },
        { status: 402 }
      );
    }
  }

  // Re-fetch and sync DB to Stripe truth
  const sub1 = await fetchExpandedSubscription(sub0.id);
  const seatItem1 = findSeatItem(sub1, seatPriceId);
  const extraSeatsFinal = Math.max(0, Number(seatItem1?.quantity ?? 0));
  const seatLimitFinal = included + extraSeatsFinal;

  await prisma.workspace.update({
    where: { id: ws.id },
    data: {
      seatLimit: seatLimitFinal,
      includedSeats: included,
      updatedAt: new Date(),
    } as any,
  });

  return NextResponse.json({
    success: true,
    seatLimit: seatLimitFinal,
    includedSeats: included,
    seatsUsed,
    chargedNow,
    invoiceId,
    amountDue,
    appliedNextCycle: !isIncrease, // decreases are next cycle; increases are immediate after trial
    source: "stripe",
    trialing: isTrialing,
  });
}