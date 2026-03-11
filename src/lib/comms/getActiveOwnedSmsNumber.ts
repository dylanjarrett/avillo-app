//lib/comms/getActiveOwnedSmsNumber.ts
import { prisma } from "@/lib/prisma";

type Args = {
  workspaceId: string;
  userId: string;
};

export async function getActiveOwnedSmsNumber(args: Args) {
  const { workspaceId, userId } = args;

  const phone = await prisma.userPhoneNumber.findFirst({
    where: {
      workspaceId,
      assignedToUserId: userId,
      status: "ACTIVE",
      capabilities: { has: "SMS" },
    },
    select: {
      id: true,
      e164: true,
      assignedToUserId: true,
      workspaceId: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return phone;
}