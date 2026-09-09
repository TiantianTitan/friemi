"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type {
  ActivityStatus,
  ActivityVisibility,
  ParticipantStatus,
  UserProfileStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeAnalyticsLocale } from "@/features/analytics/events";
import { queueAnalyticsEvent } from "@/features/analytics/server";
import { getActivityDetailPath } from "@/features/activities/utils/activityRoutes";
import { createNotification } from "@/features/notifications/utils/createNotification";
import { isCurrentUserAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeGuestEmail,
  normalizeGuestPhone,
  normalizeGuestWechatId,
} from "../utils/contactIdentity";
import {
  guestJoinRateLimitWindowMs,
  isGuestJoinRateLimited,
} from "../utils/guestJoinRateLimit";

const activeParticipantStatuses: ParticipantStatus[] = ["JOINED", "APPROVED"];
const existingGuestStatuses: ParticipantStatus[] = [
  "JOINED",
  "APPROVED",
  "PENDING",
];
const joinableActivityStatuses: ActivityStatus[] = ["RECRUITING", "CONFIRMED"];
const joinableActivityVisibility: ActivityVisibility[] = [
  "PUBLIC",
  "LINK_ONLY",
  "PRIVATE",
];
const activeOrganizerStatuses: UserProfileStatus[] = ["ACTIVE"];

const guestJoinSchema = z.object({
  activityId: z.string().min(1, "活动不存在"),
  locale: z.string().min(1).default("zh-CN"),
  displayName: z
    .string()
    .trim()
    .min(1, "请填写名字或昵称")
    .max(24, "名字最多 24 个字"),
  phone: z.string().trim().max(40, "电话过长").optional(),
  email: z
    .string()
    .trim()
    .max(120, "邮箱过长")
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: "请输入有效邮箱",
    }),
  wechatId: z.string().trim().max(80, "微信号过长").optional(),
  message: z.string().trim().max(300, "留言最多 300 个字").optional(),
});

export type GuestJoinActivityState = {
  activityId?: string;
  fieldErrors?: Record<string, string[]>;
  formError?: string;
  success?: boolean;
  values?: {
    displayName: string;
    email: string;
    message: string;
    phone: string;
    wechatId: string;
  };
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function getActivityEndBoundary(activity: {
  startAt: Date;
  endAt: Date | null;
}) {
  return activity.endAt ?? activity.startAt;
}

function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function getHeaderValue(
  requestHeaders: Awaited<ReturnType<typeof headers>>,
  names: string[],
) {
  for (const name of names) {
    const value = requestHeaders.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function getSourceFingerprint(
  requestHeaders: Awaited<ReturnType<typeof headers>>,
) {
  const forwardedFor = getHeaderValue(requestHeaders, [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "x-vercel-forwarded-for",
  ]);
  const firstIp = forwardedFor?.split(",")[0]?.trim() ?? "";
  const userAgent = requestHeaders.get("user-agent")?.trim() ?? "";
  const seed = [firstIp, userAgent].filter(Boolean).join("|");

  if (!seed) {
    return null;
  }

  return createHash("sha256").update(seed).digest("hex");
}

function getValues(rawInput: {
  displayName: string;
  email: string;
  message: string;
  phone: string;
  wechatId: string;
}) {
  return {
    displayName: rawInput.displayName,
    email: rawInput.email,
    message: rawInput.message,
    phone: rawInput.phone,
    wechatId: rawInput.wechatId,
  };
}

export async function joinActivityAsGuestAction(
  _previousState: GuestJoinActivityState,
  formData: FormData,
): Promise<GuestJoinActivityState> {
  const rawInput = {
    activityId: getString(formData, "activityId"),
    locale: getString(formData, "locale") || "zh-CN",
    displayName: getString(formData, "displayName"),
    phone: getString(formData, "phone"),
    email: getString(formData, "email"),
    wechatId: getString(formData, "wechatId"),
    message: getString(formData, "message"),
  };

  if (!(await isCurrentUserAdmin())) {
    return {
      formError: "只有网站管理员可以添加游客。",
      values: getValues(rawInput),
    };
  }

  const result = guestJoinSchema.safeParse(rawInput);

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors as Record<
      string,
      string[] | undefined
    >;

    return {
      fieldErrors: fieldErrors as Record<string, string[]>,
      formError: fieldErrors.contact?.[0] ?? "请检查游客信息。",
      values: getValues(rawInput),
    };
  }

  const normalizedEmail = normalizeGuestEmail(result.data.email);
  const normalizedPhone = normalizeGuestPhone(result.data.phone);
  const normalizedWechatId = normalizeGuestWechatId(result.data.wechatId);
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent");
  const sourceFingerprint = getSourceFingerprint(requestHeaders);

  try {
    const joinResult = await prisma.$transaction(
      async (tx) => {
        const activity = await tx.activity.findUnique({
          where: {
            id: result.data.activityId,
          },
          select: {
            id: true,
            organizerId: true,
            status: true,
            visibility: true,
            startAt: true,
            endAt: true,
            capacity: true,
            organizer: {
              select: {
                status: true,
              },
            },
            _count: {
              select: {
                guestParticipants: {
                  where: {
                    linkedParticipantId: null,
                    status: {
                      in: activeParticipantStatuses,
                    },
                  },
                },
                participants: {
                  where: {
                    status: {
                      in: activeParticipantStatuses,
                    },
                  },
                },
              },
            },
          },
        });

        if (!activity) {
          return { ok: false as const, error: "活动不存在或已不可见。" };
        }

        if (
          !joinableActivityVisibility.includes(activity.visibility) ||
          !activeOrganizerStatuses.includes(activity.organizer.status)
        ) {
          return { ok: false as const, error: "活动不存在或已不可见。" };
        }

        if (activity.status === "CANCELLED" || activity.status === "ENDED") {
          return {
            ok: false as const,
            error: "活动已结束或取消，不能继续报名。",
          };
        }

        if (!joinableActivityStatuses.includes(activity.status)) {
          return { ok: false as const, error: "当前活动暂不可报名。" };
        }

        if (getActivityEndBoundary(activity) <= new Date()) {
          return { ok: false as const, error: "活动已结束，不能继续报名。" };
        }

        if (sourceFingerprint) {
          const recentAttemptThreshold = new Date(
            Date.now() - guestJoinRateLimitWindowMs,
          );
          const [activityAttemptCount, globalAttemptCount] = await Promise.all([
            tx.guestActivityParticipant.count({
              where: {
                activityId: activity.id,
                createdAt: {
                  gte: recentAttemptThreshold,
                },
                sourceFingerprint,
              },
            }),
            tx.guestActivityParticipant.count({
              where: {
                createdAt: {
                  gte: recentAttemptThreshold,
                },
                sourceFingerprint,
              },
            }),
          ]);

          if (
            isGuestJoinRateLimited({
              activityAttemptCount,
              globalAttemptCount,
            })
          ) {
            return {
              ok: false as const,
              error: "提交过于频繁，请稍后再试。",
            };
          }
        }

        const duplicateConditions = [
          normalizedEmail ? { normalizedEmail } : null,
          normalizedPhone ? { normalizedPhone } : null,
          normalizedWechatId ? { normalizedWechatId } : null,
        ].filter(Boolean) as Prisma.GuestActivityParticipantWhereInput[];

        const existingGuest =
          duplicateConditions.length > 0
            ? await tx.guestActivityParticipant.findFirst({
                where: {
                  activityId: activity.id,
                  status: {
                    in: existingGuestStatuses,
                  },
                  OR: duplicateConditions,
                },
                select: {
                  id: true,
                },
              })
            : null;

        if (existingGuest) {
          return { ok: false as const, error: "你已经用该联系方式报名过。" };
        }

        if (
          activity.capacity > 0 &&
          activity._count.participants + activity._count.guestParticipants >=
            activity.capacity
        ) {
          return { ok: false as const, error: "活动名额已满，不能继续报名。" };
        }

        const nextStatus: ParticipantStatus = "APPROVED";

        await tx.guestActivityParticipant.create({
          data: {
            activityId: activity.id,
            displayName: result.data.displayName,
            email: result.data.email?.trim() || null,
            normalizedEmail,
            phone: result.data.phone?.trim() || null,
            normalizedPhone,
            wechatId: result.data.wechatId?.trim() || null,
            normalizedWechatId,
            message: result.data.message?.trim() || null,
            sourceLocale: result.data.locale,
            sourceUserAgent: userAgent,
            sourceFingerprint,
            status: nextStatus,
          },
        });

        return {
          ok: true as const,
          activityId: activity.id,
          organizerId: activity.organizerId,
          status: nextStatus,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (!joinResult.ok) {
      return {
        formError: joinResult.error,
        values: getValues(rawInput),
      };
    }

    await createNotification(prisma, {
      actorDisplayName: result.data.displayName,
      activityId: joinResult.activityId,
      recipientId: joinResult.organizerId,
      type: "PARTICIPATION_CONFIRMED",
    }).catch((error) => {
      console.error("Failed to create guest participation notification", error);
    });

    queueAnalyticsEvent({
      locale: normalizeAnalyticsLocale(result.data.locale),
      name: "join_submitted",
      route: `/${result.data.locale}${getActivityDetailPath(joinResult.activityId)}`,
      entityId: joinResult.activityId,
      entityType: "team",
      sourceSurface: "activity_detail",
      properties: {
        participant_status: joinResult.status,
        requires_approval: false,
        submitter_kind: "admin_guest",
      },
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return {
        formError: "你已经用该联系方式报名过。",
        values: getValues(rawInput),
      };
    }

    console.error("Failed to add guest participant", error);

    return {
      formError: "添加游客失败，请稍后重试。",
      values: getValues(rawInput),
    };
  }

  return {
    activityId: result.data.activityId,
    success: true,
  };
}
