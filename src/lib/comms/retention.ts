//lib/comms/retention.ts
import { prisma } from "@/lib/prisma";

function envInt(key: string, fallback: number) {
  const v = process.env[key];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function cutoffDate(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function deleteBatched(model: "smsMessage" | "call" | "commEvent" | "conversation", where: any, batchSize = 50_000, dryRun = false) {
  let total = 0;

  while (true) {
    const ids = await (prisma as any)[model].findMany({
      where,
      select: { id: true },
      take: batchSize,
    });

    if (ids.length === 0) break;

    if (!dryRun) {
      const del = await (prisma as any)[model].deleteMany({
        where: { id: { in: ids.map((x: any) => x.id) } },
      });
      total += del.count;
    } else {
      total += ids.length;
    }
  }

  return total;
}

export async function runCommsRetentionOnce() {
  const DRY = process.env.COMMS_RETENTION_DRY_RUN === "1";

  // Looser defaults than Hub
  const daysSms = envInt("COMMS_RETENTION_DAYS_SMS", 365);
  const daysCalls = envInt("COMMS_RETENTION_DAYS_CALLS", 365);
  const daysEvents = envInt("COMMS_RETENTION_DAYS_EVENTS", daysSms); // optional but recommended
  const daysEmptyConversations = envInt("COMMS_RETENTION_DAYS_EMPTY_CONVERSATIONS", 180);

  const smsCutoff = cutoffDate(daysSms);
  const callsCutoff = cutoffDate(daysCalls);
  const eventsCutoff = cutoffDate(daysEvents);
  const emptyConvCutoff = cutoffDate(daysEmptyConversations);

  const results: any[] = [];

  // 1) SMS messages (CommEvents tied to smsMessageId will cascade-delete)
  results.push({
    type: "SMS_MESSAGE",
    cutoff: smsCutoff.toISOString(),
    deleted: await deleteBatched("smsMessage", { createdAt: { lt: smsCutoff } }, 50_000, DRY),
    dryRun: DRY,
  });

  // 2) Calls (CommEvents tied to callId will cascade-delete)
  results.push({
    type: "CALL",
    cutoff: callsCutoff.toISOString(),
    deleted: await deleteBatched("call", { createdAt: { lt: callsCutoff } }, 50_000, DRY),
    dryRun: DRY,
  });

  // 3) CommEvents (covers standalone events like DELIVERY_UPDATE, MISSED_CALL, VOICEMAIL, etc.)
  // Safe even if many were already cascade-deleted.
  results.push({
    type: "COMM_EVENT",
    cutoff: eventsCutoff.toISOString(),
    deleted: await deleteBatched("commEvent", { occurredAt: { lt: eventsCutoff } }, 50_000, DRY),
    dryRun: DRY,
  });

  // 4) Empty conversations (no smsMessages/calls/events) that haven’t been touched in a while
  results.push({
    type: "EMPTY_CONVERSATION",
    cutoff: emptyConvCutoff.toISOString(),
    deleted: await deleteBatched(
      "conversation",
      {
        updatedAt: { lt: emptyConvCutoff },
        smsMessages: { none: {} },
        calls: { none: {} },
        events: { none: {} },
      },
      50_000,
      DRY
    ),
    dryRun: DRY,
  });

  return { ok: true, results };
}