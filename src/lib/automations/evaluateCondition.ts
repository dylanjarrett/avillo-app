import { prisma } from "@/lib/prisma";
import type { ConditionConfig, AutomationContext } from "./types";

function safeId(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function evaluateCondition(
  condition: ConditionConfig,
  context: AutomationContext
): Promise<boolean> {
  const { field, operator, value } = condition;

  const workspaceId = safeId((context as any)?.workspaceId);
  const contactId = safeId((context as any)?.contactId);
  const listingId = safeId((context as any)?.listingId);

  // HARD REQUIRE tenant scope for DB lookups
  if (!workspaceId) return false;

  let actual: any = null;

  // ------------ CONTACT FIELDS ------------
  if (field.startsWith("contact.") && contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
    });

    const key = field.replace("contact.", "");
    actual = (c as any)?.[key];
  }

  // ------------ LISTING FIELDS ------------
  if (field.startsWith("listing.") && listingId) {
    const l = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId },
    });

    const key = field.replace("listing.", "");
    actual = (l as any)?.[key];
  }

  // ------------ PAYLOAD FIELDS (trigger payload) ------------
  if (field.startsWith("payload.") && context.payload) {
    const key = field.replace("payload.", "");
    actual = (context.payload as any)?.[key];
  }

  // If nothing resolved, condition fails safely
  if (actual === null || actual === undefined) return false;

  // ------------ OPERATOR LOGIC ------------
  switch (operator) {
    case "equals":
      return actual === value;

    case "not_equals":
      return actual !== value;

    case "gt":
      return Number(actual) > Number(value);

    case "gte":
      return Number(actual) >= Number(value);

    case "lt":
      return Number(actual) < Number(value);

    case "lte":
      return Number(actual) <= Number(value);

    case "contains":
      return Array.isArray(actual)
        ? actual.includes(value)
        : String(actual).includes(String(value));

    case "not_contains":
      return Array.isArray(actual)
        ? !actual.includes(value)
        : !String(actual).includes(String(value));

    default:
      return false;
  }
}