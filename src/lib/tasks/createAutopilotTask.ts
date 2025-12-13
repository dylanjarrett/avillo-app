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

  return prisma.task.create({
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
}