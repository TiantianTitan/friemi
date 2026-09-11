import { NextResponse } from "next/server";
import { getOptionalCurrentUserProfileSnapshot } from "@/lib/auth";
import { getActivityAaSnapshot } from "@/features/aa/server/ledgerService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(value: string | number | boolean | null | undefined) {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ activityId: string }> },
) {
  const profile = await getOptionalCurrentUserProfileSnapshot();
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { activityId } = await context.params;
  const locale = new URL(request.url).searchParams.get("locale") ?? "zh-CN";
  const kind = new URL(request.url).searchParams.get("kind");

  try {
    const snapshot = await getActivityAaSnapshot(activityId, profile.id);
    if (kind === "settlement") {
      const headers = [
        "from",
        "to",
        "amount_minor",
        "currency",
        "ledger_version",
        "blocked",
      ];
      const lines = snapshot.settlements.map((settlement) =>
        [
          settlement.fromName,
          settlement.toName,
          settlement.amountMinor,
          snapshot.baseCurrency,
          snapshot.version,
          snapshot.summary.settlementBlocked,
        ]
          .map(csvCell)
          .join(","),
      );
      const csv = `\uFEFF${headers.map(csvCell).join(",")}\n${lines.join("\n")}\n`;
      return new NextResponse(csv, {
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("friemi-aa-settlement.csv")}`,
          "content-type": "text/csv; charset=utf-8",
        },
      });
    }
    const headers = [
      "id",
      "type",
      "status",
      "title",
      "category",
      "occurred_at",
      "original_currency",
      "original_amount_minor",
      "base_currency",
      "base_amount_minor",
      "fx_rate",
      "fx_rate_source",
      "fx_rate_date",
      "contributions",
      "transfer_from",
      "transfer_to",
      "shares",
      "split_mode",
      "note",
      "attachment_count",
      "created_by",
      "version",
    ];
    const lines = snapshot.transactions.map((transaction) =>
      [
        transaction.id,
        transaction.type,
        transaction.status,
        transaction.title,
        transaction.categoryName,
        transaction.occurredAt,
        transaction.originalCurrency,
        transaction.originalAmountMinor,
        snapshot.baseCurrency,
        transaction.baseAmountMinor,
        transaction.fxRate,
        transaction.fxRateSource,
        transaction.fxRateDate,
        transaction.contributions
          .map(
            (contribution) =>
              `${contribution.displayName}:${contribution.amountMinor}`,
          )
          .join(" | "),
        transaction.transferFrom?.displayName,
        transaction.transferTo?.displayName,
        transaction.shares
          .map((share) => `${share.displayName}:${share.amountMinor}`)
          .join(" | "),
        transaction.splitMode,
        transaction.note,
        transaction.attachmentCount,
        transaction.creator.displayName,
        transaction.version,
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = `\uFEFF${headers.map(csvCell).join(",")}\n${lines.join("\n")}\n`;
    const safeTitle = snapshot.title
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);

    return new NextResponse(csv, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          `${safeTitle || "friemi-aa"}-${locale}.csv`,
        )}`,
        "content-type": "text/csv; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
