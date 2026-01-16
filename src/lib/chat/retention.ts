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

async function deleteBatched(where: any, batchSize = 50_000, dryRun = false) {
  let total = 0;

  while (true) {
    const ids = await prisma.chatMessage.findMany({
      where,
      select: { id: true },
      take: batchSize,
    });

    if (ids.length === 0) break;

    if (!dryRun) {
      const del = await prisma.chatMessage.deleteMany({
        where: { id: { in: ids.map((x) => x.id) } },
      });
      total += del.count;
    } else {
      total += ids.length;
    }
  }

  return total;
}

export async function runHubRetentionOnce() {
  const DRY = process.env.HUB_RETENTION_DRY_RUN === "1";

  const daysDefault = envInt("HUB_RETENTION_DAYS_DEFAULT", 90);
  const daysBoard = envInt("HUB_RETENTION_DAYS_BOARD", 180);
  const daysDm = envInt("HUB_RETENTION_DAYS_DM", daysDefault);
  const daysRoom = envInt("HUB_RETENTION_DAYS_ROOM", daysDefault);

  const boardCutoff = cutoffDate(daysBoard);
  const dmCutoff = cutoffDate(daysDm);
  const roomCutoff = cutoffDate(daysRoom);

  const results = [];

  results.push({
    channelType: "BOARD",
    cutoff: boardCutoff.toISOString(),
    deletedMessages: await deleteBatched(
      { createdAt: { lt: boardCutoff }, channel: { type: "BOARD" } },
      50_000,
      DRY
    ),
    dryRun: DRY,
  });

  results.push({
    channelType: "DM",
    cutoff: dmCutoff.toISOString(),
    deletedMessages: await deleteBatched(
      { createdAt: { lt: dmCutoff }, channel: { type: "DM" } },
      50_000,
      DRY
    ),
    dryRun: DRY,
  });

  results.push({
    channelType: "ROOM",
    cutoff: roomCutoff.toISOString(),
    deletedMessages: await deleteBatched(
      { createdAt: { lt: roomCutoff }, channel: { type: "ROOM" } },
      50_000,
      DRY
    ),
    dryRun: DRY,
  });

  return { ok: true, results };
}
