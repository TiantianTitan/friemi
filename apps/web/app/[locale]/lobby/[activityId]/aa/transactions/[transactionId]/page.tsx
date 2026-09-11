import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  History,
  ImageIcon,
  ReceiptText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileNavSectionOverride } from "@/components/navigation/MobileNavSectionOverride";
import { ensureCurrentUserProfileSnapshot } from "@/lib/auth";
import { withLocale } from "@/lib/routes";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import {
  getActivityAaSnapshot,
  type ActivityAaSnapshot,
} from "@/features/aa/server/ledgerService";
import { formatMinorAmount } from "@/features/aa/domain/money";
import { getAaCopy, getAaStatusLabel } from "@/features/aa/copy";
import {
  confirmAaTransferAction,
  disputeAaTransactionAction,
  reviewAaChangeRequestAction,
  resolveAaConflictAction,
  resolveAaDisputeAction,
  restoreAaTransactionAction,
  reviewAaTransactionAction,
  updateAaTransactionAction,
  voidAaTransactionAction,
} from "@/features/aa/actions/aaTransactionActions";
import {
  addAaReceiptAction,
  retryAaReceiptAction,
} from "@/features/aa/actions/aaReceiptActions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    locale: string;
    activityId: string;
    transactionId: string;
  }>;
};

function minorStringToInput(value: string) {
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

export default async function AaTransactionDetailPage({ params }: PageProps) {
  const { locale, activityId, transactionId } = await params;
  const profile = await ensureCurrentUserProfileSnapshot(
    locale,
    `/lobby/${activityId}/aa/transactions/${transactionId}`,
  );
  let snapshot: ActivityAaSnapshot;
  try {
    snapshot = await getActivityAaSnapshot(activityId, profile.id);
  } catch {
    redirect(withLocale(locale, `/lobby/${activityId}/aa`));
  }
  const transaction = snapshot.transactions.find(
    (item) => item.id === transactionId,
  );
  const copy = getAaCopy(locale);
  const backHref = withLocale(locale, `/lobby/${activityId}/aa`);
  const revisions = transaction
    ? await prisma.aaTransactionRevision.findMany({
        where: { transactionId: transaction.id },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        include: { actor: true },
        take: 50,
      })
    : [];

  if (!transaction) {
    return (
      <PageContainer className="max-w-xl py-5" mobileSafeTop>
        <Link
          className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#156240]"
          href={backHref}
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.title}
        </Link>
        <p className="mt-12 rounded-2xl border border-[#E3DFD0] bg-white p-6 text-center text-sm font-semibold text-[#66736A]">
          {copy.unavailable}
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      className="max-w-2xl space-y-5 bg-[#FBFCF7] py-4 sm:py-8"
      mobileSafeTop
      mobileSafeBottom
    >
      <MobileNavSectionOverride section="activities" />
      <header className="flex items-center gap-3">
        <Link
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#156240] ring-1 ring-[#D6D5B2]"
          href={backHref}
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black text-ink">
            {transaction.title}
          </h1>
          <p className="text-xs font-semibold text-[#7C827A]">
            {getAaStatusLabel(locale, transaction.status)} · v
            {transaction.version}
          </p>
        </div>
      </header>

      <section className="rounded-[1.5rem] bg-[#156240] p-6 text-white shadow-[0_18px_40px_rgba(21,98,64,0.18)]">
        <p className="text-xs font-bold text-white/70">
          {transaction.type === "TRANSFER"
            ? `${transaction.transferFrom?.displayName} → ${transaction.transferTo?.displayName}`
            : transaction.categoryName}
        </p>
        <p className="mt-2 text-3xl font-black tabular-nums">
          {formatMinorAmount(
            BigInt(transaction.baseAmountMinor),
            snapshot.baseCurrency,
            locale,
          )}
        </p>
        {transaction.originalCurrency !== snapshot.baseCurrency ? (
          <div className="mt-2 text-xs font-semibold text-white/70">
            <p>
              {formatMinorAmount(
                BigInt(transaction.originalAmountMinor),
                transaction.originalCurrency,
                locale,
              )}{" "}
              · 1 {transaction.originalCurrency} = {transaction.fxRate}{" "}
              {snapshot.baseCurrency}
            </p>
            <p className="mt-1">
              {transaction.fxRateSource ?? "MANUAL"}
              {transaction.fxRateDate
                ? ` · ${transaction.fxRateDate.slice(0, 10)}`
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      {transaction.type !== "TRANSFER" ? (
        <section className="rounded-[1.3rem] border border-[#E3DFD0] bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-ink">
            <ReceiptText className="h-4 w-4 text-[#156240]" />
            {copy.detailTab}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            {transaction.contributions.map((contribution) => (
              <div
                className="flex justify-between gap-3"
                key={contribution.participantId}
              >
                <dt className="font-semibold text-[#7C827A]">
                  {transaction.type === "INCOME" ? copy.income : copy.expense}
                </dt>
                <dd className="text-right font-bold text-ink">
                  {contribution.displayName} ·{" "}
                  {formatMinorAmount(
                    BigInt(contribution.amountMinor),
                    snapshot.baseCurrency,
                    locale,
                  )}
                </dd>
              </div>
            ))}
            {transaction.shares.map((share) => (
              <div
                className="flex justify-between gap-3 border-t border-[#EEEBDD] pt-3"
                key={share.participantId}
              >
                <dt className="truncate font-semibold text-[#5F675F]">
                  {share.displayName}
                </dt>
                <dd className="font-black tabular-nums text-ink">
                  {formatMinorAmount(
                    BigInt(share.amountMinor),
                    snapshot.baseCurrency,
                    locale,
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <section className="rounded-[1.3rem] border border-[#E3DFD0] bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
              {transaction.transferFrom?.displayName}
            </span>
            <ArrowRight className="h-4 w-4 text-[#8AB68E]" />
            <span className="min-w-0 flex-1 truncate text-right text-sm font-bold text-ink">
              {transaction.transferTo?.displayName}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs font-bold">
            <span
              className={`rounded-xl px-2 py-2 ${transaction.payerConfirmedAt ? "bg-[#ECF5EF] text-[#156240]" : "bg-[#FFF5DD] text-[#7A5B13]"}`}
            >
              {transaction.payerConfirmedAt ? "✓ " : ""}
              {copy.confirm}
            </span>
            <span
              className={`rounded-xl px-2 py-2 ${transaction.payeeConfirmedAt ? "bg-[#ECF5EF] text-[#156240]" : "bg-[#FFF5DD] text-[#7A5B13]"}`}
            >
              {transaction.payeeConfirmedAt ? "✓ " : ""}
              {copy.confirm}
            </span>
          </div>
        </section>
      )}

      {transaction.note ? (
        <p className="rounded-2xl border border-[#E3DFD0] bg-white px-4 py-3 text-sm font-medium leading-6 text-[#5F675F]">
          {transaction.note}
        </p>
      ) : null}

      {transaction.attachments.length > 0 || transaction.canAttach ? (
        <section className="rounded-[1.2rem] border border-[#E3DFD0] bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-ink">
            <ImageIcon className="h-4 w-4 text-[#156240]" />
            {locale === "fr"
              ? "Justificatifs privés"
              : locale === "en"
                ? "Private receipts"
                : "私密消费凭证"}
          </h2>
          <div className="mt-3 grid gap-2">
            {transaction.attachments.map((attachment) => (
              attachment.status === "READY" ? (
                <a
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[#F5F8F2] px-3 text-sm font-bold text-[#156240]"
                  href={`/api/aa/${encodeURIComponent(activityId)}/receipts/${encodeURIComponent(attachment.id)}`}
                  key={attachment.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="truncate">{attachment.fileName}</span>
                  <span className="shrink-0 text-[10px] text-[#7C827A]">
                    {attachment.mimeType}
                  </span>
                </a>
              ) : (
                <form
                  action={retryAaReceiptAction}
                  className="grid gap-2 rounded-xl bg-[#FFF8E9] p-3"
                  key={attachment.id}
                >
                  <input name="activityId" type="hidden" value={activityId} />
                  <input
                    name="attachmentId"
                    type="hidden"
                    value={attachment.id}
                  />
                  <input name="locale" type="hidden" value={locale} />
                  <input
                    name="transactionId"
                    type="hidden"
                    value={transaction.id}
                  />
                  <p className="text-xs font-bold text-[#725C28]">
                    {locale === "fr"
                      ? "Échec de l'envoi du justificatif. Vous pouvez réessayer sans recréer l'opération."
                      : locale === "en"
                        ? "Receipt upload failed. Retry without recreating the entry."
                        : "凭证上传失败，可单独重试，不会重复创建账目。"}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      accept="image/*,.heic,.heif"
                      className="min-w-0 flex-1 text-[10px] font-semibold text-[#66736A]"
                      name="receipt"
                      required
                      type="file"
                    />
                    <button
                      className="min-h-9 shrink-0 rounded-full bg-white px-3 text-[11px] font-bold text-[#156240] ring-1 ring-[#8AB68E]"
                      type="submit"
                    >
                      {locale === "fr"
                        ? "Réessayer"
                        : locale === "en"
                          ? "Retry"
                          : "重试"}
                    </button>
                  </div>
                </form>
              )
            ))}
            {transaction.canAttach ? (
              <form
                action={addAaReceiptAction}
                className="grid gap-2 rounded-xl border border-dashed border-[#C7DCCB] p-3"
              >
                <input name="activityId" type="hidden" value={activityId} />
                <input name="locale" type="hidden" value={locale} />
                <input
                  name="transactionId"
                  type="hidden"
                  value={transaction.id}
                />
                <input
                  accept="image/*,.heic,.heif"
                  className="text-[10px] font-semibold text-[#66736A]"
                  name="receipt"
                  required
                  type="file"
                />
                <button
                  className="min-h-9 rounded-full bg-[#ECF5EF] text-[11px] font-bold text-[#156240]"
                  type="submit"
                >
                  {locale === "fr"
                    ? "Ajouter un justificatif"
                    : locale === "en"
                      ? "Add receipt"
                      : "补充消费凭证"}
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      {revisions.length > 0 ? (
        <details className="group rounded-[1.2rem] border border-[#E3DFD0] bg-white p-4">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
            <History className="h-4 w-4" />
            {locale === "fr"
              ? "Historique des révisions"
              : locale === "en"
                ? "Revision history"
                : "修订历史"}
            <span className="ml-auto text-xs text-[#7C827A]">
              {revisions.length}
            </span>
          </summary>
          <ol className="mt-3 grid gap-2 border-t border-[#EEEBDD] pt-3">
            {revisions.map((revision) => (
              <li
                className="flex items-center justify-between gap-3 rounded-xl bg-[#F8FAF5] px-3 py-2"
                key={revision.id}
              >
                <span className="min-w-0 truncate text-xs font-bold text-ink">
                  v{revision.version} · {revision.actor.displayNameSnapshot}
                </span>
                <time className="shrink-0 text-[10px] font-semibold text-[#8A9188]">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(revision.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {transaction.hasConflict ? (
        <section className="rounded-[1.2rem] border border-[#E8D9B4] bg-[#FFF8E9] p-4">
          <p className="text-sm font-bold leading-6 text-[#725C28]">
            {copy.conflict}
          </p>
          {snapshot.canManage ? (
            <form action={resolveAaConflictAction} className="mt-3">
              <input name="activityId" type="hidden" value={activityId} />
              <input
                name="transactionId"
                type="hidden"
                value={transaction.id}
              />
              <input name="locale" type="hidden" value={locale} />
              <button
                className="min-h-9 rounded-full border border-[#CFAE65] bg-white px-4 text-xs font-bold text-[#725C28]"
                type="submit"
              >
                {copy.dismissConflict}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {transaction.pendingChange ? (
        <section className="rounded-[1.2rem] border border-[#E8D9B4] bg-[#FFF8E9] p-4">
          <p className="text-sm font-bold leading-6 text-[#725C28]">
            {locale === "fr"
              ? `${transaction.pendingChange.actorName} a proposé une modification. La version comptabilisée reste active jusqu'à validation.`
              : locale === "en"
                ? `${transaction.pendingChange.actorName} proposed a change. The posted version stays active until review.`
                : `${transaction.pendingChange.actorName}提交了变更申请；审核前仍按当前已入账版本计算。`}
          </p>
          {transaction.canReviewChange ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["reject", "approve"] as const).map((decision) => (
                <form action={reviewAaChangeRequestAction} key={decision}>
                  <input name="activityId" type="hidden" value={activityId} />
                  <input
                    name="changeRequestId"
                    type="hidden"
                    value={transaction.pendingChange!.id}
                  />
                  <input name="decision" type="hidden" value={decision} />
                  <input name="locale" type="hidden" value={locale} />
                  <input
                    name="transactionId"
                    type="hidden"
                    value={transaction.id}
                  />
                  <button
                    className={cn(
                      "min-h-10 w-full rounded-full text-xs font-bold",
                      decision === "approve"
                        ? "bg-[#156240] text-white"
                        : "border border-[#E7C4CB] bg-white text-[#A53C50]",
                    )}
                    type="submit"
                  >
                    {decision === "approve" ? copy.approve : copy.reject}
                  </button>
                </form>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {transaction.canEdit ? (
        <details className="group rounded-[1.2rem] border border-[#E3DFD0] bg-white p-4">
          <summary className="flex min-h-8 cursor-pointer list-none items-center text-sm font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
            {copy.edit}
            <span className="ml-auto text-lg transition group-open:rotate-45">
              ＋
            </span>
          </summary>
          <form
            action={updateAaTransactionAction}
            className="mt-4 grid gap-3 border-t border-[#EEEBDD] pt-4"
          >
            <input name="activityId" type="hidden" value={activityId} />
            <input name="transactionId" type="hidden" value={transaction.id} />
            <input
              name="expectedVersion"
              type="hidden"
              value={transaction.version}
            />
            <input name="locale" type="hidden" value={locale} />
            <label>
              <span className="text-xs font-bold text-[#66736A]">
                {copy.edit}
              </span>
              <input
                className="mt-1.5 h-11 w-full rounded-xl border border-[#D6D5B2] px-3 text-sm font-semibold outline-none focus:border-[#369758]"
                defaultValue={transaction.title}
                maxLength={120}
                name="title"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs font-bold text-[#66736A]">
                  {copy.amount}
                </span>
                <input
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#D6D5B2] px-3 text-sm font-semibold tabular-nums outline-none focus:border-[#369758]"
                  defaultValue={minorStringToInput(
                    transaction.originalAmountMinor,
                  )}
                  min="0.01"
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                <span className="text-xs font-bold text-[#66736A]">
                  {copy.date}
                </span>
                <input
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#D6D5B2] px-3 text-sm font-semibold outline-none focus:border-[#369758]"
                  defaultValue={transaction.occurredAt.slice(0, 10)}
                  name="occurredOn"
                  required
                  type="date"
                />
              </label>
            </div>
            <textarea
              className="min-h-20 rounded-xl border border-[#D6D5B2] px-3 py-2 text-sm outline-none focus:border-[#369758]"
              defaultValue={transaction.note ?? ""}
              maxLength={2000}
              name="note"
            />
            <label className="flex items-start gap-2 rounded-xl bg-[#FFF8E9] px-3 py-2 text-[11px] font-semibold leading-5 text-[#725C28]">
              <input
                className="mt-0.5 h-4 w-4 accent-[#156240]"
                name="futureConfirmed"
                type="checkbox"
                value="true"
              />
              <span>
                {locale === "fr"
                  ? "Si la nouvelle date est future, confirmez qu'elle doit affecter le solde dès maintenant."
                  : locale === "en"
                    ? "If the new date is in the future, confirm it should affect the balance now."
                    : "如果改为未来日期，请勾选确认该记录现在就影响余额。"}
              </span>
            </label>
            <button
              className="min-h-10 rounded-full bg-[#156240] px-4 text-sm font-bold text-white"
              type="submit"
            >
              {copy.saveChanges}
            </button>
          </form>
        </details>
      ) : null}

      <section className="rounded-[1.2rem] border border-[#E3DFD0] bg-white p-4">
        <p className="flex items-center gap-2 text-xs font-bold text-[#7C827A]">
          <History className="h-3.5 w-3.5" />
          {new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(transaction.createdAt))}{" "}
          · {transaction.creator.displayName}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {transaction.canReview ? (
            <>
              <form action={reviewAaTransactionAction}>
                <input name="activityId" type="hidden" value={activityId} />
                <input
                  name="transactionId"
                  type="hidden"
                  value={transaction.id}
                />
                <input name="locale" type="hidden" value={locale} />
                <input name="decision" type="hidden" value="reject" />
                <button
                  className="min-h-10 w-full rounded-full border border-[#E7C4CB] text-xs font-bold text-[#A53C50]"
                  type="submit"
                >
                  {copy.reject}
                </button>
              </form>
              <form action={reviewAaTransactionAction}>
                <input name="activityId" type="hidden" value={activityId} />
                <input
                  name="transactionId"
                  type="hidden"
                  value={transaction.id}
                />
                <input name="locale" type="hidden" value={locale} />
                <input name="decision" type="hidden" value="approve" />
                <button
                  className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#156240] text-xs font-bold text-white"
                  type="submit"
                >
                  <Check className="h-3.5 w-3.5" />
                  {copy.approve}
                </button>
              </form>
            </>
          ) : null}
          {transaction.canConfirm ? (
            <form action={confirmAaTransferAction}>
              <input name="activityId" type="hidden" value={activityId} />
              <input
                name="transactionId"
                type="hidden"
                value={transaction.id}
              />
              <input name="locale" type="hidden" value={locale} />
              <button
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#156240] text-xs font-bold text-white"
                type="submit"
              >
                <Check className="h-3.5 w-3.5" />
                {copy.confirm}
              </button>
            </form>
          ) : null}
          {transaction.canDispute ? (
            <form action={disputeAaTransactionAction}>
              <input name="activityId" type="hidden" value={activityId} />
              <input
                name="transactionId"
                type="hidden"
                value={transaction.id}
              />
              <input name="locale" type="hidden" value={locale} />
              <button
                className="min-h-10 w-full rounded-full border border-[#E8D9B4] text-xs font-bold text-[#725C28]"
                type="submit"
              >
                {copy.dispute}
              </button>
            </form>
          ) : null}
          {snapshot.canManage && transaction.status === "DISPUTED" ? (
            <form action={resolveAaDisputeAction}>
              <input name="activityId" type="hidden" value={activityId} />
              <input
                name="transactionId"
                type="hidden"
                value={transaction.id}
              />
              <input name="locale" type="hidden" value={locale} />
              <button
                className="min-h-10 w-full rounded-full bg-[#156240] text-xs font-bold text-white"
                type="submit"
              >
                {copy.resolveDispute}
              </button>
            </form>
          ) : null}
          {transaction.canVoid ? (
            <form action={voidAaTransactionAction}>
              <input name="activityId" type="hidden" value={activityId} />
              <input
                name="transactionId"
                type="hidden"
                value={transaction.id}
              />
              <input name="locale" type="hidden" value={locale} />
              <button
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-[#E7C4CB] text-xs font-bold text-[#A53C50]"
                type="submit"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {copy.void}
              </button>
            </form>
          ) : null}
          {snapshot.canManage &&
          transaction.status === "VOIDED" &&
          snapshot.status === "ACTIVE" ? (
            <form action={restoreAaTransactionAction}>
              <input name="activityId" type="hidden" value={activityId} />
              <input
                name="transactionId"
                type="hidden"
                value={transaction.id}
              />
              <input name="locale" type="hidden" value={locale} />
              <button
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-[#8AB68E] text-xs font-bold text-[#156240]"
                type="submit"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {copy.restore}
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </PageContainer>
  );
}
