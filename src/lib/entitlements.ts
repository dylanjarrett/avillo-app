// src/lib/entitlements.ts
import { prisma } from "@/lib/prisma";
import { AccessLevel, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

/**
 * ✅ Stripe-aligned gating:
 * - During TRIALING: treat as fully active (same as ACTIVE)
 * - After trial: Stripe transitions to ACTIVE (paid) or PAST_DUE/CANCELED/etc.
 * - So paid access = (status is ACTIVE or TRIALING) for paid tiers
 *
 * ✅ Your beta policy:
 * - BETA bypass unlocks Pro features without Stripe
 * - BUT beta is solo-only → WORKSPACE_INVITE is always OFF in BETA
 * - When beta ends: you flip all workspaces to EXPIRED to hard-block until plan selection
 */

export type EntitlementKey =
  | "INTELLIGENCE_GENERATE"
  | "INTELLIGENCE_SAVE"
  | "AUTOMATIONS_READ"
  | "AUTOMATIONS_WRITE"
  | "AUTOMATIONS_RUN"
  | "AUTOMATIONS_TRIGGER"
  | "AUTOMATIONS_PERSIST"
  | "WORKSPACE_INVITE"
  | "COMMS_ACCESS"
  | "COMMS_PROVISION_NUMBER";

export type Entitlements = {
  accessLevel: AccessLevel; // BETA | PAID | EXPIRED
  plan: SubscriptionPlan; // STARTER | PRO | FOUNDING_PRO | ENTERPRISE
  subscriptionStatus: SubscriptionStatus; // NONE | TRIALING | ACTIVE | PAST_DUE | CANCELED

  /** True when Pro-tier features should be allowed (your primary gate). */
  isPaidTier: boolean;

  /** Per-feature flags */
  can: Record<EntitlementKey, boolean>;
};

function normalizeAccess(v: unknown): AccessLevel {
  const a = String(v ?? "").toUpperCase();
  if (a === "BETA") return AccessLevel.BETA;
  if (a === "EXPIRED") return AccessLevel.EXPIRED;
  return AccessLevel.PAID;
}

function normalizePlan(v: unknown): SubscriptionPlan {
  const p = String(v ?? "").toUpperCase();
  if (p === "PRO") return SubscriptionPlan.PRO;
  if (p === "FOUNDING_PRO" || p === "FOUNDINGPRO" || p === "FOUNDING-PRO")
    return SubscriptionPlan.FOUNDING_PRO;
  if (p === "ENTERPRISE") return SubscriptionPlan.ENTERPRISE;
  return SubscriptionPlan.STARTER;
}

function normalizeStatus(v: unknown): SubscriptionStatus {
  const s = String(v ?? "").toUpperCase();
  if (s === "TRIALING") return SubscriptionStatus.TRIALING;
  if (s === "ACTIVE") return SubscriptionStatus.ACTIVE;
  if (s === "PAST_DUE" || s === "PASTDUE" || s === "UNPAID") return SubscriptionStatus.PAST_DUE;
  if (s === "CANCELED" || s === "CANCELLED") return SubscriptionStatus.CANCELED;
  return SubscriptionStatus.NONE;
}

function isPaidPlan(plan: SubscriptionPlan) {
  return (
    plan === SubscriptionPlan.PRO ||
    plan === SubscriptionPlan.FOUNDING_PRO ||
    plan === SubscriptionPlan.ENTERPRISE
  );
}

/** Stripe-consistent: trial counts as paid access */
function billingOk(status: SubscriptionStatus) {
  return status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING;
}

export async function getEntitlementsForWorkspaceId(workspaceId: string): Promise<Entitlements> {
  const w = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      accessLevel: true,
      plan: true,
      subscriptionStatus: true,
      // trialEndsAt is intentionally NOT used for gating (Stripe status is source of truth)
      // trialEndsAt: true,
    },
  });

  const accessLevel = normalizeAccess(w?.accessLevel);
  const plan = normalizePlan(w?.plan);
  const subscriptionStatus = normalizeStatus(w?.subscriptionStatus);

  const stripeBillingOk = billingOk(subscriptionStatus);
  const paidPlan = isPaidPlan(plan);

  // Primary paid-feature gate:
  // - BETA: allow Pro features without Stripe (bypass)
  // - EXPIRED: block everything that requires payment
  // - PAID: require paid plan + Stripe billing ok
  const isPaidTier =
    accessLevel === AccessLevel.BETA
      ? true
      : accessLevel === AccessLevel.EXPIRED
        ? false
        : paidPlan && stripeBillingOk;

  const isEnterprise = plan === SubscriptionPlan.ENTERPRISE;

  // ✅ Comms rules:
  // - BETA: always allow (bypass for testing)
  // - PAID: must be PRO/FOUNDING_PRO/ENTERPRISE AND Stripe billing ok
  // - EXPIRED: never
  const commsAllowed =
    accessLevel === AccessLevel.BETA
      ? true
      : accessLevel === AccessLevel.PAID && paidPlan && stripeBillingOk;

  const can: Entitlements["can"] = {
    // Intelligence
    INTELLIGENCE_GENERATE: isPaidTier,
    INTELLIGENCE_SAVE: isPaidTier,

    // Automations
    // (You’ve been allowing read/write shell always, then gating actual persistence/runs.)
    AUTOMATIONS_READ: true,
    AUTOMATIONS_WRITE: true,
    AUTOMATIONS_PERSIST: isPaidTier,
    AUTOMATIONS_RUN: isPaidTier,
    AUTOMATIONS_TRIGGER: isPaidTier,

    // Workspace invites:
    // - NOT allowed in BETA (solo-only)
    // - Requires Enterprise + Stripe OK + accessLevel PAID (not expired)
    WORKSPACE_INVITE: accessLevel === AccessLevel.PAID && isEnterprise && stripeBillingOk,

    // Comms
    COMMS_ACCESS: commsAllowed,
    COMMS_PROVISION_NUMBER: commsAllowed,
  };

  return { accessLevel, plan, subscriptionStatus, isPaidTier, can };
}

export async function requireEntitlement(workspaceId: string, key: EntitlementKey) {
  const ent = await getEntitlementsForWorkspaceId(workspaceId);
  if (ent.can[key]) return { ok: true as const, ent };

  const requiredPlan =
    key === "WORKSPACE_INVITE"
      ? SubscriptionPlan.ENTERPRISE
      : key === "COMMS_ACCESS" || key === "COMMS_PROVISION_NUMBER"
        ? SubscriptionPlan.PRO
        : SubscriptionPlan.PRO;

  // Slightly more helpful messaging for common billing states
  const billingMessage =
    ent.accessLevel === AccessLevel.EXPIRED
      ? "This workspace is inactive. Choose a plan to continue."
      : ent.subscriptionStatus === SubscriptionStatus.PAST_DUE
        ? "Your subscription is past due. Update your payment method to regain access."
        : ent.subscriptionStatus === SubscriptionStatus.CANCELED
          ? "Your subscription is canceled. Reactivate to regain access."
          : "Choose a plan to continue.";

  return {
    ok: false as const,
    ent,
    error: {
      code: "PLAN_REQUIRED",
      entitlement: key,
      requiredPlan,
      accessLevel: ent.accessLevel,
      plan: ent.plan,
      subscriptionStatus: ent.subscriptionStatus,
      message:
        key === "WORKSPACE_INVITE"
          ? ent.accessLevel === AccessLevel.BETA
            ? "Team invites are disabled during the private beta."
            : !billingOk(ent.subscriptionStatus)
              ? billingMessage
              : "Inviting team members requires Avillo Enterprise."
          : key === "COMMS_ACCESS" || key === "COMMS_PROVISION_NUMBER"
            ? ent.accessLevel === AccessLevel.BETA
              ? "" // beta bypass allows Comms
              : billingMessage
            : ent.accessLevel === AccessLevel.BETA
              ? "" // beta bypass allows Pro features; this path is unlikely, but keep safe
              : billingMessage,
    },
  };
}