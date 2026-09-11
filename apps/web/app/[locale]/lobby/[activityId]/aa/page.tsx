import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Camera,
  CarFront,
  Check,
  ChevronRight,
  Download,
  Filter,
  MoreHorizontal,
  Plus,
  ReceiptText,
  RotateCcw,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Snowflake,
  Ticket,
  Utensils,
  UsersRound,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileNavSectionOverride } from "@/components/navigation/MobileNavSectionOverride";
import { ensureCurrentUserProfileSnapshot } from "@/lib/auth";
import { withLocale } from "@/lib/routes";
import { formatMinorAmount } from "@/features/aa/domain/money";
import {
  AaLedgerError,
  getActivityAaSnapshot,
  type ActivityAaSnapshot,
} from "@/features/aa/server/ledgerService";
import { getAaCopy, getAaStatusLabel } from "@/features/aa/copy";
import {
  confirmAaTransferAction,
  reviewAaTransactionAction,
} from "@/features/aa/actions/aaTransactionActions";
import {
  createAaCategoryAction,
  toggleAaCategoryAction,
  updateAaLedgerRulesAction,
  updateAaLedgerStatusAction,
} from "@/features/aa/actions/aaLedgerActions";
import { cn } from "@/lib/utils";
import { AaCsvImportForm } from "@/features/aa/components/AaCsvImportForm";
import { AaLedgerShareTools } from "@/features/aa/components/AaLedgerShareTools";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; activityId: string }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    page?: string;
  }>;
};

function getUi(locale: string) {
  if (locale === "fr") {
    return {
      all: "Tout",
      details: "Détails",
      entries: "Saisies",
      filter: "Rechercher et filtrer",
      filteredEmpty: "Aucune dépense ne correspond à ces filtres.",
      participants: "Personnes",
      pending: "à traiter",
      progress: "Voir la progression",
      reset: "Effacer",
      search: "Titre, personne ou note",
      spendList: "Liste des dépenses",
      title: "Règlement",
      upload: "Ajouter une dépense",
      viewerReceive: "À recevoir",
      viewerPay: "À payer",
      viewerSettled: "À jour",
    };
  }
  if (locale === "en") {
    return {
      all: "All",
      details: "Details",
      entries: "Entered",
      filter: "Search and filter",
      filteredEmpty: "No expenses match these filters.",
      participants: "People",
      pending: "to review",
      progress: "View settlement progress",
      reset: "Clear",
      search: "Title, person or note",
      spendList: "Expense list",
      title: "Settlement",
      upload: "Upload expense",
      viewerReceive: "You receive",
      viewerPay: "You pay",
      viewerSettled: "All square",
    };
  }
  return {
    all: "全部",
    details: "详情",
    entries: "已上传",
    filter: "搜索与筛选",
    filteredEmpty: "没有符合当前筛选条件的开支。",
    participants: "参与人数",
    pending: "待处理",
    progress: "查看结算进度",
    reset: "清除",
    search: "搜索标题、成员或备注",
    spendList: "开支列表（预计）",
    title: "结算",
    upload: "上传开支",
    viewerReceive: "你应收",
    viewerPay: "你需付",
    viewerSettled: "你已结清",
  };
}

function getStatusTone(status: string) {
  if (status === "POSTED") return "bg-[#ECF5EF] text-[#369758]";
  if (status === "PENDING_REVIEW" || status === "PENDING_CONFIRMATION") {
    return "bg-[#FFF5DD] text-[#8A641B]";
  }
  if (status === "REJECTED" || status === "DISPUTED") {
    return "bg-[#FFF0F2] text-[#A53C50]";
  }
  return "bg-[#F1F2E3] text-[#6F756D]";
}

function transactionIcon(type: string) {
  if (type === "INCOME") return ArrowDownLeft;
  if (type === "TRANSFER") return ArrowRight;
  return ArrowUpRight;
}

function categoryIcon(name: string) {
  if (/餐|食|饭|酒|饮|dinner|food/i.test(name)) return Utensils;
  if (/交通|车|taxi|transport/i.test(name)) return CarFront;
  if (/住宿|酒店|hotel|stay/i.test(name)) return BedDouble;
  if (/票|ticket/i.test(name)) return Ticket;
  if (/购物|shop/i.test(name)) return ShoppingBag;
  return ReceiptText;
}

function LedgerErrorState({
  activityId,
  error,
  locale,
}: {
  activityId: string;
  error: unknown;
  locale: string;
}) {
  const copy = getAaCopy(locale);
  const message =
    error instanceof AaLedgerError && error.code === "MAX_PARTICIPANTS"
      ? copy.tooMany
      : error instanceof AaLedgerError && error.code === "FORBIDDEN"
        ? copy.forbidden
        : copy.unavailable;

  return (
    <PageContainer className="max-w-[430px] bg-[#FEFFF9] py-5" mobileSafeTop>
      <MobileNavSectionOverride section="activities" />
      <Link
        className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#156240]"
        href={withLocale(locale, `/lobby/${activityId}`)}
      >
        <ArrowLeft className="h-4 w-4" />
        {copy.back}
      </Link>
      <section className="mt-10 rounded-[16px] border border-[#E7E1CE] bg-white p-6 text-center">
        <ReceiptText className="mx-auto h-6 w-6 text-[#369758]" />
        <p className="mt-3 text-sm font-semibold leading-6 text-[#66736A]">
          {message}
        </p>
      </section>
    </PageContainer>
  );
}

function CompactSummary({
  locale,
  snapshot,
}: {
  locale: string;
  snapshot: ActivityAaSnapshot;
}) {
  const ui = getUi(locale);
  const balance = BigInt(snapshot.viewer.balanceMinor);
  const amount = balance < 0n ? -balance : balance;
  const balanceLabel =
    balance > 0n
      ? ui.viewerReceive
      : balance < 0n
        ? ui.viewerPay
        : ui.viewerSettled;
  const pending =
    snapshot.summary.pendingReviewCount +
    snapshot.summary.pendingChangeCount +
    snapshot.summary.pendingConfirmationCount;

  return (
    <section className="rounded-[16px] border border-[#E7E1CE] bg-white p-4 shadow-[0_8px_24px_rgba(21,98,64,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold text-[#8E8383]">
            {locale === "fr"
              ? "Dépenses totales"
              : locale === "en"
                ? "Total expenses"
                : "总开支（预计）"}
          </p>
          <p className="mt-1 text-[28px] font-black leading-none tracking-[-0.035em] text-[#1D1D1B] friemi-tabular">
            {formatMinorAmount(
              BigInt(snapshot.summary.expenseTotalMinor),
              snapshot.baseCurrency,
              locale,
            )}
          </p>
          <span
            className={cn(
              "mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold",
              pending > 0
                ? "bg-[#FFF5DD] text-[#8A641B]"
                : "bg-[#ECF5EF] text-[#369758]",
            )}
          >
            {pending > 0 ? `${pending} ${ui.pending}` : balanceLabel}
          </span>
        </div>
        <div className="rounded-[12px] bg-[#F3F7F0] px-3 py-2 text-right">
          <p className="text-[9px] font-bold text-[#8E8383]">{balanceLabel}</p>
          <p className="mt-1 text-[14px] font-black text-[#156240] friemi-tabular">
            {formatMinorAmount(amount, snapshot.baseCurrency, locale)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 border-t border-[#EEEBDD] pt-3">
        <div>
          <p className="text-[9px] font-bold text-[#8E8383]">{ui.entries}</p>
          <p className="mt-1 text-[13px] font-black text-[#1D1D1B]">
            {snapshot.summary.postedCount}
          </p>
        </div>
        <div className="border-x border-[#EEEBDD] px-3">
          <p className="text-[9px] font-bold text-[#8E8383]">
            {ui.participants}
          </p>
          <p className="mt-1 text-[13px] font-black text-[#1D1D1B]">
            {
              snapshot.participants.filter(
                (participant) => participant.status === "ACTIVE",
              ).length
            }
          </p>
        </div>
        <div className="pl-3">
          <p className="text-[9px] font-bold text-[#8E8383]">
            {locale === "fr"
              ? "Version"
              : locale === "en"
                ? "Version"
                : "账本版本"}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[13px] font-black text-[#1D1D1B]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#369758]" />v
            {snapshot.version}
          </p>
        </div>
      </div>
    </section>
  );
}

function TransactionRow({
  activityId,
  locale,
  snapshot,
  transaction,
}: {
  activityId: string;
  locale: string;
  snapshot: ActivityAaSnapshot;
  transaction: ActivityAaSnapshot["transactions"][number];
}) {
  const copy = getAaCopy(locale);
  const TypeIcon = transactionIcon(transaction.type);
  const CategoryIcon = categoryIcon(transaction.categoryName);
  const meta =
    transaction.type === "TRANSFER"
      ? `${transaction.transferFrom?.displayName} → ${transaction.transferTo?.displayName}`
      : `${transaction.contributionNames.join("、")} · ${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(transaction.occurredAt))}`;

  return (
    <article className="border-b border-[#EEEBDD] last:border-0">
      <Link
        className="flex min-h-[68px] items-center gap-3 py-3"
        href={withLocale(
          locale,
          `/lobby/${activityId}/aa/transactions/${transaction.id}`,
        )}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F4F7F1] text-[#156240]">
          <CategoryIcon className="h-[18px] w-[18px]" strokeWidth={1.7} />
          <TypeIcon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white p-0.5 text-[#369758] ring-1 ring-[#D6D5B2]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-black text-[#1D1D1B]">
            {transaction.title}
          </span>
          <span className="mt-1 block truncate text-[10px] font-semibold text-[#8E8383]">
            {meta}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-black text-[#1D1D1B] friemi-tabular">
            {formatMinorAmount(
              BigInt(transaction.baseAmountMinor),
              snapshot.baseCurrency,
              locale,
            )}
          </span>
          <span
            className={cn(
              "mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold",
              getStatusTone(transaction.status),
            )}
          >
            {getAaStatusLabel(locale, transaction.status)}
          </span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#B7B6AE]" />
      </Link>

      {transaction.canReview ? (
        <div className="mb-3 grid grid-cols-2 gap-2 pl-[52px]">
          <form action={reviewAaTransactionAction}>
            <input name="activityId" type="hidden" value={activityId} />
            <input name="transactionId" type="hidden" value={transaction.id} />
            <input name="locale" type="hidden" value={locale} />
            <input name="decision" type="hidden" value="reject" />
            <button
              className="min-h-9 w-full rounded-full border border-[#E7C4CB] text-[10px] font-bold text-[#A53C50]"
              type="submit"
            >
              {copy.reject}
            </button>
          </form>
          <form action={reviewAaTransactionAction}>
            <input name="activityId" type="hidden" value={activityId} />
            <input name="transactionId" type="hidden" value={transaction.id} />
            <input name="locale" type="hidden" value={locale} />
            <input name="decision" type="hidden" value="approve" />
            <button
              className="min-h-9 w-full rounded-full bg-[#369758] text-[10px] font-bold text-white"
              type="submit"
            >
              {copy.approve}
            </button>
          </form>
        </div>
      ) : transaction.canConfirm ? (
        <form action={confirmAaTransferAction} className="mb-3 pl-[52px]">
          <input name="activityId" type="hidden" value={activityId} />
          <input name="transactionId" type="hidden" value={transaction.id} />
          <input name="locale" type="hidden" value={locale} />
          <button
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#369758] text-[10px] font-bold text-white"
            type="submit"
          >
            <Check className="h-3.5 w-3.5" />
            {copy.confirm}
          </button>
        </form>
      ) : null}
    </article>
  );
}

export default async function AaLedgerPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, activityId } = await params;
  const filters = await searchParams;
  const profile = await ensureCurrentUserProfileSnapshot(
    locale,
    `/lobby/${activityId}/aa`,
  );
  let snapshot: ActivityAaSnapshot;

  try {
    snapshot = await getActivityAaSnapshot(activityId, profile.id);
  } catch (error) {
    return (
      <LedgerErrorState activityId={activityId} error={error} locale={locale} />
    );
  }

  const copy = getAaCopy(locale);
  const ui = getUi(locale);
  const backHref = withLocale(locale, `/lobby/${activityId}`);
  const newHref = withLocale(locale, `/lobby/${activityId}/aa/new`);
  const progressHref = withLocale(locale, `/lobby/${activityId}/aa/progress`);
  const query = filters.q?.trim().toLocaleLowerCase(locale) ?? "";
  const filteredTransactions = snapshot.transactions.filter((transaction) => {
    const haystack = [
      transaction.title,
      transaction.note ?? "",
      transaction.categoryName,
      transaction.creator.displayName,
      ...transaction.contributionNames,
      ...transaction.shares.map((share) => share.displayName),
    ]
      .join(" ")
      .toLocaleLowerCase(locale);
    return (
      (!query || haystack.includes(query)) &&
      (!filters.type || transaction.type === filters.type) &&
      (!filters.status || transaction.status === filters.status)
    );
  });
  const hasFilters = Boolean(query || filters.type || filters.status);
  const requestedPage = Number.parseInt(filters.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = 100;
  const pageCount = Math.max(
    1,
    Math.ceil(filteredTransactions.length / pageSize),
  );
  const currentPage = Math.min(page, pageCount);
  const visibleTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const pageHref = (nextPage: number) => {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== "page" && value) queryParams.set(key, value);
    });
    queryParams.set("page", String(nextPage));
    return withLocale(
      locale,
      `/lobby/${activityId}/aa?${queryParams.toString()}`,
    );
  };

  return (
    <PageContainer
      className="max-w-[430px] space-y-5 bg-[#FEFFF9] pb-8 pt-4 sm:py-8"
      mobileSafeBottom
      mobileSafeTop
    >
      <MobileNavSectionOverride section="activities" />
      <header className="grid grid-cols-[44px_1fr_44px] items-center">
        <Link
          aria-label={copy.back}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#1D1D1B] transition hover:bg-[#F1F2E3]"
          href={backHref}
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="text-[17px] font-black text-[#1D1D1B]">{ui.title}</h1>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-[#8E8383]">
            {snapshot.title}
          </p>
        </div>
        <a
          aria-label={copy.settings}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#1D1D1B] transition hover:bg-[#F1F2E3]"
          href="#aa-ledger-settings"
        >
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </a>
      </header>

      <CompactSummary locale={locale} snapshot={snapshot} />

      {snapshot.status !== "ACTIVE" ? (
        <p className="rounded-[12px] bg-[#F1F2E3] px-3 py-2.5 text-[10px] font-semibold text-[#68736B]">
          {copy.readonly}
        </p>
      ) : null}

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[12px] font-black text-[#1D1D1B]">
            {ui.spendList}
          </h2>
          {snapshot.status === "ACTIVE" ? (
            <Link
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#F1F6ED] px-3 text-[10px] font-bold text-[#156240]"
              href={newHref}
            >
              <Plus className="h-3.5 w-3.5" />
              {ui.upload}
            </Link>
          ) : null}
        </div>

        {filteredTransactions.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-[16px] border border-[#E7E1CE] bg-white px-4">
            {visibleTransactions.map((transaction) => (
              <TransactionRow
                activityId={activityId}
                key={transaction.id}
                locale={locale}
                snapshot={snapshot}
                transaction={transaction}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-[16px] border border-dashed border-[#C7DCCB] bg-white px-6 py-8 text-center">
            <Camera
              className="mx-auto h-6 w-6 text-[#369758]"
              strokeWidth={1.7}
            />
            <h3 className="mt-3 text-[13px] font-black text-[#1D1D1B]">
              {hasFilters ? ui.filteredEmpty : copy.emptyTitle}
            </h3>
            <p className="mt-1.5 text-[11px] font-semibold leading-5 text-[#7C827A]">
              {hasFilters ? ui.search : copy.emptyBody}
            </p>
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {currentPage > 1 ? (
              <Link
                className="min-h-9 rounded-full border border-[#D6D5B2] py-2 text-center text-xs font-bold text-[#156240]"
                href={pageHref(currentPage - 1)}
              >
                ←
              </Link>
            ) : (
              <span />
            )}
            <span className="text-[10px] font-bold text-[#8E8383]">
              {currentPage} / {pageCount}
            </span>
            {currentPage < pageCount ? (
              <Link
                className="min-h-9 rounded-full border border-[#D6D5B2] py-2 text-center text-xs font-bold text-[#156240]"
                href={pageHref(currentPage + 1)}
              >
                →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}

        <div className="mt-3 flex items-center justify-between px-1 text-[11px] font-bold text-[#68736B]">
          <span>
            {locale === "fr"
              ? "Total"
              : locale === "en"
                ? "Total"
                : "总开支（预计）"}
          </span>
          <strong className="text-[14px] font-black text-[#1D1D1B] friemi-tabular">
            {formatMinorAmount(
              BigInt(snapshot.summary.expenseTotalMinor),
              snapshot.baseCurrency,
              locale,
            )}
          </strong>
        </div>
      </section>

      <Link
        className="flex min-h-12 items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-[#156240] to-[#369758] px-4 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(21,98,64,0.16)]"
        href={progressHref}
      >
        <UsersRound className="h-4 w-4" />
        {ui.progress}
        <ArrowRight className="h-4 w-4" />
      </Link>

      <details
        className="group rounded-[16px] border border-[#E7E1CE] bg-white px-4 py-3"
        open={hasFilters}
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-[11px] font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
          <Filter className="h-3.5 w-3.5" />
          {ui.filter}
          <ChevronRight className="ml-auto h-3.5 w-3.5 transition group-open:rotate-90" />
        </summary>
        <form
          className="mt-3 grid gap-2 border-t border-[#EEEBDD] pt-3"
          method="get"
        >
          <input
            className="h-10 rounded-[12px] border border-[#D6D5B2] px-3 text-[11px] font-semibold outline-none focus:border-[#369758]"
            defaultValue={filters.q}
            name="q"
            placeholder={ui.search}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="h-10 rounded-[12px] border border-[#D6D5B2] bg-white px-2 text-[11px] font-semibold"
              defaultValue={filters.type}
              name="type"
            >
              <option value="">{ui.all}</option>
              <option value="EXPENSE">{copy.expense}</option>
              <option value="INCOME">{copy.income}</option>
              <option value="TRANSFER">{copy.transfer}</option>
            </select>
            <select
              className="h-10 rounded-[12px] border border-[#D6D5B2] bg-white px-2 text-[11px] font-semibold"
              defaultValue={filters.status}
              name="status"
            >
              <option value="">{ui.all}</option>
              {[
                "POSTED",
                "PENDING_REVIEW",
                "PENDING_CONFIRMATION",
                "DISPUTED",
                "REJECTED",
                "VOIDED",
              ].map((status) => (
                <option key={status} value={status}>
                  {getAaStatusLabel(locale, status)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              className="flex min-h-10 items-center justify-center rounded-full border border-[#D6D5B2] text-[10px] font-bold text-[#68736B]"
              href={withLocale(locale, `/lobby/${activityId}/aa`)}
            >
              {ui.reset}
            </Link>
            <button
              className="min-h-10 rounded-full bg-[#369758] text-[10px] font-bold text-white"
              type="submit"
            >
              {ui.filter}
            </button>
          </div>
        </form>
      </details>

      {snapshot.canManage ? (
        <details
          className="group rounded-[16px] border border-[#E7E1CE] bg-white px-4 py-3"
          id="aa-ledger-settings"
        >
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-[11px] font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
            <Settings2 className="h-3.5 w-3.5" />
            {copy.settings}
            <ChevronRight className="ml-auto h-3.5 w-3.5 transition group-open:rotate-90" />
          </summary>
          <div className="mt-3 space-y-4 border-t border-[#EEEBDD] pt-4">
            <form
              action={updateAaLedgerRulesAction}
              className="grid gap-3 rounded-[12px] bg-[#F7F9F4] p-3"
            >
              <input name="activityId" type="hidden" value={activityId} />
              <input name="locale" type="hidden" value={locale} />
              {[
                [
                  "requireMemberReview",
                  snapshot.requireMemberReview,
                  locale === "fr"
                    ? "Valider les saisies"
                    : locale === "en"
                      ? "Review member entries"
                      : "参与者提交后需要审核",
                ],
                [
                  "allowMemberCorrections",
                  snapshot.allowMemberCorrections,
                  locale === "fr"
                    ? "Corrections des membres"
                    : locale === "en"
                      ? "Allow member corrections"
                      : "允许参与者发起共同纠错",
                ],
                [
                  "requireTransferConfirmation",
                  snapshot.requireTransferConfirmation,
                  locale === "fr"
                    ? "Confirmation des paiements"
                    : locale === "en"
                      ? "Confirm payments on both sides"
                      : "转账需要双方确认",
                ],
              ].map(([name, checked, label]) => (
                <label
                  className="flex min-h-9 items-center gap-3 text-[10px] font-bold text-[#68736B]"
                  key={String(name)}
                >
                  <input
                    className="h-4 w-4 accent-[#369758]"
                    defaultChecked={Boolean(checked)}
                    name={String(name)}
                    type="checkbox"
                    value="true"
                  />
                  {String(label)}
                </label>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {snapshot.summary.postedCount > 0 ? (
                  <input
                    name="baseCurrency"
                    type="hidden"
                    value={snapshot.baseCurrency}
                  />
                ) : null}
                <select
                  className="h-10 rounded-[12px] border border-[#D6D5B2] bg-white px-2 text-[10px] font-bold"
                  defaultValue={snapshot.baseCurrency}
                  disabled={snapshot.summary.postedCount > 0}
                  name={
                    snapshot.summary.postedCount > 0
                      ? undefined
                      : "baseCurrency"
                  }
                >
                  {["EUR", "CNY", "USD", "GBP"].map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-[12px] border border-[#D6D5B2] bg-white px-2 text-[10px] font-bold"
                  defaultValue={snapshot.timezone}
                  name="timezone"
                >
                  <option value="Europe/Paris">Europe/Paris</option>
                  <option value="Europe/Bratislava">Europe/Bratislava</option>
                  <option value="Asia/Shanghai">Asia/Shanghai</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <button
                className="min-h-10 rounded-full bg-[#369758] text-[10px] font-bold text-white"
                type="submit"
              >
                {locale === "fr"
                  ? "Enregistrer"
                  : locale === "en"
                    ? "Save rules"
                    : "保存核算规则"}
              </button>
            </form>

            <div className="rounded-[12px] bg-[#F7F9F4] p-3">
              <p className="text-[10px] font-black text-[#1D1D1B]">
                {locale === "fr"
                  ? "Catégories"
                  : locale === "en"
                    ? "Categories"
                    : "费用分类"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {snapshot.categorySettings.map((category) => (
                  <form action={toggleAaCategoryAction} key={category.id}>
                    <input name="activityId" type="hidden" value={activityId} />
                    <input
                      name="categoryId"
                      type="hidden"
                      value={category.id}
                    />
                    <input name="locale" type="hidden" value={locale} />
                    <button
                      className={cn(
                        "min-h-8 rounded-full px-3 text-[9px] font-bold",
                        category.isActive
                          ? "bg-[#ECF5EF] text-[#156240]"
                          : "bg-[#EEEFEA] text-[#9A9C95] line-through",
                      )}
                      type="submit"
                    >
                      {category.name}
                    </button>
                  </form>
                ))}
              </div>
              <form action={createAaCategoryAction} className="mt-2 flex gap-2">
                <input name="activityId" type="hidden" value={activityId} />
                <input name="locale" type="hidden" value={locale} />
                <input
                  className="h-9 min-w-0 flex-1 rounded-[10px] border border-[#D6D5B2] bg-white px-3 text-[10px]"
                  maxLength={60}
                  name="name"
                  placeholder={
                    locale === "fr"
                      ? "Nouvelle catégorie"
                      : locale === "en"
                        ? "New category"
                        : "新增分类"
                  }
                  required
                />
                <button
                  className="min-h-9 rounded-full border border-[#8AB68E] px-3 text-[10px] font-bold text-[#156240]"
                  type="submit"
                >
                  ＋
                </button>
              </form>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#D6D5B2] text-[10px] font-bold text-[#156240]"
                href={`/api/aa/${encodeURIComponent(activityId)}/export?locale=${encodeURIComponent(locale)}`}
              >
                <Download className="h-3.5 w-3.5" />
                {copy.exportCsv}
              </a>
              <AaLedgerShareTools locale={locale} title={snapshot.title} />
            </div>
            <div className="rounded-[12px] bg-[#F7F9F4] p-3">
              <AaCsvImportForm activityId={activityId} locale={locale} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <form action={updateAaLedgerStatusAction}>
                <input name="activityId" type="hidden" value={activityId} />
                <input name="locale" type="hidden" value={locale} />
                <input
                  name="intent"
                  type="hidden"
                  value={snapshot.status === "ACTIVE" ? "freeze" : "reopen"}
                />
                <button
                  className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-[#D6D5B2] text-[10px] font-bold text-[#68736B]"
                  type="submit"
                >
                  {snapshot.status === "ACTIVE" ? (
                    <Snowflake className="h-3.5 w-3.5" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  {snapshot.status === "ACTIVE" ? copy.freeze : copy.reopen}
                </button>
              </form>
              {snapshot.status !== "ARCHIVED" ? (
                <form action={updateAaLedgerStatusAction}>
                  <input name="activityId" type="hidden" value={activityId} />
                  <input name="locale" type="hidden" value={locale} />
                  <input name="intent" type="hidden" value="archive" />
                  <button
                    className="min-h-10 w-full rounded-full border border-[#E7C4CB] text-[10px] font-bold text-[#A53C50]"
                    type="submit"
                  >
                    {copy.archive}
                  </button>
                </form>
              ) : null}
            </div>

            <details className="group/log rounded-[12px] bg-[#F7F9F4] p-3">
              <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-[10px] font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
                <ScrollText className="h-3.5 w-3.5" />
                {locale === "fr"
                  ? "Journal"
                  : locale === "en"
                    ? "Activity log"
                    : "活动记录"}
                <span className="ml-auto">{snapshot.activityLog.length}</span>
              </summary>
              <ol className="mt-2 grid max-h-72 gap-2 overflow-y-auto border-t border-[#EEEBDD] pt-2">
                {snapshot.activityLog.map((event) => (
                  <li
                    className="flex justify-between gap-2 rounded-[10px] bg-white px-3 py-2 text-[9px]"
                    key={event.id}
                  >
                    <span className="truncate font-bold text-[#1D1D1B]">
                      {event.action} · {event.actorName ?? "SYSTEM"}
                    </span>
                    <time className="shrink-0 text-[#8E8383]">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "short",
                      }).format(new Date(event.createdAt))}
                    </time>
                  </li>
                ))}
              </ol>
            </details>
          </div>
        </details>
      ) : null}

      <p className="text-center text-[9px] font-semibold leading-4 text-[#AAA79E]">
        {copy.freeNotice}
      </p>
    </PageContainer>
  );
}
