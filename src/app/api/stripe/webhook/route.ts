// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY in environment.");
if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET in environment.");

const stripe = new Stripe(stripeSecretKey);

type Plan = "STARTER" | "PRO" | "FOUNDING_PRO";
type Status = "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

function unixToDate(x: unknown): Date | null {
  if (typeof x !== "number" || !x) return null;
  return new Date(x * 1000);
}

function getUnixField(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const val = (obj as Record<string, unknown>)[key];
  return typeof val === "number" ? val : null;
}

function getCustomerId(
  x: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id ?? null;
}

function getSubscriptionId(x: string | Stripe.Subscription | null | undefined) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id ?? null;
}

function getPrimaryPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

function planFromPriceId(priceId?: string | null): Plan | null {
  if (!priceId) return null;

  const starterMonthly =
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? "price_1SeSegPuU4fMjEPuYJkTyNGf";
  const starterAnnual =
    process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "price_1SeSegPuU4fMjEPubZKAdkNu";

  const proMonthly =
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "price_1SeSgXPuU4fMjEPuoyfcpKQ3";
  const proAnnual =
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "price_1SeSflPuU4fMjEPuWLykKHPr";

  const foundingMonthly =
    process.env.STRIPE_FOUNDING_PRO_MONTHLY_PRICE_ID ?? "price_1SeShcPuU4fMjEPuwuE9sIxf";
  const foundingAnnual =
    process.env.STRIPE_FOUNDING_PRO_ANNUAL_PRICE_ID ?? "price_1SeShQPuU4fMjEPug2u9Z3KP";

  if (priceId === starterMonthly || priceId === starterAnnual) return "STARTER";
  if (priceId === proMonthly || priceId === proAnnual) return "PRO";
  if (priceId === foundingMonthly || priceId === foundingAnnual) return "FOUNDING_PRO";

  return null;
}

function statusFromStripe(sub: Stripe.Subscription): Status {
  switch (sub.status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "NONE";
  }
}

function isProPlan(plan: Plan | null | undefined) {
  return plan === "PRO" || plan === "FOUNDING_PRO";
}

async function pauseAutomationsForUserAcrossWorkspaces(params: {
  userId: string;
  reason: string;
  fromPlan?: Plan | null;
  toPlan?: Plan | null;
  fromStatus?: Status | null;
  toStatus?: Status | null;
}) {
  const { prisma } = await import("@/lib/prisma");
  const { userId, reason, fromPlan, toPlan, fromStatus, toStatus } = params;

  // Find all workspaces this user belongs to (including owned ones via membership table)
  const memberships = await prisma.workspaceUser.findMany({
    where: { userId },
    select: { workspaceId: true },
  });

  const workspaceIds = memberships.map((m) => m.workspaceId);
  if (workspaceIds.length === 0) return;

  const paused = await prisma.automation.updateMany({
    where: { workspaceId: { in: workspaceIds }, active: true },
    data: {
      active: false,
      status: "paused",
      updatedAt: new Date(),
    },
  });

  // Audit: write one CRMActivity per workspace (safe + explicit tenant boundary)
  if (paused.count > 0) {
    await Promise.all(
      workspaceIds.map(async (workspaceId) => {
        try {
          await prisma.cRMActivity.create({
            data: {
              workspaceId,
              actorUserId: userId,
              type: "automation_paused",
              summary: "Automations paused due to plan change",
              data: {
                reason,
                fromPlan,
                toPlan,
                fromStatus,
                toStatus,
                at: new Date().toISOString(),
                pausedCount: paused.count,
              },
            },
          });
        } catch (e) {
          console.warn("[stripe-webhook] Failed to write CRMActivity audit:", e);
        }
      })
    );
  }
}

async function updateUserBilling(params: {
  userId?: string | null;
  stripeCustomerId?: string | null;
  subscription: Stripe.Subscription;
}) {
  const { prisma } = await import("@/lib/prisma");
  const { userId, stripeCustomerId, subscription } = params;

  const priceId = getPrimaryPriceId(subscription);
  const plan = planFromPriceId(priceId) ?? "STARTER";
  const status = statusFromStripe(subscription);

  const trialEndsAt = unixToDate(getUnixField(subscription, "trial_end"));
  const currentPeriodEnd = unixToDate(getUnixField(subscription, "current_period_end"));

  // Find the user: prefer userId (metadata), fallback to stripeCustomerId
  const user =
    (userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, plan: true, subscriptionStatus: true },
        })
      : null) ??
    (stripeCustomerId
      ? await prisma.user.findFirst({
          where: { stripeCustomerId },
          select: { id: true, plan: true, subscriptionStatus: true },
        })
      : null);

  if (!user) {
    console.warn("[stripe-webhook] No user match for updateUserBilling", {
      userId,
      stripeCustomerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  const prevPlan = (user.plan as Plan) ?? "STARTER";
  const prevStatus = (user.subscriptionStatus as Status) ?? "NONE";

  // Any paid checkout/sub update => user accessLevel PAID (your platform gating is user-level)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessLevel: "PAID",
      plan: plan as any,
      subscriptionStatus: status as any,
      trialEndsAt: trialEndsAt ?? null,
      currentPeriodEnd: currentPeriodEnd ?? null,
      stripeCustomerId: stripeCustomerId ?? null,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId ?? null,
    } as any,
  });

  // Pause automations if they lost Pro
  const hadPro = isProPlan(prevPlan);
  const lostProByPlan = hadPro && plan === "STARTER";
  const lostProByStatus =
    hadPro && (status === "PAST_DUE" || status === "CANCELED" || status === "NONE");

  if (lostProByPlan || lostProByStatus) {
    await pauseAutomationsForUserAcrossWorkspaces({
      userId: user.id,
      reason: lostProByPlan ? "DOWNGRADED_TO_STARTER" : "SUBSCRIPTION_NOT_ACTIVE",
      fromPlan: prevPlan,
      toPlan: plan,
      fromStatus: prevStatus,
      toStatus: status,
    });
  }
}

async function handleCanceled(params: { userId?: string | null; stripeCustomerId?: string | null }) {
  const { prisma } = await import("@/lib/prisma");
  const { userId, stripeCustomerId } = params;

  const user =
    (userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, plan: true, subscriptionStatus: true },
        })
      : null) ??
    (stripeCustomerId
      ? await prisma.user.findFirst({
          where: { stripeCustomerId },
          select: { id: true, plan: true, subscriptionStatus: true },
        })
      : null);

  if (!user) {
    console.warn("[stripe-webhook] No user found for cancel", { userId, stripeCustomerId });
    return;
  }

  const prevPlan = (user.plan as Plan) ?? "STARTER";
  const prevStatus = (user.subscriptionStatus as Status) ?? "NONE";

  // When canceled, you said: keep accessLevel PAID but remove Pro capabilities via plan/status.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessLevel: "PAID",
      plan: "STARTER" as any,
      subscriptionStatus: "CANCELED" as any,
      trialEndsAt: null,
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
    } as any,
  });

  await pauseAutomationsForUserAcrossWorkspaces({
    userId: user.id,
    reason: "SUBSCRIPTION_CANCELED",
    fromPlan: prevPlan,
    toPlan: "STARTER",
    fromStatus: prevStatus,
    toStatus: "CANCELED",
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const stripeCustomerId = getCustomerId(session.customer as any);
        const subscriptionId = getSubscriptionId(session.subscription as any);

        // Prefer linking by userId (client_reference_id or metadata)
        const userId =
          (session.client_reference_id as string | null | undefined) ??
          ((session.metadata as any)?.userId as string | null | undefined) ??
          null;

        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await updateUserBilling({
          userId,
          stripeCustomerId,
          subscription,
        });

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = getCustomerId(subscription.customer as any);

        const userId = ((subscription.metadata as any)?.userId as string | null | undefined) ?? null;

        if (!stripeCustomerId && !userId) break;

        await updateUserBilling({
          userId,
          stripeCustomerId,
          subscription,
        });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = getCustomerId(subscription.customer as any);
        const userId = ((subscription.metadata as any)?.userId as string | null | undefined) ?? null;

        await handleCanceled({ userId, stripeCustomerId });
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
