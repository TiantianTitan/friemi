"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertTransactionInvariant } from "../domain/ledger";
import { csvRowsToObjects, parseNamedMinorAmounts } from "../domain/csv";
import { ensureActivityAaLedger } from "../server/ledgerService";
import { getActivityAaAccess } from "../server/access";
import { getCurrentUserProfileForMutation } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";

export type AaCsvImportState = {
  error?: string;
  importedCount?: number;
  skippedCount?: number;
};

const requiredHeaders = [
  "id",
  "type",
  "status",
  "title",
  "occurred_at",
  "original_currency",
  "original_amount_minor",
  "base_amount_minor",
  "fx_rate",
] as const;

const transactionTypeSchema = z.enum(["EXPENSE", "INCOME", "TRANSFER"]);
const currencyPattern = /^[A-Z]{3}$/;

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function importCopy(locale: string) {
  if (locale === "fr") {
    return {
      forbidden: "Seuls l'organisateur et les gestionnaires peuvent importer.",
      invalid: "Le fichier CSV ne correspond pas au modèle Friemi AA.",
      size: "Le fichier CSV dépasse 2 Mo.",
    };
  }
  if (locale === "en") {
    return {
      forbidden: "Only the host or a manager can import entries.",
      invalid: "This CSV does not match the Friemi AA template.",
      size: "The CSV file is larger than 2 MB.",
    };
  }
  return {
    forbidden: "只有主理人或协管可以导入记录。",
    invalid: "CSV 内容不符合 Friemi AA 模板，请先使用导出文件作为模板。",
    size: "CSV 文件不能超过 2 MB。",
  };
}

export async function importAaCsvAction(
  _previous: AaCsvImportState,
  formData: FormData,
): Promise<AaCsvImportState> {
  const activityId = getString(formData, "activityId");
  const locale = getString(formData, "locale") || "zh-CN";
  const copy = importCopy(locale);
  const file = formData.get("csv");

  if (!activityId || !(file instanceof File) || file.size === 0) {
    return { error: copy.invalid };
  }
  if (file.size > 2 * 1024 * 1024) return { error: copy.size };

  let rows: ReturnType<typeof csvRowsToObjects>;
  try {
    rows = csvRowsToObjects(await file.text());
    if (
      rows.length === 0 ||
      requiredHeaders.some((header) => !(header in rows[0]!.values))
    ) {
      throw new Error("MISSING_HEADERS");
    }
  } catch {
    return { error: copy.invalid };
  }

  const profile = await getCurrentUserProfileForMutation(
    locale,
    `/lobby/${activityId}/aa`,
  );
  await ensureActivityAaLedger(activityId, profile.id);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const access = await getActivityAaAccess(activityId, profile.id, tx);
      const ledger = await tx.aaLedger.findUnique({
        where: { activityId },
        include: { categories: true, participants: true },
      });

      if (!access?.canManage || !ledger || ledger.status !== "ACTIVE") {
        throw new Error("FORBIDDEN");
      }

      const viewer = ledger.participants.find(
        (participant) => participant.userProfileId === profile.id,
      );
      if (!viewer) throw new Error("FORBIDDEN");

      const activeCount = await tx.aaTransaction.count({
        where: { ledgerId: ledger.id, status: { not: "VOIDED" } },
      });
      const postedRowCount = rows.filter(
        (row) => row.values.status?.trim() === "POSTED",
      ).length;
      if (activeCount + postedRowCount > 10_000) {
        throw new Error("CAPACITY");
      }

      const participantNames = new Map<string, string | null>();
      ledger.participants.forEach((participant) => {
        const name = participant.displayNameSnapshot.trim();
        participantNames.set(
          name,
          participantNames.has(name) ? null : participant.id,
        );
      });
      const existingIds = new Set(
        (
          await tx.aaTransaction.findMany({
            where: {
              importSource: "FRIEMI_CSV",
              importRecordId: { in: rows.map((row) => row.values.id!) },
              ledgerId: ledger.id,
            },
            select: { importRecordId: true },
          })
        ).flatMap((item) => item.importRecordId ?? []),
      );

      let importedCount = 0;
      let skippedCount = 0;

      for (const row of rows) {
        // Only finalized rows can be transported safely. Review, confirmation,
        // dispute and void state is ledger-specific and must never be promoted
        // to POSTED merely because the CSV was imported elsewhere.
        if (row.values.status?.trim() !== "POSTED") {
          skippedCount += 1;
          continue;
        }
        const sourceId = row.values.id?.trim();
        if (!sourceId) throw new Error(`LINE_${row.line}`);
        if (existingIds.has(sourceId)) {
          skippedCount += 1;
          continue;
        }

        const type = transactionTypeSchema.parse(row.values.type);
        const title = row.values.title?.trim().slice(0, 120);
        const originalCurrency = row.values.original_currency
          ?.trim()
          .toUpperCase();
        const originalAmountMinor = BigInt(
          row.values.original_amount_minor ?? "",
        );
        const baseAmountMinor = BigInt(row.values.base_amount_minor ?? "");
        const fxRate = row.values.fx_rate?.trim();
        const occurredAt = new Date(row.values.occurred_at ?? "");

        if (
          !title ||
          !originalCurrency ||
          !currencyPattern.test(originalCurrency) ||
          originalAmountMinor <= 0n ||
          baseAmountMinor <= 0n ||
          !fxRate ||
          Number.isNaN(occurredAt.getTime())
        ) {
          throw new Error(`LINE_${row.line}`);
        }

        const participantId = (name: string | undefined) => {
          const matched = participantNames.get(name?.trim() ?? "");
          if (!matched) throw new Error(`LINE_${row.line}`);
          return matched;
        };
        const namedContributions = parseNamedMinorAmounts(
          row.values.contributions ?? "",
        );
        const namedShares = parseNamedMinorAmounts(row.values.shares ?? "");
        const contributions = namedContributions.map((item) => ({
          amountMinor: item.amountMinor,
          participantId: participantId(item.displayName),
        }));
        const shares = namedShares.map((item) => ({
          amountMinor: item.amountMinor,
          participantId: participantId(item.displayName),
        }));
        const transferFromParticipantId =
          type === "TRANSFER"
            ? participantId(row.values.transfer_from)
            : null;
        const transferToParticipantId =
          type === "TRANSFER" ? participantId(row.values.transfer_to) : null;

        assertTransactionInvariant({
          baseAmountMinor,
          contributions,
          id: sourceId,
          shares,
          status: "POSTED",
          transferFromParticipantId,
          transferToParticipantId,
          type,
        });

        const category = ledger.categories.find(
          (item) => item.name === row.values.category?.trim(),
        );
        await tx.aaTransaction.create({
          data: {
            baseAmountMinor,
            categoryId: category?.id,
            categoryNameSnapshot:
              row.values.category?.trim().slice(0, 60) || "其他",
            contributions: { create: contributions },
            creatorParticipantId: viewer.id,
            fxRate,
            fxRateDate: row.values.fx_rate_date
              ? new Date(row.values.fx_rate_date)
              : null,
            fxRateSource: row.values.fx_rate_source?.slice(0, 80) || "IMPORT",
            importRecordId: sourceId,
            importSource: "FRIEMI_CSV",
            ledgerId: ledger.id,
            note: row.values.note?.slice(0, 2000) || null,
            occurredAt,
            originalAmountMinor,
            originalCurrency,
            payerConfirmedAt: type === "TRANSFER" ? new Date() : null,
            payerConfirmedById: transferFromParticipantId,
            payeeConfirmedAt: type === "TRANSFER" ? new Date() : null,
            payeeConfirmedById: transferToParticipantId,
            reviewedAt: new Date(),
            reviewedByParticipantId: viewer.id,
            shares: { create: shares },
            splitMode:
              type === "TRANSFER"
                ? null
                : row.values.split_mode === "WEIGHT" ||
                    row.values.split_mode === "PERCENT" ||
                    row.values.split_mode === "CUSTOM"
                  ? row.values.split_mode
                  : "EQUAL",
            status: "POSTED",
            title,
            transferFromParticipantId,
            transferToParticipantId,
            type,
          },
        });
        importedCount += 1;
      }

      if (importedCount > 0) {
        await tx.aaLedger.update({
          where: { id: ledger.id },
          data: { version: { increment: 1 } },
        });
        await tx.aaAuditEvent.create({
          data: {
            action: "IMPORT_CSV",
            actorParticipantId: viewer.id,
            after: { importedCount, skippedCount },
            entityId: ledger.id,
            entityType: "LEDGER",
            ledgerId: ledger.id,
          },
        });
      }

      return { importedCount, skippedCount };
    });

    revalidatePath(withLocale(locale, `/lobby/${activityId}/aa`));
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return { error: copy.forbidden };
    }
    console.error("Failed to import AA CSV", {
      code: error instanceof Error ? error.message : "IMPORT_FAILED",
    });
    return { error: copy.invalid };
  }
}
