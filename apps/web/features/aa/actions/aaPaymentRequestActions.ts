"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  buildSettlementSuggestions,
  calculateBalances,
} from "../domain/ledger";
import { getActivityAaAccess } from "../server/access";
import { createAaNotifications } from "../server/notifications";
import { getCurrentUserProfileForMutation } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

const requestSchema = z.object({
  activityId: z.string().min(1),
  amountMinor: z.coerce.bigint().positive(),
  fromParticipantId: z.string().min(1),
  ledgerVersion: z.coerce.number().int().positive(),
  locale: z.string().min(1),
  toParticipantId: z.string().min(1),
});

export async function createAaPaymentRequestAction(formData: FormData) {
  const input = requestSchema.parse({
    activityId: value(formData, "activityId"),
    amountMinor: value(formData, "amountMinor"),
    fromParticipantId: value(formData, "fromParticipantId"),
    ledgerVersion: value(formData, "ledgerVersion"),
    locale: value(formData, "locale") || "zh-CN",
    toParticipantId: value(formData, "toParticipantId"),
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa`,
  );

  const requestId = await prisma.$transaction(async (tx) => {
    const access = await getActivityAaAccess(input.activityId, profile.id, tx);
    const ledger = await tx.aaLedger.findUnique({
      where: { activityId: input.activityId },
      include: {
        participants: true,
        transactions: { include: { contributions: true, shares: true } },
      },
    });
    if (!access || !ledger || ledger.status === "ARCHIVED") {
      throw new Error("FORBIDDEN");
    }
    const viewer = ledger.participants.find(
      (participant) => participant.userProfileId === profile.id,
    );
    if (!viewer || (viewer.id !== input.toParticipantId && !access.canManage)) {
      throw new Error("FORBIDDEN");
    }
    if (ledger.version !== input.ledgerVersion) throw new Error("STALE_LEDGER");
    if (
      ledger.transactions.some((transaction) =>
        ["PENDING_REVIEW", "PENDING_CONFIRMATION", "DISPUTED"].includes(
          transaction.status,
        ),
      )
    ) {
      throw new Error("SETTLEMENT_BLOCKED");
    }

    const balances = calculateBalances(
      ledger.participants.map((participant) => participant.id),
      ledger.transactions.map((transaction) => ({
        baseAmountMinor: transaction.baseAmountMinor,
        contributions: transaction.contributions,
        id: transaction.id,
        shares: transaction.shares,
        status: transaction.status,
        transferFromParticipantId: transaction.transferFromParticipantId,
        transferToParticipantId: transaction.transferToParticipantId,
        type: transaction.type,
      })),
    );
    const matches = buildSettlementSuggestions(balances).some(
      (suggestion) =>
        suggestion.amountMinor === input.amountMinor &&
        suggestion.fromParticipantId === input.fromParticipantId &&
        suggestion.toParticipantId === input.toParticipantId,
    );
    if (!matches) throw new Error("STALE_LEDGER");

    const existing = await tx.aaPaymentRequest.findFirst({
      where: {
        amountMinor: input.amountMinor,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        fromParticipantId: input.fromParticipantId,
        ledgerId: ledger.id,
        ledgerVersion: ledger.version,
        status: { in: ["SENT", "VIEWED"] },
        toParticipantId: input.toParticipantId,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.aaPaymentRequest.create({
      data: {
        amountMinor: input.amountMinor,
        createdByParticipantId: viewer.id,
        currency: ledger.baseCurrency,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        fromParticipantId: input.fromParticipantId,
        ledgerId: ledger.id,
        ledgerVersion: ledger.version,
        sentAt: new Date(),
        status: "SENT",
        toParticipantId: input.toParticipantId,
      },
      select: { id: true },
    });
    await tx.aaAuditEvent.create({
      data: {
        action: "CREATE_PAYMENT_REQUEST",
        actorParticipantId: viewer.id,
        after: {
          amountMinor: input.amountMinor.toString(),
          fromParticipantId: input.fromParticipantId,
          toParticipantId: input.toParticipantId,
        },
        entityId: created.id,
        entityType: "PAYMENT_REQUEST",
        ledgerId: ledger.id,
      },
    });
    await createAaNotifications(tx, {
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${created.id}:payment-request`,
      participants: ledger.participants,
      recipientParticipantIds: [input.fromParticipantId],
      type: "AA_PAYMENT_REQUEST",
    });
    return created.id;
  });

  revalidatePath(withLocale(input.locale, `/lobby/${input.activityId}/aa`));
  redirect(
    withLocale(
      input.locale,
      `/lobby/${input.activityId}/aa/requests/${requestId}`,
    ),
  );
}

export async function cancelAaPaymentRequestAction(formData: FormData) {
  const activityId = value(formData, "activityId");
  const requestId = value(formData, "requestId");
  const locale = value(formData, "locale") || "zh-CN";
  const profile = await getCurrentUserProfileForMutation(
    locale,
    `/lobby/${activityId}/aa`,
  );

  await prisma.$transaction(async (tx) => {
    const access = await getActivityAaAccess(activityId, profile.id, tx);
    const request = await tx.aaPaymentRequest.findFirst({
      where: { id: requestId, ledger: { activityId } },
      include: { creator: true, ledger: { include: { participants: true } } },
    });
    if (
      !access ||
      !request ||
      (request.creator.userProfileId !== profile.id && !access.canManage)
    ) {
      throw new Error("FORBIDDEN");
    }
    const viewer = request.ledger.participants.find(
      (participant) => participant.userProfileId === profile.id,
    );
    if (!viewer) throw new Error("FORBIDDEN");
    await tx.aaPaymentRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED" },
    });
    await tx.aaAuditEvent.create({
      data: {
        action: "CANCEL_PAYMENT_REQUEST",
        actorParticipantId: viewer.id,
        entityId: request.id,
        entityType: "PAYMENT_REQUEST",
        ledgerId: request.ledgerId,
      },
    });
  });

  redirect(withLocale(locale, `/lobby/${activityId}/aa/progress`));
}
