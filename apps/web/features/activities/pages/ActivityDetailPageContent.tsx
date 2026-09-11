import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import type { ReactNode } from "react";
import { formatActivityDate } from "@chill-club/shared";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  MapPin,
  PencilLine,
  Repeat2,
  ShieldAlert,
  Store,
  Ticket,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@chill-club/ui";
import { ActivityPriorityAdminMenu } from "@/components/admin/ActivityPriorityManagementClient";
import { PageContainer } from "@/components/layout/PageContainer";
import { AnalyticsExternalLink } from "@/features/analytics/components/AnalyticsExternalLink";
import { AnalyticsLink } from "@/features/analytics/components/AnalyticsLink";
import { ActivityAnalyticsSummaryPanel } from "@/features/analytics/components/ActivityAnalyticsSummaryPanel";
import { normalizeAnalyticsLocale } from "@/features/analytics/events";
import { getActivityAnalyticsSummary } from "@/features/analytics/queries/getActivityAnalyticsSummary";
import { queueAnalyticsEvent } from "@/features/analytics/server";
import {
  getAnalyticsEntityForActivityDetail,
  inferAnalyticsSourceSurfaceFromReferrer,
} from "@/features/analytics/utils";
import { ActivityStatusBadge } from "@/features/activities/components/ActivityStatusBadge";
import { ActivityAnnouncementDetailPanel } from "@/features/activities/components/ActivityAnnouncementDetailPanel";
import { ClaimAutoCreatedActivityCelebration } from "@/features/activities/components/ClaimAutoCreatedActivityCelebration";
import { ClaimAutoCreatedActivityButton } from "@/features/activities/components/ClaimAutoCreatedActivityButton";
import { ActivityCheckInForm } from "@/features/activities/components/ActivityCheckInForm";
import { ActivityCheckInReviewPanel } from "@/features/activities/components/ActivityCheckInReviewPanel";
import { ActivityAnnouncementComposer } from "@/features/activities/components/ActivityAnnouncementComposer";
import { ActivityCopyButton } from "@/features/activities/components/ActivityCopyButton";
import { ActivityCoverImage } from "@/features/activities/components/ActivityCoverImage";
import { ActivityCoverImageManager } from "@/features/activities/components/ActivityCoverImageManager";
import { ActivityMapPreview } from "@/features/activities/components/ActivityMapPreview";
import { ActivityRichDescription } from "@/features/activities/components/ActivityRichDescription";
import { ActivityShareDialogButton } from "@/features/activities/components/ActivityShareDialogButton";
import { ActivityShareTools } from "@/features/activities/components/ActivityShareTools";
import { getActivityPriorityAdminSnapshot } from "@/features/activities/priority/adminActivityPriority";
import { CancelParticipationForm } from "@/features/activities/components/CancelParticipationForm";
import { CancelActivityForm } from "@/features/activities/components/CancelActivityForm";
import {
  AdminGuestParticipantControl,
  JoinActivityForm,
} from "@/features/activities/components/JoinActivityForm";
import { ParticipationApprovalPanel } from "@/features/activities/components/ParticipationApprovalPanel";
import { BoardGameToolFloatingEntry } from "@/features/activities/components/BoardGameToolFloatingEntry";
import { TeamDetailMobileCtaSheet } from "@/features/activities/components/TeamDetailMobileCtaSheet";
import {
  getActivityById,
  getActivityShareMetadataById,
} from "@/features/activities/queries/getActivityById";
import { getActivityViewerParticipation } from "@/features/activities/queries/getActivityViewerParticipation";
import { getActivityCheckInRoster } from "@/features/activities/queries/getActivityCheckInRoster";
import { getPendingParticipants } from "@/features/activities/queries/getPendingParticipants";
import {
  getActivityDateLabel,
  getActivityDisplayStatus,
  getActivityEndBoundary,
  getActivityLocationLabel,
  getActivityOrganizerInitial,
  getActivityPriceLabel,
  getActivitySeatLabel,
} from "@/features/activities/utils/activityDisplay";
import { ActivityFavoriteButton } from "@/features/favorites/components/ActivityFavoriteButton";
import { getViewerActivityFavorite } from "@/features/favorites/queries/getViewerActivityFavorite";
import { ActivityFriendSignalPanel } from "@/features/friends/components/ActivityFriendSignalPanel";
import { getActivityFriendSignal } from "@/features/friends/queries/getActivityFriendSignals";
import {
  getViewerFollowedProfileIds,
  getViewerFriendIds,
} from "@/features/friends/queries/getViewerFriendIds";
import { ActivityHistoryBackButton } from "@/features/activities/components/ActivityHistoryBackButton";
import { ContextualDetailLink } from "@/features/navigation/components/ContextualDetailLink";
import { DetailSourceReturnLink } from "@/features/navigation/components/DetailSourceReturnLink";
import { DetailSourceRestore } from "@/features/navigation/components/DetailSourceRestore";
import { ActivityOrganizerContactForm } from "@/features/direct-messages/components/ActivityOrganizerContactForm";
import { getActivityRoomUnreadState } from "@/features/activity-room-chat/services/activityRoomChat";
import { ParticipantToolCard } from "@/features/aa/components/ParticipantToolCard";
import { AaActivitySummaryCard } from "@/features/aa/components/AaActivitySummaryCard";
import { getActivityAaEntryState } from "@/features/aa/server/ledgerService";
import { getPublicEventCopy } from "@/features/public-events/copy";
import { ensurePublicEventFromActivityInfo } from "@/features/public-events/queries/ensurePublicEventFromActivityInfo";
import { getTicketCtaLabel } from "@/features/public-events/utils/ticketCta";
import { ReportDialog } from "@/features/reports/components/ReportDialog";
import { UserProfilePreviewPopover } from "@/features/profile/components/UserProfilePreviewPopover";
import { MobileNavSectionOverride } from "@/components/navigation/MobileNavSectionOverride";
import { ManualTranslationBundle } from "@/features/translations/components/ManualTranslation";
import { ActivityWeatherWidget } from "@/features/weather/components/ActivityWeatherWidget";
import { getActivityWeatherWidgetInput } from "@/features/weather/activityWeather";
import { getOptionalCurrentUserProfileSnapshot } from "@/lib/auth";
import { isCurrentUserAdmin } from "@/lib/admin-auth";
import { getCategoryLabel, getCopy, getTypeLabel } from "@/lib/copy";
import { isMobileUserAgent } from "@/lib/mobile-root-lobby-entry";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { createPerformanceTracker } from "@/lib/performance";
import { withLocale } from "@/lib/routes";
import {
  buildCanonicalUrl,
  buildDetailShareMetadata,
  buildFallbackShareMetadata,
  buildTeamShareImageUrl,
  buildTeamShareMetadata,
  getCanonicalMetadataBaseUrl,
  getShareDateLabel,
  getShareLocationLabel,
  getSharePriceLabel,
  resolveShareImageUrl,
} from "@/lib/share-metadata";
import { resolveTeamWechatShareImageUrl } from "@/features/activities/utils/teamWechatShareImage";
import {
  ensurePrivateActivityShareToken,
  getPrivateActivitySharePath,
} from "@/features/activities/utils/activityShareAccess";
import {
  getActivityDetailPath,
  getLegacyActivityDetailPath,
} from "@/features/activities/utils/activityRoutes";

type ActivityDetailPageProps = {
  params: Promise<{
    locale: string;
    activityId: string;
  }>;
  searchParams: Promise<{
    access?: string;
    claimed?: string;
    sheet?: string;
  }>;
};

type ActivityDetailRouteKind = "legacy" | "lobby";

type ActivityDetailPageContentProps = ActivityDetailPageProps & {
  routeKind?: ActivityDetailRouteKind;
};

function getActivityRoutePattern(routeKind: ActivityDetailRouteKind) {
  return routeKind === "lobby"
    ? "/lobby/[activityId]"
    : "/activities/[activityId]";
}

function getActivityRoutePath(
  locale: string,
  activityId: string,
  routeKind: ActivityDetailRouteKind,
) {
  const detailPath =
    routeKind === "lobby"
      ? getActivityDetailPath(activityId)
      : getLegacyActivityDetailPath(activityId);

  return `/${locale}${detailPath}`;
}

function getActivityLayerTitle(locale: string) {
  return locale === "fr"
    ? "Détail de l'activité"
    : locale === "en"
      ? "Activity Detail"
      : "活动详情";
}

function getLobbyLayerTitle(locale: string) {
  return locale === "fr"
    ? "Détail du groupe"
    : locale === "en"
      ? "Plan Detail"
      : "聚吧详情";
}

function ActivityLayerHeader({
  action,
  backHref,
  returnMode = "context",
  title,
}: {
  action?: ReactNode;
  backHref: string;
  returnMode?: "context" | "path";
  title: string;
}) {
  const buttonClassName =
    "inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#111210]/70 ring-1 ring-[#E7E1CA] transition active:scale-95";

  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3 md:hidden">
      {returnMode === "path" ? (
        <Link aria-label={title} className={buttonClassName} href={backHref}>
          <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
        </Link>
      ) : (
        <ActivityHistoryBackButton
          ariaLabel={title}
          className={buttonClassName}
          fallbackHref={backHref}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
        </ActivityHistoryBackButton>
      )}
      <p className="truncate text-center text-[18px] font-bold leading-none tracking-normal text-[#111210]">
        {title}
      </p>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

type DetailViewerParticipationStatus =
  | "JOINED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | null;

const participantAvatarTones = [
  "bg-coral text-white",
  "bg-sage text-white",
  "bg-meadow text-white",
  "bg-forest text-white",
  "bg-sand text-white",
  "bg-outline text-white",
];

function getStableParticipantAvatarTone(value: string) {
  const total = [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return participantAvatarTones[total % participantAvatarTones.length];
}

function getParticipantInitial(nickname: string) {
  return nickname.trim().charAt(0).toUpperCase() || "N";
}

function getAutoCreatedTeamCopy(locale: string) {
  if (locale === "fr") {
    return {
      claimHint:
        "Cette équipe a été créée à partir d'une activité populaire. Réclamez-la pour modifier l'heure et le lieu.",
      deadlinePrefix: "Réclamation ouverte jusqu'au",
    };
  }

  if (locale === "en") {
    return {
      claimHint:
        "This team was created from a popular activity. Claim it to edit the time, location, and plan details.",
      deadlinePrefix: "Claim window ends at",
    };
  }

  return {
    claimHint:
      "这是由热门活动自动生成的聚吧，认领后你就可以修改时间、地点和聚吧信息。",
    deadlinePrefix: "认领截止",
  };
}

function formatClaimDeadline(locale: string, value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isLikelyExternalUrl(value: string | null | undefined) {
  const trimmedValue = value?.trim() ?? "";

  return (
    /^https?:\/\//i.test(trimmedValue) ||
    /^www\./i.test(trimmedValue) ||
    /^[^\s]+\.[^\s]{2,}(?:\/\S*)?$/i.test(trimmedValue)
  );
}

function normalizeExternalUrl(value: string | null | undefined) {
  const trimmedValue = value?.trim() ?? "";

  if (!isLikelyExternalUrl(trimmedValue)) {
    return null;
  }

  return /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;
}

function shouldTreatProtectedLocationAsOnline(activity: {
  address: string;
  city: string;
}) {
  const label = `${activity.city} ${activity.address}`.toLowerCase();

  return (
    isLikelyExternalUrl(activity.address) ||
    /网址|链接|线上|online|url|link|lien|en ligne|site web/.test(label)
  );
}

function getProtectedAccessNoticeCopy(
  locale: string,
  requiresApproval: boolean,
) {
  const detailCopy = getCopy(locale).activityDetail;

  return requiresApproval
    ? detailCopy.hiddenAddressApprovalNotice
    : detailCopy.hiddenAddressNotice;
}

function getProtectedOnlineLinkNoticeCopy(
  locale: string,
  requiresApproval: boolean,
) {
  const detailCopy = getCopy(locale).activityDetail;

  return requiresApproval
    ? detailCopy.hiddenOnlineLinkApprovalNotice
    : detailCopy.hiddenOnlineLinkNotice;
}

function getTeamDetailCtaCopy(locale: string) {
  if (locale === "fr") {
    return {
      eyebrow: "Prochaine étape",
      title: "Rejoindre ce plan",
      organizerTitle: "Gérer ce plan",
    };
  }

  if (locale === "en") {
    return {
      eyebrow: "Next step",
      title: "Join this plan",
      organizerTitle: "Manage this plan",
    };
  }

  return {
    eyebrow: "下一步",
    title: "报名这个聚吧",
    organizerTitle: "管理这个聚吧",
  };
}

function getTeamDetailCtaTitle({
  isClosed,
  isFull,
  isOrganizer,
  locale,
  requiresApproval,
  viewerParticipationStatus,
}: {
  isClosed: boolean;
  isFull: boolean;
  isOrganizer: boolean;
  locale: string;
  requiresApproval: boolean;
  viewerParticipationStatus: DetailViewerParticipationStatus;
}) {
  const t = getCopy(locale).join;
  const ctaCopy = getTeamDetailCtaCopy(locale);

  if (isOrganizer) {
    return ctaCopy.organizerTitle;
  }

  if (isClosed) {
    return t.closedTitle;
  }

  if (viewerParticipationStatus === "PENDING") {
    return t.pendingTitle;
  }

  if (
    viewerParticipationStatus === "JOINED" ||
    viewerParticipationStatus === "APPROVED"
  ) {
    return t.joinedTitle;
  }

  if (isFull) {
    return t.fullTitle;
  }

  return requiresApproval ? t.submitApproval : ctaCopy.title;
}

function getTeamDetailMobileJoinOpenLabel({
  locale,
  viewerParticipationStatus,
}: {
  locale: string;
  viewerParticipationStatus: DetailViewerParticipationStatus;
}) {
  if (
    viewerParticipationStatus === "JOINED" ||
    viewerParticipationStatus === "APPROVED"
  ) {
    if (locale === "fr") {
      return "Annuler l'inscription";
    }

    if (locale === "en") {
      return "Cancel join";
    }

    return "取消报名";
  }

  if (viewerParticipationStatus === "PENDING") {
    if (locale === "fr") {
      return "En attente";
    }

    if (locale === "en") {
      return "Pending";
    }

    return "待审核";
  }

  return undefined;
}

function getActivityOperatorActionCopy(locale: string) {
  if (locale === "fr") {
    return {
      announcement: "Modifier l'annonce",
      checkIn: "Gestion des présences",
      edit: "Modifier",
    };
  }

  if (locale === "en") {
    return {
      announcement: "Edit announcement",
      checkIn: "Check-in management",
      edit: "Edit",
    };
  }

  return {
    announcement: "编辑公告",
    checkIn: "签到管理",
    edit: "编辑聚吧",
  };
}

function getPlayAgainCopy(locale: string) {
  if (locale === "fr") {
    return "Relancer";
  }

  if (locale === "en") {
    return "Run it again";
  }

  return "再来一局";
}

function ActivityPlayAgainLink({
  activityId,
  className,
  locale,
}: {
  activityId: string;
  className?: string;
  locale: string;
}) {
  return (
    <Link
      className={cn(
        "mx-auto mt-2 hidden w-fit items-center justify-center gap-1.5 bg-transparent text-xs font-semibold leading-6 text-[#156240] transition hover:text-[#0F4D32] active:scale-[0.98] md:inline-flex",
        className,
      )}
      href={withLocale(
        locale,
        `/activities/new?copyActivityId=${encodeURIComponent(activityId)}&return=history`,
      )}
    >
      <Repeat2 className="h-3.5 w-3.5" />
      <span className="truncate">{getPlayAgainCopy(locale)}</span>
    </Link>
  );
}

function getApprovalModeNoticeCopy(locale: string) {
  if (locale === "fr") {
    return {
      autoDescription:
        "Les personnes sont ajoutées à la liste des participants après inscription.",
      autoTitle: "Inscription directe",
      organizerEmptyDescription:
        "Les prochaines demandes apparaîtront dans l'espace de validation.",
      organizerEmptyTitle: "Validation active",
      organizerPendingDescription:
        "Traitez-les avant que les places ne soient comptabilisées.",
      organizerPendingTitle: (count: number) =>
        `${count} demande${count > 1 ? "s" : ""} en attente`,
      requiredDescription:
        "La demande passe d'abord par l'organisateur, puis compte une fois validée.",
      requiredTitle: "Validation requise",
      reviewAction: "Valider",
    };
  }

  if (locale === "en") {
    return {
      autoDescription:
        "People are added to the participant list after joining.",
      autoTitle: "Direct join",
      organizerEmptyDescription:
        "New requests will appear in the review area when people apply.",
      organizerEmptyTitle: "Review is on",
      organizerPendingDescription:
        "Review them before they count toward available seats.",
      organizerPendingTitle: (count: number) =>
        `${count} pending request${count === 1 ? "" : "s"}`,
      requiredDescription:
        "The organizer reviews requests first. Approved requests count toward seats.",
      requiredTitle: "Approval required",
      reviewAction: "Review",
    };
  }

  return {
    autoDescription: "报名后会直接进入参与名单。",
    autoTitle: "直接报名",
    organizerEmptyDescription: "新的报名申请会显示在审核区，处理后才计入人数。",
    organizerEmptyTitle: "已开启报名审核",
    organizerPendingDescription: "处理通过后才会计入报名人数。",
    organizerPendingTitle: (count: number) => `${count} 个报名待审核`,
    requiredDescription: "报名后先由发起人确认，通过后才会计入人数。",
    requiredTitle: "报名需审核",
    reviewAction: "去审核",
  };
}

function ApprovalModeNotice({
  className,
  isOrganizer,
  locale,
  pendingCount = 0,
  requiresApproval,
  variant = "card",
}: {
  className?: string;
  isOrganizer: boolean;
  locale: string;
  pendingCount?: number;
  requiresApproval: boolean;
  variant?: "card" | "inline";
}) {
  const copy = getApprovalModeNoticeCopy(locale);
  const hasPendingRequests =
    isOrganizer && requiresApproval && pendingCount > 0;
  const Icon = requiresApproval ? ShieldAlert : CheckCircle2;
  const title = isOrganizer
    ? hasPendingRequests
      ? copy.organizerPendingTitle(pendingCount)
      : requiresApproval
        ? copy.organizerEmptyTitle
        : copy.autoTitle
    : requiresApproval
      ? copy.requiredTitle
      : copy.autoTitle;
  const description = isOrganizer
    ? hasPendingRequests
      ? copy.organizerPendingDescription
      : requiresApproval
        ? copy.organizerEmptyDescription
        : copy.autoDescription
    : requiresApproval
      ? copy.requiredDescription
      : copy.autoDescription;

  if (variant === "inline") {
    return (
      <div className={cn("flex items-start gap-2.5 text-left", className)}>
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            requiresApproval
              ? "bg-[#FFF5E6] text-coral"
              : "bg-[#F1F7F1] text-[#156240]",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-bold leading-5",
              requiresApproval ? "text-[#8A3B21]" : "text-[#156240]",
            )}
          >
            {title}
          </p>
          <p className="mt-0.5 text-xs font-medium leading-5 text-zinc-500">
            {description}
          </p>
        </div>
        {hasPendingRequests ? (
          <Link
            href="#participation-approval"
            className="mt-0.5 inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-white px-3 text-xs font-semibold text-[#156240] ring-1 ring-[#8AB68E]/55 transition hover:-translate-y-0.5 hover:bg-[#FEFFF9]"
          >
            {copy.reviewAction}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl px-3 py-2.5 text-left ring-1",
        requiresApproval
          ? "bg-white text-[#2c312b] ring-[#dce3dc]"
          : "bg-white/82 text-[#156240] ring-[#8AB68E]/55",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/88",
          requiresApproval ? "text-coral" : "text-[#156240]",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-5">{title}</p>
        <p className="mt-0.5 text-xs font-medium leading-5 opacity-[0.82]">
          {description}
        </p>
      </div>
      {hasPendingRequests ? (
        <Link
          href="#participation-approval"
          className="mt-0.5 inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-white px-3 text-xs font-semibold text-[#156240] ring-1 ring-[#8AB68E]/55 transition hover:-translate-y-0.5 hover:bg-[#FEFFF9]"
        >
          {copy.reviewAction}
        </Link>
      ) : null}
    </div>
  );
}

function ProtectedDetailNotice({
  icon = "address",
  label,
}: {
  icon?: "address" | "link";
  label: string;
}) {
  const Icon = icon === "link" ? ExternalLink : ShieldAlert;

  return (
    <div className="rounded-[1rem] border border-[#D6D5B2] bg-[#FEFFF9] px-3 py-2.5 text-sm font-semibold leading-6 text-[#156240] shadow-sm">
      <span className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{label}</span>
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";

export async function generateActivityDetailMetadata(
  { params, searchParams }: ActivityDetailPageProps,
  routeKind: ActivityDetailRouteKind = "legacy",
): Promise<Metadata> {
  const { locale, activityId } = await params;
  const { access: accessToken } = await searchParams;
  const baseUrl = getCanonicalMetadataBaseUrl();
  const fallbackActivityPath = withLocale(
    locale,
    getActivityDetailPath(activityId),
  );
  const activity = await getActivityShareMetadataById(
    activityId,
    accessToken ?? null,
  );

  if (!activity) {
    return buildFallbackShareMetadata(baseUrl, fallbackActivityPath);
  }

  const activityPath = withLocale(
    locale,
    activity.publicEventId
      ? `/public-events/${activity.publicEventId}`
      : getActivityDetailPath(activityId),
  );
  const canonicalUrl = buildCanonicalUrl(
    baseUrl,
    activityPath,
    activity.visibility === "PRIVATE" ? { access: accessToken } : undefined,
  );
  const dateLabel = getShareDateLabel({
    endAt: activity.endAt,
    floating: true,
    locale,
    startAt: activity.startAt,
  });
  const locationLabel = getShareLocationLabel({
    address: activity.address,
    city: activity.city,
  });
  const priceLabel = getSharePriceLabel(
    activity.priceType,
    activity.priceText,
    locale,
  );

  if (!activity.publicEventId) {
    const metadata = buildTeamShareMetadata({
      canonicalUrl,
      capacity: activity.capacity,
      coverImageUrl: activity.coverImageUrl,
      dateLabel,
      locale,
      locationLabel,
      participantCount: activity.participantCount,
      priceLabel,
      shareImageUrl: buildTeamShareImageUrl({
        accessToken:
          activity.visibility === "PRIVATE" ? (accessToken ?? null) : null,
        activityId,
        baseUrl,
        locale,
      }),
      wechatShareImageUrl: resolveTeamWechatShareImageUrl({
        activityId,
        activityUrl: canonicalUrl,
        coverImageUrl: activity.coverImageUrl,
        locale,
      }),
      title: activity.title,
    });

    return metadata;
  }

  const metadata = buildDetailShareMetadata({
    canonicalUrl,
    coverImageUrl: activity.coverImageUrl,
    dateLabel,
    description: activity.description,
    locationLabel,
    priceLabel,
    title: activity.title,
  });

  return metadata;
}

export async function generateLobbyActivityDetailMetadata(
  props: ActivityDetailPageProps,
): Promise<Metadata> {
  return generateActivityDetailMetadata(props, "lobby");
}

export async function ActivityDetailPageContent({
  params,
  searchParams,
  routeKind = "legacy",
}: ActivityDetailPageContentProps) {
  const { locale, activityId } = await params;
  const {
    access: accessToken,
    claimed: claimedSuccess,
    sheet,
  } = await searchParams;
  const isSheetPresentation = sheet === "1";
  const perf = createPerformanceTracker({
    locale,
    route: getActivityRoutePattern(routeKind),
  });
  const t = getCopy(locale);
  const analyticsLocale = normalizeAnalyticsLocale(locale);
  const publicEventCopy = getPublicEventCopy(locale);
  const [viewerProfile, isAdmin] = await Promise.all([
    perf.measure("activity.viewerProfile", () =>
      getOptionalCurrentUserProfileSnapshot(),
    ),
    perf.measure("activity.viewerAdmin", () => isCurrentUserAdmin()),
  ]);
  const [viewerFriendIds, viewerFollowedProfileIds]: [string[], string[]] =
    viewerProfile?.id
      ? await perf.measure("activity.viewerRelations", () =>
          Promise.all([
            getViewerFriendIds(viewerProfile.id),
            getViewerFollowedProfileIds(viewerProfile.id),
          ]),
        )
      : [[], []];
  const [activity, activityIsFavorited] = await Promise.all([
    perf.measure("activity.primary", () =>
      getActivityById(
        activityId,
        viewerProfile?.id ?? null,
        viewerFriendIds,
        accessToken ?? null,
      ),
    ),
    perf.measure("activity.favoriteState", () =>
      getViewerActivityFavorite(activityId, viewerProfile?.id),
    ),
  ]);

  if (!activity) {
    notFound();
  }

  if (
    routeKind === "lobby" &&
    (activity.isActivityInfo || activity.type === "PUBLIC_EVENT")
  ) {
    const publicEventId =
      activity.publicEventId ??
      (await ensurePublicEventFromActivityInfo(activity.id));

    if (!publicEventId) {
      notFound();
    }

    redirect(withLocale(locale, `/public-events/${publicEventId}`));
  }

  const activityPriorityTarget =
    activity.isActivityInfo && activity.publicEventId
      ? {
          targetId: activity.publicEventId,
          targetType: "PUBLIC_EVENT" as const,
        }
      : {
          targetId: activity.id,
          targetType: "ACTIVITY" as const,
        };
  const activityPrioritySnapshot = isAdmin
    ? await perf.measure("activity.prioritySnapshot", () =>
        getActivityPriorityAdminSnapshot(activityPriorityTarget),
      )
    : null;

  if (viewerProfile?.id) {
    const notificationActivityId = activity.id;
    const notificationRecipientId = viewerProfile.id;

    after(() => {
      prisma.notification
        .updateMany({
          where: {
            activityId: notificationActivityId,
            readAt: null,
            recipientId: notificationRecipientId,
            type: {
              in: ["ACTIVITY_COMMENTED", "COMMENT_REPLY"],
            },
          },
          data: {
            readAt: new Date(),
          },
        })
        .catch((error) => {
          console.error("Failed to mark activity notifications as read", error);
        });
    });
  }

  const weatherInput = getActivityWeatherWidgetInput(activity);
  const isPrivateActivity = activity.visibility === "PRIVATE";
  const isOrganizer = viewerProfile?.id === activity.organizer.id;
  const isTeamOperator = Boolean(activity.viewerCanManage) || isOrganizer;
  const shareToken =
    isPrivateActivity && isTeamOperator
      ? await ensurePrivateActivityShareToken(activity.id)
      : activity.shareEnabled && activity.shareToken
        ? activity.shareToken
        : null;

  if (
    isPrivateActivity &&
    isTeamOperator &&
    shareToken &&
    accessToken !== shareToken
  ) {
    redirect(
      getPrivateActivitySharePath({
        activityId: activity.id,
        extraSearchParams: {
          claimed: claimedSuccess,
          sheet,
        },
        locale,
        shareToken,
      }),
    );
  }

  const privateSharePath =
    isPrivateActivity && (accessToken || shareToken)
      ? getPrivateActivitySharePath({
          activityId: activity.id,
          locale,
          shareToken: accessToken || shareToken || "",
        })
      : null;

  const requestHeaders = await headers();
  const referrer = requestHeaders.get("referer");
  const userAgent = requestHeaders.get("user-agent");
  const isMobileRequest = isMobileUserAgent(userAgent);
  const detailAnalyticsEntity = getAnalyticsEntityForActivityDetail(activity);
  const detailSourceSurface = inferAnalyticsSourceSurfaceFromReferrer(
    referrer,
    "activity_list",
  );
  const detailRoutePath = getActivityRoutePath(locale, activity.id, routeKind);
  const lobbyActivityDetailPath = getActivityDetailPath(activity.id);
  const legacyActivityDetailPath = getLegacyActivityDetailPath(activity.id);

  queueAnalyticsEvent(
    {
      locale: analyticsLocale,
      name: activity.isActivityInfo
        ? "public_event_detail_viewed"
        : "activity_detail_viewed",
      route: detailRoutePath,
      entityId: detailAnalyticsEntity.entityId,
      entityType: detailAnalyticsEntity.entityType,
      sourceSurface: detailSourceSurface,
      properties: {
        category: activity.category,
        city: activity.city,
        item_kind: detailAnalyticsEntity.itemKind,
        status: activity.status,
      },
    },
    {
      referrer,
      userAgent,
      userProfileId: viewerProfile?.id,
    },
  );

  if (activity.isActivityInfo) {
    const activityCategoryLabel = getCategoryLabel(activity.category, locale);
    const activityDateLabel = getActivityDateLabel(activity, locale);
    const activityLocationLabel = getActivityLocationLabel(activity);
    const activityAddressUrl = normalizeExternalUrl(activity.address);
    const activityShareLocationLabel = activityAddressUrl
      ? t.activityDetail.onlineLink
      : activityLocationLabel;
    const activityPriceLabel = getActivityPriceLabel(activity, locale);
    const activityEndBoundary = getActivityEndBoundary(activity);
    const isCancelled = activity.status === "CANCELLED";
    const isEndedByTime = activityEndBoundary <= new Date();
    const canCreateTeam = !isCancelled && !isEndedByTime;
    const canOpenTicketLink = Boolean(activity.ticketUrl) && canCreateTeam;
    const ticketCtaLabel = getTicketCtaLabel(locale, activity.ticketLabel);
    const unavailableReason = isCancelled
      ? publicEventCopy.eventCancelled
      : publicEventCopy.eventEnded;
    perf.finish(
      {
        itemKind: "public_event",
        hasViewer: Boolean(viewerProfile),
      },
      {
        referrer,
        route: detailRoutePath,
        routeKey: "public_event_detail",
        sourceSurface: "public_event_detail",
        userAgent,
        userProfileId: viewerProfile?.id,
      },
    );

    return (
      <PageContainer
        className="space-y-5 py-4 sm:space-y-6 sm:py-8"
        mobileSafeTop
      >
        <MobileNavSectionOverride section="activities" />
        <DetailSourceRestore sourceKey="activity_detail" />
        <ActivityLayerHeader
          backHref={withLocale(locale, "/activities")}
          title={getActivityLayerTitle(locale)}
        />
        <DetailSourceReturnLink
          className="hidden h-8 bg-white/60 px-3 text-xs shadow-none sm:h-9 sm:text-sm md:inline-flex"
          locale={locale}
        />
        <div className="space-y-2 px-1 sm:px-0">
          <h1 className="text-[1.7rem] font-bold leading-[1.06] tracking-normal text-ink sm:text-4xl md:text-5xl">
            {activity.title}
          </h1>
        </div>
        <div className="relative aspect-[1.48/1] overflow-hidden rounded-[1.25rem] bg-moss shadow-[0_10px_24px_rgba(29,29,27,0.1)] sm:aspect-[16/9] md:aspect-[2.35/1]">
          <ActivityCoverImage
            src={activity.coverImageUrl}
            overlayClassName="bg-gradient-to-t from-black/14 via-transparent to-black/12"
          />
          <div className="absolute right-3 top-4 z-30 flex items-start gap-2 sm:right-5 sm:top-6">
            {activityPrioritySnapshot ? (
              <ActivityPriorityAdminMenu
                initialSnapshot={activityPrioritySnapshot}
                locale={locale}
                targetId={activityPriorityTarget.targetId}
                targetTitle={activity.title}
                targetType={activityPriorityTarget.targetType}
              />
            ) : null}
            <ActivityFavoriteButton
              activityId={activity.id}
              favoriteCount={activity.favoriteCount}
              isAuthenticated={Boolean(viewerProfile)}
              isFavorited={activityIsFavorited}
              locale={locale}
              redirectPath={legacyActivityDetailPath}
              sourceSurface="public_event_detail"
            />
            <ReportDialog
              className="bg-white/90 text-zinc-800 shadow-sm ring-1 ring-black/10 hover:bg-white hover:text-ink"
              isAuthenticated={Boolean(viewerProfile)}
              locale={locale}
              redirectPath={legacyActivityDetailPath}
              targetId={activity.id}
              targetType="ACTIVITY"
              variant="icon"
            />
          </div>
          <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-[#156240] ring-1 ring-white/70">
              {activityCategoryLabel}
            </span>
            <span className="rounded-full bg-white/86 px-2.5 py-1 text-[11px] font-semibold text-[#111210]/70 ring-1 ring-white/60">
              {publicEventCopy.detailSource}
            </span>
          </div>
        </div>

        <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="min-w-0 space-y-6 lg:order-1">
            <div className="rounded-lg border border-black/10 bg-white/70 p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-ink">
                {publicEventCopy.eventInfoTitle}
              </h2>
              <ActivityRichDescription
                className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-600"
                copyFailedLabel={t.activityShare.copyFailed}
                copyLabel={t.activityShare.copyLink}
                copySuccessLabel={t.activityShare.copied}
                entityId={detailAnalyticsEntity.entityId}
                entityType={detailAnalyticsEntity.entityType}
                locale={locale}
                sourceSurface="public_event_detail"
                text={activity.description}
              />
              <ManualTranslationBundle
                accessToken={accessToken ?? null}
                entityId={activity.id}
                entityType="activity"
                fields={[
                  {
                    field: "title",
                    label: t.translation.fields.title,
                    text: activity.title,
                  },
                  {
                    field: "description",
                    label: t.translation.fields.description,
                    text: activity.description,
                  },
                  {
                    field: "address",
                    label: t.translation.fields.address,
                    text: activityLocationLabel,
                  },
                  {
                    field: "priceText",
                    label: t.translation.fields.priceText,
                    text: activity.priceText,
                  },
                ]}
                locale={locale}
              />
            </div>

            {!activityAddressUrl &&
            (activity.latitude !== null ||
              activity.longitude !== null ||
              activityLocationLabel.trim()) ? (
              <>
                <ActivityMapPreview
                  address={activityLocationLabel}
                  city={activity.city}
                  latitude={activity.latitude}
                  longitude={activity.longitude}
                  openLabel={t.activityDetail.openGoogleMaps}
                  queryAddress={activity.address}
                  title={t.activityDetail.locationMapTitle}
                />
                {activity.isAddressHiddenFromViewer ? (
                  <p className="-mt-3 rounded-md border border-[#D6D5B2] bg-[#FEFFF9] px-3 py-2 text-sm font-medium text-[#156240]">
                    {t.activityDetail.hiddenAddressNotice}
                  </p>
                ) : null}
              </>
            ) : null}
          </article>

          <aside className="order-first h-fit w-full min-w-0 max-w-full rounded-[1.25rem] border border-black/10 bg-white/80 p-4 shadow-sm sm:p-5 lg:sticky lg:top-24 lg:order-2">
            <div className="mb-5 rounded-xl border border-[#8AB68E] bg-[#FEFFF9] px-3 py-3 text-sm leading-6 text-zinc-700">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <Ticket className="h-4 w-4 text-[#156240]" />
                {publicEventCopy.publicEventRuleTitle}
              </div>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                {publicEventCopy.publicEventRuleDescription}
              </p>
            </div>

            <div className="mb-5">
              <ActivityShareTools
                activityTitle={activity.title}
                analyticsEntityId={detailAnalyticsEntity.entityId}
                analyticsEntityType={detailAnalyticsEntity.entityType}
                analyticsSourceSurface="public_event_detail"
                categoryLabel={activityCategoryLabel}
                coverImageUrl={activity.coverImageUrl}
                dateLabel={activityDateLabel}
                description={activity.description}
                locationLabel={activityShareLocationLabel}
                locale={locale}
                priceLabel={activityPriceLabel}
                shareKind="activity"
              />
            </div>

            {weatherInput ? (
              <ActivityWeatherWidget
                className="mb-5"
                date={weatherInput.date}
                latitude={weatherInput.latitude}
                locale={locale}
                locationQuery={weatherInput.locationQuery}
                longitude={weatherInput.longitude}
              />
            ) : null}

            <div className="space-y-4 text-sm text-zinc-700">
              <p className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{activityDateLabel}</span>
                <ActivityCopyButton
                  analyticsEvent={{
                    name: "field_copied",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "public_event_detail",
                    properties: {
                      field_name: "time",
                    },
                  }}
                  failedLabel={t.activityShare.copyFailed}
                  label={t.activityShare.copyTime}
                  successLabel={t.activityShare.copied}
                  value={activityDateLabel}
                />
              </p>
              {activityAddressUrl ? (
                <p className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-2">
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#156240]">
                      {t.activityDetail.onlineLink}
                    </span>
                    <span className="block break-all text-zinc-600">
                      {activityAddressUrl}
                    </span>
                  </span>
                  <AnalyticsExternalLink
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#156240] ring-1 ring-[#8AB68E] transition hover:bg-[#FEFFF9]"
                    event={{
                      name: "ticket_link_clicked",
                      entityId: detailAnalyticsEntity.entityId,
                      entityType: detailAnalyticsEntity.entityType,
                      sourceSurface: "public_event_detail",
                      properties: {
                        item_kind: detailAnalyticsEntity.itemKind,
                      },
                    }}
                    href={activityAddressUrl}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </AnalyticsExternalLink>
                  <ActivityCopyButton
                    analyticsEvent={{
                      name: "field_copied",
                      entityId: detailAnalyticsEntity.entityId,
                      entityType: detailAnalyticsEntity.entityType,
                      sourceSurface: "public_event_detail",
                      properties: {
                        field_name: "online_link",
                      },
                    }}
                    failedLabel={t.activityShare.copyFailed}
                    label={t.activityShare.copyLink}
                    successLabel={t.activityShare.copied}
                    value={activityAddressUrl}
                  />
                </p>
              ) : (
                <p className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    {activityLocationLabel}
                  </span>
                  <ActivityCopyButton
                    analyticsEvent={{
                      name: "field_copied",
                      entityId: detailAnalyticsEntity.entityId,
                      entityType: detailAnalyticsEntity.entityType,
                      sourceSurface: "public_event_detail",
                      properties: {
                        field_name: "location",
                      },
                    }}
                    failedLabel={t.activityShare.copyFailed}
                    label={t.activityShare.copyLocation}
                    successLabel={t.activityShare.copied}
                    value={activityLocationLabel}
                  />
                </p>
              )}
              <p className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                <WalletCards className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  {activityPriceLabel}
                </span>
                <ActivityCopyButton
                  analyticsEvent={{
                    name: "field_copied",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "public_event_detail",
                    properties: {
                      field_name: "price",
                    },
                  }}
                  failedLabel={t.activityShare.copyFailed}
                  label={t.activityShare.copyPrice}
                  successLabel={t.activityShare.copied}
                  value={activityPriceLabel}
                />
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              {canOpenTicketLink && activity.ticketUrl ? (
                <AnalyticsExternalLink
                  className="inline-flex min-h-11 min-w-0 max-w-full items-center justify-center gap-2 rounded-full bg-[#369758] px-4 py-2 text-center text-sm font-semibold leading-tight text-white shadow-[0_10px_22px_rgba(54,151,88,0.18)] transition hover:bg-[#156240]"
                  event={{
                    name: "ticket_link_clicked",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "public_event_detail",
                    properties: {
                      item_kind: detailAnalyticsEntity.itemKind,
                    },
                  }}
                  href={activity.ticketUrl}
                >
                  <span className="min-w-0 leading-tight">
                    {ticketCtaLabel}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </AnalyticsExternalLink>
              ) : null}
              {activity.officialUrl ? (
                <AnalyticsExternalLink
                  className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-4 text-sm font-medium text-ink ring-1 ring-black/10 transition hover:bg-zinc-50"
                  event={{
                    name: "public_event_source_clicked",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "public_event_detail",
                    properties: {
                      source_kind: "official_page",
                    },
                  }}
                  href={activity.officialUrl}
                >
                  {publicEventCopy.officialPage}
                  <ExternalLink className="h-4 w-4" />
                </AnalyticsExternalLink>
              ) : null}
              {canCreateTeam ? (
                <AnalyticsLink
                  href={withLocale(
                    locale,
                    `/activities/${activity.id}/teams/new`,
                  )}
                  event={{
                    name: "team_create_started",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "public_event_detail",
                    properties: {
                      category: activity.category,
                      city: activity.city,
                      item_kind: detailAnalyticsEntity.itemKind,
                    },
                  }}
                >
                  <Button className="h-11 w-full whitespace-nowrap rounded-full">
                    {publicEventCopy.teamUp}
                  </Button>
                </AnalyticsLink>
              ) : (
                <p className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
                  {unavailableReason}
                </p>
              )}
            </div>
          </aside>
        </section>
      </PageContainer>
    );
  }

  const [viewerParticipation, friendSignal] = await Promise.all([
    perf.measure("activity.viewerParticipation", () =>
      getActivityViewerParticipation(activity.id, viewerProfile?.id),
    ),
    perf.measure("activity.friendSignal", () =>
      getActivityFriendSignal(
        activity.id,
        viewerProfile?.id,
        viewerFollowedProfileIds,
      ),
    ),
  ]);
  const displayStatus = getActivityDisplayStatus(activity);
  const activityEndBoundary = getActivityEndBoundary(activity);
  const isEndedByTime = activityEndBoundary <= new Date();
  const isClosed =
    !["RECRUITING", "CONFIRMED"].includes(activity.status) || isEndedByTime;
  const isCancelled = activity.status === "CANCELLED";
  const isFull =
    activity.capacity > 0 && activity.participantCount >= activity.capacity;
  const canCancelActivity =
    isOrganizer &&
    !isCancelled &&
    !isEndedByTime &&
    ["OPEN", "FULL", "RECRUITING", "CONFIRMED"].includes(activity.status);
  const canManageCrewCover =
    isTeamOperator &&
    !activity.isActivityInfo &&
    activity.type !== "PUBLIC_EVENT";
  const canContactOrganizer = !isTeamOperator;
  const activityDetailPath = lobbyActivityDetailPath;
  const activityEditHref = withLocale(
    locale,
    `/activities/${activity.id}/edit`,
  );
  const activityCategoryLabel = getCategoryLabel(activity.category, locale);
  const activityDateLabel = getActivityDateLabel(activity, locale);
  const activityLocationLabel = getActivityLocationLabel(activity);
  const hasActivityDescription = activity.description.trim().length > 0;
  const activityAddressUrl = activity.isAddressHiddenFromViewer
    ? null
    : normalizeExternalUrl(activity.address);
  const activityShareLocationLabel = activityAddressUrl
    ? t.activityDetail.onlineLink
    : activityLocationLabel;
  const protectedLocationIsOnline =
    activity.isAddressHiddenFromViewer &&
    shouldTreatProtectedLocationAsOnline(activity);
  const protectedLocationNotice = activity.isAddressHiddenFromViewer
    ? protectedLocationIsOnline
      ? getProtectedOnlineLinkNoticeCopy(locale, activity.requiresApproval)
      : getProtectedAccessNoticeCopy(locale, activity.requiresApproval)
    : null;
  const autoCreatedTeam = activity.autoCreatedTeam;
  const autoCreatedTeamCopy = getAutoCreatedTeamCopy(locale);
  const autoCreatedClaimDeadline = formatClaimDeadline(
    locale,
    autoCreatedTeam?.claimableUntil ?? null,
  );
  const activityParticipantLabel =
    activity.capacity > 0
      ? `${activity.participantCount}/${activity.capacity} ${t.common.people}`
      : `${activity.participantCount} ${t.common.people}`;
  const participantPreview = activity.participantPreview ?? [];
  const ticketUrl =
    activity.ticketUrl ?? activity.publicEvent?.ticketUrl ?? null;
  const ticketLabel = getTicketCtaLabel(
    locale,
    activity.ticketLabel ?? activity.publicEvent?.ticketLabel,
  );
  const canOpenTicketLink =
    Boolean(ticketUrl) && !isCancelled && !isEndedByTime;
  const activityPriceLabel = getActivityPriceLabel(activity, locale);
  const activityVisibilityLabel =
    activity.visibility === "PRIVATE"
      ? t.activityDetail.visibilityPrivate
      : t.activityDetail.visibilityPublic;
  const teamDetailCtaCopy = getTeamDetailCtaCopy(locale);
  const teamDetailCtaTitle = getTeamDetailCtaTitle({
    isClosed,
    isFull,
    isOrganizer: isTeamOperator,
    locale,
    requiresApproval: activity.requiresApproval,
    viewerParticipationStatus: viewerParticipation?.status ?? null,
  });
  const mobileJoinCtaOpenLabel = getTeamDetailMobileJoinOpenLabel({
    locale,
    viewerParticipationStatus: viewerParticipation?.status ?? null,
  });
  const canCancelViewerParticipation =
    viewerParticipation?.status === "JOINED" ||
    viewerParticipation?.status === "APPROVED" ||
    viewerParticipation?.status === "PENDING";
  const canCheckInViewerParticipation =
    !isTeamOperator &&
    (viewerParticipation?.status === "JOINED" ||
      viewerParticipation?.status === "APPROVED");
  const hasRoomRelevantParticipation =
    viewerParticipation?.status === "JOINED" ||
    viewerParticipation?.status === "APPROVED" ||
    viewerParticipation?.status === "PENDING";
  const activityRoomHref = withLocale(locale, `/lobby/${activity.id}/room`);
  const showActivityRoomEntry =
    !activity.isActivityInfo &&
    activity.type !== "PUBLIC_EVENT" &&
    Boolean(viewerProfile) &&
    (isTeamOperator || hasRoomRelevantParticipation);
  const canUseActivityAnnouncement =
    !activity.isActivityInfo && activity.type !== "PUBLIC_EVENT";
  const canSendActivityAnnouncement =
    canUseActivityAnnouncement && isTeamOperator;
  const showActivityAnnouncementPanel = canUseActivityAnnouncement;
  const activityRoomUnreadState =
    showActivityRoomEntry && viewerProfile?.id
      ? await perf
          .measure("activity.roomUnreadState", () =>
            getActivityRoomUnreadState(viewerProfile.id, activity.id),
          )
          .catch((error: unknown) => {
            console.error("Failed to load activity room unread count", error);

            return {
              hasUnreadAnnouncement: false,
              isMuted: false,
              unreadCount: 0,
            };
          })
      : {
          hasUnreadAnnouncement: false,
          isMuted: false,
          unreadCount: 0,
        };
  const activityAaEntryState = await perf.measure("activity.aaEntryState", () =>
    getActivityAaEntryState(activity.id, viewerProfile?.id),
  );
  const mobileDetailTitle = getLobbyLayerTitle(locale);
  const mobileShareLabel =
    locale === "fr"
      ? "Partager le groupe"
      : locale === "en"
        ? "Share plan"
        : "聚吧分享";
  const mobileMapOpenLabel =
    locale === "fr" ? "Y aller" : locale === "en" ? "Go" : "前往";
  const operatorActionCopy = getActivityOperatorActionCopy(locale);
  const mobileCloseLabel =
    locale === "fr" ? "Fermer" : locale === "en" ? "Close" : "关闭";
  const mobileParticipantPreview = participantPreview.slice(0, 6);
  const extraParticipantCount = Math.max(
    activity.participantCount - mobileParticipantPreview.length,
    0,
  );
  const canUseBoardGameTools =
    !activity.isActivityInfo && activity.category === "BOARD_GAME";
  const gameToolsHref = withLocale(locale, "/game-tools");
  const [pendingParticipants, analyticsSummary, activityCheckInRoster] =
    await Promise.all([
      isTeamOperator && activity.requiresApproval && viewerProfile
        ? perf.measure("activity.pendingParticipants", () =>
            getPendingParticipants(activity.id, viewerProfile.id),
          )
        : Promise.resolve([]),
      isTeamOperator && !isMobileRequest
        ? perf.measure("activity.analyticsSummary", () =>
            getActivityAnalyticsSummary(activity.id),
          )
        : Promise.resolve(null),
      isTeamOperator && viewerProfile
        ? perf.measure("activity.checkInRoster", () =>
            getActivityCheckInRoster(activity.id, viewerProfile.id),
          )
        : Promise.resolve([]),
    ]);
  perf.finish(
    {
      commentCount: 0,
      hasViewer: Boolean(viewerProfile),
      isOrganizer: isTeamOperator,
      itemKind: "team",
    },
    {
      referrer,
      route: detailRoutePath,
      routeKey: "activity_detail",
      sourceSurface: "activity_detail",
      userAgent,
      userProfileId: viewerProfile?.id,
    },
  );
  const renderTeamShareTools = (options?: { collapsible?: boolean }) => (
    <ActivityShareTools
      activityTitle={activity.title}
      analyticsEntityId={detailAnalyticsEntity.entityId}
      analyticsEntityType={detailAnalyticsEntity.entityType}
      analyticsSourceSurface="activity_detail"
      categoryLabel={activityCategoryLabel}
      collapsible={options?.collapsible}
      coverImageUrl={activity.coverImageUrl}
      dateLabel={activityDateLabel}
      description={activity.description}
      locationLabel={activityShareLocationLabel}
      locale={locale}
      priceLabel={activityPriceLabel}
      shareKind="team"
      sharePath={privateSharePath}
    />
  );
  const canShowMobileMapPreview =
    !protectedLocationNotice &&
    !activityAddressUrl &&
    (activity.latitude !== null ||
      activity.longitude !== null ||
      Boolean(activityLocationLabel.trim()));
  const hasMobileDetailContent =
    hasActivityDescription ||
    Boolean(protectedLocationNotice) ||
    canShowMobileMapPreview;
  const renderMobileActivityMetaRow = () => (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden text-[12px] font-semibold leading-5 text-[#111210]/55">
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <UsersRound className="h-3.5 w-3.5 shrink-0 text-[#8AB68E]" />
        <span>{activityParticipantLabel}</span>
      </span>
      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#8AB68E]" />
        <span className="truncate">{activityDateLabel}</span>
      </span>
    </div>
  );
  const renderMobileActivityDetailContent = () =>
    hasMobileDetailContent ? (
      <div className="space-y-3">
        {protectedLocationNotice ? (
          <ProtectedDetailNotice
            icon={protectedLocationIsOnline ? "link" : "address"}
            label={protectedLocationNotice}
          />
        ) : canShowMobileMapPreview ? (
          <ActivityMapPreview
            address={activityLocationLabel}
            city={activity.city}
            className="shadow-none"
            latitude={activity.latitude}
            longitude={activity.longitude}
            openLabel={mobileMapOpenLabel}
            queryAddress={activity.address}
            title={t.activityDetail.locationMapTitle}
          />
        ) : null}
        {hasActivityDescription ? (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-ink">
              {locale === "en"
                ? "Plan note"
                : locale === "fr"
                  ? "Note du groupe"
                  : "聚吧说明"}
            </h2>
            <ActivityRichDescription
              className="whitespace-pre-wrap text-sm leading-7 text-zinc-600"
              copyFailedLabel={t.activityShare.copyFailed}
              copyLabel={t.activityShare.copyLink}
              copySuccessLabel={t.activityShare.copied}
              entityId={detailAnalyticsEntity.entityId}
              entityType={detailAnalyticsEntity.entityType}
              locale={locale}
              sourceSurface="activity_detail"
              text={activity.description}
            />
            <ManualTranslationBundle
              accessToken={accessToken ?? null}
              entityId={activity.id}
              entityType="activity"
              fields={[
                {
                  field: "title",
                  label: t.translation.fields.title,
                  text: activity.title,
                },
                {
                  field: "description",
                  label: t.translation.fields.description,
                  text: activity.description,
                },
                {
                  field: "address",
                  label: t.translation.fields.address,
                  text: activityLocationLabel,
                },
                {
                  field: "priceText",
                  label: t.translation.fields.priceText,
                  text: activity.priceText,
                },
              ]}
              locale={locale}
            />
          </div>
        ) : null}
      </div>
    ) : null;

  const renderMobilePriceAndLinkedEventRow = () => {
    if (!activityPriceLabel && !activity.publicEvent) {
      return null;
    }

    if (!activity.publicEvent) {
      return activityPriceLabel ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <WalletCards className="h-3.5 w-3.5 shrink-0 text-[#F09182]" />
          <span className="truncate">{activityPriceLabel}</span>
        </div>
      ) : null;
    }

    return (
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {activityPriceLabel ? (
              <>
                <WalletCards className="h-3.5 w-3.5 shrink-0 text-[#F09182]" />
                <span className="truncate">{activityPriceLabel}</span>
              </>
            ) : (
              <span aria-hidden="true" />
            )}
          </span>
          <span className="inline-flex max-w-[8.25rem] shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap py-0.5 text-[12px] font-semibold leading-6 text-[#156240] transition active:scale-[0.98]">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate leading-6">
              {publicEventCopy.linkedEventTitle}
            </span>
          </span>
        </summary>
        <div className="mt-3 space-y-2 border-t border-[#E7E1CA] pt-3">
          <p className="line-clamp-2 text-sm font-bold leading-5 text-ink">
            {activity.publicEvent.title}
          </p>
          <p className="text-xs font-semibold leading-5 text-[#111210]/55">
            {publicEventCopy.linkedEventDescription}
          </p>
          {activity.publicEvent.status === "CANCELLED" ? (
            <p className="inline-flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700 ring-1 ring-red-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{publicEventCopy.eventCancelled}</span>
            </p>
          ) : null}
          <Link
            className="inline-flex h-8 items-center justify-center gap-2 rounded-full bg-[#156240] px-3 text-xs font-semibold text-white transition hover:bg-[#0F4D32] active:scale-[0.98]"
            href={withLocale(
              locale,
              `/public-events/${activity.publicEvent.id}`,
            )}
          >
            {publicEventCopy.linkedEventCta}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </details>
    );
  };
  const renderActivityDetailDesktop = () =>
    hasActivityDescription || activity.publicEvent ? (
      <div className="hidden space-y-4 border-y border-[#E7E1CA] py-4 md:block">
        {hasActivityDescription ? (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-ink">
              {locale === "en"
                ? "Details"
                : locale === "fr"
                  ? "Détails"
                  : "详情"}
            </h2>
            <ActivityRichDescription
              className="whitespace-pre-wrap text-sm leading-7 text-zinc-600"
              copyFailedLabel={t.activityShare.copyFailed}
              copyLabel={t.activityShare.copyLink}
              copySuccessLabel={t.activityShare.copied}
              entityId={detailAnalyticsEntity.entityId}
              entityType={detailAnalyticsEntity.entityType}
              locale={locale}
              sourceSurface="activity_detail"
              text={activity.description}
            />
            <ManualTranslationBundle
              accessToken={accessToken ?? null}
              entityId={activity.id}
              entityType="activity"
              fields={[
                {
                  field: "title",
                  label: t.translation.fields.title,
                  text: activity.title,
                },
                {
                  field: "description",
                  label: t.translation.fields.description,
                  text: activity.description,
                },
                {
                  field: "address",
                  label: t.translation.fields.address,
                  text: activityLocationLabel,
                },
                {
                  field: "priceText",
                  label: t.translation.fields.priceText,
                  text: activity.priceText,
                },
              ]}
              locale={locale}
            />
          </div>
        ) : null}

        {activity.publicEvent ? (
          <div
            className={cn(
              hasActivityDescription ? "border-t border-[#E7E1CA] pt-4" : null,
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#156240]">
                  {publicEventCopy.linkedEventTitle}
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-bold leading-6 text-ink">
                  {activity.publicEvent.title}
                </p>
              </div>
              <Link
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#156240] ring-1 ring-[#D6D5B2] transition hover:bg-[#F6FAF4] active:scale-[0.98]"
                href={withLocale(
                  locale,
                  `/public-events/${activity.publicEvent.id}`,
                )}
              >
                {publicEventCopy.linkedEventCta}
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <PageContainer
      className={cn(
        "mobile-v23-lobby-detail space-y-4 md:space-y-6 md:py-8",
        isSheetPresentation
          ? "mobile-v23-lobby-detail-sheet min-h-full max-w-none px-4 pb-6 pt-3 sm:px-4"
          : "app-mobile-page-shell [--app-mobile-page-top-gap:2rem] [--app-mobile-page-bottom-gap:1.1rem] max-md:pt-[calc(var(--app-top-safe-area)+2rem)] max-md:pb-[calc(var(--app-mobile-nav-height)+var(--app-bottom-safe-area)+1.1rem)]",
      )}
    >
      {isSheetPresentation ? null : (
        <MobileNavSectionOverride section="lobby" />
      )}
      {isSheetPresentation ? null : (
        <DetailSourceRestore sourceKey="activity_detail" />
      )}
      <ClaimAutoCreatedActivityCelebration
        active={claimedSuccess === "1"}
        editHref={activityEditHref}
        locale={locale}
      />
      {isSheetPresentation ? null : (
        <ActivityLayerHeader
          action={
            <ActivityShareDialogButton
              className="h-9 w-9 bg-white text-[#111210]/70 shadow-none ring-[#E7E1CA] hover:bg-white hover:text-[#156240]"
              closeLabel={mobileCloseLabel}
              label={mobileShareLabel}
            >
              {renderTeamShareTools({ collapsible: false })}
            </ActivityShareDialogButton>
          }
          backHref={withLocale(locale, "/lobby")}
          title={mobileDetailTitle}
        />
      )}
      {isSheetPresentation ? null : (
        <DetailSourceReturnLink
          className="hidden h-8 bg-white/60 px-3 text-xs shadow-none sm:h-9 sm:text-sm md:inline-flex"
          locale={locale}
        />
      )}
      <div
        className={cn(
          "space-y-2 px-1 sm:px-0",
          isSheetPresentation ? "pt-1" : null,
        )}
      >
        <h1 className="text-[1.65rem] font-bold leading-[1.06] tracking-normal text-ink sm:text-4xl md:text-5xl">
          {activity.title}
        </h1>
      </div>
      <div className="relative aspect-[1.75/1] overflow-hidden rounded-[1.45rem] bg-moss shadow-[0_16px_36px_rgba(29,29,27,0.12)] sm:aspect-[16/9] md:aspect-[2.35/1]">
        <ActivityCoverImage
          src={activity.coverImageUrl}
          overlayClassName="bg-gradient-to-t from-black/16 via-transparent to-black/20"
        />
        <div className="absolute right-3 top-4 z-30 flex items-center gap-2 sm:right-5 sm:top-6">
          {activityPrioritySnapshot ? (
            <ActivityPriorityAdminMenu
              initialSnapshot={activityPrioritySnapshot}
              locale={locale}
              targetId={activityPriorityTarget.targetId}
              targetTitle={activity.title}
              targetType={activityPriorityTarget.targetType}
            />
          ) : null}
          {!isTeamOperator ? (
            <ActivityFavoriteButton
              activityId={activity.id}
              favoriteCount={activity.favoriteCount}
              isAuthenticated={Boolean(viewerProfile)}
              isFavorited={activityIsFavorited}
              locale={locale}
              redirectPath={lobbyActivityDetailPath}
              sourceSurface="activity_detail"
            />
          ) : null}
          {isSheetPresentation ? (
            <ActivityShareDialogButton
              className="bg-white/95 text-zinc-900 ring-black/10 hover:bg-white md:hidden"
              closeLabel={mobileCloseLabel}
              label={mobileShareLabel}
            >
              {renderTeamShareTools({ collapsible: false })}
            </ActivityShareDialogButton>
          ) : null}
          {canManageCrewCover ? (
            <ActivityCoverImageManager
              activityId={activity.id}
              fallbackCoverImageUrl={activity.coverImageUrl}
              initialCoverImageUrl={activity.customCoverImageUrl ?? null}
              locale={locale}
              triggerTone="detail"
            />
          ) : null}
          <ReportDialog
            className="bg-white/90 text-zinc-800 shadow-sm ring-1 ring-black/10 hover:bg-white hover:text-ink"
            isAuthenticated={Boolean(viewerProfile)}
            locale={locale}
            redirectPath={lobbyActivityDetailPath}
            targetId={activity.id}
            targetType="ACTIVITY"
            variant="icon"
          />
        </div>
      </div>
      <div className="space-y-4 px-1 sm:px-0" id="activity-details">
        <div className="md:hidden">
          <div className="space-y-1.5 text-[12px] font-semibold leading-5 text-[#111210]/55">
            {renderMobileActivityMetaRow()}
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1.5">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#F09182]" />
                <span className="line-clamp-1">
                  {activityShareLocationLabel}
                </span>
              </span>
            </div>
            {renderMobilePriceAndLinkedEventRow()}
          </div>
        </div>
        <div className="space-y-4 md:hidden">
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold leading-none text-[#111210]/72">
                {t.activityDetail.organizerTitle}
              </p>
              {showActivityRoomEntry ? (
                <ActivityPlayAgainLink
                  activityId={activity.id}
                  className="ml-auto mr-0 mt-0 inline-flex min-h-7 max-w-[7.5rem] px-0.5 text-[11px] md:hidden"
                  locale={locale}
                />
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <UserProfilePreviewPopover
                avatarUrl={activity.organizer.avatarUrl}
                giftSourceContextId={activity.id}
                giftSourceSurface="ACTIVITY"
                isAuthenticated={Boolean(viewerProfile)}
                locale={locale}
                nickname={activity.organizer.nickname}
                profileId={activity.organizer.id}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-semibold text-ink ring-1 ring-[#8AB68E]/50">
                  {activity.organizer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activity.organizer.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getActivityOrganizerInitial(activity)
                  )}
                </span>
              </UserProfilePreviewPopover>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold leading-tight text-ink">
                  {activity.organizer.nickname}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold leading-4 text-[#111210]/45">
                  {activity.organizer.bio ?? t.activityDetail.emptyOrganizerBio}
                </p>
              </div>
              {!isTeamOperator && canCheckInViewerParticipation ? (
                <ActivityCheckInForm
                  activityId={activity.id}
                  checkInRequestedAt={
                    viewerParticipation?.checkInRequestedAt?.toISOString() ??
                    null
                  }
                  checkedInAt={
                    viewerParticipation?.checkedInAt?.toISOString() ?? null
                  }
                  locale={locale}
                />
              ) : null}
            </div>
          </div>
          {mobileParticipantPreview.length > 0 ? (
            <div>
              <p className="text-[12px] font-semibold leading-none text-[#111210]/72">
                {t.activityDetail.participants}
              </p>
              <div className="mt-2 flex min-w-0 items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center">
                  {mobileParticipantPreview.map((participant, index) => (
                    <UserProfilePreviewPopover
                      avatarUrl={participant.avatarUrl}
                      giftSourceContextId={activity.id}
                      giftSourceSurface="ACTIVITY"
                      isAuthenticated={Boolean(viewerProfile)}
                      isGuest={participant.kind !== "user"}
                      key={participant.id}
                      locale={locale}
                      nickname={participant.nickname}
                      profileId={participant.id}
                    >
                      <span
                        aria-label={participant.nickname}
                        className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white text-xs font-semibold shadow-sm ring-1 ring-[#8AB68E]"
                        style={{ marginLeft: index === 0 ? 0 : -7 }}
                        title={participant.nickname}
                      >
                        <span
                          className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold ${getStableParticipantAvatarTone(participant.id)}`}
                        >
                          {participant.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              className="h-full w-full object-cover"
                              src={participant.avatarUrl}
                            />
                          ) : (
                            getParticipantInitial(participant.nickname)
                          )}
                        </span>
                      </span>
                    </UserProfilePreviewPopover>
                  ))}
                  {extraParticipantCount > 0 ? (
                    <span className="-ml-1 flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-[#F1F2EC] px-2 text-[11px] font-bold text-[#111210]/58 shadow-sm ring-1 ring-[#D6D5B2] friemi-tabular">
                      +{extraParticipantCount}
                    </span>
                  ) : null}
                </div>
                {isTeamOperator ? (
                  <ActivityCheckInReviewPanel
                    activityId={activity.id}
                    locale={locale}
                    participants={activityCheckInRoster}
                    triggerLabel={operatorActionCopy.checkIn}
                    triggerVariant="icon"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          <ParticipantToolCard
            aaActionCount={activityAaEntryState.actionCount}
            aaContent={
              activityAaEntryState.canAccess ? (
                <AaActivitySummaryCard
                  href={withLocale(locale, `/lobby/${activity.id}/aa`)}
                  locale={locale}
                  summary={activityAaEntryState.summary}
                />
              ) : undefined
            }
            aaHref={withLocale(locale, `/lobby/${activity.id}/aa`)}
            aaUnavailable={activityAaEntryState.unavailable}
            announcementContent={
              showActivityAnnouncementPanel ? (
                <ActivityAnnouncementDetailPanel
                  activityId={activity.id}
                  announcements={activity.announcements}
                  editor={
                    canSendActivityAnnouncement ? (
                      <ActivityAnnouncementComposer
                        activityId={activity.id}
                        compact
                        iconOnly
                        locale={locale}
                        triggerLabel={operatorActionCopy.announcement}
                      />
                    ) : undefined
                  }
                  hasUnread={activityRoomUnreadState.hasUnreadAnnouncement}
                  locale={locale}
                />
              ) : undefined
            }
            announcementHref="#activity-announcement"
            announcementUnread={activityRoomUnreadState.hasUnreadAnnouncement}
            canAccessAa={activityAaEntryState.canAccess}
            chatDisabled={!showActivityRoomEntry}
            chatHref={activityRoomHref}
            chatUnreadCount={activityRoomUnreadState.unreadCount}
            detailContent={renderMobileActivityDetailContent()}
            detailHref="#activity-details"
            locale={locale}
            participantCount={activity.participantCount}
            participants={participantPreview}
            variant="bare"
          />
          {isTeamOperator ? (
            <>
              <div className="grid gap-2">
                <Link
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#D6D5B2] bg-white px-3 text-sm font-semibold text-[#156240] transition active:scale-[0.98]"
                  href={activityEditHref}
                >
                  <PencilLine className="h-4 w-4" />
                  <span className="truncate">{operatorActionCopy.edit}</span>
                </Link>
              </div>
              {canCancelActivity ? (
                <CancelActivityForm
                  activityId={activity.id}
                  activityTitle={activity.title}
                  locale={locale}
                />
              ) : null}
            </>
          ) : null}
          {!isTeamOperator && canCancelViewerParticipation ? (
            <CancelParticipationForm
              activityId={activity.id}
              activityTitle={activity.title}
              buttonClassName="min-h-11 border-transparent bg-[#F09182] px-10 text-[15px] font-semibold text-white shadow-[0_12px_26px_rgba(240,145,130,0.22)] hover:bg-[#F09182] active:scale-[0.98]"
              locale={locale}
            />
          ) : !isTeamOperator ? (
            <TeamDetailMobileCtaSheet
              activityTitle={activity.title}
              locale={locale}
              openLabel={mobileJoinCtaOpenLabel}
              placement="inline"
            >
              <div className="grid gap-3">
                <ApprovalModeNotice
                  isOrganizer={false}
                  locale={locale}
                  requiresApproval={activity.requiresApproval}
                  variant="inline"
                />
                <JoinActivityForm
                  activityId={activity.id}
                  activityTitle={activity.title}
                  accessToken={accessToken ?? null}
                  closeOnSuccess
                  formInstanceId="mobile"
                  hideMessageHint
                  locale={locale}
                  requiresApproval={activity.requiresApproval}
                  isFull={isFull}
                  isClosed={isClosed}
                  isOrganizer={isOrganizer}
                  isAuthenticated={Boolean(viewerProfile)}
                  viewerParticipationStatus={
                    viewerParticipation?.status ?? null
                  }
                />
                {canContactOrganizer ? (
                  <ContactOrganizerForm
                    accessToken={accessToken ?? null}
                    activityId={activity.id}
                    isAuthenticated={Boolean(viewerProfile)}
                    locale={locale}
                    organizerNickname={activity.organizer.nickname}
                    organizerProfileId={activity.organizer.id}
                  />
                ) : null}
              </div>
            </TeamDetailMobileCtaSheet>
          ) : null}
          {isAdmin && !isClosed && !isFull ? (
            <AdminGuestParticipantControl
              activityId={activity.id}
              formInstanceId="mobile-admin"
              locale={locale}
            />
          ) : null}
        </div>
      </div>

      {isTeamOperator && activity.requiresApproval ? (
        <ParticipationApprovalPanel
          activityId={activity.id}
          locale={locale}
          pendingParticipants={pendingParticipants}
        />
      ) : null}

      <section className="hidden min-w-0 gap-6 md:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 space-y-6 lg:order-1">
          {renderActivityDetailDesktop()}
          <ParticipantToolCard
            aaActionCount={activityAaEntryState.actionCount}
            aaHref={withLocale(locale, `/lobby/${activity.id}/aa`)}
            aaUnavailable={activityAaEntryState.unavailable}
            announcementHref="#activity-announcement-desktop"
            announcementUnread={activityRoomUnreadState.hasUnreadAnnouncement}
            canAccessAa={activityAaEntryState.canAccess}
            chatDisabled={!showActivityRoomEntry}
            chatHref={activityRoomHref}
            chatUnreadCount={activityRoomUnreadState.unreadCount}
            detailHref="#activity-details"
            locale={locale}
            participantCount={activity.participantCount}
            participants={participantPreview}
          />
          {activityAaEntryState.canAccess ? (
            <AaActivitySummaryCard
              href={withLocale(locale, `/lobby/${activity.id}/aa`)}
              locale={locale}
              summary={activityAaEntryState.summary}
            />
          ) : null}
          {showActivityAnnouncementPanel ? (
            <div className="scroll-mt-24" id="activity-announcement-desktop">
              <ActivityAnnouncementDetailPanel
                activityId={activity.id}
                announcements={activity.announcements}
                editor={
                  canSendActivityAnnouncement ? (
                    <ActivityAnnouncementComposer
                      activityId={activity.id}
                      compact
                      iconOnly
                      locale={locale}
                      triggerLabel={operatorActionCopy.announcement}
                    />
                  ) : undefined
                }
                hasUnread={activityRoomUnreadState.hasUnreadAnnouncement}
                locale={locale}
              />
            </div>
          ) : null}

          {protectedLocationNotice ? (
            <ProtectedDetailNotice
              icon={protectedLocationIsOnline ? "link" : "address"}
              label={protectedLocationNotice}
            />
          ) : !activityAddressUrl &&
            (activity.latitude !== null ||
              activity.longitude !== null ||
              activityLocationLabel.trim()) ? (
            <div className="hidden md:block">
              <ActivityMapPreview
                address={activityLocationLabel}
                city={activity.city}
                latitude={activity.latitude}
                longitude={activity.longitude}
                openLabel={t.activityDetail.openGoogleMaps}
                queryAddress={activity.address}
                title={t.activityDetail.locationMapTitle}
              />
            </div>
          ) : null}

          {activity.merchant ? (
            <div className="rounded-lg border border-black/10 bg-white/70 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-moss" />
                <h2 className="text-lg font-semibold text-ink">
                  {t.merchant.detailTitle}
                </h2>
              </div>
              <div className="mt-4 flex flex-col gap-3 rounded-md bg-paper/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink">
                    {activity.merchant.name}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {activity.merchant.city}
                  </p>
                </div>
                <ContextualDetailLink
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-white px-4 text-sm font-medium text-ink ring-1 ring-black/10 transition hover:bg-zinc-50"
                  href={withLocale(
                    locale,
                    `/merchants/${activity.merchant.slug}`,
                  )}
                  detailSource={{
                    sourceKey: "activity_detail",
                    targetKey: `merchant:${activity.merchant.slug}`,
                    targetKind: "merchant",
                  }}
                  data-detail-source-target={`merchant:${activity.merchant.slug}`}
                >
                  {t.merchant.viewProfile}
                  <ExternalLink className="h-4 w-4" />
                </ContextualDetailLink>
              </div>
            </div>
          ) : null}

          <div className="hidden rounded-lg border border-black/10 bg-white/70 p-4 sm:p-5 md:block">
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-moss" />
              <h2 className="text-lg font-semibold text-ink">
                {t.activityDetail.organizerTitle}
              </h2>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <UserProfilePreviewPopover
                avatarUrl={activity.organizer.avatarUrl}
                giftSourceContextId={activity.id}
                giftSourceSurface="ACTIVITY"
                isAuthenticated={Boolean(viewerProfile)}
                locale={locale}
                nickname={activity.organizer.nickname}
                profileId={activity.organizer.id}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-sm font-semibold text-ink">
                  {activity.organizer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activity.organizer.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getActivityOrganizerInitial(activity)
                  )}
                </div>
              </UserProfilePreviewPopover>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {activity.organizer.nickname}
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {activity.organizer.bio ?? t.activityDetail.emptyOrganizerBio}
                </p>
              </div>
            </div>
          </div>
        </article>

        <aside className="order-first flex h-fit w-full min-w-0 max-w-full flex-col lg:sticky lg:top-24 lg:order-2">
          {isTeamOperator ? (
            <div className="order-1 hidden rounded-[1.15rem] border border-[#D6D5B2] bg-white p-3 md:block">
              <div className="grid gap-2">
                <Link
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#D6D5B2] bg-white px-4 text-sm font-semibold text-[#156240] transition hover:border-[#8AB68E] hover:bg-[#F6FAF4] active:scale-[0.98]"
                  href={activityEditHref}
                >
                  <PencilLine className="h-4 w-4" />
                  {operatorActionCopy.edit}
                </Link>
                <div className="[&>button]:w-full">
                  <ActivityCheckInReviewPanel
                    activityId={activity.id}
                    locale={locale}
                    participants={activityCheckInRoster}
                    triggerLabel={operatorActionCopy.checkIn}
                  />
                </div>
                {canCancelActivity ? (
                  <CancelActivityForm
                    activityId={activity.id}
                    activityTitle={activity.title}
                    locale={locale}
                  />
                ) : null}
                {isAdmin && !isClosed && !isFull ? (
                  <AdminGuestParticipantControl
                    activityId={activity.id}
                    formInstanceId="desktop-operator"
                    locale={locale}
                  />
                ) : null}
              </div>
              {showActivityRoomEntry ? (
                <ActivityPlayAgainLink
                  activityId={activity.id}
                  locale={locale}
                />
              ) : null}
            </div>
          ) : (
            <div className="order-1 hidden rounded-[1.35rem] border border-[#D6D5B2] bg-white p-4 md:block">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-normal text-forest">
                  {teamDetailCtaCopy.eyebrow}
                </p>
                <h2 className="mt-1 text-xl font-bold leading-tight text-ink">
                  {teamDetailCtaTitle}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-forest">
                  <span className="rounded-full bg-white px-3 py-1 ring-1 ring-sage/70">
                    {getActivitySeatLabel(activity, locale)}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 ring-1 ring-sage/70">
                    {activityParticipantLabel}
                  </span>
                </div>
                <ApprovalModeNotice
                  className="mt-3"
                  isOrganizer={false}
                  locale={locale}
                  pendingCount={0}
                  requiresApproval={activity.requiresApproval}
                />
              </div>
              <div className="grid gap-3">
                {canCheckInViewerParticipation ? (
                  <ActivityCheckInForm
                    activityId={activity.id}
                    buttonClassName="min-h-11 px-4 text-sm"
                    checkInRequestedAt={
                      viewerParticipation?.checkInRequestedAt?.toISOString() ??
                      null
                    }
                    checkedInAt={
                      viewerParticipation?.checkedInAt?.toISOString() ?? null
                    }
                    locale={locale}
                  />
                ) : null}
                {showActivityRoomEntry ? (
                  <ActivityPlayAgainLink
                    activityId={activity.id}
                    locale={locale}
                  />
                ) : null}
                <JoinActivityForm
                  activityId={activity.id}
                  activityTitle={activity.title}
                  accessToken={accessToken ?? null}
                  canAddGuest={isAdmin}
                  formInstanceId="desktop"
                  locale={locale}
                  requiresApproval={activity.requiresApproval}
                  isFull={isFull}
                  isClosed={isClosed}
                  isOrganizer={isOrganizer}
                  isAuthenticated={Boolean(viewerProfile)}
                  viewerParticipationStatus={
                    viewerParticipation?.status ?? null
                  }
                />
                {canContactOrganizer ? (
                  <ContactOrganizerForm
                    accessToken={accessToken ?? null}
                    activityId={activity.id}
                    isAuthenticated={Boolean(viewerProfile)}
                    locale={locale}
                    organizerNickname={activity.organizer.nickname}
                    organizerProfileId={activity.organizer.id}
                  />
                ) : null}
              </div>
            </div>
          )}

          <div className="order-3 mt-3 hidden md:block">
            {renderTeamShareTools()}
          </div>

          {weatherInput ? (
            <ActivityWeatherWidget
              className="order-4 mt-3"
              date={weatherInput.date}
              latitude={weatherInput.latitude}
              locale={locale}
              locationQuery={weatherInput.locationQuery}
              longitude={weatherInput.longitude}
            />
          ) : null}

          <div className="order-5 mt-3 hidden space-y-3 rounded-[1.1rem] border border-sand bg-white/68 p-3 text-sm text-zinc-700 sm:p-4 md:block">
            <p className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{activityDateLabel}</span>
              <ActivityCopyButton
                analyticsEvent={{
                  name: "field_copied",
                  entityId: detailAnalyticsEntity.entityId,
                  entityType: detailAnalyticsEntity.entityType,
                  sourceSurface: "activity_detail",
                  properties: {
                    field_name: "time",
                  },
                }}
                failedLabel={t.activityShare.copyFailed}
                label={t.activityShare.copyTime}
                successLabel={t.activityShare.copied}
                value={activityDateLabel}
              />
            </p>
            {protectedLocationNotice ? (
              <p className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-[#156240]">
                {protectedLocationIsOnline ? (
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 break-words font-semibold">
                  {protectedLocationNotice}
                </span>
              </p>
            ) : activityAddressUrl ? (
              <p className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-2">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-semibold text-[#156240]">
                    {t.activityDetail.onlineLink}
                  </span>
                  <span className="block break-all text-zinc-600">
                    {activityAddressUrl}
                  </span>
                </span>
                <AnalyticsExternalLink
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#156240] ring-1 ring-[#8AB68E] transition hover:bg-[#FEFFF9]"
                  event={{
                    name: "ticket_link_clicked",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "activity_detail",
                    properties: {
                      item_kind: detailAnalyticsEntity.itemKind,
                    },
                  }}
                  href={activityAddressUrl}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </AnalyticsExternalLink>
                <ActivityCopyButton
                  analyticsEvent={{
                    name: "field_copied",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "activity_detail",
                    properties: {
                      field_name: "online_link",
                    },
                  }}
                  failedLabel={t.activityShare.copyFailed}
                  label={t.activityShare.copyLink}
                  successLabel={t.activityShare.copied}
                  value={activityAddressUrl}
                />
              </p>
            ) : (
              <p className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  {activityLocationLabel}
                </span>
                <ActivityCopyButton
                  analyticsEvent={{
                    name: "field_copied",
                    entityId: detailAnalyticsEntity.entityId,
                    entityType: detailAnalyticsEntity.entityType,
                    sourceSurface: "activity_detail",
                    properties: {
                      field_name: "location",
                    },
                  }}
                  failedLabel={t.activityShare.copyFailed}
                  label={t.activityShare.copyLocation}
                  successLabel={t.activityShare.copied}
                  value={activityLocationLabel}
                />
              </p>
            )}
            <p className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
              <span className="flex min-w-0 items-center gap-2 text-zinc-500">
                <WalletCards className="h-4 w-4 shrink-0" />
                {t.activityDetail.price}
              </span>
              <span className="min-w-0 break-words text-right font-medium text-ink">
                {activityPriceLabel}
              </span>
              <ActivityCopyButton
                analyticsEvent={{
                  name: "field_copied",
                  entityId: detailAnalyticsEntity.entityId,
                  entityType: detailAnalyticsEntity.entityType,
                  sourceSurface: "activity_detail",
                  properties: {
                    field_name: "price",
                  },
                }}
                failedLabel={t.activityShare.copyFailed}
                label={t.activityShare.copyPrice}
                successLabel={t.activityShare.copied}
                value={activityPriceLabel}
              />
            </p>
            <p className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 text-zinc-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                {activity.requiresApproval
                  ? t.activityDetail.approvalRequired
                  : t.activityDetail.approvalAuto}
              </span>
            </p>

            {canOpenTicketLink && ticketUrl ? (
              <AnalyticsExternalLink
                className="inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-full bg-[#369758] px-4 py-2 text-center text-sm font-semibold leading-tight text-white shadow-[0_10px_22px_rgba(54,151,88,0.18)] transition hover:bg-[#156240]"
                event={{
                  name: "ticket_link_clicked",
                  entityId: detailAnalyticsEntity.entityId,
                  entityType: detailAnalyticsEntity.entityType,
                  sourceSurface: "activity_detail",
                  properties: {
                    item_kind: detailAnalyticsEntity.itemKind,
                  },
                }}
                href={ticketUrl}
              >
                <span className="min-w-0 leading-tight">{ticketLabel}</span>
                <ExternalLink className="h-4 w-4" />
              </AnalyticsExternalLink>
            ) : null}

            {autoCreatedTeam?.isClaimable && !isTeamOperator ? (
              <div className="mt-3 rounded-2xl border border-[#8AB68E] bg-[#FEFFF9] p-3">
                {autoCreatedClaimDeadline ? (
                  <p className="text-[11px] font-semibold text-[#156240]">
                    {autoCreatedTeamCopy.deadlinePrefix}{" "}
                    {autoCreatedClaimDeadline}
                  </p>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-[#156240]">
                  {autoCreatedTeamCopy.claimHint}
                </p>
                {autoCreatedTeam.isClaimable ? (
                  <div className="mt-3">
                    <ClaimAutoCreatedActivityButton
                      activityId={activity.id}
                      isAuthenticated={Boolean(viewerProfile)}
                      locale={locale}
                      redirectPath={activityDetailPath}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="order-6 mt-4 hidden space-y-4 text-sm text-zinc-700 md:block lg:mt-5">
            <p className="grid grid-cols-[minmax(0,1fr)_minmax(0,50%)] items-start gap-3">
              <span className="flex min-w-0 items-center gap-2 text-zinc-500">
                <Ticket className="h-4 w-4 shrink-0" />
                {t.activityDetail.type}
              </span>
              <span className="min-w-0 break-words text-right font-medium text-ink">
                {getTypeLabel(activity.type, locale)}
              </span>
            </p>
            <p className="grid grid-cols-[minmax(0,1fr)_minmax(0,50%)] items-start gap-3">
              <span className="flex min-w-0 items-center gap-2 text-zinc-500">
                <UsersRound className="h-4 w-4 shrink-0" />
                {t.activityDetail.visibility}
              </span>
              <span className="min-w-0 break-words text-right font-medium text-ink">
                {activityVisibilityLabel}
              </span>
            </p>
            {activity.destination ? (
              <p className="grid grid-cols-[minmax(0,1fr)_minmax(0,50%)] items-start gap-3">
                <span className="min-w-0 text-zinc-500">
                  {t.activityDetail.destination}
                </span>
                <span className="min-w-0 break-words text-right font-medium text-ink">
                  {activity.destination}
                </span>
              </p>
            ) : null}
            {activity.minParticipants ? (
              <p className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <span className="min-w-0 text-zinc-500">
                  {t.activityDetail.minParticipants}
                </span>
                <span className="shrink-0 text-right font-medium text-ink">
                  {activity.minParticipants} {t.common.people}
                </span>
              </p>
            ) : null}
            <ActivityFriendSignalPanel locale={locale} signal={friendSignal} />
          </div>

          <div className="order-7 mt-6 hidden lg:block">
            <ActivityAnalyticsSummaryPanel
              locale={locale}
              summary={analyticsSummary}
            />
          </div>
        </aside>
      </section>
      {canUseBoardGameTools ? (
        <BoardGameToolFloatingEntry
          gameToolsHref={gameToolsHref}
          locale={locale}
        />
      ) : null}
    </PageContainer>
  );
}

function ContactOrganizerForm({
  accessToken,
  activityId,
  isAuthenticated,
  locale,
  organizerNickname,
  organizerProfileId,
}: {
  accessToken?: string | null;
  activityId: string;
  isAuthenticated: boolean;
  locale: string;
  organizerNickname: string;
  organizerProfileId: string;
}) {
  const t = getCopy(locale);
  const label = isAuthenticated
    ? t.activityDetail.contactOrganizer
    : t.activityDetail.contactOrganizerLogin;

  return (
    <ActivityOrganizerContactForm
      accessToken={accessToken}
      activityId={activityId}
      hint={t.activityDetail.contactOrganizerHint}
      isAuthenticated={isAuthenticated}
      label={label}
      locale={locale}
      organizerNickname={organizerNickname}
      organizerProfileId={organizerProfileId}
    />
  );
}
