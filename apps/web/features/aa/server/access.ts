import type { AaParticipantRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AaClient = Prisma.TransactionClient | typeof prisma;

export type AaAccess = {
  canManage: boolean;
  role: AaParticipantRole;
};

export async function getActivityAaAccess(
  activityId: string,
  profileId: string,
  client: AaClient = prisma,
): Promise<AaAccess | null> {
  const activity = await client.activity.findUnique({
    where: { id: activityId },
    select: {
      organizerId: true,
      coManagers: {
        where: { managerProfileId: profileId },
        select: { id: true },
        take: 1,
      },
      participants: {
        where: {
          userProfileId: profileId,
          status: { in: ["JOINED", "APPROVED"] },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!activity) return null;

  if (activity.organizerId === profileId) {
    return { canManage: true, role: "OWNER" };
  }

  if (activity.coManagers.length > 0) {
    return { canManage: true, role: "ADMIN" };
  }

  if (activity.participants.length > 0) {
    return { canManage: false, role: "MEMBER" };
  }

  const historicalParticipant = await client.aaParticipant.findFirst({
    where: {
      userProfileId: profileId,
      ledger: { activityId },
    },
    select: { id: true },
  });

  return historicalParticipant ? { canManage: false, role: "MEMBER" } : null;
}
