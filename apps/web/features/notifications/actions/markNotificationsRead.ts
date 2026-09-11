"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeAnalyticsLocale } from "@/features/analytics/events";
import { queueAnalyticsEvent } from "@/features/analytics/server";
import { createNotification } from "@/features/notifications/utils/createNotification";
import { markReferralMutualFollowAcceptedBetween } from "@/features/referrals/services/referrals";
import { ensureCurrentUserProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";
import { getVisibleNotificationWhere } from "../queries/getNotifications";
import { getConversationPair } from "@/features/direct-messages/utils/conversation";
import { getActivityDetailPath } from "@/features/activities/utils/activityRoutes";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function getNotificationIdList(notificationIds: readonly string[]) {
  return Array.from(
    new Set(
      notificationIds.filter(
        (notificationId) =>
          typeof notificationId === "string" && notificationId.length > 0,
      ),
    ),
  ).slice(0, 100);
}

function trackNotificationOpened({
  locale,
  notificationId,
  targetType,
  type,
  userProfileId,
}: {
  locale: string;
  notificationId: string;
  targetType:
    | "activity"
    | "admin_reports"
    | "messages"
    | "notifications"
    | "profile";
  type: string;
  userProfileId: string;
}) {
  queueAnalyticsEvent(
    {
      locale: normalizeAnalyticsLocale(locale),
      name: "notification_opened",
      route: `/${locale}/notifications`,
      entityId: notificationId,
      entityType: "notification",
      sourceSurface: "notification",
      properties: {
        notification_type: type,
        target_type: targetType,
      },
    },
    {
      userProfileId,
    },
  );
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const locale = getString(formData, "locale") || "zh-CN";
  const profile = await ensureCurrentUserProfile(locale, "/notifications");

  await prisma.notification.updateMany({
    where: getVisibleNotificationWhere({
      recipientId: profile.id,
      readAt: null,
    }),
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath(withLocale(locale, "/notifications"));
  redirect(withLocale(locale, "/notifications"));
}

export async function markNotificationReadAction(formData: FormData) {
  const locale = getString(formData, "locale") || "zh-CN";
  const notificationId = getString(formData, "notificationId");
  const profile = await ensureCurrentUserProfile(locale, "/notifications");

  if (notificationId) {
    await prisma.notification.updateMany({
      where: getVisibleNotificationWhere({
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      }),
      data: {
        readAt: new Date(),
      },
    });
  }

  revalidatePath(withLocale(locale, "/notifications"));
  redirect(withLocale(locale, "/notifications"));
}

export async function deleteNotificationAction(formData: FormData) {
  const locale = getString(formData, "locale") || "zh-CN";
  const notificationId = getString(formData, "notificationId");
  const profile = await ensureCurrentUserProfile(locale, "/notifications");

  if (notificationId) {
    await prisma.notification.deleteMany({
      where: getVisibleNotificationWhere({
        id: notificationId,
        recipientId: profile.id,
      }),
    });
  }

  revalidatePath(withLocale(locale, "/notifications"));
  redirect(withLocale(locale, "/notifications"));
}

export async function deleteNotificationClientAction(
  locale: string,
  notificationId: string,
) {
  const normalizedLocale = locale || "zh-CN";
  const profile = await ensureCurrentUserProfile(
    normalizedLocale,
    "/notifications",
  );

  if (notificationId) {
    await prisma.notification.deleteMany({
      where: getVisibleNotificationWhere({
        id: notificationId,
        recipientId: profile.id,
      }),
    });
  }

  revalidatePath(withLocale(normalizedLocale, "/notifications"));

  return { ok: true as const };
}

export async function deleteNotificationsClientAction(
  locale: string,
  notificationIds: string[],
) {
  const normalizedLocale = locale || "zh-CN";
  const profile = await ensureCurrentUserProfile(
    normalizedLocale,
    "/notifications",
  );
  const ids = getNotificationIdList(notificationIds);

  if (ids.length > 0) {
    await prisma.notification.deleteMany({
      where: getVisibleNotificationWhere({
        id: {
          in: ids,
        },
        recipientId: profile.id,
      }),
    });
  }

  revalidatePath(withLocale(normalizedLocale, "/notifications"));

  return { ok: true as const };
}

export async function markNotificationReadClientAction(
  locale: string,
  notificationId: string,
) {
  const normalizedLocale = locale || "zh-CN";
  const profile = await ensureCurrentUserProfile(
    normalizedLocale,
    "/notifications",
  );

  if (notificationId) {
    await prisma.notification.updateMany({
      where: getVisibleNotificationWhere({
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      }),
      data: {
        readAt: new Date(),
      },
    });
  }

  revalidatePath(withLocale(normalizedLocale, "/notifications"));

  return { ok: true as const };
}

export async function markNotificationsReadClientAction(
  locale: string,
  notificationIds: string[],
) {
  const normalizedLocale = locale || "zh-CN";
  const profile = await ensureCurrentUserProfile(
    normalizedLocale,
    "/notifications",
  );
  const ids = getNotificationIdList(notificationIds);

  if (ids.length > 0) {
    await prisma.notification.updateMany({
      where: getVisibleNotificationWhere({
        id: {
          in: ids,
        },
        recipientId: profile.id,
        readAt: null,
      }),
      data: {
        readAt: new Date(),
      },
    });
  }

  revalidatePath(withLocale(normalizedLocale, "/notifications"));

  return { ok: true as const };
}

export async function markAllNotificationsReadClientAction(locale: string) {
  const normalizedLocale = locale || "zh-CN";
  const profile = await ensureCurrentUserProfile(
    normalizedLocale,
    "/notifications",
  );

  await prisma.notification.updateMany({
    where: getVisibleNotificationWhere({
      recipientId: profile.id,
      readAt: null,
    }),
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath(withLocale(normalizedLocale, "/notifications"));

  return { ok: true as const };
}

export async function followBackFromNotificationClientAction(
  locale: string,
  notificationId: string,
) {
  const normalizedLocale = locale || "zh-CN";
  const profile = await ensureCurrentUserProfile(
    normalizedLocale,
    "/notifications",
  );
  const notification = await prisma.notification.findFirst({
    where: getVisibleNotificationWhere({
      id: notificationId,
      recipientId: profile.id,
      type: "FRIEND_REQUEST",
    }),
    select: {
      aaTransactionId: true,
      actor: {
        select: {
          id: true,
          nickname: true,
          status: true,
        },
      },
    },
  });
  const target = notification?.actor;

  if (!target || target.id === profile.id || target.status !== "ACTIVE") {
    return { ok: false as const };
  }

  const targetFollowsViewer = await prisma.userFollow.findUnique({
    where: {
      followerId_followingId: {
        followerId: target.id,
        followingId: profile.id,
      },
    },
    select: {
      id: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.userFollow.upsert({
      where: {
        followerId_followingId: {
          followerId: profile.id,
          followingId: target.id,
        },
      },
      create: {
        followerId: profile.id,
        followingId: target.id,
      },
      update: {},
    });

    await tx.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    await createNotification(tx, {
      actorDisplayName: profile.nickname,
      actorId: profile.id,
      dedupe: true,
      recipientId: target.id,
      type: "FRIEND_REQUEST",
    });
  });

  if (targetFollowsViewer) {
    await markReferralMutualFollowAcceptedBetween(profile.id, target.id).catch(
      (error: unknown) => {
        console.error("Failed to mark referral mutual follow accepted", error);
      },
    );
  }

  revalidatePath(withLocale(normalizedLocale, "/notifications"));
  revalidatePath(withLocale(normalizedLocale, "/profile"));
  revalidatePath(withLocale(normalizedLocale, "/profile/network"));
  revalidatePath(withLocale(normalizedLocale, `/profile/${target.id}`));

  return {
    isMutualFollow: Boolean(targetFollowsViewer),
    ok: true as const,
  };
}

export async function deleteReadNotificationsAction(formData: FormData) {
  const locale = getString(formData, "locale") || "zh-CN";
  const profile = await ensureCurrentUserProfile(locale, "/notifications");

  await prisma.notification.deleteMany({
    where: getVisibleNotificationWhere({
      recipientId: profile.id,
      readAt: {
        not: null,
      },
    }),
  });

  revalidatePath(withLocale(locale, "/notifications"));
  redirect(withLocale(locale, "/notifications"));
}

export async function deleteReadNotificationsClientAction(locale: string) {
  const normalizedLocale = locale || "zh-CN";
  const profile = await ensureCurrentUserProfile(
    normalizedLocale,
    "/notifications",
  );

  await prisma.notification.deleteMany({
    where: getVisibleNotificationWhere({
      recipientId: profile.id,
      readAt: {
        not: null,
      },
    }),
  });

  revalidatePath(withLocale(normalizedLocale, "/notifications"));

  return { ok: true as const };
}

export async function openNotificationActivityAction(formData: FormData) {
  const locale = getString(formData, "locale") || "zh-CN";
  const notificationId = getString(formData, "notificationId");
  const profile = await ensureCurrentUserProfile(locale, "/notifications");
  const notification = await prisma.notification.findFirst({
    where: getVisibleNotificationWhere({
      id: notificationId,
      recipientId: profile.id,
    }),
    select: {
      aaTransactionId: true,
      actorId: true,
      activityId: true,
      momentId: true,
      planet: {
        select: {
          slug: true,
        },
      },
      type: true,
    },
  });

  if (notification?.type === "FRIEND_REQUEST") {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    revalidatePath(withLocale(locale, "/notifications"));
    if (notification.actorId) {
      revalidatePath(withLocale(locale, `/profile/${notification.actorId}`));
    }
    trackNotificationOpened({
      locale,
      notificationId,
      targetType: "profile",
      type: notification.type,
      userProfileId: profile.id,
    });
    redirect(
      withLocale(
        locale,
        notification.actorId
          ? `/profile/${notification.actorId}`
          : "/notifications",
      ),
    );
  }

  if (notification?.type === "PLANET_JOIN_REQUEST") {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    revalidatePath(withLocale(locale, "/notifications"));
    if (notification.planet?.slug) {
      revalidatePath(withLocale(locale, `/planets/${notification.planet.slug}`));
    }
    trackNotificationOpened({
      locale,
      notificationId,
      targetType: "notifications",
      type: notification.type,
      userProfileId: profile.id,
    });
    redirect(
      withLocale(
        locale,
        notification.planet?.slug
          ? `/planets/${notification.planet.slug}`
          : "/planets",
      ),
    );
  }

  if (notification?.type === "REPORT_CREATED") {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    revalidatePath(withLocale(locale, "/notifications"));
    revalidatePath(withLocale(locale, "/admin/reports"));
    trackNotificationOpened({
      locale,
      notificationId,
      targetType: "admin_reports",
      type: notification.type,
      userProfileId: profile.id,
    });
    redirect(withLocale(locale, "/admin/reports"));
  }

  if (notification?.type === "CHARM_GIFT_RECEIVED") {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    revalidatePath(withLocale(locale, "/notifications"));
    if (notification.actorId) {
      revalidatePath(withLocale(locale, `/profile/${notification.actorId}`));
    }
    trackNotificationOpened({
      locale,
      notificationId,
      targetType: "profile",
      type: notification.type,
      userProfileId: profile.id,
    });
    redirect(
      withLocale(
        locale,
        notification.actorId
          ? `/profile/${notification.actorId}`
          : "/notifications",
      ),
    );
  }

  if (notification?.type === "DIRECT_MESSAGE" && notification.actorId) {
    const conversation = await prisma.conversation.findUnique({
      where: {
        userAId_userBId: getConversationPair(profile.id, notification.actorId),
      },
      select: {
        id: true,
      },
    });

    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    revalidatePath(withLocale(locale, "/notifications"));
    if (conversation?.id) {
      revalidatePath(withLocale(locale, `/messages/${conversation.id}`));
    }
    revalidatePath(withLocale(locale, "/messages"));
    trackNotificationOpened({
      locale,
      notificationId,
      targetType: "messages",
      type: notification.type,
      userProfileId: profile.id,
    });

    const target = conversation?.id
      ? notification.activityId
        ? `/messages/${conversation.id}?activityId=${encodeURIComponent(notification.activityId)}`
        : `/messages/${conversation.id}`
      : "/messages";

    redirect(withLocale(locale, target));
  }

  if (
    notification?.type === "MOMENT_LIKED" ||
    notification?.type === "MOMENT_COMMENTED" ||
    notification?.type === "MOMENT_COMMENT_REPLY" ||
    notification?.type === "MOMENT_REPOSTED"
  ) {
    await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: profile.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    revalidatePath(withLocale(locale, "/notifications"));
    revalidatePath(withLocale(locale, "/footprints"));
    trackNotificationOpened({
      locale,
      notificationId,
      targetType: "notifications",
      type: notification.type,
      userProfileId: profile.id,
    });
    redirect(
      withLocale(
        locale,
        notification.momentId
          ? `/footprints/${notification.momentId}`
          : "/footprints",
      ),
    );
  }

  if (!notification?.activityId) {
    if (notification) {
      trackNotificationOpened({
        locale,
        notificationId,
        targetType: "notifications",
        type: notification.type,
        userProfileId: profile.id,
      });
    }
    redirect(withLocale(locale, "/notifications"));
  }

  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      recipientId: profile.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  revalidatePath(withLocale(locale, "/notifications"));

  const target = notification.type.startsWith("AA_")
    ? notification.aaTransactionId
      ? `/lobby/${notification.activityId}/aa/transactions/${notification.aaTransactionId}`
      : `/lobby/${notification.activityId}/aa`
    : notification.type === "PARTICIPATION_PENDING" && notification.actorId
      ? `${getActivityDetailPath(notification.activityId)}#participation-approval`
      : notification.type === "ACTIVITY_COMMENTED" ||
          notification.type === "COMMENT_REPLY"
        ? `${getActivityDetailPath(notification.activityId)}#comments`
        : getActivityDetailPath(notification.activityId);

  trackNotificationOpened({
    locale,
    notificationId,
    targetType: "activity",
    type: notification.type,
    userProfileId: profile.id,
  });
  redirect(withLocale(locale, target));
}
