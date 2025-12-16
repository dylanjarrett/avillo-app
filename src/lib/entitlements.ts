// src/lib/entitlements.ts
import { prisma } from "@/lib/prisma";

export type PlanWire = "STARTER" | "PRO" | "FOUNDING_PRO" | string | null | undefined;
export type StatusWire =
  | "NONE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | string
  | null
  | undefined;

export type EntitlementKey =
  | "INTELLIGENCE_GENERATE"
  | "INTELLIGENCE_SAVE"
  | "AUTOMATIONS_READ"
  | "AUTOMATIONS_WRITE"
  | "AUTOMATIONS_RUN"
  | "AUTOMATIONS_TRIGGER"
  | "AUTOMATIONS_PERSIST"; 

export type Entitlements = {
  plan: "STARTER" | "PRO" | "FOUNDING_PRO";
  subscriptionStatus: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  isPaidTier: boolean;
  can: Record<EntitlementKey, boolean>;
};

function normalizePlan(plan: PlanWire): Entitlements["plan"] {
  const p = String(plan || "").toUpperCase();
  if (p === "PRO") return "PRO";
  if (p === "FOUNDING_PRO" || p === "FOUNDINGPRO" || p === "FOUNDING-PRO") return "FOUNDING_PRO";
  return "STARTER";
}

function normalizeStatus(status: StatusWire): Entitlements["subscriptionStatus"] {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "ACTIVE";
  if (s === "TRIALING") return "TRIALING";
  if (s === "PAST_DUE" || s === "PASTDUE" || s === "UNPAID") return "PAST_DUE";
  if (s === "CANCELED" || s === "CANCELLED") return "CANCELED";
  return "NONE";
}

/**
 * Paid-access rule:
 * - PRO / FOUNDING_PRO are paid tiers
 * - Allow ACTIVE + TRIALING
 * - (Optional) allow PAST_DUE if you want grace
 */
function hasPaidAccess(plan: Entitlements["plan"], status: Entitlements["subscriptionStatus"]) {
  const paidPlan = plan === "PRO" || plan === "FOUNDING_PRO";
  if (!paidPlan) return false;

  if (status === "ACTIVE" || status === "TRIALING") return true;

  // Optional grace:
  // return status === "PAST_DUE";
  return false;
}

export async function getEntitlementsForUserId(userId: string): Promise<Entitlements> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true as any,
      subscriptionStatus: true as any,
    },
  });

  const plan = normalizePlan((u as any)?.plan);
  const subscriptionStatus = normalizeStatus((u as any)?.subscriptionStatus);
  const isPaidTier = hasPaidAccess(plan, subscriptionStatus);

  /**
   * Your current product decision:
   * - Starter: can view + design (UI), but cannot save/update/delete or run
   * - Pro/Founding Pro: full access
   */
  const can: Entitlements["can"] = {
    // Intelligence
    INTELLIGENCE_GENERATE: isPaidTier,
    INTELLIGENCE_SAVE: isPaidTier,

    // Autopilot / Automations
    AUTOMATIONS_READ: true,          // Starter can view the page + list
    AUTOMATIONS_WRITE: true,         // Starter can edit locally (UI) but not persist
    AUTOMATIONS_PERSIST: isPaidTier, // ✅ gate POST/PUT/DELETE
    AUTOMATIONS_RUN: isPaidTier,     // ✅ gate /run
    AUTOMATIONS_TRIGGER: isPaidTier, // ✅ gate background triggers if/when enabled
  };

  return { plan, subscriptionStatus, isPaidTier, can };
}

export async function requireEntitlement(userId: string, key: EntitlementKey) {
  const ent = await getEntitlementsForUserId(userId);
  if (ent.can[key]) return { ok: true as const, ent };

  return {
    ok: false as const,
    ent,
    error: {
      code: "PLAN_REQUIRED",
      entitlement: key,
      requiredPlan: "PRO",
      plan: ent.plan,
      subscriptionStatus: ent.subscriptionStatus,
      message: "This feature requires Avillo Pro.",
    },
  };
}