import type { NotificationType, Prisma } from "@prisma/client";
import { createNotifications } from "@/features/notifications/utils/createNotification";

type AaNotificationParticipant = {
  id: string;
  userProfileId: string | null;
};

export async function createAaNotifications(
  tx: Prisma.TransactionClient,
  input: {
    aaTransactionId?: string | null;
    activityId: string;
    actor: {
      displayNameSnapshot: string;
      userProfileId: string | null;
    };
    occurrenceId: string;
    participants: AaNotificationParticipant[];
    recipientParticipantIds: Iterable<string>;
    type: Extract<
      NotificationType,
      | "AA_DISPUTE_OPENED"
      | "AA_ENTRY_UPDATED"
      | "AA_PAYMENT_REQUEST"
      | "AA_REVIEW_REQUIRED"
      | "AA_TRANSFER_CONFIRMATION"
    >;
  },
) {
  const recipientIds = new Set(input.recipientParticipantIds);
  const profileIds = new Set(
    input.participants
      .filter((participant) => recipientIds.has(participant.id))
      .flatMap((participant) => participant.userProfileId ?? []),
  );
  if (input.actor.userProfileId) profileIds.delete(input.actor.userProfileId);

  return createNotifications(
    tx,
    [...profileIds].map((recipientId) => ({
      aaTransactionId: input.aaTransactionId,
      actorDisplayName: input.actor.displayNameSnapshot,
      actorId: input.actor.userProfileId,
      activityId: input.activityId,
      dedupe: true,
      dedupeIncludingRead: true,
      occurrenceId: input.occurrenceId,
      recipientId,
      type: input.type,
    })),
  );
}
