import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActivityDetailPath } from "./activityRoutes";

export function generateActivityShareToken() {
  return randomBytes(24).toString("base64url");
}

export function getPrivateActivitySharePath({
  activityId,
  extraSearchParams,
  locale,
  shareToken,
}: {
  activityId: string;
  extraSearchParams?: {
    claimed?: string | null;
    sheet?: string | null;
  };
  locale: string;
  shareToken: string;
}) {
  const searchParams = new URLSearchParams({ access: shareToken });

  for (const [key, value] of Object.entries(extraSearchParams ?? {})) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  return `/${locale}${getActivityDetailPath(activityId)}?${searchParams.toString()}`;
}

export async function ensurePrivateActivityShareToken(
  activityId: string,
  tx?: Prisma.TransactionClient,
) {
  const delegate = tx ?? prisma;
  const activity = await delegate.activity.findUnique({
    where: {
      id: activityId,
    },
    select: {
      id: true,
      shareEnabled: true,
      shareToken: true,
      visibility: true,
    },
  });

  if (!activity || activity.visibility !== "PRIVATE") {
    return null;
  }

  if (activity.shareEnabled && activity.shareToken) {
    return activity.shareToken;
  }

  const updated = await delegate.activity.update({
    where: {
      id: activity.id,
    },
    data: {
      shareEnabled: true,
      shareToken: activity.shareToken ?? generateActivityShareToken(),
    },
    select: {
      shareToken: true,
    },
  });

  return updated.shareToken;
}

export function buildPrivateActivityShareAccessWhere(
  accessToken: string | null | undefined,
): Prisma.ActivityWhereInput[] {
  if (!accessToken) {
    return [];
  }

  return [
    {
      AND: [
        { visibility: "PRIVATE" as const },
        { shareEnabled: true },
        { shareToken: accessToken },
      ],
    },
  ];
}

export function buildPrivateActivityFriendAccessWhere(
  friendIds: string[],
): Prisma.ActivityWhereInput[] {
  if (friendIds.length === 0) {
    return [];
  }

  return [
    {
      AND: [{ visibility: "PRIVATE" as const }, { organizerId: { in: friendIds } }],
    },
  ];
}
