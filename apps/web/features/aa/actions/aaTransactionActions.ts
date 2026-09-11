"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  AaParticipantRole,
  AaTransactionStatus,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { getCurrentUserProfileForMutation } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";
import {
  allocateByWeights,
  allocateEqually,
  convertToBaseMinor,
  parseDecimalToScaledInteger,
  parseMoneyToMinor,
} from "../domain/money";
import { assertTransactionInvariant } from "../domain/ledger";
import { ensureActivityAaLedger } from "../server/ledgerService";
import { getActivityAaAccess } from "../server/access";
import { uploadAaReceipt } from "../server/receiptStorage";
import { createAaNotifications } from "../server/notifications";

export type CreateAaTransactionState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  transactionId?: string;
};

const createSchema = z.object({
  activityId: z.string().min(1),
  locale: z.string().min(1).default("zh-CN"),
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  title: z.string().trim().min(1).max(120),
  amount: z.string().trim().min(1),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  fxRate: z.string().trim().min(1),
  fxRateSource: z.string().trim().max(80).optional(),
  fxRateDate: z.string().trim().optional(),
  categoryId: z.string().optional(),
  occurredOn: z.string().min(1),
  splitMode: z.enum(["EQUAL", "WEIGHT", "PERCENT", "CUSTOM"]),
  contributorParticipantId: z.string().optional(),
  transferFromParticipantId: z.string().optional(),
  transferToParticipantId: z.string().optional(),
  note: z.string().trim().max(2000).optional(),
  clientMutationId: z.string().trim().max(120).optional(),
  futureConfirmed: z.boolean().default(false),
});

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      forbidden: "Vous n'avez pas accès à cette répartition.",
      inactive: "Cette personne ne peut plus être ajoutée à une dépense.",
      invalid: "Vérifiez le montant, les personnes et la répartition.",
      locked:
        "Le compte est en lecture seule. Rouvrez-le avant de le modifier.",
      failed: "Impossible d'enregistrer cette opération pour le moment.",
      duplicate: "Cette opération a déjà été enregistrée.",
      capacity: "Ce compte contient déjà 10 000 opérations actives.",
      future: "Confirmez la date future avant d'enregistrer.",
    };
  }

  if (locale === "en") {
    return {
      forbidden: "You do not have access to this split.",
      inactive: "That person can no longer be added to a new entry.",
      invalid: "Check the amount, people, and split.",
      locked: "This ledger is read-only. Reopen it before making changes.",
      failed: "This entry could not be saved right now.",
      duplicate: "This entry has already been saved.",
      capacity: "This ledger already contains 10,000 active entries.",
      future: "Confirm the future date before saving.",
    };
  }

  return {
    forbidden: "你没有本次核算的操作权限。",
    inactive: "该成员已停用，不能加入新的记录。",
    invalid: "请检查金额、相关成员和分摊方式。",
    locked: "账本当前只读，请重新开启后再修改。",
    failed: "暂时无法保存这笔记录，请稍后重试。",
    duplicate: "这笔记录已经保存，请勿重复提交。",
    capacity: "该账本已达到 10,000 笔有效记录上限。",
    future: "请先确认未来日期记录会立即影响余额。",
  };
}

function isManager(role: AaParticipantRole) {
  return role === "OWNER" || role === "ADMIN";
}

function parseOccurredAt(value: string) {
  const parsed = new Date(`${value}T12:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("INVALID_DATE");
  }

  return parsed;
}

function parseOptionalFxDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildShares({
  baseAmountMinor,
  formData,
  participantIds,
  splitMode,
}: {
  baseAmountMinor: bigint;
  formData: FormData;
  participantIds: string[];
  splitMode: "EQUAL" | "WEIGHT" | "PERCENT" | "CUSTOM";
}) {
  if (splitMode === "EQUAL") {
    return allocateEqually(baseAmountMinor, participantIds);
  }

  if (splitMode === "CUSTOM") {
    const allocations = participantIds.map((participantId) => ({
      participantId,
      amountMinor: parseMoneyToMinor(
        stringValue(formData, `shareAmount:${participantId}`),
      ),
    }));

    if (
      allocations.reduce(
        (sum, allocation) => sum + allocation.amountMinor,
        0n,
      ) !== baseAmountMinor
    ) {
      throw new Error("CUSTOM_TOTAL_MISMATCH");
    }

    return allocations;
  }

  const weights = participantIds.map((participantId) => ({
    participantId,
    weight: parseDecimalToScaledInteger(
      stringValue(formData, `shareWeight:${participantId}`),
      4,
    ),
  }));

  if (
    splitMode === "PERCENT" &&
    weights.reduce((sum, item) => sum + item.weight, 0n) !== 1000000n
  ) {
    throw new Error("PERCENT_TOTAL_MISMATCH");
  }

  return allocateByWeights(baseAmountMinor, weights);
}

function refreshAaViews(locale: string, activityId: string) {
  const aaPath = withLocale(locale, `/lobby/${activityId}/aa`);
  revalidatePath(aaPath);
  revalidatePath(withLocale(locale, `/lobby/${activityId}`));
  return aaPath;
}

export async function createAaTransactionAction(
  _previousState: CreateAaTransactionState,
  formData: FormData,
): Promise<CreateAaTransactionState> {
  const locale = stringValue(formData, "locale") || "zh-CN";
  const copy = getCopy(locale);
  const parsed = createSchema.safeParse({
    activityId: stringValue(formData, "activityId"),
    locale,
    type: stringValue(formData, "type"),
    title: stringValue(formData, "title"),
    amount: stringValue(formData, "amount"),
    currency: stringValue(formData, "currency"),
    fxRate: stringValue(formData, "fxRate") || "1",
    fxRateSource: stringValue(formData, "fxRateSource") || undefined,
    fxRateDate: stringValue(formData, "fxRateDate") || undefined,
    categoryId: stringValue(formData, "categoryId") || undefined,
    occurredOn: stringValue(formData, "occurredOn"),
    splitMode: stringValue(formData, "splitMode") || "EQUAL",
    contributorParticipantId:
      stringValue(formData, "contributorParticipantId") || undefined,
    transferFromParticipantId:
      stringValue(formData, "transferFromParticipantId") || undefined,
    transferToParticipantId:
      stringValue(formData, "transferToParticipantId") || undefined,
    note: stringValue(formData, "note") || undefined,
    clientMutationId: stringValue(formData, "clientMutationId") || undefined,
    futureConfirmed: stringValue(formData, "futureConfirmed") === "true",
  });

  if (!parsed.success) {
    return { formError: copy.invalid };
  }

  let originalAmountMinor: bigint;
  let occurredAt: Date;

  try {
    originalAmountMinor = parseMoneyToMinor(parsed.data.amount);
    occurredAt = parseOccurredAt(parsed.data.occurredOn);

    if (originalAmountMinor <= 0n) {
      throw new Error("INVALID_AMOUNT");
    }
  } catch {
    return { formError: copy.invalid };
  }

  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (occurredAt > today && !parsed.data.futureConfirmed) {
    return { formError: copy.future };
  }

  const profile = await getCurrentUserProfileForMutation(
    locale,
    `/lobby/${parsed.data.activityId}/aa/new`,
  );

  let createdTransactionId: string | undefined;
  let createdLedgerId: string | undefined;
  let creatorParticipantId: string | undefined;

  try {
    await ensureActivityAaLedger(parsed.data.activityId, profile.id);

    await prisma.$transaction(async (tx) => {
      const ledger = await tx.aaLedger.findUnique({
        where: { activityId: parsed.data.activityId },
        include: {
          participants: { where: { status: "ACTIVE" } },
          categories: { where: { isActive: true } },
        },
      });

      if (!ledger) {
        throw new Error("FORBIDDEN");
      }

      const viewer = ledger.participants.find(
        (participant) => participant.userProfileId === profile.id,
      );

      if (!viewer) {
        throw new Error("FORBIDDEN");
      }
      createdLedgerId = ledger.id;
      creatorParticipantId = viewer.id;

      if (
        ledger.status === "ARCHIVED" ||
        (ledger.status === "FROZEN" && parsed.data.type !== "TRANSFER")
      ) {
        throw new Error("LOCKED");
      }

      const activeTransactionCount = await tx.aaTransaction.count({
        where: { ledgerId: ledger.id, status: { not: "VOIDED" } },
      });
      if (activeTransactionCount >= 10_000) {
        throw new Error("MAX_TRANSACTIONS");
      }

      const effectiveFxRate =
        parsed.data.currency === ledger.baseCurrency ? "1" : parsed.data.fxRate;
      const baseAmountMinor = convertToBaseMinor(
        originalAmountMinor,
        effectiveFxRate,
      );
      if (baseAmountMinor <= 0n) throw new Error("INVALID_AMOUNT");

      const activeParticipantIds = new Set(
        ledger.participants.map((participant) => participant.id),
      );
      const manager = isManager(viewer.role);
      const commonData = {
        ledgerId: ledger.id,
        type: parsed.data.type,
        title: parsed.data.title,
        note: parsed.data.note,
        originalCurrency: parsed.data.currency,
        originalAmountMinor,
        baseAmountMinor,
        fxRate: effectiveFxRate,
        fxRateSource:
          parsed.data.currency === ledger.baseCurrency
            ? "LEDGER_BASE"
            : (parsed.data.fxRateSource ?? "MANUAL"),
        fxRateDate:
          parsed.data.currency === ledger.baseCurrency
            ? null
            : parseOptionalFxDate(parsed.data.fxRateDate),
        occurredAt,
        creatorParticipantId: viewer.id,
        clientMutationId: parsed.data.clientMutationId,
      };

      if (parsed.data.type === "TRANSFER") {
        const fromId = parsed.data.transferFromParticipantId;
        const toId = parsed.data.transferToParticipantId;

        if (
          !fromId ||
          !toId ||
          fromId === toId ||
          !activeParticipantIds.has(fromId) ||
          !activeParticipantIds.has(toId) ||
          (!manager && fromId !== viewer.id && toId !== viewer.id)
        ) {
          throw new Error("INVALID_PARTICIPANTS");
        }

        const now = new Date();
        const transferStatus: AaTransactionStatus =
          ledger.requireTransferConfirmation
            ? "PENDING_CONFIRMATION"
            : "POSTED";
        const transaction = await tx.aaTransaction.create({
          data: {
            ...commonData,
            status: transferStatus,
            splitMode: null,
            categoryNameSnapshot: "转账",
            transferFromParticipantId: fromId,
            transferToParticipantId: toId,
            payerConfirmedById: fromId === viewer.id ? viewer.id : null,
            payerConfirmedAt: fromId === viewer.id ? now : null,
            payeeConfirmedById: toId === viewer.id ? viewer.id : null,
            payeeConfirmedAt: toId === viewer.id ? now : null,
          },
          select: { id: true },
        });
        createdTransactionId = transaction.id;
        const matchingRequest = await tx.aaPaymentRequest.findFirst({
          where: {
            amountMinor: baseAmountMinor,
            fromParticipantId: fromId,
            ledgerId: ledger.id,
            status: { in: ["SENT", "VIEWED"] },
            toParticipantId: toId,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (matchingRequest) {
          await tx.aaPaymentRequest.update({
            where: { id: matchingRequest.id },
            data: {
              completedAt: transferStatus === "POSTED" ? now : null,
              linkedTransferId: transaction.id,
              status:
                transferStatus === "POSTED" ? "COMPLETED" : "VIEWED",
              viewedAt: now,
            },
          });
        }

        await tx.aaAuditEvent.create({
          data: {
            ledgerId: ledger.id,
            transactionId: transaction.id,
            actorParticipantId: viewer.id,
            action: "CREATE_TRANSFER",
            entityType: "TRANSACTION",
            entityId: transaction.id,
            after: {
              amountMinor: baseAmountMinor.toString(),
              fromId,
              toId,
              status: transferStatus,
            },
          },
        });
        await createAaNotifications(tx, {
          aaTransactionId: transaction.id,
          activityId: parsed.data.activityId,
          actor: viewer,
          occurrenceId: `${transaction.id}:created`,
          participants: ledger.participants,
          recipientParticipantIds: [fromId, toId],
          type:
            transferStatus === "POSTED"
              ? "AA_ENTRY_UPDATED"
              : "AA_TRANSFER_CONFIRMATION",
        });
      } else {
        const contributorId = parsed.data.contributorParticipantId;
        const participantIds = formData
          .getAll("shareParticipantIds")
          .filter((value): value is string => typeof value === "string");

        if (
          participantIds.length === 0 ||
          participantIds.some(
            (participantId) => !activeParticipantIds.has(participantId),
          )
        ) {
          throw new Error("INVALID_PARTICIPANTS");
        }

        const uniqueParticipantIds = [...new Set(participantIds)];
        const shares = buildShares({
          baseAmountMinor,
          formData,
          participantIds: uniqueParticipantIds,
          splitMode: parsed.data.splitMode,
        });
        const selectedContributionIds = [
          ...new Set(
            formData
              .getAll("contributionParticipantIds")
              .filter((value): value is string => typeof value === "string"),
          ),
        ];
        let contributions: Array<{
          participantId: string;
          amountMinor: bigint;
        }>;

        if (selectedContributionIds.length > 0) {
          if (
            selectedContributionIds.some(
              (participantId) => !activeParticipantIds.has(participantId),
            )
          ) {
            throw new Error("INVALID_PARTICIPANTS");
          }

          const originalContributions = selectedContributionIds.map(
            (participantId) => ({
              participantId,
              amountMinor: parseMoneyToMinor(
                stringValue(formData, `contributionAmount:${participantId}`),
              ),
            }),
          );
          if (
            originalContributions.some((item) => item.amountMinor <= 0n) ||
            originalContributions.reduce(
              (sum, item) => sum + item.amountMinor,
              0n,
            ) !== originalAmountMinor
          ) {
            throw new Error("CONTRIBUTION_TOTAL_MISMATCH");
          }

          contributions = allocateByWeights(
            baseAmountMinor,
            originalContributions.map((item) => ({
              participantId: item.participantId,
              weight: item.amountMinor,
            })),
          );
        } else {
          if (!contributorId || !activeParticipantIds.has(contributorId)) {
            throw new Error("INVALID_PARTICIPANTS");
          }
          contributions = [
            { participantId: contributorId, amountMinor: baseAmountMinor },
          ];
        }

        if (
          !manager &&
          !contributions.some((item) => item.participantId === viewer.id) &&
          !shares.some((item) => item.participantId === viewer.id)
        ) {
          throw new Error("INVALID_PARTICIPANTS");
        }
        const category = ledger.categories.find(
          (item) => item.id === parsed.data.categoryId,
        );
        const status: AaTransactionStatus =
          manager || !ledger.requireMemberReview ? "POSTED" : "PENDING_REVIEW";
        const transactionInput = {
          id: "new",
          type: parsed.data.type,
          status,
          baseAmountMinor,
          contributions,
          shares,
        };

        if (status === "POSTED") {
          assertTransactionInvariant(transactionInput);
        }

        const transaction = await tx.aaTransaction.create({
          data: {
            ...commonData,
            status,
            splitMode: parsed.data.splitMode,
            categoryId: category?.id,
            categoryNameSnapshot: category?.name ?? "其他",
            reviewedByParticipantId: status === "POSTED" ? viewer.id : null,
            reviewedAt: status === "POSTED" ? new Date() : null,
            contributions: {
              create: contributions,
            },
            shares: {
              create: shares.map((share) => ({
                participantId: share.participantId,
                amountMinor: share.amountMinor,
                ruleValue:
                  parsed.data.splitMode === "EQUAL"
                    ? null
                    : stringValue(
                        formData,
                        parsed.data.splitMode === "CUSTOM"
                          ? `shareAmount:${share.participantId}`
                          : `shareWeight:${share.participantId}`,
                      ) || null,
              })),
            },
          },
          select: { id: true },
        });
        createdTransactionId = transaction.id;

        await tx.aaAuditEvent.create({
          data: {
            ledgerId: ledger.id,
            transactionId: transaction.id,
            actorParticipantId: viewer.id,
            action:
              status === "POSTED" ? "CREATE_AND_APPROVE" : "SUBMIT_FOR_REVIEW",
            entityType: "TRANSACTION",
            entityId: transaction.id,
            after: {
              amountMinor: baseAmountMinor.toString(),
              splitMode: parsed.data.splitMode,
              status,
              type: parsed.data.type,
            },
          },
        });
        await createAaNotifications(tx, {
          aaTransactionId: transaction.id,
          activityId: parsed.data.activityId,
          actor: viewer,
          occurrenceId: `${transaction.id}:created`,
          participants: ledger.participants,
          recipientParticipantIds:
            status === "PENDING_REVIEW"
              ? [
                  ...ledger.participants
                    .filter(
                      (participant) =>
                        participant.role === "OWNER" ||
                        participant.role === "ADMIN",
                    )
                    .map((participant) => participant.id),
                  ...contributions.map((item) => item.participantId),
                ]
              : [
                  ...contributions.map((item) => item.participantId),
                  ...shares.map((item) => item.participantId),
                ],
          type:
            status === "PENDING_REVIEW"
              ? "AA_REVIEW_REQUIRED"
              : "AA_ENTRY_UPDATED",
        });
      }

      await tx.aaLedger.update({
        where: { id: ledger.id },
        data: { version: { increment: 1 } },
      });
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { formError: copy.duplicate };
    }

    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") return { formError: copy.forbidden };
    if (message === "LOCKED") return { formError: copy.locked };
    if (message === "MAX_TRANSACTIONS") {
      return { formError: copy.capacity };
    }
    if (message === "INVALID_PARTICIPANTS") return { formError: copy.inactive };
    if (
      message.includes("MISMATCH") ||
      message.includes("INVALID") ||
      message.includes("EMPTY")
    ) {
      return { formError: copy.invalid };
    }

    console.error("Failed to create AA transaction", error);
    return { formError: copy.failed };
  }

  const receipt = formData.get("receipt");
  if (
    receipt instanceof File &&
    receipt.size > 0 &&
    createdTransactionId &&
    createdLedgerId &&
    creatorParticipantId
  ) {
    try {
      const uploaded = await uploadAaReceipt({
        file: receipt,
        ledgerId: createdLedgerId,
        participantId: creatorParticipantId,
        transactionId: createdTransactionId,
      });
      await prisma.$transaction([
        prisma.aaAttachment.create({
          data: {
            byteSize: uploaded.byteSize,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            objectKey: uploaded.objectKey,
            status: uploaded.status,
            transactionId: createdTransactionId,
            uploaderParticipantId: creatorParticipantId,
          },
        }),
        prisma.aaAuditEvent.create({
          data: {
            action:
              uploaded.status === "READY"
                ? "ATTACH_RECEIPT"
                : "RECEIPT_UPLOAD_FAILED",
            actorParticipantId: creatorParticipantId,
            after: { status: uploaded.status },
            entityId: createdTransactionId,
            entityType: "ATTACHMENT",
            ledgerId: createdLedgerId,
            transactionId: createdTransactionId,
          },
        }),
      ]);
    } catch (error) {
      console.error("Failed to attach AA receipt", {
        code: "AA_RECEIPT_ATTACH_FAILED",
        error,
      });
    }
  }

  if (stringValue(formData, "responseMode") === "json") {
    return { success: true, transactionId: createdTransactionId };
  }

  redirect(refreshAaViews(locale, parsed.data.activityId));
}

const operationSchema = z.object({
  activityId: z.string().min(1),
  transactionId: z.string().min(1),
  locale: z.string().min(1).default("zh-CN"),
});

async function getOperationContext(
  tx: Prisma.TransactionClient,
  activityId: string,
  transactionId: string,
  profileId: string,
) {
  const transaction = await tx.aaTransaction.findFirst({
    where: { id: transactionId, ledger: { activityId } },
    include: {
      ledger: { include: { participants: true } },
      contributions: true,
      shares: true,
    },
  });

  if (!transaction) throw new Error("FORBIDDEN");
  const viewer = transaction.ledger.participants.find(
    (participant) => participant.userProfileId === profileId,
  );
  if (!viewer) throw new Error("FORBIDDEN");
  const access = await getActivityAaAccess(activityId, profileId, tx);
  if (!access) throw new Error("FORBIDDEN");
  return { access, transaction, viewer };
}

export async function reviewAaTransactionAction(formData: FormData) {
  const input = operationSchema
    .extend({
      decision: z.enum(["approve", "reject"]),
      reason: z.string().trim().max(240).optional(),
    })
    .parse({
      activityId: stringValue(formData, "activityId"),
      transactionId: stringValue(formData, "transactionId"),
      locale: stringValue(formData, "locale") || "zh-CN",
      decision: stringValue(formData, "decision"),
      reason: stringValue(formData, "reason") || undefined,
    });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa`,
  );

  await prisma.$transaction(async (tx) => {
    const { access, transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );

    if (!access.canManage || transaction.status !== "PENDING_REVIEW") {
      throw new Error("FORBIDDEN");
    }

    if (input.decision === "approve") {
      assertTransactionInvariant({
        id: transaction.id,
        type: transaction.type,
        status: "POSTED",
        baseAmountMinor: transaction.baseAmountMinor,
        contributions: transaction.contributions,
        shares: transaction.shares,
        transferFromParticipantId: transaction.transferFromParticipantId,
        transferToParticipantId: transaction.transferToParticipantId,
      });
    }

    const nextStatus = input.decision === "approve" ? "POSTED" : "REJECTED";
    await tx.aaTransaction.update({
      where: { id: transaction.id },
      data: {
        status: nextStatus,
        reviewedByParticipantId: viewer.id,
        reviewedAt: new Date(),
        rejectionReason:
          input.decision === "reject" ? (input.reason ?? "") : null,
        version: { increment: 1 },
      },
    });
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: input.decision === "approve" ? "APPROVE" : "REJECT",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        before: { status: transaction.status },
        after: { status: nextStatus, reason: input.reason },
      },
    });
    await createAaNotifications(tx, {
      aaTransactionId: transaction.id,
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${transaction.id}:review:${transaction.version + 1}`,
      participants: transaction.ledger.participants,
      recipientParticipantIds: [transaction.creatorParticipantId],
      type: "AA_ENTRY_UPDATED",
    });
  });

  redirect(refreshAaViews(input.locale, input.activityId));
}

const proposedChangeSchema = z.object({
  note: z.string().max(2000).nullish(),
  occurredAt: z.string().datetime(),
  originalAmountMinor: z.string().regex(/^\d+$/),
  title: z.string().trim().min(1).max(120),
});

export async function reviewAaChangeRequestAction(formData: FormData) {
  const input = operationSchema
    .extend({
      changeRequestId: z.string().min(1),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().trim().max(240).optional(),
    })
    .parse({
      activityId: stringValue(formData, "activityId"),
      changeRequestId: stringValue(formData, "changeRequestId"),
      decision: stringValue(formData, "decision"),
      locale: stringValue(formData, "locale") || "zh-CN",
      reason: stringValue(formData, "reason") || undefined,
      transactionId: stringValue(formData, "transactionId"),
    });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa/transactions/${input.transactionId}`,
  );

  await prisma.$transaction(async (tx) => {
    const { access, transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );
    const request = await tx.aaChangeRequest.findFirst({
      where: {
        id: input.changeRequestId,
        status: "PENDING",
        transactionId: transaction.id,
      },
      include: { actor: true },
    });
    if (!access.canManage || !request) throw new Error("FORBIDDEN");

    if (
      input.decision === "approve" &&
      request.expectedVersion !== transaction.version
    ) {
      await tx.aaConflict.create({
        data: {
          clientVersion: request.expectedVersion,
          proposedPayload: request.proposedPayload as Prisma.InputJsonValue,
          serverVersion: transaction.version,
          transactionId: transaction.id,
        },
      });
      await tx.aaChangeRequest.update({
        where: { id: request.id },
        data: {
          rejectionReason: "STALE_VERSION",
          reviewedAt: new Date(),
          reviewedByParticipantId: viewer.id,
          status: "REJECTED",
        },
      });
      await tx.aaLedger.update({
        where: { id: transaction.ledgerId },
        data: { version: { increment: 1 } },
      });
      await tx.aaAuditEvent.create({
        data: {
          action: "CHANGE_REQUEST_CONFLICT",
          actorParticipantId: viewer.id,
          entityId: request.id,
          entityType: "CHANGE_REQUEST",
          ledgerId: transaction.ledgerId,
          transactionId: transaction.id,
        },
      });
      return;
    }

    if (input.decision === "approve") {
      const proposed = proposedChangeSchema.parse(request.proposedPayload);
      const originalAmountMinor = BigInt(proposed.originalAmountMinor);
      const baseAmountMinor = convertToBaseMinor(
        originalAmountMinor,
        transaction.fxRate.toString(),
      );
      if (originalAmountMinor <= 0n || baseAmountMinor <= 0n) {
        throw new Error("INVALID_AMOUNT");
      }
      const reallocate = (
        values: Array<{ participantId: string; amountMinor: bigint }>,
      ) =>
        allocateByWeights(
          baseAmountMinor,
          values
            .filter((item) => item.amountMinor > 0n)
            .map((item) => ({
              participantId: item.participantId,
              weight: item.amountMinor,
            })),
        );
      const contributions =
        transaction.type === "TRANSFER"
          ? []
          : reallocate(transaction.contributions);
      const shares =
        transaction.type === "TRANSFER" ? [] : reallocate(transaction.shares);

      assertTransactionInvariant({
        baseAmountMinor,
        contributions,
        id: transaction.id,
        shares,
        status: "POSTED",
        transferFromParticipantId: transaction.transferFromParticipantId,
        transferToParticipantId: transaction.transferToParticipantId,
        type: transaction.type,
      });
      await tx.aaTransactionRevision.create({
        data: {
          actorParticipantId: viewer.id,
          changeSummary: "Approve participant change request",
          snapshot: {
            baseAmountMinor: transaction.baseAmountMinor.toString(),
            note: transaction.note,
            occurredAt: transaction.occurredAt.toISOString(),
            originalAmountMinor: transaction.originalAmountMinor.toString(),
            status: transaction.status,
            title: transaction.title,
          },
          transactionId: transaction.id,
          version: transaction.version,
        },
      });
      for (const contribution of transaction.contributions) {
        await tx.aaContribution.update({
          where: { id: contribution.id },
          data: {
            amountMinor:
              contributions.find(
                (item) => item.participantId === contribution.participantId,
              )?.amountMinor ?? 0n,
          },
        });
      }
      for (const share of transaction.shares) {
        await tx.aaShare.update({
          where: { id: share.id },
          data: {
            amountMinor:
              shares.find((item) => item.participantId === share.participantId)
                ?.amountMinor ?? 0n,
          },
        });
      }
      const requiresTransferConfirmation =
        transaction.type === "TRANSFER" &&
        transaction.ledger.requireTransferConfirmation;
      await tx.aaTransaction.update({
        where: { id: transaction.id },
        data: {
          baseAmountMinor,
          note: proposed.note ?? null,
          occurredAt: new Date(proposed.occurredAt),
          originalAmountMinor,
          payerConfirmedAt: requiresTransferConfirmation
            ? transaction.transferFromParticipantId === request.actorParticipantId
              ? new Date()
              : null
            : transaction.payerConfirmedAt,
          payerConfirmedById: requiresTransferConfirmation
            ? transaction.transferFromParticipantId === request.actorParticipantId
              ? request.actorParticipantId
              : null
            : transaction.payerConfirmedById,
          payeeConfirmedAt: requiresTransferConfirmation
            ? transaction.transferToParticipantId === request.actorParticipantId
              ? new Date()
              : null
            : transaction.payeeConfirmedAt,
          payeeConfirmedById: requiresTransferConfirmation
            ? transaction.transferToParticipantId === request.actorParticipantId
              ? request.actorParticipantId
              : null
            : transaction.payeeConfirmedById,
          status: requiresTransferConfirmation
            ? "PENDING_CONFIRMATION"
            : "POSTED",
          title: proposed.title,
          version: { increment: 1 },
        },
      });
    }

    await tx.aaChangeRequest.update({
      where: { id: request.id },
      data: {
        rejectionReason:
          input.decision === "reject" ? (input.reason ?? "") : null,
        reviewedAt: new Date(),
        reviewedByParticipantId: viewer.id,
        status: input.decision === "approve" ? "APPROVED" : "REJECTED",
      },
    });
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        action:
          input.decision === "approve"
            ? "APPROVE_CHANGE_REQUEST"
            : "REJECT_CHANGE_REQUEST",
        actorParticipantId: viewer.id,
        after: { status: input.decision.toUpperCase() },
        entityId: request.id,
        entityType: "CHANGE_REQUEST",
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
      },
    });
    await createAaNotifications(tx, {
      aaTransactionId: transaction.id,
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${request.id}:review`,
      participants: transaction.ledger.participants,
      recipientParticipantIds: [request.actorParticipantId],
      type: "AA_ENTRY_UPDATED",
    });
  });

  redirect(
    withLocale(
      input.locale,
      `/lobby/${input.activityId}/aa/transactions/${input.transactionId}`,
    ),
  );
}

export async function confirmAaTransferAction(formData: FormData) {
  const input = operationSchema.parse({
    activityId: stringValue(formData, "activityId"),
    transactionId: stringValue(formData, "transactionId"),
    locale: stringValue(formData, "locale") || "zh-CN",
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa`,
  );

  await prisma.$transaction(async (tx) => {
    const { transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );

    if (
      transaction.type !== "TRANSFER" ||
      transaction.status !== "PENDING_CONFIRMATION"
    ) {
      throw new Error("FORBIDDEN");
    }

    const confirmsPayer = transaction.transferFromParticipantId === viewer.id;
    const confirmsPayee = transaction.transferToParticipantId === viewer.id;
    if (!confirmsPayer && !confirmsPayee) throw new Error("FORBIDDEN");

    const now = new Date();
    const payerConfirmedAt = confirmsPayer ? now : transaction.payerConfirmedAt;
    const payeeConfirmedAt = confirmsPayee ? now : transaction.payeeConfirmedAt;
    const nextStatus =
      payerConfirmedAt && payeeConfirmedAt ? "POSTED" : "PENDING_CONFIRMATION";

    await tx.aaTransaction.update({
      where: { id: transaction.id },
      data: {
        payerConfirmedAt,
        payerConfirmedById: confirmsPayer
          ? viewer.id
          : transaction.payerConfirmedById,
        payeeConfirmedAt,
        payeeConfirmedById: confirmsPayee
          ? viewer.id
          : transaction.payeeConfirmedById,
        status: nextStatus,
        version: { increment: 1 },
      },
    });
    if (nextStatus === "POSTED") {
      await tx.aaPaymentRequest.updateMany({
        where: { linkedTransferId: transaction.id },
        data: { completedAt: now, status: "COMPLETED" },
      });
    }
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: "CONFIRM_TRANSFER",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        before: { status: transaction.status },
        after: {
          confirmedAs: confirmsPayer ? "PAYER" : "PAYEE",
          status: nextStatus,
        },
      },
    });
    await createAaNotifications(tx, {
      aaTransactionId: transaction.id,
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${transaction.id}:confirm:${transaction.version + 1}`,
      participants: transaction.ledger.participants,
      recipientParticipantIds: [
        transaction.transferFromParticipantId!,
        transaction.transferToParticipantId!,
      ],
      type:
        nextStatus === "POSTED"
          ? "AA_ENTRY_UPDATED"
          : "AA_TRANSFER_CONFIRMATION",
    });
  });

  redirect(refreshAaViews(input.locale, input.activityId));
}

export async function voidAaTransactionAction(formData: FormData) {
  const input = operationSchema.parse({
    activityId: stringValue(formData, "activityId"),
    transactionId: stringValue(formData, "transactionId"),
    locale: stringValue(formData, "locale") || "zh-CN",
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa`,
  );

  await prisma.$transaction(async (tx) => {
    const { access, transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );
    const canVoid =
      access.canManage ||
      (transaction.creatorParticipantId === viewer.id &&
        transaction.status !== "POSTED" &&
        viewer.status === "ACTIVE");

    if (
      !canVoid ||
      transaction.status === "VOIDED" ||
      transaction.ledger.status !== "ACTIVE"
    ) {
      throw new Error("FORBIDDEN");
    }

    await tx.aaTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedByParticipantId: viewer.id,
        version: { increment: 1 },
      },
    });
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: "VOID",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        before: { status: transaction.status },
        after: { status: "VOIDED" },
      },
    });
    await createAaNotifications(tx, {
      aaTransactionId: transaction.id,
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${transaction.id}:void:${transaction.version + 1}`,
      participants: transaction.ledger.participants,
      recipientParticipantIds: [
        ...transaction.contributions.map((item) => item.participantId),
        ...transaction.shares.map((item) => item.participantId),
        ...(transaction.transferFromParticipantId
          ? [transaction.transferFromParticipantId]
          : []),
        ...(transaction.transferToParticipantId
          ? [transaction.transferToParticipantId]
          : []),
      ],
      type: "AA_ENTRY_UPDATED",
    });
  });

  redirect(refreshAaViews(input.locale, input.activityId));
}

export async function restoreAaTransactionAction(formData: FormData) {
  const input = operationSchema.parse({
    activityId: stringValue(formData, "activityId"),
    transactionId: stringValue(formData, "transactionId"),
    locale: stringValue(formData, "locale") || "zh-CN",
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa`,
  );

  await prisma.$transaction(async (tx) => {
    const { access, transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );
    if (
      !access.canManage ||
      transaction.status !== "VOIDED" ||
      transaction.ledger.status !== "ACTIVE"
    ) {
      throw new Error("FORBIDDEN");
    }

    const nextStatus: AaTransactionStatus =
      transaction.type === "TRANSFER" &&
      transaction.ledger.requireTransferConfirmation &&
      (!transaction.payerConfirmedAt || !transaction.payeeConfirmedAt)
        ? "PENDING_CONFIRMATION"
        : "POSTED";
    await tx.aaTransaction.update({
      where: { id: transaction.id },
      data: {
        status: nextStatus,
        voidedAt: null,
        voidedByParticipantId: null,
        version: { increment: 1 },
      },
    });
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: "RESTORE",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        before: { status: "VOIDED" },
        after: { status: nextStatus },
      },
    });
  });

  redirect(refreshAaViews(input.locale, input.activityId));
}

export async function updateAaTransactionAction(formData: FormData) {
  const input = operationSchema
    .extend({
      expectedVersion: z.coerce.number().int().positive(),
      title: z.string().trim().min(1).max(120),
      amount: z.string().trim().min(1),
      note: z.string().trim().max(2000).optional(),
      occurredOn: z.string().min(1),
      futureConfirmed: z.boolean().default(false),
    })
    .parse({
      activityId: stringValue(formData, "activityId"),
      transactionId: stringValue(formData, "transactionId"),
      locale: stringValue(formData, "locale") || "zh-CN",
      expectedVersion: stringValue(formData, "expectedVersion"),
      title: stringValue(formData, "title"),
      amount: stringValue(formData, "amount"),
      note: stringValue(formData, "note") || undefined,
      occurredOn: stringValue(formData, "occurredOn"),
      futureConfirmed: stringValue(formData, "futureConfirmed") === "true",
    });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa/transactions/${input.transactionId}`,
  );
  const originalAmountMinor = parseMoneyToMinor(input.amount);
  const occurredAt = parseOccurredAt(input.occurredOn);
  const updateDayEnd = new Date();
  updateDayEnd.setUTCHours(23, 59, 59, 999);
  if (occurredAt > updateDayEnd && !input.futureConfirmed) {
    throw new Error("FUTURE_CONFIRMATION_REQUIRED");
  }
  let conflictCreated = false;
  let changeRequested = false;

  await prisma.$transaction(async (tx) => {
    const { access, transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );
    const manager = access.canManage;
    const ownsEditableDraft =
      transaction.creatorParticipantId === viewer.id &&
      ["PENDING_REVIEW", "REJECTED", "PENDING_CONFIRMATION"].includes(
        transaction.status,
      );
    const canProposePostedChange =
      transaction.status === "POSTED" &&
      (transaction.creatorParticipantId === viewer.id ||
        transaction.ledger.allowMemberCorrections);

    if (
      transaction.ledger.status !== "ACTIVE" ||
      transaction.status === "VOIDED" ||
      (!manager &&
        ((!ownsEditableDraft && !canProposePostedChange) ||
          viewer.status !== "ACTIVE"))
    ) {
      throw new Error("FORBIDDEN");
    }

    if (transaction.version !== input.expectedVersion) {
      await tx.aaConflict.create({
        data: {
          transactionId: transaction.id,
          clientVersion: input.expectedVersion,
          serverVersion: transaction.version,
          proposedPayload: {
            title: input.title,
            note: input.note,
            originalAmountMinor: originalAmountMinor.toString(),
            occurredAt: occurredAt.toISOString(),
          },
        },
      });
      await tx.aaAuditEvent.create({
        data: {
          ledgerId: transaction.ledgerId,
          transactionId: transaction.id,
          actorParticipantId: viewer.id,
          action: "EDIT_CONFLICT",
          entityType: "TRANSACTION",
          entityId: transaction.id,
          before: { serverVersion: transaction.version },
          after: { clientVersion: input.expectedVersion },
        },
      });
      conflictCreated = true;
      return;
    }

    if (originalAmountMinor <= 0n) throw new Error("INVALID_AMOUNT");
    const baseAmountMinor = convertToBaseMinor(
      originalAmountMinor,
      transaction.fxRate.toString(),
    );
    const nextVersion = transaction.version + 1;

    if (!manager && transaction.status === "POSTED") {
      const pendingChange = await tx.aaChangeRequest.findFirst({
        where: { status: "PENDING", transactionId: transaction.id },
        select: { id: true },
      });
      if (pendingChange) throw new Error("CHANGE_ALREADY_PENDING");

      const request = await tx.aaChangeRequest.create({
        data: {
          actorParticipantId: viewer.id,
          expectedVersion: transaction.version,
          proposedPayload: {
            baseAmountMinor: baseAmountMinor.toString(),
            note: input.note,
            occurredAt: occurredAt.toISOString(),
            originalAmountMinor: originalAmountMinor.toString(),
            title: input.title,
          },
          transactionId: transaction.id,
        },
      });
      await tx.aaLedger.update({
        where: { id: transaction.ledgerId },
        data: { version: { increment: 1 } },
      });
      await tx.aaAuditEvent.create({
        data: {
          action: "REQUEST_CHANGE",
          actorParticipantId: viewer.id,
          after: { expectedVersion: transaction.version },
          entityId: request.id,
          entityType: "CHANGE_REQUEST",
          ledgerId: transaction.ledgerId,
          transactionId: transaction.id,
        },
      });
      await createAaNotifications(tx, {
        aaTransactionId: transaction.id,
        activityId: input.activityId,
        actor: viewer,
        occurrenceId: `${request.id}:change-request`,
        participants: transaction.ledger.participants,
        recipientParticipantIds: transaction.ledger.participants
          .filter(
            (participant) =>
              participant.role === "OWNER" || participant.role === "ADMIN",
          )
          .map((participant) => participant.id),
        type: "AA_REVIEW_REQUIRED",
      });
      changeRequested = true;
      return;
    }

    await tx.aaTransactionRevision.create({
      data: {
        transactionId: transaction.id,
        version: transaction.version,
        actorParticipantId: viewer.id,
        changeSummary: "Edit transaction",
        snapshot: {
          title: transaction.title,
          note: transaction.note,
          status: transaction.status,
          originalAmountMinor: transaction.originalAmountMinor.toString(),
          baseAmountMinor: transaction.baseAmountMinor.toString(),
          occurredAt: transaction.occurredAt.toISOString(),
          contributions: transaction.contributions.map((item) => ({
            participantId: item.participantId,
            amountMinor: item.amountMinor.toString(),
          })),
          shares: transaction.shares.map((item) => ({
            participantId: item.participantId,
            amountMinor: item.amountMinor.toString(),
          })),
        },
      },
    });

    let nextStatus: AaTransactionStatus = transaction.status;
    let payerConfirmedAt = transaction.payerConfirmedAt;
    let payerConfirmedById = transaction.payerConfirmedById;
    let payeeConfirmedAt = transaction.payeeConfirmedAt;
    let payeeConfirmedById = transaction.payeeConfirmedById;

    if (transaction.type === "TRANSFER") {
      const now = new Date();
      payerConfirmedAt =
        transaction.transferFromParticipantId === viewer.id ? now : null;
      payerConfirmedById =
        transaction.transferFromParticipantId === viewer.id ? viewer.id : null;
      payeeConfirmedAt =
        transaction.transferToParticipantId === viewer.id ? now : null;
      payeeConfirmedById =
        transaction.transferToParticipantId === viewer.id ? viewer.id : null;
      nextStatus = transaction.ledger.requireTransferConfirmation
        ? "PENDING_CONFIRMATION"
        : "POSTED";
    } else {
      const reallocate = (
        values: Array<{ participantId: string; amountMinor: bigint }>,
      ) => {
        const positive = values.filter((item) => item.amountMinor > 0n);
        const allocated = allocateByWeights(
          baseAmountMinor,
          positive.map((item) => ({
            participantId: item.participantId,
            weight: item.amountMinor,
          })),
        );
        const amountByParticipant = new Map(
          allocated.map((item) => [item.participantId, item.amountMinor]),
        );
        return values.map((item) => ({
          participantId: item.participantId,
          amountMinor: amountByParticipant.get(item.participantId) ?? 0n,
        }));
      };
      const contributions = reallocate(transaction.contributions);
      const shares = reallocate(transaction.shares);

      for (const contribution of transaction.contributions) {
        await tx.aaContribution.update({
          where: { id: contribution.id },
          data: {
            amountMinor:
              contributions.find(
                (item) => item.participantId === contribution.participantId,
              )?.amountMinor ?? 0n,
          },
        });
      }
      for (const share of transaction.shares) {
        await tx.aaShare.update({
          where: { id: share.id },
          data: {
            amountMinor:
              shares.find((item) => item.participantId === share.participantId)
                ?.amountMinor ?? 0n,
          },
        });
      }

      nextStatus = manager ? "POSTED" : "PENDING_REVIEW";
    }

    await tx.aaTransaction.update({
      where: { id: transaction.id },
      data: {
        title: input.title,
        note: input.note,
        originalAmountMinor,
        baseAmountMinor,
        occurredAt,
        status: nextStatus,
        reviewedByParticipantId: nextStatus === "POSTED" ? viewer.id : null,
        reviewedAt: nextStatus === "POSTED" ? new Date() : null,
        rejectionReason: null,
        payerConfirmedAt,
        payerConfirmedById,
        payeeConfirmedAt,
        payeeConfirmedById,
        version: nextVersion,
      },
    });
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: "UPDATE",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        before: {
          version: transaction.version,
          amountMinor: transaction.baseAmountMinor.toString(),
        },
        after: {
          version: nextVersion,
          amountMinor: baseAmountMinor.toString(),
          status: nextStatus,
        },
      },
    });
    await createAaNotifications(tx, {
      aaTransactionId: transaction.id,
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${transaction.id}:update:${nextVersion}`,
      participants: transaction.ledger.participants,
      recipientParticipantIds: [
        ...transaction.contributions.map((item) => item.participantId),
        ...transaction.shares.map((item) => item.participantId),
        ...transaction.ledger.participants
          .filter(
            (participant) =>
              !manager &&
              (participant.role === "OWNER" || participant.role === "ADMIN"),
          )
          .map((participant) => participant.id),
      ],
      type: "AA_ENTRY_UPDATED",
    });
  });

  refreshAaViews(input.locale, input.activityId);
  redirect(
    withLocale(
      input.locale,
      `/lobby/${input.activityId}/aa/transactions/${input.transactionId}${
        conflictCreated
          ? "?conflict=1"
          : changeRequested
            ? "?change=pending"
            : ""
      }`,
    ),
  );
}

export async function resolveAaConflictAction(formData: FormData) {
  const input = operationSchema.parse({
    activityId: stringValue(formData, "activityId"),
    transactionId: stringValue(formData, "transactionId"),
    locale: stringValue(formData, "locale") || "zh-CN",
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa/transactions/${input.transactionId}`,
  );

  await prisma.$transaction(async (tx) => {
    const { access, transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );
    if (!access.canManage) throw new Error("FORBIDDEN");

    await tx.aaConflict.updateMany({
      where: { transactionId: transaction.id, status: "OPEN" },
      data: {
        status: "DISMISSED",
        resolvedAt: new Date(),
        resolvedByParticipantId: viewer.id,
      },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: "DISMISS_CONFLICT",
        entityType: "TRANSACTION",
        entityId: transaction.id,
      },
    });
  });

  redirect(
    withLocale(
      input.locale,
      `/lobby/${input.activityId}/aa/transactions/${input.transactionId}`,
    ),
  );
}

export async function disputeAaTransactionAction(formData: FormData) {
  const input = operationSchema.parse({
    activityId: stringValue(formData, "activityId"),
    transactionId: stringValue(formData, "transactionId"),
    locale: stringValue(formData, "locale") || "zh-CN",
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa/transactions/${input.transactionId}`,
  );

  await prisma.$transaction(async (tx) => {
    const { transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );
    const involved =
      transaction.creatorParticipantId === viewer.id ||
      transaction.contributions.some(
        (item) => item.participantId === viewer.id,
      ) ||
      transaction.shares.some((item) => item.participantId === viewer.id) ||
      transaction.transferFromParticipantId === viewer.id ||
      transaction.transferToParticipantId === viewer.id;

    if (!involved || transaction.status !== "POSTED") {
      throw new Error("FORBIDDEN");
    }

    await tx.aaTransaction.update({
      where: { id: transaction.id },
      data: { status: "DISPUTED", version: { increment: 1 } },
    });
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: "DISPUTE",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        before: { status: "POSTED" },
        after: { status: "DISPUTED" },
      },
    });
    await createAaNotifications(tx, {
      aaTransactionId: transaction.id,
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${transaction.id}:dispute:${transaction.version + 1}`,
      participants: transaction.ledger.participants,
      recipientParticipantIds: [
        ...transaction.contributions.map((item) => item.participantId),
        ...transaction.shares.map((item) => item.participantId),
        ...transaction.ledger.participants
          .filter(
            (participant) =>
              participant.role === "OWNER" || participant.role === "ADMIN",
          )
          .map((participant) => participant.id),
      ],
      type: "AA_DISPUTE_OPENED",
    });
  });

  redirect(refreshAaViews(input.locale, input.activityId));
}

export async function resolveAaDisputeAction(formData: FormData) {
  const input = operationSchema.parse({
    activityId: stringValue(formData, "activityId"),
    transactionId: stringValue(formData, "transactionId"),
    locale: stringValue(formData, "locale") || "zh-CN",
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa/transactions/${input.transactionId}`,
  );

  await prisma.$transaction(async (tx) => {
    const { access, transaction, viewer } = await getOperationContext(
      tx,
      input.activityId,
      input.transactionId,
      profile.id,
    );
    if (!access.canManage || transaction.status !== "DISPUTED") {
      throw new Error("FORBIDDEN");
    }

    await tx.aaTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "POSTED",
        reviewedAt: new Date(),
        reviewedByParticipantId: viewer.id,
        version: { increment: 1 },
      },
    });
    await tx.aaLedger.update({
      where: { id: transaction.ledgerId },
      data: { version: { increment: 1 } },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: transaction.ledgerId,
        transactionId: transaction.id,
        actorParticipantId: viewer.id,
        action: "RESOLVE_DISPUTE",
        entityType: "TRANSACTION",
        entityId: transaction.id,
        before: { status: "DISPUTED" },
        after: { status: "POSTED" },
      },
    });
    await createAaNotifications(tx, {
      aaTransactionId: transaction.id,
      activityId: input.activityId,
      actor: viewer,
      occurrenceId: `${transaction.id}:resolve:${transaction.version + 1}`,
      participants: transaction.ledger.participants,
      recipientParticipantIds: [
        ...transaction.contributions.map((item) => item.participantId),
        ...transaction.shares.map((item) => item.participantId),
      ],
      type: "AA_ENTRY_UPDATED",
    });
  });

  redirect(refreshAaViews(input.locale, input.activityId));
}
