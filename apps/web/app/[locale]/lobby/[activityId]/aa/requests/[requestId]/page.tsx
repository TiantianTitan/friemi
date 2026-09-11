import Link from "next/link";
import { ArrowLeft, CircleDollarSign, Clock3, X } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileNavSectionOverride } from "@/components/navigation/MobileNavSectionOverride";
import { AaPaymentRequestShare } from "@/features/aa/components/AaPaymentRequestShare";
import { formatMinorAmount } from "@/features/aa/domain/money";
import { getActivityAaAccess } from "@/features/aa/server/access";
import { cancelAaPaymentRequestAction } from "@/features/aa/actions/aaPaymentRequestActions";
import { ensureCurrentUserProfileSnapshot } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    activityId: string;
    locale: string;
    requestId: string;
  }>;
};

function minorToInput(amountMinor: bigint) {
  const whole = amountMinor / 100n;
  const fraction = (amountMinor % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export default async function AaPaymentRequestPage({ params }: PageProps) {
  const { activityId, locale, requestId } = await params;
  const profile = await ensureCurrentUserProfileSnapshot(
    locale,
    `/lobby/${activityId}/aa/requests/${requestId}`,
  );
  const access = await getActivityAaAccess(activityId, profile.id);
  const request = access
    ? await prisma.aaPaymentRequest.findFirst({
        where: { id: requestId, ledger: { activityId } },
        include: { creator: true, fromParticipant: true, toParticipant: true },
      })
    : null;
  const backHref = withLocale(
    locale,
    `/lobby/${activityId}/aa?tab=settlement`,
  );
  const copy =
    locale === "fr"
      ? {
          back: "Règlement",
          cancelled: "Cette demande n'est plus active.",
          cancel: "Annuler la demande",
          heading: "Demande de paiement",
          message: (from: string, to: string, amount: string) =>
            `${from} doit ${amount} à ${to} pour les dépenses partagées Friemi.`,
          record: "Enregistrer le paiement",
        }
      : locale === "en"
        ? {
            back: "Settlement",
            cancelled: "This request is no longer active.",
            cancel: "Cancel request",
            heading: "Payment request",
            message: (from: string, to: string, amount: string) =>
              `${from} owes ${to} ${amount} for shared Friemi costs.`,
            record: "Record payment",
          }
        : {
            back: "返回结算",
            cancelled: "该付款请求已失效或取消。",
            cancel: "取消付款请求",
            heading: "AA 付款请求",
            message: (from: string, to: string, amount: string) =>
              `${from}需要向${to}支付 ${amount}，用于结清 Friemi 聚吧共同开支。`,
            record: "记录已付款",
          };

  if (!request) {
    return (
      <PageContainer className="max-w-xl py-5" mobileSafeTop>
        <Link className="text-sm font-bold text-[#156240]" href={backHref}>
          ← {copy.back}
        </Link>
        <p className="mt-10 rounded-2xl bg-white p-6 text-center text-sm font-bold text-[#66736A]">
          {copy.cancelled}
        </p>
      </PageContainer>
    );
  }

  const amount = formatMinorAmount(
    request.amountMinor,
    request.currency,
    locale,
  );
  const message = copy.message(
    request.fromParticipant.displayNameSnapshot,
    request.toParticipant.displayNameSnapshot,
    amount,
  );
  const viewerParticipant =
    request.creator.userProfileId === profile.id
      ? request.creator
      : await prisma.aaParticipant.findFirst({
          where: { ledgerId: request.ledgerId, userProfileId: profile.id },
        });
  const canCancel = Boolean(
    access?.canManage || viewerParticipant?.id === request.createdByParticipantId,
  );
  const active = request.status === "SENT" || request.status === "VIEWED";

  return (
    <PageContainer
      className="max-w-xl space-y-5 bg-[#FBFCF7] py-4 sm:py-8"
      mobileSafeBottom
      mobileSafeTop
    >
      <MobileNavSectionOverride section="activities" />
      <header className="flex items-center gap-3">
        <Link
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#156240] ring-1 ring-[#D6D5B2]"
          href={backHref}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-black text-ink">{copy.heading}</h1>
      </header>

      <section className="rounded-[1.6rem] bg-[#156240] p-6 text-center text-white shadow-[0_18px_40px_rgba(21,98,64,0.2)]">
        <CircleDollarSign className="mx-auto h-7 w-7 text-white/80" />
        <p className="mt-3 text-3xl font-black tabular-nums">{amount}</p>
        <p className="mt-3 text-sm font-bold leading-6 text-white/80">
          {request.fromParticipant.displayNameSnapshot} →{" "}
          {request.toParticipant.displayNameSnapshot}
        </p>
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-white/65">
          <Clock3 className="h-3 w-3" />
          {request.status}
        </p>
      </section>

      {active ? (
        <section className="rounded-[1.3rem] border border-[#E3DFD0] bg-white p-5">
          <p className="mb-5 text-center text-sm font-semibold leading-6 text-[#66736A]">
            {message}
          </p>
          <AaPaymentRequestShare locale={locale} message={message} />
        </section>
      ) : (
        <p className="rounded-2xl bg-[#FFF0F2] px-4 py-3 text-center text-sm font-bold text-[#A53C50]">
          {copy.cancelled}
        </p>
      )}

      {active && request.fromParticipant.userProfileId === profile.id ? (
        <Link
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#156240] text-sm font-bold text-white"
          href={withLocale(
            locale,
            `/lobby/${activityId}/aa/new?type=TRANSFER&from=${encodeURIComponent(request.fromParticipantId)}&to=${encodeURIComponent(request.toParticipantId)}&amount=${minorToInput(request.amountMinor)}`,
          )}
        >
          {copy.record}
        </Link>
      ) : null}

      {active && canCancel ? (
        <form action={cancelAaPaymentRequestAction}>
          <input name="activityId" type="hidden" value={activityId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="requestId" type="hidden" value={request.id} />
          <button
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#E7C4CB] text-xs font-bold text-[#A53C50]"
            type="submit"
          >
            <X className="h-4 w-4" />
            {copy.cancel}
          </button>
        </form>
      ) : null}
    </PageContainer>
  );
}
