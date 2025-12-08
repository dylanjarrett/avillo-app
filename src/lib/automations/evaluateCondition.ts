// src/lib/automations/evaluateCondition.ts
import { prisma } from "@/lib/prisma";
import type { ConditionConfig, AutomationContext } from "./types";

export async function evaluateCondition(
  condition: ConditionConfig,
  context: AutomationContext
): Promise<boolean> {
  const { field, operator, value } = condition;

  let actual: any = null;

  // ------------ CONTACT FIELDS ------------
  if (field.startsWith("contact.") && context.contactId) {
    const c = await prisma.contact.findUnique({
      where: { id: context.contactId },
    });

    const key = field.replace("contact.", "");
    actual = (c as any)?.[key];
  }

  // ------------ LISTING FIELDS ------------
  if (field.startsWith("listing.") && context.listingId) {
    const l = await prisma.listing.findUnique({
      where: { id: context.listingId },
    });

    const key = field.replace("listing.", "");
    actual = (l as any)?.[key];
  }

  // ------------ PAYLOAD FIELDS (trigger payload) ------------
  if (field.startsWith("payload.") && context.payload) {
    const key = field.replace("payload.", "");
    actual = context.payload?.[key];
  }

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
        : String(actual ?? "").includes(String(value));

    case "not_contains":
      return Array.isArray(actual)
        ? !actual.includes(value)
        : !String(actual ?? "").includes(String(value));

    default:
      return false;
  }
}