import { auditAction } from "@/enterprise/audit";

export function auditEvent(user, action, meta={}) {
  auditAction(user, action, meta);
}
