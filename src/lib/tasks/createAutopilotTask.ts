// src/lib/tasks/createAutopilotTask.ts

type AutopilotTaskInput = {
  userId: string;
  title: string;
  notes?: string | null;
  dueAt?: Date | null;
  contactId?: string | null;
  listingId?: string | null;

  // prevents spam if automation re-runs quickly
  dedupeWindowMinutes?: number; // default 60
};

export async function createAutopilotTask(input: AutopilotTaskInput) {
  const { prisma } = await import("@/lib/prisma");

  const title = (input.title || "").trim();
  if (!title) return null;

  const dueAt = input.dueAt ?? null;
  const contactId = input.contactId ?? null;
  const listingId = input.listingId ?? null;

  const windowMinutes = input.dedupeWindowMinutes ?? 60;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  // light de-dupe: same title + same contact/listing + recent OPEN autopilot task
  const existing = await prisma.task.findFirst({
    where: {
      userId: input.userId,
      source: "AUTOPILOT",
      status: "OPEN",
      title,
      contactId,
      listingId,
      createdAt: { gte: since },
      ...(dueAt ? { dueAt } : {}),
    },
    select: { id: true },
  });

  if (existing) return existing;

  const created = await prisma.task.create({
    data: {
      userId: input.userId,
      contactId,
      listingId,
      title,
      notes: (input.notes || "").trim() || null,
      dueAt,
      source: "AUTOPILOT",
      status: "OPEN",
    },
  });

  // --- CRM TIMELINE LOG ---
  // Only log if this task is tied to a contact (so it can show on their timeline).
  // We log to CRMActivity (not ContactNote) so the notes area stays human-authored.
  if (created.contactId) {
    await prisma.cRMActivity.create({
      data: {
        userId: created.userId,
        contactId: created.contactId,
        type: "task_created",
        summary: `Autopilot task created: ${created.title}`,
        data: {
          source: "AUTOPILOT",
          taskId: created.id,
          title: created.title,
          dueAt: created.dueAt ? created.dueAt.toISOString() : null,
          listingId: created.listingId ?? null,
        },
      },
    });
  }

  return created;
}