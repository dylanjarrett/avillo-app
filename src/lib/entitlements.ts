// src/lib/entitlements.ts
import { prisma } from "@/lib/prisma";

export type PlanWire = "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE" | string | null | undefined;
export type StatusWire =
  | "NONE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | string
  | null
  | undefined;

export type AccessWire = "BETA" | "PAID" | "EXPIRED" | string | null | undefined;

export type EntitlementKey =
  | "INTELLIGENCE_GENERATE"
  | "INTELLIGENCE_SAVE"
  | "AUTOMATIONS_READ"
  | "AUTOMATIONS_WRITE"
  | "AUTOMATIONS_RUN"
  | "AUTOMATIONS_TRIGGER"
  | "AUTOMATIONS_PERSIST"
  | "WORKSPACE_INVITE"; // new: gate invites to enterprise

export type Entitlements = {
  accessLevel: "BETA" | "PAID" | "EXPIRED";
  plan: "STARTER" | "PRO" | "FOUNDING_PRO" | "ENTERPRISE";
  subscriptionStatus: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  isPaidTier: boolean;
  can: Record<EntitlementKey, boolean>;
};

function normalizeAccess(access: AccessWire): Entitlements["accessLevel"] {
  const a = String(access || "").toUpperCase();
  if (a === "BETA") return "BETA";
  if (a === "EXPIRED") return "EXPIRED";
  // default to PAID for any unknown (keeps old rows from breaking)
  return "PAID";
}

function normalizePlan(plan: PlanWire): Entitlements["plan"] {
  const p = String(plan || "").toUpperCase();
  if (p === "PRO") return "PRO";
  if (p === "FOUNDING_PRO" || p === "FOUNDINGPRO" || p === "FOUNDING-PRO") return "FOUNDING_PRO";
  if (p === "ENTERPRISE") return "ENTERPRISE";
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
 * - Pro / Founding Pro / Enterprise are paid tiers
 * - Allow ACTIVE + TRIALING
 */
function hasPaidAccess(plan: Entitlements["plan"], status: Entitlements["subscriptionStatus"]) {
  const paidPlan = plan === "PRO" || plan === "FOUNDING_PRO" || plan === "ENTERPRISE";
  if (!paidPlan) return false;
  return status === "ACTIVE" || status === "TRIALING";
}

export async function getEntitlementsForWorkspaceId(workspaceId: string): Promise<Entitlements> {
  const w = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      accessLevel: true as any,
      plan: true as any,
      subscriptionStatus: true as any,
    },
  });

  const accessLevel = normalizeAccess((w as any)?.accessLevel);
  const plan = normalizePlan((w as any)?.plan);
  const subscriptionStatus = normalizeStatus((w as any)?.subscriptionStatus);

  // Overrides:
  // - BETA => unlock
  // - EXPIRED => block
  // - PAID => Stripe rule
  const isPaidTier =
    accessLevel === "BETA"
      ? true
      : accessLevel === "EXPIRED"
      ? false
      : hasPaidAccess(plan, subscriptionStatus);

  const can: Entitlements["can"] = {
    // Intelligence
    INTELLIGENCE_GENERATE: isPaidTier,
    INTELLIGENCE_SAVE: isPaidTier,

    // Automations
    AUTOMATIONS_READ: true,
    AUTOMATIONS_WRITE: true,
    AUTOMATIONS_PERSIST: isPaidTier,
    AUTOMATIONS_RUN: isPaidTier,
    AUTOMATIONS_TRIGGER: isPaidTier,

    // Invites: enterprise only
    WORKSPACE_INVITE: plan === "ENTERPRISE" && (subscriptionStatus === "ACTIVE" || subscriptionStatus === "TRIALING" || accessLevel === "BETA"),
  };

  return { accessLevel, plan, subscriptionStatus, isPaidTier, can };
}

export async function requireEntitlement(workspaceId: string, key: EntitlementKey) {
  const ent = await getEntitlementsForWorkspaceId(workspaceId);
  if (ent.can[key]) return { ok: true as const, ent };

  return {
    ok: false as const,
    ent,
    error: {
      code: "PLAN_REQUIRED",
      entitlement: key,
      requiredPlan: key === "WORKSPACE_INVITE" ? "ENTERPRISE" : "PRO",
      accessLevel: ent.accessLevel,
      plan: ent.plan,
      subscriptionStatus: ent.subscriptionStatus,
      message: key === "WORKSPACE_INVITE" ? "Inviting seats requires Avillo Enterprise." : "This feature requires Avillo Pro.",
    },
  };
}