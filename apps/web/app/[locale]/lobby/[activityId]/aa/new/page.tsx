import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowLeft, Snowflake } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileNavSectionOverride } from "@/components/navigation/MobileNavSectionOverride";
import { AaTransactionForm } from "@/features/aa/components/AaTransactionForm";
import { getAaCopy } from "@/features/aa/copy";
import { getActivityAaSnapshot } from "@/features/aa/server/ledgerService";
import { ensureCurrentUserProfileSnapshot } from "@/lib/auth";
import { withLocale } from "@/lib/routes";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; activityId: string }>;
  searchParams: Promise<{
    amount?: string;
    from?: string;
    to?: string;
    type?: string;
  }>;
};

export default async function NewAaTransactionPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, activityId } = await params;
  const query = await searchParams;
  const profile = await ensureCurrentUserProfileSnapshot(
    locale,
    `/lobby/${activityId}/aa/new`,
  );
  const snapshot = await getActivityAaSnapshot(activityId, profile.id);
  const copy = getAaCopy(locale);
  const initialType =
    query.type === "TRANSFER" || query.type === "INCOME"
      ? query.type
      : "EXPENSE";
  const canRecord =
    snapshot.status === "ACTIVE" ||
    (snapshot.status === "FROZEN" && initialType === "TRANSFER");

  return (
    <PageContainer
      className="max-w-2xl space-y-5 bg-[#FBFCF7] py-4 sm:py-8"
      mobileSafeTop
      mobileSafeBottom
    >
      <MobileNavSectionOverride section="activities" />
      <header className="flex items-center gap-3">
        <Link
          aria-label={copy.back}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#156240] ring-1 ring-[#D6D5B2]"
          href={withLocale(locale, `/lobby/${activityId}/aa`)}
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-black text-ink">{copy.add}</h1>
          <p className="truncate text-xs font-semibold text-[#7C827A]">
            {snapshot.title}
          </p>
        </div>
      </header>

      {!canRecord ? (
        <section className="rounded-[1.4rem] border border-[#E3DFD0] bg-white p-6 text-center">
          <Snowflake className="mx-auto h-6 w-6 text-[#607268]" />
          <p className="mt-3 text-sm font-semibold text-[#607268]">
            {copy.readonly}
          </p>
        </section>
      ) : (
        <section className="rounded-[1.5rem] border border-[#E3DFD0] bg-[#FEFFF9] p-4 shadow-sm sm:p-6">
          <AaTransactionForm
            activityId={activityId}
            baseCurrency={snapshot.baseCurrency}
            canManage={snapshot.canManage}
            categories={snapshot.categories}
            clientMutationId={`aa:${activityId}:${randomUUID()}`}
            defaultDate={new Date().toISOString().slice(0, 10)}
            initialAmount={query.amount}
            initialFromId={query.from}
            initialToId={query.to}
            initialType={initialType}
            locale={locale}
            participants={snapshot.participants}
            transferOnly={snapshot.status === "FROZEN"}
            viewerParticipantId={snapshot.viewer.id}
          />
        </section>
      )}
    </PageContainer>
  );
}
