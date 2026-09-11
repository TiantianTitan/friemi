import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  Clock3,
  BarChart3,
  Filter,
  LockKeyhole,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings2,
  ScrollText,
  ShieldCheck,
  Snowflake,
  WalletCards,
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
import { createAaPaymentRequestAction } from "@/features/aa/actions/aaPaymentRequestActions";
import { cn } from "@/lib/utils";
import { AaCsvImportForm } from "@/features/aa/components/AaCsvImportForm";
import { AaLedgerShareTools } from "@/features/aa/components/AaLedgerShareTools";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; activityId: string }>;
  searchParams: Promise<{
    tab?: string;
    q?: string;
    type?: string;
    status?: string;
    category?: string;
    member?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function getStatusTone(status: string) {
  if (status === "POSTED") return "bg-[#ECF5EF] text-[#156240]";
  if (status === "PENDING_REVIEW" || status === "PENDING_CONFIRMATION") {
    return "bg-[#FFF5DD] text-[#7A5B13]";
  }
  if (status === "REJECTED" || status === "DISPUTED") {
    return "bg-[#FFF0F2] text-[#A53C50]";
  }
  return "bg-[#F1F2EC] text-[#6F756D]";
}

function transactionIcon(type: string) {
  if (type === "INCOME") return ArrowDownLeft;
  if (type === "TRANSFER") return ArrowRight;
  return ArrowUpRight;
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
    <PageContainer className="max-w-xl py-5 sm:py-10" mobileSafeTop>
      <MobileNavSectionOverride section="activities" />
      <Link
        className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#156240]"
        href={withLocale(locale, `/lobby/${activityId}`)}
      >
        <ArrowLeft className="h-4 w-4" />
        {copy.back}
      </Link>
      <section className="mt-10 rounded-[1.5rem] border border-[#E3DFD0] bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F2EC] text-[#607268]">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-black text-ink">{copy.title}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#66736A]">
          {message}
        </p>
      </section>
    </PageContainer>
  );
}

function BalanceSummary({
  snapshot,
  locale,
}: {
  snapshot: ActivityAaSnapshot;
  locale: string;
}) {
  const copy = getAaCopy(locale);
  const balance = BigInt(snapshot.viewer.balanceMinor);
  const balanceLabel =
    balance > 0n ? copy.youReceive : balance < 0n ? copy.youPay : copy.balanced;

  return (
    <section className="overflow-hidden rounded-[1.55rem] bg-[#156240] text-white shadow-[0_18px_40px_rgba(21,98,64,0.2)]">
      <div className="relative p-5 sm:p-6">
        <div
          aria-hidden="true"
          className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[18px] border-white/5"
        />
        <p className="relative text-xs font-bold text-white/70">
          {balanceLabel}
        </p>
        <p className="relative mt-1 text-[2rem] font-black leading-tight tabular-nums tracking-tight">
          {formatMinorAmount(
            balance < 0n ? -balance : balance,
            snapshot.baseCurrency,
            locale,
          )}
        </p>
        <div className="relative mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/15 pt-4 text-xs font-semibold text-white/76">
          <span>
            {copy.totalExpense}{" "}
            <strong className="ml-1 text-white">
              {formatMinorAmount(
                BigInt(snapshot.summary.expenseTotalMinor),
                snapshot.baseCurrency,
                locale,
              )}
            </strong>
          </span>
          <span>
            {snapshot.summary.postedCount} {copy.entries}
          </span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> v{snapshot.version}
          </span>
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
  const Icon = transactionIcon(transaction.type);
  const typeLabel =
    transaction.type === "EXPENSE"
      ? copy.expense
      : transaction.type === "INCOME"
        ? copy.income
        : copy.transfer;

  return (
    <article className="rounded-[1.15rem] border border-[#E3DFD0] bg-white p-3.5 transition hover:border-[#C7DCCB]">
      <Link
        className="flex min-w-0 items-center gap-3"
        href={withLocale(
          locale,
          `/lobby/${activityId}/aa/transactions/${transaction.id}`,
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            transaction.type === "INCOME"
              ? "bg-[#E9F6EF] text-[#18734A]"
              : transaction.type === "TRANSFER"
                ? "bg-[#EEF1F7] text-[#50627B]"
                : "bg-[#FFF1EC] text-[#B75D50]",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-bold text-ink">
              {transaction.title}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                getStatusTone(transaction.status),
              )}
            >
              {getAaStatusLabel(locale, transaction.status)}
            </span>
            {transaction.pendingChange ? (
              <span className="shrink-0 rounded-full bg-[#FFF5DD] px-2 py-0.5 text-[10px] font-bold text-[#7A5B13]">
                {locale === "fr"
                  ? "modif."
                  : locale === "en"
                    ? "change"
                    : "待变更"}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-[11px] font-semibold text-[#7C827A]">
            {typeLabel} ·{" "}
            {transaction.type === "TRANSFER"
              ? `${transaction.transferFrom?.displayName} → ${transaction.transferTo?.displayName}`
              : `${transaction.contributionNames.join("、")} · ${transaction.categoryName}`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-black tabular-nums text-ink">
            {formatMinorAmount(
              BigInt(transaction.baseAmountMinor),
              snapshot.baseCurrency,
              locale,
            )}
          </span>
          <span className="mt-1 block text-[10px] font-semibold text-[#90958E]">
            {new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
            }).format(new Date(transaction.occurredAt))}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#A7ACA4]" />
      </Link>

      {transaction.canReview ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#EEEBDD] pt-3">
          <form action={reviewAaTransactionAction}>
            <input name="activityId" type="hidden" value={activityId} />
            <input name="transactionId" type="hidden" value={transaction.id} />
            <input name="locale" type="hidden" value={locale} />
            <input name="decision" type="hidden" value="reject" />
            <button
              className="min-h-9 w-full rounded-full border border-[#E7C4CB] text-xs font-bold text-[#A53C50]"
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
              className="min-h-9 w-full rounded-full bg-[#156240] text-xs font-bold text-white"
              type="submit"
            >
              {copy.approve}
            </button>
          </form>
        </div>
      ) : transaction.canConfirm ? (
        <form
          action={confirmAaTransferAction}
          className="mt-3 border-t border-[#EEEBDD] pt-3"
        >
          <input name="activityId" type="hidden" value={activityId} />
          <input name="transactionId" type="hidden" value={transaction.id} />
          <input name="locale" type="hidden" value={locale} />
          <button
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#156240] text-xs font-bold text-white"
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
  const { tab } = filters;
  const activeTab = tab === "settlement" ? "settlement" : "details";
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
  const backHref = withLocale(locale, `/lobby/${activityId}`);
  const newHref = withLocale(locale, `/lobby/${activityId}/aa/new`);
  const query = filters.q?.trim().toLocaleLowerCase(locale) ?? "";
  const filteredTransactions = snapshot.transactions.filter((transaction) => {
    const haystack = [
      transaction.title,
      transaction.note ?? "",
      transaction.categoryName,
      transaction.creator.displayName,
      ...transaction.contributionNames,
      ...transaction.shares.map((share) => share.displayName),
      transaction.transferFrom?.displayName ?? "",
      transaction.transferTo?.displayName ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase(locale);
    const occurredOn = transaction.occurredAt.slice(0, 10);

    return (
      (!query || haystack.includes(query)) &&
      (!filters.type || transaction.type === filters.type) &&
      (!filters.status || transaction.status === filters.status) &&
      (!filters.category || transaction.categoryName === filters.category) &&
      (!filters.member ||
        transaction.relatedParticipantIds.includes(filters.member)) &&
      (!filters.from || occurredOn >= filters.from) &&
      (!filters.to || occurredOn <= filters.to)
    );
  });
  const hasFilters = Boolean(
    query ||
      filters.type ||
      filters.status ||
      filters.category ||
      filters.member ||
      filters.from ||
      filters.to,
  );
  const requestedPage = Number.parseInt(filters.page ?? "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;
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
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (key !== "page" && value) params.set(key, value);
    });
    params.set("page", String(nextPage));
    return withLocale(locale, `/lobby/${activityId}/aa?${params.toString()}`);
  };
  const ui =
    locale === "fr"
      ? {
          activityLog: "Journal d'activité",
          all: "Tous",
          category: "Catégorie",
          filter: "Filtrer",
          filteredEmpty: "Aucune opération ne correspond à ces filtres.",
          from: "Du",
          income: "Revenus",
          member: "Membre",
          reset: "Effacer",
          request: "Demander le paiement",
          search: "Rechercher un libellé, une personne ou une note",
          statistics: "Statistiques",
          to: "Au",
          transfers: "Paiements confirmés",
        }
      : locale === "en"
        ? {
            activityLog: "Activity log",
            all: "All",
            category: "Category",
            filter: "Apply filters",
            filteredEmpty: "No entries match these filters.",
            from: "From",
            income: "Income",
            member: "Member",
            reset: "Clear",
            request: "Request payment",
            search: "Search title, person, or note",
            statistics: "Statistics",
            to: "To",
            transfers: "Confirmed payments",
          }
        : {
            activityLog: "活动记录",
            all: "全部",
            category: "分类",
            filter: "筛选",
            filteredEmpty: "没有符合当前筛选条件的记录。",
            from: "开始日期",
            income: "收入合计",
            member: "相关成员",
            reset: "清除",
            request: "发送付款请求",
            search: "搜索标题、成员或备注",
            statistics: "统计概览",
            to: "结束日期",
            transfers: "已确认转账",
          };
  const filteredExpenseMinor = filteredTransactions
    .filter(
      (transaction) =>
        transaction.type === "EXPENSE" && transaction.status === "POSTED",
    )
    .reduce(
      (sum, transaction) => sum + BigInt(transaction.baseAmountMinor),
      0n,
    );

  return (
    <PageContainer
      className="max-w-4xl space-y-5 bg-[#FBFCF7] py-4 sm:py-8"
      mobileSafeTop
      mobileSafeBottom
    >
      <MobileNavSectionOverride section="activities" />
      <header className="flex items-center gap-3">
        <Link
          aria-label={copy.back}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#156240] ring-1 ring-[#D6D5B2]"
          href={backHref}
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black text-ink">{copy.title}</h1>
          <p className="truncate text-xs font-semibold text-[#7C827A]">
            {snapshot.title}
          </p>
        </div>
        {snapshot.status === "ACTIVE" ? (
          <Link
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#156240] px-4 text-sm font-bold text-white shadow-sm"
            href={newHref}
          >
            <Plus className="h-4 w-4" />
            {copy.add}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF1F1] px-3 py-2 text-xs font-bold text-[#607268]">
            <Snowflake className="h-3.5 w-3.5" />
            {snapshot.status}
          </span>
        )}
      </header>

      <BalanceSummary locale={locale} snapshot={snapshot} />

      <p className="rounded-2xl border border-[#E8E2CD] bg-[#FFFDF5] px-4 py-3 text-xs font-semibold leading-5 text-[#725F35]">
        {copy.freeNotice}
      </p>
      {snapshot.status !== "ACTIVE" ? (
        <p className="rounded-2xl bg-[#EEF1F1] px-4 py-3 text-xs font-semibold text-[#607268]">
          {copy.readonly}
        </p>
      ) : null}

      <nav
        aria-label={copy.title}
        className="grid grid-cols-2 rounded-full bg-[#EEF3EC] p-1"
      >
        <Link
          className={cn(
            "min-h-10 rounded-full px-4 py-2 text-center text-sm font-bold",
            activeTab === "details"
              ? "bg-white text-[#156240] shadow-sm"
              : "text-[#66736A]",
          )}
          href={withLocale(locale, `/lobby/${activityId}/aa`)}
        >
          {copy.detailTab}
        </Link>
        <Link
          className={cn(
            "relative min-h-10 rounded-full px-4 py-2 text-center text-sm font-bold",
            activeTab === "settlement"
              ? "bg-white text-[#156240] shadow-sm"
              : "text-[#66736A]",
          )}
          href={withLocale(locale, `/lobby/${activityId}/aa?tab=settlement`)}
        >
          {copy.settlementTab}
          {snapshot.summary.actionCount > 0 ? (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E7457A] px-1 text-[9px] text-white">
              {snapshot.summary.actionCount > 9
                ? "9+"
                : snapshot.summary.actionCount}
            </span>
          ) : null}
        </Link>
      </nav>

      {activeTab === "details" ? (
        <>
          <details className="group rounded-[1.2rem] border border-[#E3DFD0] bg-white p-4">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
              <BarChart3 className="h-4 w-4" />
              {ui.statistics}
              <ChevronRight className="ml-auto h-4 w-4 transition group-open:rotate-90" />
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#EEEBDD] pt-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#F5F8F2] p-3">
                <p className="text-[10px] font-bold text-[#7C827A]">
                  {ui.income}
                </p>
                <p className="mt-1 text-sm font-black tabular-nums text-ink">
                  {formatMinorAmount(
                    BigInt(snapshot.summary.incomeTotalMinor),
                    snapshot.baseCurrency,
                    locale,
                  )}
                </p>
              </div>
              <div className="rounded-2xl bg-[#F5F8F2] p-3">
                <p className="text-[10px] font-bold text-[#7C827A]">
                  {ui.transfers}
                </p>
                <p className="mt-1 text-sm font-black tabular-nums text-ink">
                  {formatMinorAmount(
                    BigInt(snapshot.summary.transferTotalMinor),
                    snapshot.baseCurrency,
                    locale,
                  )}
                </p>
              </div>
              {snapshot.statistics.categories.map((category) => (
                <div
                  className="rounded-2xl bg-[#F5F8F2] p-3"
                  key={category.name}
                >
                  <p className="truncate text-[10px] font-bold text-[#7C827A]">
                    {category.name}
                  </p>
                  <p className="mt-1 text-sm font-black tabular-nums text-ink">
                    {formatMinorAmount(
                      BigInt(category.amountMinor),
                      snapshot.baseCurrency,
                      locale,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </details>

          <details
            className="group rounded-[1.2rem] border border-[#E3DFD0] bg-white p-4"
            open={hasFilters}
          >
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
              <Filter className="h-4 w-4" />
              {ui.filter}
              {hasFilters ? (
                <span className="rounded-full bg-[#E7457A] px-2 py-0.5 text-[10px] text-white">
                  {filteredTransactions.length}
                </span>
              ) : null}
              <ChevronRight className="ml-auto h-4 w-4 transition group-open:rotate-90" />
            </summary>
            <form
              className="mt-4 grid gap-2 border-t border-[#EEEBDD] pt-4 sm:grid-cols-2"
              method="get"
            >
              <input
                className="h-11 rounded-xl border border-[#D6D5B2] px-3 text-sm font-semibold outline-none focus:border-[#369758] sm:col-span-2"
                defaultValue={filters.q}
                name="q"
                placeholder={ui.search}
              />
              <select
                aria-label="Type"
                className="h-11 rounded-xl border border-[#D6D5B2] bg-white px-3 text-sm font-semibold outline-none"
                defaultValue={filters.type}
                name="type"
              >
                <option value="">{ui.all}</option>
                <option value="EXPENSE">{copy.expense}</option>
                <option value="INCOME">{copy.income}</option>
                <option value="TRANSFER">{copy.transfer}</option>
              </select>
              <select
                aria-label="Status"
                className="h-11 rounded-xl border border-[#D6D5B2] bg-white px-3 text-sm font-semibold outline-none"
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
              <select
                aria-label={ui.category}
                className="h-11 rounded-xl border border-[#D6D5B2] bg-white px-3 text-sm font-semibold outline-none"
                defaultValue={filters.category}
                name="category"
              >
                <option value="">{ui.category} · {ui.all}</option>
                {snapshot.categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={ui.member}
                className="h-11 rounded-xl border border-[#D6D5B2] bg-white px-3 text-sm font-semibold outline-none"
                defaultValue={filters.member}
                name="member"
              >
                <option value="">{ui.member} · {ui.all}</option>
                {snapshot.participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.displayName}
                  </option>
                ))}
              </select>
              <label className="grid gap-1 text-[10px] font-bold text-[#7C827A]">
                {ui.from}
                <input
                  className="h-11 rounded-xl border border-[#D6D5B2] px-3 text-sm font-semibold text-ink outline-none"
                  defaultValue={filters.from}
                  name="from"
                  type="date"
                />
              </label>
              <label className="grid gap-1 text-[10px] font-bold text-[#7C827A]">
                {ui.to}
                <input
                  className="h-11 rounded-xl border border-[#D6D5B2] px-3 text-sm font-semibold text-ink outline-none"
                  defaultValue={filters.to}
                  name="to"
                  type="date"
                />
              </label>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#D6D5B2] text-xs font-bold text-[#66736A]"
                  href={withLocale(locale, `/lobby/${activityId}/aa`)}
                >
                  {ui.reset}
                </Link>
                <button
                  className="min-h-10 rounded-full bg-[#156240] text-xs font-bold text-white"
                  type="submit"
                >
                  {ui.filter}
                </button>
              </div>
            </form>
            {hasFilters ? (
              <p className="mt-3 rounded-xl bg-[#FFF8E9] px-3 py-2 text-[11px] font-bold text-[#725C28]">
                {ui.filter}: {filteredTransactions.length} · {copy.totalExpense}{" "}
                {formatMinorAmount(
                  filteredExpenseMinor,
                  snapshot.baseCurrency,
                  locale,
                )}
              </p>
            ) : null}
          </details>
        </>
      ) : null}

      {activeTab === "details" ? (
        filteredTransactions.length > 0 ? (
          <section className="grid gap-2.5">
            {visibleTransactions.map((transaction) => (
              <TransactionRow
                activityId={activityId}
                key={transaction.id}
                locale={locale}
                snapshot={snapshot}
                transaction={transaction}
              />
            ))}
            {pageCount > 1 ? (
              <nav
                aria-label="Pagination"
                className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2"
              >
                {currentPage > 1 ? (
                  <Link
                    className="min-h-10 rounded-full border border-[#D6D5B2] px-4 py-2 text-center text-xs font-bold text-[#156240]"
                    href={pageHref(currentPage - 1)}
                  >
                    ←
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-xs font-bold text-[#7C827A]">
                  {currentPage} / {pageCount}
                </span>
                {currentPage < pageCount ? (
                  <Link
                    className="min-h-10 rounded-full border border-[#D6D5B2] px-4 py-2 text-center text-xs font-bold text-[#156240]"
                    href={pageHref(currentPage + 1)}
                  >
                    →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        ) : (
          <section className="rounded-[1.4rem] border border-dashed border-[#C7DCCB] bg-white px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ECF5EF] text-[#156240]">
              <ReceiptText className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-black text-ink">
              {hasFilters ? ui.filteredEmpty : copy.emptyTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#727970]">
              {hasFilters ? ui.search : copy.emptyBody}
            </p>
            {snapshot.status === "ACTIVE" && !hasFilters ? (
              <Link
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#156240] px-5 text-sm font-bold text-white"
                href={newHref}
              >
                <Plus className="h-4 w-4" />
                {copy.add}
              </Link>
            ) : null}
          </section>
        )
      ) : snapshot.settlements.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {snapshot.summary.settlementBlocked ? (
            <p className="rounded-2xl border border-[#E8D9B4] bg-[#FFF8E9] px-4 py-3 text-xs font-bold leading-5 text-[#725C28] md:col-span-2">
              {copy.settlementBlocked}
            </p>
          ) : null}
          {snapshot.settlements.map((settlement) => (
            <article
              className={cn(
                "rounded-[1.3rem] border bg-white p-4",
                settlement.involvesViewer
                  ? "border-[#8AB68E] shadow-sm"
                  : "border-[#E3DFD0]",
              )}
              key={`${settlement.fromParticipantId}:${settlement.toParticipantId}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#FFF1EC] px-2 text-xs font-black text-[#B75D50]">
                  {Array.from(settlement.fromName)[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {settlement.fromName}
                  </p>
                  <div className="my-1 flex items-center gap-2 text-[10px] font-bold text-[#8B907F]">
                    <span className="h-px flex-1 bg-[#DCE3D9]" />
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span className="h-px flex-1 bg-[#DCE3D9]" />
                  </div>
                  <p className="truncate text-sm font-bold text-ink">
                    {settlement.toName}
                  </p>
                </div>
                <span className="text-right text-base font-black tabular-nums text-[#156240]">
                  {formatMinorAmount(
                    BigInt(settlement.amountMinor),
                    snapshot.baseCurrency,
                    locale,
                  )}
                </span>
              </div>
              <p className="mt-3 text-[11px] font-semibold leading-5 text-[#7C827A]">
                {copy.why}
              </p>
              {!snapshot.summary.settlementBlocked &&
              (settlement.fromParticipantId === snapshot.viewer.id ||
                snapshot.canManage) &&
              snapshot.status === "ACTIVE" ? (
                <Link
                  className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full border border-[#8AB68E] text-xs font-bold text-[#156240]"
                  href={`${newHref}?type=TRANSFER&from=${encodeURIComponent(settlement.fromParticipantId)}&to=${encodeURIComponent(settlement.toParticipantId)}&amount=${Number(BigInt(settlement.amountMinor)) / 100}`}
                >
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  {copy.recordPayment}
                </Link>
              ) : null}
              {!snapshot.summary.settlementBlocked &&
              (settlement.toParticipantId === snapshot.viewer.id ||
                snapshot.canManage) &&
              snapshot.status === "ACTIVE" ? (
                <form action={createAaPaymentRequestAction} className="mt-2">
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
                    className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#ECF5EF] text-xs font-bold text-[#156240]"
                    type="submit"
                  >
                    <WalletCards className="h-3.5 w-3.5" />
                    {ui.request}
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-[1.4rem] border border-[#D8E8DC] bg-white px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ECF5EF] text-[#156240]">
            <WalletCards className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-black text-ink">
            {copy.noSettlement}
          </h2>
          <p className="mt-2 text-sm font-semibold text-[#727970]">
            {copy.noSettlementBody}
          </p>
        </section>
      )}

      {snapshot.canManage ? (
        <details className="group rounded-[1.2rem] border border-[#E3DFD0] bg-white p-4">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
            <Settings2 className="h-4 w-4" />
            {copy.settings}
            <ChevronRight className="ml-auto h-4 w-4 transition group-open:rotate-90" />
          </summary>
          <div className="mt-4 grid gap-4 border-t border-[#EEEBDD] pt-4 md:grid-cols-2">
            <form
              action={updateAaLedgerRulesAction}
              className="grid gap-3 rounded-2xl bg-[#F8FAF5] p-3"
            >
              <input name="activityId" type="hidden" value={activityId} />
              <input name="locale" type="hidden" value={locale} />
              <p className="text-xs font-black text-ink">
                {locale === "fr"
                  ? "Règles du compte"
                  : locale === "en"
                    ? "Ledger rules"
                    : "核算规则"}
              </p>
              <label className="flex min-h-10 items-center gap-3 text-xs font-bold text-[#5F675F]">
                <input
                  className="h-4 w-4 accent-[#156240]"
                  defaultChecked={snapshot.requireMemberReview}
                  name="requireMemberReview"
                  type="checkbox"
                  value="true"
                />
                {locale === "fr"
                  ? "Valider les saisies des membres"
                  : locale === "en"
                    ? "Review member entries"
                    : "参与者提交后需要审核"}
              </label>
              <label className="flex min-h-10 items-center gap-3 text-xs font-bold text-[#5F675F]">
                <input
                  className="h-4 w-4 accent-[#156240]"
                  defaultChecked={snapshot.allowMemberCorrections}
                  name="allowMemberCorrections"
                  type="checkbox"
                  value="true"
                />
                {locale === "fr"
                  ? "Autoriser les membres à proposer des corrections"
                  : locale === "en"
                    ? "Let members propose corrections"
                    : "允许参与者发起共同纠错"}
              </label>
              <label className="flex min-h-10 items-center gap-3 text-xs font-bold text-[#5F675F]">
                <input
                  className="h-4 w-4 accent-[#156240]"
                  defaultChecked={snapshot.requireTransferConfirmation}
                  name="requireTransferConfirmation"
                  type="checkbox"
                  value="true"
                />
                {locale === "fr"
                  ? "Confirmation des deux côtés"
                  : locale === "en"
                    ? "Require two-sided payment confirmation"
                    : "转账需要双方确认"}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[10px] font-bold text-[#7C827A]">
                  {locale === "fr"
                    ? "Devise"
                    : locale === "en"
                      ? "Currency"
                      : "账本币种"}
                  {snapshot.summary.postedCount > 0 ? (
                    <input
                      name="baseCurrency"
                      type="hidden"
                      value={snapshot.baseCurrency}
                    />
                  ) : null}
                  <select
                    className="h-10 rounded-xl border border-[#D6D5B2] bg-white px-2 text-xs font-bold text-ink disabled:bg-[#EEF1F1]"
                    defaultValue={snapshot.baseCurrency}
                    disabled={snapshot.summary.postedCount > 0}
                    name={
                      snapshot.summary.postedCount > 0
                        ? undefined
                        : "baseCurrency"
                    }
                  >
                    {["EUR", "CNY", "USD", "GBP"].map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] font-bold text-[#7C827A]">
                  {locale === "fr"
                    ? "Fuseau"
                    : locale === "en"
                      ? "Timezone"
                      : "账本时区"}
                  <select
                    className="h-10 rounded-xl border border-[#D6D5B2] bg-white px-2 text-xs font-bold text-ink"
                    defaultValue={snapshot.timezone}
                    name="timezone"
                  >
                    <option value="Europe/Paris">Europe/Paris</option>
                    <option value="Europe/Bratislava">Europe/Bratislava</option>
                    <option value="Asia/Shanghai">Asia/Shanghai</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
              </div>
              <button
                className="min-h-10 rounded-full bg-[#156240] text-xs font-bold text-white"
                type="submit"
              >
                {locale === "fr"
                  ? "Enregistrer les règles"
                  : locale === "en"
                    ? "Save rules"
                    : "保存核算规则"}
              </button>
            </form>

            <div className="grid gap-3 rounded-2xl bg-[#F8FAF5] p-3">
              <p className="text-xs font-black text-ink">
                {locale === "fr"
                  ? "Catégories"
                  : locale === "en"
                    ? "Categories"
                    : "费用分类"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {snapshot.categorySettings.map((category) => (
                  <form action={toggleAaCategoryAction} key={category.id}>
                    <input name="activityId" type="hidden" value={activityId} />
                    <input name="categoryId" type="hidden" value={category.id} />
                    <input name="locale" type="hidden" value={locale} />
                    <button
                      className={cn(
                        "min-h-8 rounded-full px-3 text-[11px] font-bold",
                        category.isActive
                          ? "bg-[#ECF5EF] text-[#156240]"
                          : "bg-[#EEF1F1] text-[#8A9188] line-through",
                      )}
                      type="submit"
                    >
                      {category.name}
                    </button>
                  </form>
                ))}
              </div>
              <form action={createAaCategoryAction} className="flex gap-2">
                <input name="activityId" type="hidden" value={activityId} />
                <input name="locale" type="hidden" value={locale} />
                <input
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[#D6D5B2] bg-white px-3 text-xs font-semibold outline-none focus:border-[#369758]"
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
                  className="min-h-10 shrink-0 rounded-full border border-[#8AB68E] px-4 text-xs font-bold text-[#156240]"
                  type="submit"
                >
                  {locale === "fr" ? "Ajouter" : locale === "en" ? "Add" : "添加"}
                </button>
              </form>
            </div>
          </div>
          <div className="mt-4 grid gap-2 border-t border-[#EEEBDD] pt-4 sm:grid-cols-3">
            <a
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#D6D5B2] text-xs font-bold text-[#156240]"
              href={`/api/aa/${encodeURIComponent(activityId)}/export?locale=${encodeURIComponent(locale)}`}
            >
              <Download className="h-3.5 w-3.5" />
              {copy.exportCsv}
            </a>
            <a
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#D6D5B2] text-xs font-bold text-[#156240]"
              href={`/api/aa/${encodeURIComponent(activityId)}/export?locale=${encodeURIComponent(locale)}&kind=settlement`}
            >
              <Download className="h-3.5 w-3.5" />
              {locale === "fr"
                ? "Exporter le règlement"
                : locale === "en"
                  ? "Export settlement"
                  : "导出结算摘要"}
            </a>
            <AaLedgerShareTools locale={locale} title={snapshot.title} />
            {snapshot.status === "ACTIVE" ? (
              <form action={updateAaLedgerStatusAction}>
                <input name="activityId" type="hidden" value={activityId} />
                <input name="locale" type="hidden" value={locale} />
                <input name="intent" type="hidden" value="freeze" />
                <button
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#D6D5B2] text-xs font-bold text-[#607268]"
                  type="submit"
                >
                  <Snowflake className="h-3.5 w-3.5" />
                  {copy.freeze}
                </button>
              </form>
            ) : (
              <form action={updateAaLedgerStatusAction}>
                <input name="activityId" type="hidden" value={activityId} />
                <input name="locale" type="hidden" value={locale} />
                <input name="intent" type="hidden" value="reopen" />
                <button
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#8AB68E] text-xs font-bold text-[#156240]"
                  type="submit"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {copy.reopen}
                </button>
              </form>
            )}
            {snapshot.status !== "ARCHIVED" ? (
              <form action={updateAaLedgerStatusAction}>
                <input name="activityId" type="hidden" value={activityId} />
                <input name="locale" type="hidden" value={locale} />
                <input name="intent" type="hidden" value="archive" />
                <button
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#E7C4CB] text-xs font-bold text-[#A53C50]"
                  type="submit"
                >
                  <Clock3 className="h-3.5 w-3.5" />
                  {copy.archive}
                </button>
              </form>
            ) : null}
            <div className="rounded-2xl bg-[#F8FAF5] p-3 sm:col-span-3">
              <AaCsvImportForm activityId={activityId} locale={locale} />
            </div>
          </div>
          <details className="group/log mt-3 rounded-2xl bg-[#F8FAF5] p-3">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs font-bold text-[#156240] [&::-webkit-details-marker]:hidden">
              <ScrollText className="h-3.5 w-3.5" />
              {ui.activityLog}
              <span className="ml-auto text-[10px] text-[#7C827A]">
                {snapshot.activityLog.length}
              </span>
            </summary>
            <ol className="mt-2 grid max-h-80 gap-2 overflow-y-auto border-t border-[#E7EBDD] pt-3">
              {snapshot.activityLog.map((event) => (
                <li
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl bg-white px-3 py-2"
                  key={event.id}
                >
                  <span className="truncate text-[11px] font-bold text-ink">
                    {event.action} · {event.actorName ?? "SYSTEM"}
                  </span>
                  <time className="text-[10px] font-semibold text-[#8A9188]">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(event.createdAt))}
                  </time>
                </li>
              ))}
            </ol>
          </details>
        </details>
      ) : null}
    </PageContainer>
  );
}
