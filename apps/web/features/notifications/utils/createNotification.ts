import { createHash, randomUUID } from "node:crypto";
import type { NotificationType, Prisma } from "@prisma/client";
import { after } from "next/server";
import { sendMobilePushForNotification } from "@/features/mobile/push/sendMobilePush";
import {
  getPerformanceRolloutMode,
  logPerformanceShadow,
} from "@/lib/performanceRollouts";

type NotificationWriter = Pick<Prisma.TransactionClient, "notification">;

type CreateNotificationInput = {
  actorDisplayName?: string | null;
  actorId?: string | null;
  aaTransactionId?: string | null;
  activityId?: string | null;
  activityAnnouncementId?: string | null;
  charmGiftEventId?: string | null;
  dedupe?: boolean;
  dedupeIncludingRead?: boolean;
  momentCommentId?: string | null;
  momentId?: string | null;
  occurrenceId?: string | null;
  planetId?: string | null;
  recipientId: string;
  type: NotificationType;
};

export function getNotificationDedupeKey(input: CreateNotificationInput) {
  const occurrenceId = input.occurrenceId?.trim();

  if (!occurrenceId) {
    return null;
  }

  return `v1:${createHash("sha256")
    .update(
      [
        input.type,
        occurrenceId,
        input.recipientId,
        input.actorId ?? "",
        input.aaTransactionId ?? "",
        input.activityId ?? "",
        input.activityAnnouncementId ?? "",
        input.charmGiftEventId ?? "",
        input.momentCommentId ?? "",
        input.momentId ?? "",
        input.planetId ?? "",
      ].join("\n"),
    )
    .digest("hex")}`;
}

function getNotificationIdentity(input: CreateNotificationInput) {
  return {
    actorDisplayName: input.actorDisplayName?.trim() || null,
    actorId: input.actorId ?? null,
    aaTransactionId: input.aaTransactionId ?? null,
    activityId: input.activityId ?? null,
    activityAnnouncementId: input.activityAnnouncementId ?? null,
    charmGiftEventId: input.charmGiftEventId ?? null,
    dedupeKey: getNotificationDedupeKey(input),
    momentCommentId: input.momentCommentId ?? null,
    momentId: input.momentId ?? null,
    planetId: input.planetId ?? null,
    recipientId: input.recipientId,
    type: input.type,
  };
}

export async function createNotification(
  tx: NotificationWriter,
  input: CreateNotificationInput,
) {
  const identity = getNotificationIdentity(input);
  const shouldDedupe = input.dedupe ?? true;

  if (shouldDedupe) {
    const existingNotification = await tx.notification.findFirst({
      where: {
        ...identity,
        ...(input.dedupeIncludingRead ? {} : { readAt: null }),
      },
      select: {
        id: true,
      },
    });

    if (existingNotification) {
      return null;
    }
  }

  const notification = await tx.notification.create({
    data: identity,
  });

  after(() =>
    sendMobilePushForNotification(notification.id).catch((error) => {
      console.error("Failed to dispatch mobile push notification", error);
    }),
  );

  return notification;
}

export async function createNotifications(
  tx: NotificationWriter,
  inputs: CreateNotificationInput[],
) {
  if (inputs.length === 0) {
    return { count: 0 };
  }

  const rolloutKey =
    inputs.find((input) => input.occurrenceId)?.occurrenceId ??
    inputs[0]!.recipientId;
  const mode = getPerformanceRolloutMode("notificationBatch", rolloutKey);
  const identities = inputs.map((input) => ({
    id: randomUUID(),
    ...getNotificationIdentity(input),
  }));
  const supportsStableBatch = identities.every(
    (identity) => identity.dedupeKey,
  );
  let shadowExpectedBatchCount: number | null = null;
  let pendingIdentities = identities;

  if (mode !== "legacy" && supportsStableBatch) {
    const dedupeKeys = identities.map((identity) => identity.dedupeKey!);
    const existing = await tx.notification.findMany({
      where: {
        dedupeKey: {
          in: dedupeKeys,
        },
      },
      select: {
        dedupeKey: true,
      },
    });
    const existingKeys = new Set(
      existing.map((notification) => notification.dedupeKey),
    );
    const pendingKeys = new Set<string>();
    pendingIdentities = identities.filter((identity) => {
      const dedupeKey = identity.dedupeKey!;

      if (existingKeys.has(dedupeKey) || pendingKeys.has(dedupeKey)) {
        return false;
      }

      pendingKeys.add(dedupeKey);
      return true;
    });
    shadowExpectedBatchCount = pendingIdentities.length;

    if (mode === "shadow") {
      logPerformanceShadow("b2_notification_batch_expected", {
        expectedBatchCount: shadowExpectedBatchCount,
        inputCount: inputs.length,
        mode,
        occurrenceId: rolloutKey,
      });
    }
  }

  if (mode === "canary" && supportsStableBatch) {
    if (pendingIdentities.length === 0) {
      return { count: 0 };
    }

    const result = await tx.notification.createMany({
      data: pendingIdentities,
      skipDuplicates: true,
    });

    pendingIdentities.forEach((identity) => {
      after(() =>
        sendMobilePushForNotification(identity.id).catch((error) => {
          console.error("Failed to dispatch batched mobile push", error);
        }),
      );
    });

    logPerformanceShadow("b2_notification_batch", {
      expectedBatchCount: result.count,
      inputCount: inputs.length,
      mode,
      occurrenceId: rolloutKey,
    });

    return { count: result.count };
  }

  let count = 0;

  for (const input of inputs) {
    const notification = await createNotification(tx, input);

    if (notification) {
      count += 1;
    }
  }

  if (mode === "shadow" && shadowExpectedBatchCount !== null) {
    logPerformanceShadow("b2_notification_batch_comparison", {
      actualLegacyCount: count,
      expectedBatchCount: shadowExpectedBatchCount,
      inputCount: inputs.length,
      mismatch: count !== shadowExpectedBatchCount,
      mode,
      occurrenceId: rolloutKey,
    });
  }

  return { count };
}
