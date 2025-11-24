// src/lib/audit.ts

// Simple, local audit helper used instead of an external "@enterprise/audit" module.
// This keeps production builds happy and gives you a single place to plug in
// any future logging / analytics provider (Datadog, PostHog, etc.).

export type AuditMeta = Record<string, unknown>;

export type AuditUser = {
  id?: string;
  email?: string | null;
} | null | undefined;

/**
 * auditEvent
 * Lightweight wrapper for recording important account / billing / auth events.
 * Currently just logs to the server console in prod.
 */
export async function auditEvent(
  user: AuditUser,
  action: string,
  meta: AuditMeta = {}
) {
  try {
    // You can later replace this with a proper logging integration.
    console.log("[audit]", {
      action,
      user: user ? { id: user.id, email: user.email } : null,
      meta,
      at: new Date().toISOString(),
    });
  } catch (err) {
    // Never throw from audit logging – it should be fire-and-forget.
    console.error("[audit] failed", err);
  }
}
