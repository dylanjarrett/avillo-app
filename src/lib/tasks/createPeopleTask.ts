// src/lib/tasks/createPeopleTask.ts
import type { Task, TaskSource, TaskStatus } from "@prisma/client";
import { normalizeToMinute } from "@/lib/time";

type Args = {
  userId: string; // caller / actor
  workspaceId: string;

  contactId: string | null;
  listingId?: string | null;

  title: string;
  notes?: string | null;
  dueAt: Date | null;

  dedupeWindowMinutes?: number; // default 10
  normalizeDueAtToMinute?: boolean; // default true

  /**
   * Optional: assign to someone else. Defaults to current user.
   * (Enterprise-ready: lets ADMIN create tasks for agents.)
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

export async function createPeopleTask(args: Args): Promise<Task | null> {
  const prisma = await getPrisma();

  const actorUserId = String(args.userId ?? "").trim();
  const workspaceId = String(args.workspaceId ?? "").trim();

  const contactId = args.contactId ?? null;
  const listingId = args.listingId ?? null;

  const title = cleanText(args.title);
  const notes = cleanText(args.notes);

  if (!actorUserId || !workspaceId) return null;
  if (!title) return null;

  const assignedToUserId = (args.assignedToUserId ?? actorUserId) || actorUserId;

  const normalizeDue = args.normalizeDueAtToMinute ?? true;
  const dueAtRaw = args.dueAt ?? null;
  const dueAt = dueAtRaw ? (normalizeDue ? normalizeToMinute(dueAtRaw) : dueAtRaw) : null;

  const dedupeWindowMinutes = clampInt(args.dedupeWindowMinutes, 1, 240, 10);
  const windowStart = new Date(Date.now() - dedupeWindowMinutes * 60 * 1000);

  // Safety: membership guard (actor must belong to workspace)
  const membership = await prisma.workspaceUser.findFirst({
    where: { workspaceId, userId: actorUserId, removedAt: null },
    select: { id: true },
  });
  if (!membership) return null;

  // Validate referenced entities belong to workspace
  if (contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!c) return null;
  }

  if (listingId) {
    const l = await prisma.listing.findFirst({
      where: { id: listingId, workspaceId },
      select: { id: true },
    });
    if (!l) return null;
  }

  // Dedupe: same title + refs + dueAt + recent OPEN + not deleted
  const existing = await prisma.task.findFirst({
    where: {
      workspaceId,
      assignedToUserId,
      status: "OPEN" satisfies TaskStatus,
      source: "PEOPLE_NOTE" satisfies TaskSource,
      contactId,
      listingId,
      title,
      createdAt: { gte: windowStart },
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

        status: "OPEN",
        source: "PEOPLE_NOTE",
      },
    });

    // Optional timeline log (contact only)
    if (task.contactId) {
      await tx.cRMActivity.create({
        data: {
          workspaceId,
          actorUserId,

          contactId: task.contactId,
          type: "task_created",
          summary: `Task created: ${task.title}`,
          data: {
            source: "PEOPLE_NOTE",
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