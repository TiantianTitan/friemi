"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserProfileForMutation } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";
import { ensureActivityAaLedger } from "../server/ledgerService";
import { getActivityAaAccess } from "../server/access";

const schema = z.object({
  activityId: z.string().min(1),
  locale: z.string().min(1).default("zh-CN"),
  intent: z.enum(["freeze", "reopen", "archive"]),
});

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function updateAaLedgerStatusAction(formData: FormData) {
  const input = schema.parse({
    activityId: value(formData, "activityId"),
    locale: value(formData, "locale") || "zh-CN",
    intent: value(formData, "intent"),
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa`,
  );
  await ensureActivityAaLedger(input.activityId, profile.id);

  await prisma.$transaction(async (tx) => {
    const ledger = await tx.aaLedger.findUnique({
      where: { activityId: input.activityId },
      include: { participants: true },
    });
    const viewer = ledger?.participants.find(
      (participant) => participant.userProfileId === profile.id,
    );
    const access = await getActivityAaAccess(input.activityId, profile.id, tx);

    if (!ledger || !viewer || !access?.canManage) {
      throw new Error("FORBIDDEN");
    }

    const nextStatus =
      input.intent === "reopen"
        ? "ACTIVE"
        : input.intent === "freeze"
          ? "FROZEN"
          : "ARCHIVED";
    const now = new Date();

    await tx.aaLedger.update({
      where: { id: ledger.id },
      data: {
        status: nextStatus,
        version: { increment: 1 },
        frozenAt:
          input.intent === "freeze"
            ? now
            : input.intent === "reopen"
              ? null
              : ledger.frozenAt,
        archivedAt: input.intent === "archive" ? now : null,
      },
    });
    await tx.aaAuditEvent.create({
      data: {
        ledgerId: ledger.id,
        actorParticipantId: viewer.id,
        action: input.intent.toUpperCase(),
        entityType: "LEDGER",
        entityId: ledger.id,
        before: { status: ledger.status },
        after: { status: nextStatus },
      },
    });
  });

  const path = withLocale(input.locale, `/lobby/${input.activityId}/aa`);
  revalidatePath(path);
  revalidatePath(withLocale(input.locale, `/lobby/${input.activityId}`));
  redirect(path);
}

const ruleSchema = z.object({
  activityId: z.string().min(1),
  allowMemberCorrections: z.boolean(),
  baseCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  locale: z.string().min(1),
  requireMemberReview: z.boolean(),
  requireTransferConfirmation: z.boolean(),
  timezone: z.string().trim().min(1).max(64),
});

export async function updateAaLedgerRulesAction(formData: FormData) {
  const input = ruleSchema.parse({
    activityId: value(formData, "activityId"),
    allowMemberCorrections:
      value(formData, "allowMemberCorrections") === "true",
    baseCurrency: value(formData, "baseCurrency"),
    locale: value(formData, "locale") || "zh-CN",
    requireMemberReview: value(formData, "requireMemberReview") === "true",
    requireTransferConfirmation:
      value(formData, "requireTransferConfirmation") === "true",
    timezone: value(formData, "timezone") || "Europe/Paris",
  });
  const profile = await getCurrentUserProfileForMutation(
    input.locale,
    `/lobby/${input.activityId}/aa`,
  );
  await ensureActivityAaLedger(input.activityId, profile.id);

  await prisma.$transaction(async (tx) => {
    const ledger = await tx.aaLedger.findUnique({
      where: { activityId: input.activityId },
      include: { participants: true },
    });
    const access = await getActivityAaAccess(input.activityId, profile.id, tx);
    const viewer = ledger?.participants.find(
      (participant) => participant.userProfileId === profile.id,
    );
    if (!ledger || !access?.canManage || !viewer) throw new Error("FORBIDDEN");

    if (input.baseCurrency !== ledger.baseCurrency) {
      const transactionCount = await tx.aaTransaction.count({
        where: { ledgerId: ledger.id },
      });
      if (transactionCount > 0) throw new Error("CURRENCY_LOCKED");
    }

    await tx.aaLedger.update({
      where: { id: ledger.id },
      data: {
        baseCurrency: input.baseCurrency,
        allowMemberCorrections: input.allowMemberCorrections,
        requireMemberReview: input.requireMemberReview,
        requireTransferConfirmation: input.requireTransferConfirmation,
        timezone: input.timezone,
        version: { increment: 1 },
      },
    });
    await tx.aaAuditEvent.create({
      data: {
        action: "UPDATE_RULES",
        actorParticipantId: viewer.id,
        after: {
          baseCurrency: input.baseCurrency,
          allowMemberCorrections: input.allowMemberCorrections,
          requireMemberReview: input.requireMemberReview,
          requireTransferConfirmation: input.requireTransferConfirmation,
          timezone: input.timezone,
        },
        before: {
          baseCurrency: ledger.baseCurrency,
          allowMemberCorrections: ledger.allowMemberCorrections,
          requireMemberReview: ledger.requireMemberReview,
          requireTransferConfirmation: ledger.requireTransferConfirmation,
          timezone: ledger.timezone,
        },
        entityId: ledger.id,
        entityType: "LEDGER",
        ledgerId: ledger.id,
      },
    });
  });

  const path = withLocale(input.locale, `/lobby/${input.activityId}/aa`);
  revalidatePath(path);
  redirect(path);
}

export async function createAaCategoryAction(formData: FormData) {
  const activityId = value(formData, "activityId");
  const locale = value(formData, "locale") || "zh-CN";
  const name = value(formData, "name").trim().slice(0, 60);
  if (!name) return;
  const profile = await getCurrentUserProfileForMutation(
    locale,
    `/lobby/${activityId}/aa`,
  );
  await ensureActivityAaLedger(activityId, profile.id);

  await prisma.$transaction(async (tx) => {
    const ledger = await tx.aaLedger.findUnique({
      where: { activityId },
      include: { categories: true, participants: true },
    });
    const access = await getActivityAaAccess(activityId, profile.id, tx);
    const viewer = ledger?.participants.find(
      (participant) => participant.userProfileId === profile.id,
    );
    if (!ledger || !access?.canManage || !viewer) throw new Error("FORBIDDEN");

    const category = await tx.aaCategory.upsert({
      where: { ledgerId_name: { ledgerId: ledger.id, name } },
      create: {
        iconKey: "receipt",
        ledgerId: ledger.id,
        name,
        sortOrder: ledger.categories.length,
      },
      update: { isActive: true },
    });
    await tx.aaAuditEvent.create({
      data: {
        action: "UPSERT_CATEGORY",
        actorParticipantId: viewer.id,
        after: { name },
        entityId: category.id,
        entityType: "CATEGORY",
        ledgerId: ledger.id,
      },
    });
  });

  revalidatePath(withLocale(locale, `/lobby/${activityId}/aa`));
}

export async function toggleAaCategoryAction(formData: FormData) {
  const activityId = value(formData, "activityId");
  const categoryId = value(formData, "categoryId");
  const locale = value(formData, "locale") || "zh-CN";
  const profile = await getCurrentUserProfileForMutation(
    locale,
    `/lobby/${activityId}/aa`,
  );

  await prisma.$transaction(async (tx) => {
    const ledger = await tx.aaLedger.findUnique({
      where: { activityId },
      include: { categories: true, participants: true },
    });
    const access = await getActivityAaAccess(activityId, profile.id, tx);
    const viewer = ledger?.participants.find(
      (participant) => participant.userProfileId === profile.id,
    );
    const category = ledger?.categories.find((item) => item.id === categoryId);
    if (!ledger || !access?.canManage || !viewer || !category) {
      throw new Error("FORBIDDEN");
    }
    if (
      category.isActive &&
      ledger.categories.filter((item) => item.isActive).length <= 1
    ) {
      throw new Error("LAST_CATEGORY");
    }

    await tx.aaCategory.update({
      where: { id: category.id },
      data: { isActive: !category.isActive },
    });
    await tx.aaAuditEvent.create({
      data: {
        action: category.isActive ? "DISABLE_CATEGORY" : "ENABLE_CATEGORY",
        actorParticipantId: viewer.id,
        entityId: category.id,
        entityType: "CATEGORY",
        ledgerId: ledger.id,
      },
    });
  });

  revalidatePath(withLocale(locale, `/lobby/${activityId}/aa`));
}
