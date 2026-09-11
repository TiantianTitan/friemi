import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, ReceiptText, X } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileNavSectionOverride } from "@/components/navigation/MobileNavSectionOverride";
import { AaPaymentMethods } from "@/features/aa/components/AaPaymentMethods";
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

function Initial({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F2E3] text-[12px] font-black text-[#156240] ring-1 ring-[#D6D5B2]">
      {Array.from(name.trim())[0]?.toUpperCase() ?? "?"}
    </span>
  );
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
        include: {
          creator: true,
          fromParticipant: true,
          ledger: { select: { titleSnapshot: true } },
          toParticipant: {
            include: {
              userProfile: {
                select: { contactEmail: true, wechatId: true },
              },
            },
          },
        },
      })
    : null;
  const backHref = withLocale(locale, `/lobby/${activityId}/aa/progress`);
  const copy =
    locale === "fr"
      ? {
          back: "Progression",
          cancelled: "Cette demande n'est plus active.",
          cancel: "Annuler la demande",
          heading: "Détails du paiement",
          message: (from: string, to: string, amount: string) =>
            `${from} doit ${amount} à ${to} pour les dépenses partagées Friemi.`,
          payer: "Payeur",
          personal: "À payer",
          record: "Marquer comme payé",
          total: "Montant",
        }
      : locale === "en"
        ? {
            back: "Progress",
            cancelled: "This request is no longer active.",
            cancel: "Cancel request",
            heading: "Payment details",
            message: (from: string, to: string, amount: string) =>
              `${from} owes ${to} ${amount} for shared Friemi costs.`,
            payer: "Payer",
            personal: "You pay",
            record: "Mark as paid",
            total: "Amount",
          }
        : {
            back: "返回结算进度",
            cancelled: "该付款请求已失效或取消。",
            cancel: "取消付款请求",
            heading: "付款详情",
            message: (from: string, to: string, amount: string) =>
              `${from}需要向${to}支付 ${amount}，用于结清 Friemi 聚吧共同开支。`,
            payer: "付款给（垫付人）",
            personal: "个人金额",
            record: "标记已付款",
            total: "总金额",
          };

  if (!request) {
    return (
      <PageContainer className="max-w-[430px] bg-[#FEFFF9] py-5" mobileSafeTop>
        <Link className="text-sm font-bold text-[#156240]" href={backHref}>
          ← {copy.back}
        </Link>
        <p className="mt-10 rounded-[16px] border border-[#E7E1CE] bg-white p-6 text-center text-sm font-bold text-[#68736B]">
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
    access?.canManage ||
    viewerParticipant?.id === request.createdByParticipantId,
  );
  const active = request.status === "SENT" || request.status === "VIEWED";
  const statusLabel = active
    ? locale === "fr"
      ? "En attente"
      : locale === "en"
        ? "Pending"
        : "待付款"
    : locale === "fr"
      ? "Terminé"
      : locale === "en"
        ? "Completed"
        : "已完成";

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
        <h1 className="text-center text-[17px] font-black text-[#1D1D1B]">
          {copy.heading}
        </h1>
        <span />
      </header>

      <section className="rounded-[16px] border border-[#E7E1CE] bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-[#8E8383]">{copy.total}</p>
            <p className="mt-1 text-[27px] font-black tracking-[-0.03em] text-[#1D1D1B] friemi-tabular">
              {amount}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-[#8E8383]">
              {copy.personal}
            </p>
            <p className="mt-1 text-[15px] font-black text-[#1D1D1B] friemi-tabular">
              {amount}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-[#EEEBDD] pt-4">
          {request.toParticipant.avatarUrlSnapshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-1 ring-[#D6D5B2]"
              src={request.toParticipant.avatarUrlSnapshot}
            />
          ) : (
            <Initial name={request.toParticipant.displayNameSnapshot} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold text-[#8E8383]">
              {copy.payer}
            </span>
            <span className="mt-0.5 block truncate text-[12px] font-black text-[#1D1D1B]">
              {request.toParticipant.displayNameSnapshot}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF5DD] px-2.5 py-1 text-[10px] font-bold text-[#8A641B]">
            <Clock3 className="h-3 w-3" />
            {statusLabel}
          </span>
        </div>
      </section>

      <AaPaymentMethods
        contactEmail={request.toParticipant.userProfile?.contactEmail ?? null}
        locale={locale}
        payeeName={request.toParticipant.displayNameSnapshot}
        wechatId={request.toParticipant.userProfile?.wechatId ?? null}
      />

      {active ? (
        <AaPaymentRequestShare compact locale={locale} message={message} />
      ) : (
        <p className="rounded-[12px] bg-[#FFF0F2] px-4 py-3 text-center text-[11px] font-bold text-[#A53C50]">
          {copy.cancelled}
        </p>
      )}

      {active && request.fromParticipant.userProfileId === profile.id ? (
        <Link
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-[#156240] to-[#369758] text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(21,98,64,0.16)]"
          href={withLocale(
            locale,
            `/lobby/${activityId}/aa/new?type=TRANSFER&from=${encodeURIComponent(request.fromParticipantId)}&to=${encodeURIComponent(request.toParticipantId)}&amount=${minorToInput(request.amountMinor)}`,
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          {copy.record}
        </Link>
      ) : null}

      <p className="flex items-start gap-2 rounded-[12px] bg-[#F2F7F0] px-3 py-2.5 text-[10px] font-semibold leading-5 text-[#66736A]">
        <ReceiptText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#369758]" />
        {message}
      </p>

      {active && canCancel ? (
        <form action={cancelAaPaymentRequestAction}>
          <input name="activityId" type="hidden" value={activityId} />
          <input name="locale" type="hidden" value={locale} />
          <input name="requestId" type="hidden" value={request.id} />
          <button
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#E7C4CB] text-[11px] font-bold text-[#A53C50]"
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
