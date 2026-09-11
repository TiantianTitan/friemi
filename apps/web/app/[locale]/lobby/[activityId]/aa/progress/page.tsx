import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDollarSign,
  Clock3,
  WalletCards,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileNavSectionOverride } from "@/components/navigation/MobileNavSectionOverride";
import { createAaPaymentRequestAction } from "@/features/aa/actions/aaPaymentRequestActions";
import { AaLedgerShareTools } from "@/features/aa/components/AaLedgerShareTools";
import { formatMinorAmount } from "@/features/aa/domain/money";
import { getActivityAaSnapshot } from "@/features/aa/server/ledgerService";
import { ensureCurrentUserProfileSnapshot } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { withLocale } from "@/lib/routes";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; activityId: string }>;
};

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      blocked: "Terminez les validations et les litiges avant de régler.",
      paid: "À jour",
      pay: "À payer",
      receive: "À recevoir",
      record: "Marquer comme payé",
      remind: "Relancer les participants",
      request: "Demander le paiement",
      settled: "personnes à jour",
      status: "Statut du paiement",
      title: "Progression",
      total: "Dépenses totales",
      waiting: "Confirmation",
      dispute: "Litige",
      you: "vous",
    };
  }
  if (locale === "en") {
    return {
      blocked: "Finish pending reviews and disputes before settling up.",
      paid: "Settled",
      pay: "To pay",
      receive: "To receive",
      record: "Mark as paid",
      remind: "Remind unsettled friends",
      request: "Request payment",
      settled: "people settled",
      status: "Payment status",
      title: "Settlement progress",
      total: "Total expenses",
      waiting: "Awaiting confirmation",
      dispute: "Disputed",
      you: "you",
    };
  }
  return {
    blocked: "请先处理待审核、待确认或争议记录，再继续结算。",
    paid: "已确认收款",
    pay: "待付款",
    receive: "待收款",
    record: "标记已付款",
    remind: "催一下未支付的小伙伴",
    request: "发送付款请求",
    settled: "人已结清",
    status: "支付状态",
    title: "结算进度",
    total: "总开支",
    waiting: "待对方确认",
    dispute: "争议处理中",
    you: "你",
  };
}

function Initial({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F2E3] text-[12px] font-black text-[#156240] ring-1 ring-[#D6D5B2]">
      {Array.from(name.trim())[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export default async function AaSettlementProgressPage({ params }: PageProps) {
  const { activityId, locale } = await params;
  const profile = await ensureCurrentUserProfileSnapshot(
    locale,
    `/lobby/${activityId}/aa/progress`,
  );
  const snapshot = await getActivityAaSnapshot(activityId, profile.id);
  const copy = getCopy(locale);
  const backHref = withLocale(locale, `/lobby/${activityId}/aa`);
  const newHref = withLocale(locale, `/lobby/${activityId}/aa/new`);
  const activeParticipants = snapshot.participants.filter(
    (participant) => participant.status === "ACTIVE",
  );
  const participantStates = activeParticipants.map((participant) => {
    const balance = BigInt(participant.balanceMinor);
    const hasDispute = snapshot.transactions.some(
      (transaction) =>
        transaction.status === "DISPUTED" &&
        transaction.relatedParticipantIds.includes(participant.id),
    );
    const awaitsConfirmation = snapshot.transactions.some(
      (transaction) =>
        transaction.status === "PENDING_CONFIRMATION" &&
        transaction.relatedParticipantIds.includes(participant.id),
    );
    const state = hasDispute
      ? "DISPUTED"
      : awaitsConfirmation
        ? "WAITING"
        : balance === 0n
          ? "SETTLED"
          : balance < 0n
            ? "PAY"
            : "RECEIVE";
    return { ...participant, balance, state };
  });
  const settledCount = participantStates.filter(
    (participant) => participant.state === "SETTLED",
  ).length;

  return (
    <PageContainer
      className="max-w-[430px] space-y-5 bg-[#FEFFF9] pb-8 pt-4 sm:py-8"
      mobileSafeBottom
      mobileSafeTop
    >
      <MobileNavSectionOverride section="activities" />
      <header className="grid grid-cols-[44px_1fr_44px] items-center">
        <Link
          aria-label={
            locale === "fr" ? "Retour" : locale === "en" ? "Back" : "返回"
          }
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#1D1D1B] transition hover:bg-[#F1F2E3]"
          href={backHref}
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </Link>
        <h1 className="text-center text-[17px] font-black text-[#1D1D1B]">
          {copy.title}
        </h1>
        <span />
      </header>

      <section className="relative min-h-[134px] overflow-hidden rounded-[16px] border border-[#E7E1CE] bg-white p-4">
        <p className="text-[10px] font-bold text-[#8E8383]">{copy.total}</p>
        <p className="mt-1 text-[27px] font-black tracking-[-0.03em] text-[#1D1D1B] friemi-tabular">
          {formatMinorAmount(
            BigInt(snapshot.summary.expenseTotalMinor),
            snapshot.baseCurrency,
            locale,
          )}
        </p>
        <p className="mt-3 text-[11px] font-bold text-[#68736B]">
          {copy.settled} {settledCount} / {activeParticipants.length}
        </p>
        <div className="mt-2 h-1.5 w-[58%] overflow-hidden rounded-full bg-[#EEF3EC]">
          <span
            className="block h-full rounded-full bg-[#369758] transition-[width] duration-300 motion-reduce:transition-none"
            style={{
              width: `${activeParticipants.length ? (settledCount / activeParticipants.length) * 100 : 100}%`,
            }}
          />
        </div>
        <Image
          alt=""
          aria-hidden="true"
          className="absolute -bottom-5 -right-3 h-auto w-[118px] object-contain"
          height={210}
          src="/illustrations/ui/success.png"
          width={210}
        />
      </section>

      <section>
        <h2 className="text-[12px] font-black text-[#1D1D1B]">{copy.status}</h2>
        <div className="mt-3 overflow-hidden rounded-[16px] border border-[#E7E1CE] bg-white px-4">
          {participantStates.map((participant, index) => {
            const amount =
              participant.balance < 0n
                ? -participant.balance
                : participant.balance;
            const tone =
              participant.state === "SETTLED"
                ? "bg-[#ECF6EF] text-[#369758]"
                : participant.state === "DISPUTED"
                  ? "bg-[#FFF0F2] text-[#B95064]"
                  : participant.state === "WAITING"
                    ? "bg-[#FFF5DD] text-[#8A641B]"
                    : "bg-[#F2F4ED] text-[#68736B]";
            const label =
              participant.state === "SETTLED"
                ? copy.paid
                : participant.state === "DISPUTED"
                  ? copy.dispute
                  : participant.state === "WAITING"
                    ? copy.waiting
                    : participant.state === "PAY"
                      ? copy.pay
                      : copy.receive;

            return (
              <div
                className={cn(
                  "flex min-h-[64px] items-center gap-3",
                  index > 0 && "border-t border-[#EEEBDD]",
                )}
                key={participant.id}
              >
                {participant.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-[#D6D5B2]"
                    src={participant.avatarUrl}
                  />
                ) : (
                  <Initial name={participant.displayName} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-black text-[#1D1D1B]">
                    {participant.displayName}
                    {participant.isViewer ? `（${copy.you}）` : ""}
                  </span>
                  {amount > 0n ? (
                    <span className="mt-0.5 block text-[10px] font-semibold text-[#8E8383] friemi-tabular">
                      {formatMinorAmount(amount, snapshot.baseCurrency, locale)}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
                    tone,
                  )}
                >
                  {participant.state === "SETTLED" ? (
                    <Check className="h-3 w-3" />
                  ) : participant.state === "DISPUTED" ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : (
                    <Clock3 className="h-3 w-3" />
                  )}
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {snapshot.summary.settlementBlocked ? (
        <p className="rounded-[12px] bg-[#FFF7E8] px-3 py-2.5 text-[10px] font-semibold leading-5 text-[#806B3D]">
          {copy.blocked}
        </p>
      ) : snapshot.settlements.length > 0 ? (
        <section className="space-y-2.5">
          {snapshot.settlements.map((settlement) => (
            <article
              className="rounded-[16px] border border-[#E7E1CE] bg-white p-4"
              key={`${settlement.fromParticipantId}:${settlement.toParticipantId}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] font-black text-[#1D1D1B]">
                  {settlement.fromName}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-[#8AB68E]" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-black text-[#1D1D1B]">
                  {settlement.toName}
                </span>
                <span className="shrink-0 text-[14px] font-black text-[#156240] friemi-tabular">
                  {formatMinorAmount(
                    BigInt(settlement.amountMinor),
                    snapshot.baseCurrency,
                    locale,
                  )}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#EEEBDD] pt-3">
                {(settlement.fromParticipantId === snapshot.viewer.id ||
                  snapshot.canManage) &&
                snapshot.status === "ACTIVE" ? (
                  <Link
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#8AB68E] text-[11px] font-bold text-[#156240]"
                    href={`${newHref}?type=TRANSFER&from=${encodeURIComponent(settlement.fromParticipantId)}&to=${encodeURIComponent(settlement.toParticipantId)}&amount=${Number(BigInt(settlement.amountMinor)) / 100}`}
                  >
                    <CircleDollarSign className="h-3.5 w-3.5" />
                    {copy.record}
                  </Link>
                ) : (
                  <span />
                )}
                {(settlement.toParticipantId === snapshot.viewer.id ||
                  snapshot.canManage) &&
                snapshot.status === "ACTIVE" ? (
                  <form action={createAaPaymentRequestAction}>
                    <input name="activityId" type="hidden" value={activityId} />
                    <input
                      name="amountMinor"
                      type="hidden"
                      value={settlement.amountMinor}
                    />
                    <input
                      name="fromParticipantId"
                      type="hidden"
                      value={settlement.fromParticipantId}
                    />
                    <input
                      name="ledgerVersion"
                      type="hidden"
                      value={snapshot.version}
                    />
                    <input name="locale" type="hidden" value={locale} />
                    <input
                      name="toParticipantId"
                      type="hidden"
                      value={settlement.toParticipantId}
                    />
                    <button
                      className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#ECF5EF] text-[11px] font-bold text-[#156240]"
                      type="submit"
                    >
                      <WalletCards className="h-3.5 w-3.5" />
                      {copy.request}
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {settledCount < activeParticipants.length ? (
        <AaLedgerShareTools
          locale={locale}
          title={snapshot.title}
          triggerLabel={copy.remind}
        />
      ) : null}
    </PageContainer>
  );
}
