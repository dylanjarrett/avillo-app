// src/lib/tasks/createPeopleTask.ts
import { prisma } from "@/lib/prisma";

type Args = {
  userId: string;
  contactId: string | null;
  listingId?: string | null;
  title: string;
  notes?: string | null;
  dueAt: Date | null;
  dedupeWindowMinutes?: number; // prevents dupes if UI saves twice
};

export async function createPeopleTask({
  userId,
  contactId,
  listingId = null,
  title,
  notes = null,
  dueAt,
  dedupeWindowMinutes = 10,
}: Args) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return null;

  // optional dedupe: same user/contact/title created very recently
  const windowStart = new Date(Date.now() - dedupeWindowMinutes * 60 * 1000);

  const existing = await prisma.task.findFirst({
    where: {
      userId,
      status: "OPEN",
      source: "PEOPLE_NOTE",
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      title: cleanTitle,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  return prisma.task.create({
    data: {
      userId,
      contactId: contactId ?? null,
      listingId: listingId ?? null,
      title: cleanTitle,
      notes: notes?.trim() || null,
      dueAt,
      status: "OPEN",
      source: "PEOPLE_NOTE",
    },
  });
}