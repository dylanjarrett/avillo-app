// src/lib/tasks/createAutopilotTask.ts
import type { Task, TaskSource, TaskStatus } from "@prisma/client";
import { normalizeToMinute } from "@/lib/time";

type AutopilotTaskInput = {
  userId: string; // actor (runner)
  workspaceId: string;

  title: string;
  notes?: string | null;
  dueAt?: Date | null;

  contactId?: string | null;
  listingId?: string | null;

  dedupeWindowMinutes?: number; // default 60
  normalizeDueAtToMinute?: boolean; // default true

  /**
   * Optional: assign to someone else. Defaults to current user (runner).
   */
  assignedToUserId?: string | null;
};

function cleanText(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

async function getPrisma() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export async function createAutopilotTask(input: AutopilotTaskInput): Promise<Task | null> {
  const prisma = await getPrisma();

  const actorUserId = String(input.userId ?? "").trim();
  const workspaceId = String(input.workspaceId ?? "").trim();

  const title = cleanText(input.title);
  const notes = cleanText(input.notes);

  if (!actorUserId || !workspaceId) return null;
  if (!title) return null;

  const assignedToUserId = (input.assignedToUserId ?? actorUserId) || actorUserId;

  const contactId = input.contactId ?? null;
  const listingId = input.listingId ?? null;

  const normalizeDue = input.normalizeDueAtToMinute ?? true;
  const dueAtRaw = input.dueAt ?? null;
  const dueAt = dueAtRaw ? (normalizeDue ? normalizeToMinute(dueAtRaw) : dueAtRaw) : null;

  const dedupeWindowMinutes = clampInt(input.dedupeWindowMinutes, 1, 1440, 60);
  const since = new Date(Date.now() - dedupeWindowMinutes * 60 * 1000);

  // Safety: actor must belong to workspace
  const membership = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId: actorUserId, removedAt: null },
    select: { id: true },
  });
  if (!membership) return null;

  // Validate references belong to workspace
  if (contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true, relationshipType: true },
    });
    if (!c) return null;
    // Guardrail: partner contacts shouldn’t get autopilot tasks
    if (String(c.relationshipType) === "PARTNER") return null;
  }

  if (listingId) {
    const l = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId },
      select: { id: true },
    });
    if (!l) return null;
  }

  // Dedupe: same title + refs + dueAt + recent OPEN autopilot + not deleted
  const existing = await prisma.task.findFirst({
    where: {
      workspaceId,
      assignedToUserId,
      source: "AUTOPILOT" satisfies TaskSource,
      status: "OPEN" satisfies TaskStatus,
      title,
      contactId,
      listingId,
      createdAt: { gte: since },
      deletedAt: null,
      ...(dueAt ? { dueAt } : { dueAt: null }),
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  const created = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        workspaceId,
        createdByUserId: actorUserId,
        assignedToUserId,

        contactId,
        listingId,

        title,
        notes: notes || null,
        dueAt,

        source: "AUTOPILOT",
        status: "OPEN",
      },
    });

    if (task.contactId) {
      await tx.cRMActivity.create({
        data: {
          workspaceId,
          actorUserId,

          contactId: task.contactId,
          type: "task_created",
          summary: `Autopilot task created: ${task.title}`,
          data: {
            source: "AUTOPILOT",
            taskId: task.id,
            title: task.title,
            dueAt: task.dueAt ? task.dueAt.toISOString() : null,
            listingId: task.listingId ?? null,
            assignedToUserId,
          },
        },
      });
    }

    return task;
  });

  return created;
}