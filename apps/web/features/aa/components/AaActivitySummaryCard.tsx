import Link from "next/link";
import { ArrowRight, CheckCircle2, ReceiptText } from "lucide-react";
import { formatMinorAmount } from "../domain/money";

type AaActivitySummary = {
  baseCurrency: string;
  participantCount: number;
  pendingCount: number;
  postedCount: number;
  totalExpenseMinor: string;
  viewerBalanceMinor: string;
};

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      empty: "Ajoutez la première dépense partagée de ce groupe.",
      entered: "Saisies",
      open: "Voir le règlement",
      participants: "Participants",
      pending: "à traiter",
      settled: "À jour",
      start: "À commencer",
      share: "Votre part",
      title: "Aperçu du règlement",
      total: "Dépenses totales (estimées)",
    };
  }

  if (locale === "en") {
    return {
      empty: "Add this plan's first shared expense.",
      entered: "Entered",
      open: "View settlement",
      participants: "People",
      pending: "to review",
      settled: "All square",
      start: "Ready to start",
      share: "Your share",
      title: "Settlement overview",
      total: "Total spend (estimated)",
    };
  }

  return {
    empty: "还没有共同开支，进入 AA 上传第一笔即可开始。",
    entered: "已上传",
    open: "查看结算详情",
    participants: "参与人数",
    pending: "待处理",
    settled: "已结清",
    start: "待记录",
    share: "你的分摊",
    title: "结算概览",
    total: "总开支（预计）",
  };
}

export function AaActivitySummaryCard({
  href,
  locale,
  summary,
}: {
  href: string;
  locale: string;
  summary: AaActivitySummary | null;
}) {
  const copy = getCopy(locale);
  const viewerBalance = BigInt(summary?.viewerBalanceMinor ?? "0");
  const viewerAmount = viewerBalance < 0n ? -viewerBalance : viewerBalance;

  return (
    <section className="overflow-hidden rounded-[16px] border border-[#E7E1CE] bg-[#FEFFF9] shadow-[0_8px_22px_rgba(21,98,64,0.05)]">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-black text-[#1D1D1B]">
            {copy.title}
          </h3>
          {!summary ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#8E8383]">
              <ReceiptText className="h-3.5 w-3.5" />
              {copy.start}
            </span>
          ) : summary.pendingCount ? (
            <span className="rounded-full bg-[#FFF3D9] px-2.5 py-1 text-[10px] font-bold text-[#8A641B]">
              {summary.pendingCount} {copy.pending}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#369758]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {copy.settled}
            </span>
          )}
        </div>

        {summary ? (
          <>
            <p className="mt-3 text-[10px] font-bold text-[#8E8383]">
              {copy.total}
            </p>
            <p className="mt-0.5 text-[24px] font-black leading-none tracking-[-0.03em] text-[#1D1D1B] friemi-tabular">
              {formatMinorAmount(
                BigInt(summary.totalExpenseMinor),
                summary.baseCurrency,
                locale,
              )}
            </p>
            <div className="mt-4 grid grid-cols-3 border-t border-[#EEEBDD] pt-3">
              <div>
                <p className="text-[9px] font-bold text-[#8E8383]">
                  {copy.entered}
                </p>
                <p className="mt-1 text-[13px] font-black text-[#1D1D1B]">
                  {summary.postedCount}
                </p>
              </div>
              <div className="border-x border-[#EEEBDD] px-3">
                <p className="text-[9px] font-bold text-[#8E8383]">
                  {copy.participants}
                </p>
                <p className="mt-1 text-[13px] font-black text-[#1D1D1B]">
                  {summary.participantCount}
                </p>
              </div>
              <div className="pl-3">
                <p className="text-[9px] font-bold text-[#8E8383]">
                  {copy.share}
                </p>
                <p className="mt-1 truncate text-[13px] font-black text-[#1D1D1B] friemi-tabular">
                  {formatMinorAmount(
                    viewerAmount,
                    summary.baseCurrency,
                    locale,
                  )}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-[12px] bg-[#F4F8F1] px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#369758] ring-1 ring-[#D6D5B2]">
              <ReceiptText className="h-4 w-4" />
            </span>
            <p className="text-[11px] font-semibold leading-5 text-[#69736C]">
              {copy.empty}
            </p>
          </div>
        )}
      </div>
      <Link
        className="flex min-h-11 items-center justify-center gap-2 bg-gradient-to-r from-[#156240] to-[#369758] px-4 text-[12px] font-bold text-white transition hover:brightness-105 active:brightness-95"
        href={href}
      >
        {copy.open}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
