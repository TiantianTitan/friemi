"use client";

import {
  ChevronRight,
  Clock3,
  LockKeyhole,
  MapPin,
  UsersRound,
} from "lucide-react";
import { ActivityCoverImage } from "@/features/activities/components/ActivityCoverImage";
import { MobileActivityDetailSheetLink } from "@/features/activities/components/MobileActivityDetailSheetLink";
import type { ActivityCardViewModel } from "@/features/activities/types";
import {
  getActivityDateLabel,
  getActivityDisplayStatus,
} from "@/features/activities/utils/activityDisplay";
import { getActivityDetailPath } from "@/features/activities/utils/activityRoutes";
import { isPublicEventCard } from "@/features/activities/utils/activityCardKind";
import { isPrivateActivityCardLocked } from "@/features/activities/utils/privateActivityCardAccess";
import {
  getActivityCategoryPreviewSrc,
  getActivityListCoverSrc,
} from "@/features/activities/utils/activityCategoryVisuals";
import { DESKTOP_LOBBY_CANDIDATE_ORIGIN } from "@/features/activities/utils/desktopLobbyCandidates";
import { withLocale } from "@/lib/routes";
import {
  getActivityCoverDisplayUrl,
  getActivityCoverThumbnailUrl,
} from "@/lib/activity-cover-display";
import { cn } from "@/lib/utils";

type MobileActivityListRowProps = {
  activity: ActivityCardViewModel;
  className?: string;
  locale: string;
  prioritizeImage?: boolean;
  showHostedBadge?: boolean;
};

function getRowCopy(locale: string) {
  if (locale === "fr") {
    return {
      ended: "Terminé",
      friendGoing: (count: number) => `${count} suivi${count > 1 ? "s" : ""}`,
      hosted: "Créé",
      participants: "pers.",
      private: "Privé",
    };
  }

  if (locale === "en") {
    return {
      ended: "Ended",
      friendGoing: (count: number) =>
        `${count} ${count === 1 ? "followed person" : "followed people"}`,
      hosted: "Host",
      participants: "people",
      private: "Private",
    };
  }

  return {
    ended: "已结束",
    friendGoing: (count: number) => `${count} 位关注的人`,
    hosted: "我发起的",
    participants: "人",
    private: "私密",
  };
}

function getActivityHref(activity: ActivityCardViewModel, locale: string) {
  if (activity.type === "PUBLIC_EVENT" && activity.publicEventId) {
    return withLocale(
      locale,
      `/public-events/${activity.publicEventId}?origin=${DESKTOP_LOBBY_CANDIDATE_ORIGIN}`,
    );
  }

  return withLocale(locale, getActivityDetailPath(activity.id));
}

function getParisDateKey(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).format(new Date(value));
}

function getDateOnly(value: string, locale: string) {
  const date = new Date(value);

  if (locale === "zh-CN") {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      day: "numeric",
      month: "numeric",
      timeZone: "Europe/Paris",
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    return month && day ? `${month}月${day}日` : "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function getDateLabel(activity: ActivityCardViewModel, locale: string) {
  if (
    activity.endAt &&
    getParisDateKey(activity.startAt) !== getParisDateKey(activity.endAt)
  ) {
    return `${getDateOnly(activity.startAt, locale)} - ${getDateOnly(
      activity.endAt,
      locale,
    )}`;
  }

  return getActivityDateLabel(activity, locale);
}

export function MobileActivityListRow({
  activity,
  className,
  locale,
  prioritizeImage = false,
  showHostedBadge = false,
}: MobileActivityListRowProps) {
  const copy = getRowCopy(locale);
  const participantText =
    activity.capacity > 0
      ? `${activity.participantCount} / ${activity.capacity}`
      : `${activity.participantCount}`;
  const friendCount = activity.friendSignal?.count ?? 0;
  const isPublicEvent = isPublicEventCard(activity);
  const displayStatus = getActivityDisplayStatus(activity);
  const isInactiveActivity =
    displayStatus === "ENDED" || displayStatus === "CANCELLED";
  const isPrivateLocked = isPrivateActivityCardLocked(activity);
  const coverSource = getActivityListCoverSrc(
    activity.coverImageUrl,
    activity.category,
  );
  const coverImageUrl = getActivityCoverThumbnailUrl(coverSource, 192);
  const recoveryCoverImageUrl =
    coverImageUrl !== coverSource
      ? getActivityCoverDisplayUrl(coverSource)
      : null;

  return (
    <MobileActivityDetailSheetLink
      className={cn(
        "group grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-stretch gap-x-3.5 rounded-[1.1rem] px-2.5 py-2.5 transition active:scale-[0.985]",
        isInactiveActivity ? "bg-zinc-50 text-zinc-500" : "bg-white",
        className,
      )}
      href={getActivityHref(activity, locale)}
      label={activity.title}
      locale={locale}
      locked={isPrivateLocked}
    >
      <div
        className={cn(
          "relative h-[5.5rem] w-[5.5rem] overflow-hidden rounded-[0.95rem] bg-[#F1F2EC] shadow-[0_10px_22px_rgba(17,18,16,0.075)]",
          isInactiveActivity ? "bg-zinc-200 shadow-none grayscale" : null,
        )}
      >
        <ActivityCoverImage
          alt={activity.title}
          fallbackSrc={getActivityCategoryPreviewSrc(activity.category)}
          fetchPriority={prioritizeImage ? "high" : "auto"}
          loading={prioritizeImage ? "eager" : "lazy"}
          overlayClassName={cn(
            "bg-gradient-to-t to-transparent",
            isInactiveActivity ? "from-zinc-900/24" : "from-black/10",
          )}
          recoverySrc={recoveryCoverImageUrl}
          src={coverImageUrl}
        />
      </div>

      <div className="flex min-w-0 flex-col justify-center py-0.5 pr-0.5">
        <h2
          className={cn(
            "line-clamp-2 text-[15px] font-bold leading-[1.18] tracking-normal",
            isInactiveActivity ? "text-zinc-600" : "text-[#111210]",
          )}
        >
          {activity.title}
        </h2>
        <p
          className={cn(
            "mt-1.5 flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold",
            isInactiveActivity ? "text-zinc-500" : "text-[#111210]/58",
          )}
        >
          {isPublicEvent ? (
            <MapPin
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isInactiveActivity ? "text-zinc-400" : null,
              )}
            />
          ) : (
            <UsersRound
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                isInactiveActivity ? "text-zinc-400" : null,
              )}
            />
          )}
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">
              {isPublicEvent
                ? activity.city || activity.address
                : `${participantText} · ${activity.city || copy.participants}`}
            </span>
            {!isPublicEvent && showHostedBadge ? (
              <span className="shrink-0 rounded-full bg-[#EAF5E8] px-1.5 py-0.5 text-[9.5px] font-semibold leading-none text-[#096B45] ring-1 ring-[#BFD8B9]">
                {copy.hosted}
              </span>
            ) : null}
          </span>
        </p>
        <p
          className={cn(
            "mt-3 flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold",
            isInactiveActivity ? "text-zinc-500" : "text-[#111210]/54",
          )}
        >
          <Clock3
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isInactiveActivity ? "text-zinc-400" : null,
            )}
          />
          <span className="truncate">{getDateLabel(activity, locale)}</span>
        </p>
      </div>

      <div className="flex h-full flex-col items-end justify-between py-1">
        <ChevronRight
          className={cn(
            "mt-0.5 h-4 w-4 transition group-active:translate-x-0.5",
            isInactiveActivity ? "text-zinc-400" : "text-[#111210]/70",
          )}
        />
        {isPrivateLocked ? (
          <span className="inline-flex max-w-[5.9rem] items-center gap-1 truncate rounded-full bg-[#EAF5E8] px-2 py-1 text-[10px] font-semibold leading-none text-[#096B45] ring-1 ring-[#BFD8B9]">
            <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden="true" />
            {copy.private}
          </span>
        ) : isInactiveActivity ? (
          <span className="max-w-[5.9rem] truncate rounded-full bg-zinc-200 px-2 py-1 text-[10px] font-semibold leading-none text-zinc-600">
            {copy.ended}
          </span>
        ) : friendCount > 0 ? (
          <span className="max-w-[5.9rem] truncate rounded-full bg-[#EAF7EA] px-2 py-1 text-[10px] font-semibold leading-none text-[#138456]">
            {copy.friendGoing(friendCount)}
          </span>
        ) : null}
      </div>
    </MobileActivityDetailSheetLink>
  );
}
