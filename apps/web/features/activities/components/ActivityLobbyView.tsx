"use client";

import Link from "next/link";
import type { ActivityCategory } from "@chill-club/shared";
import { CalendarPlus, Compass, SlidersHorizontal, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PaginationControl } from "@/components/ui/PaginationControl";
import { trackClientAnalyticsEvent } from "@/features/analytics/client";
import { DetailSourceRestore } from "@/features/navigation/components/DetailSourceRestore";
import {
  isDetailSourceReturnPage,
  readDetailSourceContext,
} from "@/features/navigation/contextualDetailReturn";
import { getCategoryLabel, getCopy } from "@/lib/copy";
import { withLocale } from "@/lib/routes";
import {
  DESKTOP_VIEWPORT_MEDIA_QUERY,
  useMediaQuery,
} from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { activityCategoryOptions } from "../utils/activityFilters";
import type { ActivityCardViewModel } from "../types";
import { ActivityCard } from "./ActivityCard";
import { ActivitySwipeDiscovery } from "./ActivitySwipeDiscovery";
import { isPublicEventCard } from "../utils/activityCardKind";
import { getActivityTimeState } from "../utils/activityDisplay";
import { sortLobbyActivitiesByStatusAndOwnership } from "../utils/lobbyActivitySort";
import {
  dedupeActivityCards,
  filterUniqueActivityCards,
} from "../utils/activityCardIdentity";
import type {
  ActivityLobbyFeedPage,
  ActivityLobbyFeedStatus,
} from "../queries/getActivityLobby";

type ActivityLobbyViewProps = {
  allActivities: ActivityCardViewModel[];
  allActivityFeed: ActivityLobbyFeedPage;
  openActivities: ActivityCardViewModel[];
  createdActivities: ActivityCardViewModel[];
  deferredFilters?: LobbyFilterId[];
  joinedActivities: ActivityCardViewModel[];
  favoriteActivities: ActivityCardViewModel[];
  friendHostedActivities: ActivityCardViewModel[];
  friendJoinedActivities: ActivityCardViewModel[];
  initialFilter?: LobbyFilterId;
  initialCategoryFilter?: ActivityCategory | null;
  initialStatusFilter?: LobbyStatusFilterId;
  starterActivities: ActivityCardViewModel[];
  locale: string;
  viewerProfileId: string;
};

type LobbyFilterId =
  | "all"
  | "open"
  | "created"
  | "joined"
  | "favorites"
  | "friendHosted"
  | "friendJoined";

type FilterOption = {
  id: LobbyFilterId;
  count: number | null;
  label: string;
};

type LobbyStatusFilterId = ActivityLobbyFeedStatus;
type LobbyTypeFilterId = ActivityCategory | "all";

type StatusFilterOption = {
  id: LobbyStatusFilterId;
  count: number | null;
  label: string;
};

type TypeFilterOption = {
  id: LobbyTypeFilterId;
  label: string;
};

type LobbySectionResponse = {
  activities?: ActivityCardViewModel[];
  ok: boolean;
};

type LobbyFeedResponse = {
  feed?: ActivityLobbyFeedPage;
  ok: boolean;
};

type LobbySwipeResponse = {
  activities?: ActivityCardViewModel[];
  hasMore?: boolean;
  ok: boolean;
};

type WindowWithIdleCallback = Window &
  typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
  };

const LOBBY_PAGE_SIZE = 8;
const LOBBY_SWIPE_BATCH_SIZE = 8;
const LOBBY_SWIPE_IDLE_DELAY_MS = 1200;
const LOBBY_FEED_PREFETCH_IDLE_MS = 2200;
const LOBBY_DEFERRED_SECTION_INITIAL_DELAY_MS = 2500;
const LOBBY_DEFERRED_SECTION_STAGGER_MS = 700;
const CATEGORY_FALLBACK_MIN_RESULTS = 4;
const CATEGORY_FALLBACK_LIMIT = 4;

const categoryFallbackMap = {
  FOOD: ["WANDER", "BOARD_GAME", "OTHER"],
  WANDER: ["TRAVEL", "ART", "FOOD"],
  AUDIO_VISUAL: ["MUSIC", "ART", "OTHER"],
  ART: ["AUDIO_VISUAL", "WANDER", "MUSIC"],
  BOARD_GAME: ["FOOD", "GROWTH", "OTHER"],
  GROWTH: ["WANDER", "OTHER", "ART"],
  TRAVEL: ["WANDER", "FOOD", "ART"],
  MUSIC: ["AUDIO_VISUAL", "ART", "FOOD"],
  SPORTS: ["WANDER", "GROWTH", "TRAVEL"],
  OTHER: ["WANDER", "FOOD", "ART"],
} satisfies Record<ActivityCategory, ActivityCategory[]>;

function scheduleIdleTask(callback: () => void, timeout = 900) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const idleWindow = window as WindowWithIdleCallback;

  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(callback, { timeout });

    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, timeout);

  return () => window.clearTimeout(handle);
}

function getLobbySwipeExcludeId(activity: ActivityCardViewModel) {
  if (isPublicEventCard(activity)) {
    return `public:${activity.publicEventId ?? activity.id}`;
  }

  return `activity:${activity.id}`;
}

function mergeUniqueLobbySwipeActivities(
  currentActivities: ActivityCardViewModel[],
  nextActivities: ActivityCardViewModel[],
) {
  return [
    ...currentActivities,
    ...filterUniqueActivityCards(currentActivities, nextActivities),
  ];
}

function prepareInitialLobbySwipeActivities(
  activities: ActivityCardViewModel[],
) {
  return mergeUniqueLobbySwipeActivities([], activities);
}

type EmptyLobbyAction = {
  description: string;
  href: string;
  label: string;
  tone: "primary" | "secondary" | "tertiary";
};

type FilterGroupRowProps = {
  children: ReactNode;
  label: string;
};

type MobileLobbyFilterSheetProps = {
  activeFilter: LobbyFilterId;
  activeStatusFilter: LobbyStatusFilterId;
  activeTypeFilter: LobbyTypeFilterId;
  failedFilters: Partial<Record<LobbyFilterId, boolean>>;
  filterCopy: ReturnType<typeof getLobbyFilterCopy>;
  filterOptions: FilterOption[];
  isOpen: boolean;
  loadingFilter: LobbyFilterId | null;
  locale: string;
  onClose: () => void;
  onFilterChange: (filter: LobbyFilterId) => void;
  onStatusChange: (status: LobbyStatusFilterId) => void;
  onTypeChange: (type: LobbyTypeFilterId) => void;
  statusFilterOptions: StatusFilterOption[];
  typeFilterOptions: TypeFilterOption[];
};

function getAllLabel(locale: string) {
  if (locale === "fr") {
    return "Tout";
  }

  if (locale === "en") {
    return "All";
  }

  return "全部";
}

function getFilterLabel(locale: string, id: LobbyFilterId, fallback: string) {
  if (locale === "fr") {
    switch (id) {
      case "open":
        return "Publics";
      case "created":
        return "Créées";
      case "joined":
        return "Rejointes";
      case "favorites":
        return "Favoris";
      case "friendHosted":
        return "Vos suivis";
      case "friendJoined":
        return "Suivis inscrits";
      default:
        return fallback;
    }
  }

  if (locale === "en") {
    switch (id) {
      case "open":
        return "Open";
      case "created":
        return "Hosted by me";
      case "joined":
        return "Joined by me";
      case "favorites":
        return "Favorites";
      case "friendHosted":
        return "People you follow host";
      case "friendJoined":
        return "People you follow joined";
      default:
        return fallback;
    }
  }

  switch (id) {
    case "open":
      return "开放局";
    case "created":
      return "我发起的";
    case "joined":
      return "我参加的";
    case "favorites":
      return "我收藏的";
    case "friendHosted":
      return "关注的人发起";
    case "friendJoined":
      return "关注的人参加";
    default:
      return fallback;
  }
}

function getEmptyCategoryCopy(locale: string) {
  if (locale === "fr") {
    return {
      title: "Rien ici pour le moment.",
      description:
        "Essayez une autre catégorie, lancez un plan, ou découvrez de nouvelles activités pour remplir votre hall.",
    };
  }

  if (locale === "en") {
    return {
      title: "Nothing in this section yet.",
      description:
        "Try another section, start a plan, or discover something new to bring this area to life.",
    };
  }

  return {
    title: "这里暂时还没有内容。",
    description: "可以切换看看其他分类，也可以先发起一场聚吧。",
  };
}

function getEmptyCategoryResetLabel(locale: string) {
  if (locale === "fr") {
    return "Voir tout";
  }

  if (locale === "en") {
    return "View all";
  }

  return "查看全部";
}

function getMoreActivitiesLabel(locale: string) {
  if (locale === "fr") {
    return "Plus";
  }

  if (locale === "en") {
    return "More";
  }

  return "更多";
}

function getEmptyLobbyActions(locale: string): EmptyLobbyAction[] {
  if (locale === "fr") {
    return [
      {
        href: "/search",
        label: "Trouver des personnes",
        description:
          "Suivez des personnes qui vous intéressent. Leurs groupes apparaîtront ici.",
        tone: "primary",
      },
      {
        href: "/activities/new",
        label: "Je lance un plan",
        description:
          "Parc, expo ou cinema... lancez quelque chose maintenant et voyez qui part avec vous.",
        tone: "secondary",
      },
      {
        href: "/activities",
        label: "Découvrir",
        description:
          "Regardez ce qui se passe déjà, puis rejoignez ou gardez de côté ce qui vous attire.",
        tone: "tertiary",
      },
    ];
  }

  if (locale === "en") {
    return [
      {
        href: "/search",
        label: "Find people",
        description:
          "Follow people you are interested in. Their plans will appear here.",
        tone: "primary",
      },
      {
        href: "/activities/new",
        label: "Start a plan",
        description:
          "Park, exhibit, or movie night. Start something now and see who wants in.",
        tone: "secondary",
      },
      {
        href: "/activities",
        label: "Discover activities",
        description:
          "Browse what is already happening, then join or favorite whatever feels right.",
        tone: "tertiary",
      },
    ];
  }

  return [
    {
      href: "/search",
      label: "去找人",
      description: "关注几个感兴趣的人。他们发起或参加聚吧时，这里会显示。",
      tone: "primary",
    },
    {
      href: "/activities/new",
      label: "聚聚",
      description:
        "公园、逛展、看电影，想到什么就先聚聚，看看谁会跟上你一起出发。",
      tone: "secondary",
    },
    {
      href: "/activities",
      label: "去发现活动",
      description:
        "先逛逛大家都在玩什么，看到心动的活动就参加，或者先收藏起来。",
      tone: "tertiary",
    },
  ];
}

function getLobbyFilterCopy(locale: string) {
  if (locale === "fr") {
    return {
      category: "Vue",
      status: "Statut",
      title: "Filtrer le hall",
      type: "Type",
    };
  }

  if (locale === "en") {
    return {
      category: "Scope",
      status: "Status",
      title: "Filter the lobby",
      type: "Type",
    };
  }

  return {
    category: "范围",
    status: "状态",
    title: "筛选聚吧",
    type: "类型",
  };
}

function getMobileLobbyFilterCopy(locale: string) {
  if (locale === "fr") {
    return {
      apply: "Valider",
      close: "Fermer",
      openCategory: "Catégorie",
      openStatus: "Statut",
      title: "Filtrer",
    };
  }

  if (locale === "en") {
    return {
      apply: "Done",
      close: "Close",
      openCategory: "Category",
      openStatus: "Status",
      title: "Filters",
    };
  }

  return {
    apply: "完成",
    close: "关闭",
    openCategory: "分类",
    openStatus: "状态",
    title: "筛选",
  };
}

function getStatusFilterLabel(locale: string, id: LobbyStatusFilterId) {
  if (locale === "fr") {
    switch (id) {
      case "ongoing":
        return "En cours";
      case "ended":
        return "Terminées";
      default:
        return "Tout";
    }
  }

  if (locale === "en") {
    switch (id) {
      case "ongoing":
        return "Ongoing";
      case "ended":
        return "Ended";
      default:
        return "All";
    }
  }

  switch (id) {
    case "ongoing":
      return "进行中";
    case "ended":
      return "已结束";
    default:
      return "全部";
  }
}

function isEndedLobbyActivity(activity: ActivityCardViewModel) {
  return getActivityTimeState(activity) === "ENDED";
}

function getLobbyActivityKey(activity: ActivityCardViewModel) {
  return isPublicEventCard(activity) && activity.publicEventId
    ? `public:${activity.publicEventId}`
    : `activity:${activity.id}`;
}

function getLobbyFeedCacheKey(
  status: LobbyStatusFilterId,
  page: number,
  typeFilter: LobbyTypeFilterId = "all",
) {
  return `${typeFilter}:${status}:${page}`;
}

function getLobbyFeedStatusCount(
  feed: ActivityLobbyFeedPage,
  status: LobbyStatusFilterId,
) {
  if (feed.countsApproximate) {
    return null;
  }

  if (status === "ongoing") {
    return feed.ongoingCount;
  }

  if (status === "ended") {
    return feed.endedCount;
  }

  return feed.totalCount;
}

function createEmptyLobbyFeedForStatus(
  status: LobbyStatusFilterId,
): ActivityLobbyFeedPage {
  return {
    activities: [],
    countsApproximate: true,
    endedCount: 0,
    ongoingCount: 0,
    page: 1,
    pageSize: LOBBY_PAGE_SIZE,
    status,
    totalCount: 0,
    totalPages: 1,
  };
}

function getLobbyTotalPages(totalItems: number, pageSize = LOBBY_PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function getPagedLobbyActivities(
  activities: ActivityCardViewModel[],
  page: number,
  pageSize = LOBBY_PAGE_SIZE,
) {
  const startIndex = (page - 1) * pageSize;

  return activities.slice(startIndex, startIndex + pageSize);
}

function dedupeLobbyActivities(activities: ActivityCardViewModel[]) {
  return dedupeActivityCards(activities);
}

function sortLobbyActivities(
  activities: ActivityCardViewModel[],
  viewerProfileId?: string | null,
) {
  return sortLobbyActivitiesByStatusAndOwnership(activities, {
    tieBreaker: (left, right) => {
      const leftIsCandidate = isPublicEventCard(left);
      const rightIsCandidate = isPublicEventCard(right);

      return leftIsCandidate === rightIsCandidate
        ? 0
        : leftIsCandidate
          ? 1
          : -1;
    },
    viewerProfileId,
  });
}

function filterLobbyActivitiesByStatus(
  activities: ActivityCardViewModel[],
  statusFilter: LobbyStatusFilterId,
) {
  if (statusFilter === "ongoing") {
    return activities.filter((activity) => !isEndedLobbyActivity(activity));
  }

  if (statusFilter === "ended") {
    return activities.filter(isEndedLobbyActivity);
  }

  return activities;
}

function filterLobbyActivitiesByType(
  activities: ActivityCardViewModel[],
  typeFilter: LobbyTypeFilterId,
) {
  if (typeFilter === "all") {
    return activities;
  }

  return activities.filter((activity) => activity.category === typeFilter);
}

function getCategoryFallbackActivities({
  currentActivities,
  limit = CATEGORY_FALLBACK_LIMIT,
  sourceActivities,
  statusFilter,
  typeFilter,
}: {
  currentActivities: ActivityCardViewModel[];
  limit?: number;
  sourceActivities: ActivityCardViewModel[];
  statusFilter: LobbyStatusFilterId;
  typeFilter: LobbyTypeFilterId;
}) {
  if (typeFilter === "all" || currentActivities.length >= limit) {
    return [];
  }

  const currentActivityKeys = new Set(
    currentActivities.map(getLobbyActivityKey),
  );
  const adjacentCategories = categoryFallbackMap[typeFilter];
  const adjacentCategorySet = new Set<ActivityCategory>(adjacentCategories);
  const candidates = filterLobbyActivitiesByStatus(
    dedupeLobbyActivities(sourceActivities),
    statusFilter,
  ).filter((activity) => {
    if (activity.category === typeFilter) {
      return false;
    }

    return !currentActivityKeys.has(getLobbyActivityKey(activity));
  });
  const adjacentActivities = candidates.filter((activity) =>
    adjacentCategorySet.has(activity.category),
  );
  const broadActivities = candidates.filter(
    (activity) => !adjacentCategorySet.has(activity.category),
  );

  return sortLobbyActivities([...adjacentActivities, ...broadActivities]).slice(
    0,
    limit,
  );
}

function syncLobbyCategorySearchParam(typeFilter: LobbyTypeFilterId) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (typeFilter === "all") {
    url.searchParams.delete("category");
  } else {
    url.searchParams.set("category", typeFilter);
  }

  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextHref !== currentHref) {
    window.history.replaceState(window.history.state, "", nextHref);
  }
}

function getCategoryFallbackCopy({
  currentCount,
  locale,
  typeLabel,
}: {
  currentCount: number;
  locale: string;
  typeLabel: string;
}) {
  if (locale === "fr") {
    return {
      eyebrow: currentCount > 0 ? "Aussi dans le même élan" : "À explorer",
      title:
        currentCount > 0
          ? `${typeLabel} est encore calme`
          : `Pas encore de ${typeLabel}`,
      description:
        currentCount > 0
          ? "On garde vos résultats en premier, puis on ajoute quelques idées proches pour continuer sans page vide."
          : "Cette catégorie est encore rare. Voici des idées proches pour garder le fil.",
      badge: "Suggestion proche",
      resetLabel: "Voir tout le hall",
    };
  }

  if (locale === "en") {
    return {
      eyebrow: currentCount > 0 ? "Nearby picks" : "Keep browsing",
      title:
        currentCount > 0
          ? `${typeLabel} is still light`
          : `No ${typeLabel} yet`,
      description:
        currentCount > 0
          ? "Your selected category stays first. These nearby picks keep the page useful while this topic grows."
          : "This topic is still quiet, so here are nearby picks instead of a blank stop.",
      badge: "Nearby pick",
      resetLabel: "View all lobby",
    };
  }

  return {
    eyebrow: currentCount > 0 ? "顺手看看" : "先别空着",
    title: currentCount > 0 ? `${typeLabel} 还不多` : `暂时没有${typeLabel}`,
    description:
      currentCount > 0
        ? "当前分类会排在前面，下面补几张相近主题，继续逛不掉线。"
        : "这个分类还比较冷门，先给你补几张相近方向，避免停在空页面。",
    badge: "相近推荐",
    resetLabel: "查看全部大厅",
  };
}

function getStatusFilterOptions(
  activities: ActivityCardViewModel[],
  locale: string,
): StatusFilterOption[] {
  const ongoingCount = activities.filter(
    (activity) => !isEndedLobbyActivity(activity),
  ).length;
  const endedCount = activities.length - ongoingCount;
  const ids: LobbyStatusFilterId[] = ["all", "ongoing", "ended"];

  return ids.map((id) => ({
    id,
    count:
      id === "ongoing"
        ? ongoingCount
        : id === "ended"
          ? endedCount
          : activities.length,
    label: getStatusFilterLabel(locale, id),
  }));
}

function getLobbyFeedStatusFilterOptions(
  feed: ActivityLobbyFeedPage,
  locale: string,
): StatusFilterOption[] {
  const ids: LobbyStatusFilterId[] = ["all", "ongoing", "ended"];

  return ids.map((id) => ({
    id,
    count: getLobbyFeedStatusCount(feed, id),
    label: getStatusFilterLabel(locale, id),
  }));
}

function getActivityLobbyPreviewCopy(locale: string) {
  if (locale === "fr") {
    return {
      eyebrow: "Hall d'équipe",
      title: "Parcourez d'abord",
      description: "Les plans publics sont visibles sans connexion.",
      signIn: "Se connecter",
      browse: "Activités",
      emptyTitle: "Aucun plan pour le moment",
      emptyDescription:
        "Les plans publics apparaîtront ici dès qu'ils seront disponibles.",
      sectionTitle: "Plans publics",
    };
  }

  if (locale === "en") {
    return {
      eyebrow: "Team lobby",
      title: "Browse first",
      description: "Public plans are visible before signing in.",
      signIn: "Sign in",
      browse: "Activities",
      emptyTitle: "No plans yet",
      emptyDescription:
        "Public team plans will appear here when they are available.",
      sectionTitle: "Public plans",
    };
  }

  return {
    eyebrow: "聚吧",
    title: "先逛逛",
    description: "公开聚吧可以直接看，登录后可以报名、收藏和管理。",
    signIn: "登录",
    browse: "看活动",
    emptyTitle: "暂时还没有公开聚吧",
    emptyDescription: "有新的公开聚吧后，会先显示在这里。",
    sectionTitle: "公开聚吧",
  };
}

function FilterGroupRow({ children, label }: FilterGroupRowProps) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:items-center sm:gap-2">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-normal text-[#156240] sm:whitespace-nowrap sm:px-0 sm:text-left sm:text-[11px] sm:tracking-normal">
        {label}
      </p>
      <div className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function MobileLobbyFilterSheet({
  activeFilter,
  activeStatusFilter,
  activeTypeFilter,
  failedFilters,
  filterCopy,
  filterOptions,
  isOpen,
  loadingFilter,
  locale,
  onClose,
  onFilterChange,
  onStatusChange,
  onTypeChange,
  statusFilterOptions,
  typeFilterOptions,
}: MobileLobbyFilterSheetProps) {
  const copy = getMobileLobbyFilterCopy(locale);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 sm:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lobby-mobile-filter-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/36 backdrop-blur-[2px]"
        aria-label={copy.close}
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[1.5rem] border border-[#8AB68E] bg-[#FFF5E6] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-22px_50px_rgba(29,29,27,0.14)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#8AB68E]" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              id="lobby-mobile-filter-title"
              className="text-base font-semibold text-ink"
            >
              {copy.title}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#D6D5B2] bg-white text-[#156240] shadow-sm"
            aria-label={copy.close}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="px-1 text-[11px] font-semibold uppercase tracking-normal text-[#156240]">
              {filterCopy.category}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {filterOptions.map((option) => {
                const active = option.id === activeFilter;
                const pending = option.count === null;
                const optionLoading = pending && loadingFilter === option.id;
                const optionFailed =
                  pending && Boolean(failedFilters[option.id]);

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onFilterChange(option.id)}
                    className={cn(
                      "flex h-11 min-w-0 items-center justify-between gap-2 rounded-2xl border px-3 text-left text-sm font-semibold transition",
                      active
                        ? "border-[#8AB68E] bg-[#F1F2EC] text-[#156240] shadow-[0_6px_16px_rgba(54,151,88,0.12)]"
                        : "border-[#D6D5B2] bg-white/88 text-[#156240]",
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {!pending || optionLoading || optionFailed ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          active
                            ? "bg-white/78 text-[#156240]"
                            : "bg-[#F1F2EC] text-[#156240]",
                        )}
                      >
                        {optionFailed
                          ? "!"
                          : optionLoading
                            ? "..."
                            : option.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-1 text-[11px] font-semibold uppercase tracking-normal text-[#156240]">
              {filterCopy.type}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {typeFilterOptions.map((option) => {
                const active = option.id === activeTypeFilter;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onTypeChange(option.id)}
                    className={cn(
                      "flex h-10 min-w-0 items-center justify-center rounded-2xl border px-2 text-sm font-semibold transition",
                      active
                        ? "border-[#8AB68E] bg-[#F1F2EC] text-[#156240] shadow-[0_6px_16px_rgba(54,151,88,0.12)]"
                        : "border-[#D6D5B2] bg-white/88 text-[#156240]",
                    )}
                  >
                    <span className="min-w-0 max-w-full truncate">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-1 text-[11px] font-semibold uppercase tracking-normal text-[#156240]">
              {filterCopy.status}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {statusFilterOptions.map((option) => {
                const active = option.id === activeStatusFilter;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onStatusChange(option.id)}
                    className={cn(
                      "flex h-11 min-w-0 flex-col items-center justify-center rounded-2xl border px-2 text-sm font-semibold transition",
                      active
                        ? "border-[#8AB68E] bg-[#F1F2EC] text-[#156240]"
                        : "border-[#D6D5B2] bg-white/88 text-[#156240]",
                    )}
                  >
                    <span className="min-w-0 max-w-full truncate">
                      {option.label}
                    </span>
                    <span className="text-[11px] opacity-75">
                      {option.count ?? "..."}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#369758] text-sm font-semibold text-white shadow-[0_10px_22px_rgba(54,151,88,0.18)] transition hover:bg-[#156240]"
          onClick={onClose}
        >
          {copy.apply}
        </button>
      </div>
    </div>
  );
}

function LobbyPagination({
  locale,
  onPageChange,
  page,
  scrollTargetId,
  totalPages,
}: {
  locale: string;
  onPageChange: (page: number) => void;
  page: number;
  scrollTargetId: string;
  totalPages: number;
}) {
  return (
    <PaginationControl
      currentPage={page}
      locale={locale}
      mode="callback"
      onPageChange={onPageChange}
      scrollTargetId={scrollTargetId}
      totalPages={totalPages}
    />
  );
}

function LobbySectionLoading({ locale }: { locale: string }) {
  const label =
    locale === "fr"
      ? "Chargement..."
      : locale === "en"
        ? "Loading..."
        : "正在加载...";

  return (
    <div className="rounded-[1.25rem] border border-[#D6D5B2] bg-[#FEFFF9]/85 px-4 py-5">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#D6D5B2] border-t-[#369758]" />
        <p className="text-sm font-semibold text-[#156240]">{label}</p>
      </div>
      <div className="mt-4 grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-48 animate-pulse rounded-lg border border-black/10 bg-white/72"
            style={{ animationDelay: `${item * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function LobbySectionError({
  locale,
  onRetry,
}: {
  locale: string;
  onRetry: () => void;
}) {
  const copy =
    locale === "fr"
      ? {
          title: "Chargement impossible.",
          retry: "Réessayer",
        }
      : locale === "en"
        ? {
            title: "Could not load this section.",
            retry: "Retry",
          }
        : {
            title: "这个分区加载失败。",
            retry: "重试",
          };

  return (
    <div className="rounded-[1.25rem] border border-dashed border-[#8AB68E] bg-[#FEFFF9]/85 px-4 py-5">
      <p className="text-base font-semibold text-ink">{copy.title}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex h-9 items-center rounded-full bg-[#369758] px-4 text-sm font-semibold text-white transition hover:bg-[#156240]"
      >
        {copy.retry}
      </button>
    </div>
  );
}

function getLazyLobbySwipeCopy(locale: string) {
  if (locale === "fr") {
    return {
      eyebrow: "Swipe",
      title: "Swipez",
      loading: "Préparation des activités...",
    };
  }

  if (locale === "en") {
    return {
      eyebrow: "Swipe",
      title: "Swipe",
      loading: "Preparing activities...",
    };
  }

  return {
    eyebrow: "发现活动",
    title: "滑一滑",
    loading: "正在准备活动...",
  };
}

function LobbySwipeLoadingShell({
  className,
  locale,
}: {
  className?: string;
  locale: string;
}) {
  const copy = getLazyLobbySwipeCopy(locale);

  return (
    <section className={cn("overflow-visible px-0 py-1", className)}>
      <div className="flex items-center gap-2 px-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#F1F2EC] text-[#156240] shadow-sm ring-1 ring-[#8AB68E]">
          <Compass className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-[#156240]">
            {copy.eyebrow}
          </p>
          <h2 className="text-[1.35rem] font-semibold leading-[1.05] text-ink">
            {copy.title}
          </h2>
        </div>
      </div>

      <div className="relative mx-auto mt-2 h-[19rem] max-w-[22.5rem] overflow-hidden rounded-[1.2rem] bg-white shadow-[0_14px_32px_rgba(29,29,27,0.08)] ring-1 ring-[#D6D5B2]/85">
        <div className="h-32 animate-pulse bg-[linear-gradient(90deg,#F1F2EC_0%,#FEFFF9_48%,#F1F2EC_100%)]" />
        <div className="space-y-3 p-3.5">
          <div className="h-5 w-4/5 animate-pulse rounded-full bg-fog" />
          <div className="h-5 w-2/3 animate-pulse rounded-full bg-fog" />
          <div className="mt-4 grid gap-2">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-[#F1F2EC]" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-[#F1F2EC]" />
          </div>
          <div className="pt-4">
            <div className="h-10 w-full animate-pulse rounded-full bg-[#D6D5B2]" />
          </div>
        </div>
        <p className="absolute inset-x-0 bottom-3 text-center text-xs font-semibold text-[#156240]">
          {copy.loading}
        </p>
      </div>
    </section>
  );
}

export function LazyLobbySwipeDiscovery({
  className,
  favoriteRedirectPath = "/lobby",
  initialActivities,
  isAuthenticated,
  locale,
  variant = "lobby",
}: {
  className?: string;
  favoriteRedirectPath?: string;
  initialActivities: ActivityCardViewModel[];
  isAuthenticated: boolean;
  locale: string;
  variant?: "lobby" | "home";
}) {
  const [activities, setActivities] = useState(() =>
    prepareInitialLobbySwipeActivities(initialActivities),
  );
  const [requested, setRequested] = useState(initialActivities.length > 0);
  const [loadSettled, setLoadSettled] = useState(initialActivities.length > 0);
  const [hasMore, setHasMore] = useState(
    initialActivities.length >= LOBBY_SWIPE_BATCH_SIZE,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const activitiesRef = useRef(activities);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const nextActivities =
      prepareInitialLobbySwipeActivities(initialActivities);

    requestControllerRef.current?.abort();
    loadingMoreRef.current = false;
    activitiesRef.current = nextActivities;
    hasMoreRef.current = nextActivities.length >= LOBBY_SWIPE_BATCH_SIZE;
    setActivities(nextActivities);
    setHasMore(hasMoreRef.current);
    setLoadingMore(false);
    setLoadMoreFailed(false);

    if (nextActivities.length > 0) {
      setRequested(true);
      setLoadSettled(true);
    } else {
      setRequested(false);
      setLoadSettled(false);
    }
  }, [initialActivities]);

  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  const loadSwipeActivities = useCallback(
    async (mode: "initial" | "append") => {
      if (loadingMoreRef.current) {
        return false;
      }

      if (mode === "append" && !hasMoreRef.current) {
        return false;
      }

      loadingMoreRef.current = true;
      setLoadMoreFailed(false);
      setLoadingMore(mode === "append");

      const controller = new AbortController();
      requestControllerRef.current = controller;
      let didTimeout = false;
      const timeoutId = window.setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, 8000);
      const params = new URLSearchParams({
        limit: String(LOBBY_SWIPE_BATCH_SIZE),
      });

      if (mode === "append") {
        activitiesRef.current.forEach((activity) => {
          const excludeId = getLobbySwipeExcludeId(activity);

          if (excludeId) {
            params.append("exclude", excludeId);
          }
        });
      }

      try {
        const response = await fetch(`/api/lobby/swipe?${params.toString()}`, {
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Lobby swipe request failed: ${response.status}`);
        }

        const payload = (await response.json()) as LobbySwipeResponse;

        if (!payload.ok) {
          throw new Error("Lobby swipe request returned an error payload.");
        }

        if (controller.signal.aborted) {
          return false;
        }

        const incomingActivities = payload.activities ?? [];

        setActivities((currentActivities) => {
          const nextActivities =
            mode === "append"
              ? mergeUniqueLobbySwipeActivities(
                  currentActivities,
                  incomingActivities,
                )
              : prepareInitialLobbySwipeActivities(incomingActivities);

          activitiesRef.current = nextActivities;
          return nextActivities;
        });

        const nextHasMore =
          Boolean(payload.hasMore) && incomingActivities.length > 0;
        hasMoreRef.current = nextHasMore;
        setHasMore(nextHasMore);

        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (didTimeout && mode === "append") {
            setLoadMoreFailed(true);
          }

          return false;
        }

        console.error("Failed to load lobby swipe discovery", error);

        if (mode === "append") {
          setLoadMoreFailed(true);
        }

        return false;
      } finally {
        window.clearTimeout(timeoutId);

        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }

        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (requested || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const cancelIdleTask = scheduleIdleTask(() => {
      setRequested(true);
      void loadSwipeActivities("initial").finally(() => {
        if (!cancelled) {
          setLoadSettled(true);
        }
      });
    }, LOBBY_SWIPE_IDLE_DELAY_MS);

    return () => {
      cancelled = true;
      cancelIdleTask();
    };
  }, [loadSwipeActivities, requested]);

  const requestMoreSwipeActivities = useCallback(() => {
    void loadSwipeActivities("append");
  }, [loadSwipeActivities]);

  if (activities.length === 0 && !loadSettled) {
    return <LobbySwipeLoadingShell className={className} locale={locale} />;
  }

  if (activities.length === 0) {
    return null;
  }

  return (
    <ActivitySwipeDiscovery
      activities={activities}
      className={className}
      favoriteRedirectPath={favoriteRedirectPath}
      hasMoreActivities={hasMore}
      isAuthenticated={isAuthenticated}
      isLoadingMore={loadingMore}
      locale={locale}
      loadMoreFailed={loadMoreFailed}
      onRequestMore={requestMoreSwipeActivities}
      onRetryLoadMore={requestMoreSwipeActivities}
      shuffleDeck={false}
      sourceSurface="activity_list"
      variant={variant}
    />
  );
}

function CategoryFallbackSection({
  activities,
  currentCount,
  detailSourceKey,
  detailSourceState,
  favoriteRedirectPath,
  isAuthenticated,
  locale,
  onViewAll,
  selectedCategory,
  titleId,
}: {
  activities: ActivityCardViewModel[];
  currentCount: number;
  detailSourceKey: "lobby";
  detailSourceState?: Record<string, boolean | number | string>;
  favoriteRedirectPath: string;
  isAuthenticated: boolean;
  locale: string;
  onViewAll?: () => void;
  selectedCategory: ActivityCategory;
  titleId?: string;
}) {
  if (activities.length === 0) {
    return null;
  }

  const selectedCategoryLabel = getCategoryLabel(selectedCategory, locale);
  const copy = getCategoryFallbackCopy({
    currentCount,
    locale,
    typeLabel: selectedCategoryLabel,
  });
  const fallbackCategoryLabels = Array.from(
    new Set(
      activities.map((activity) => getCategoryLabel(activity.category, locale)),
    ),
  ).slice(0, 3);

  const trackFallbackClick = () => {
    trackClientAnalyticsEvent({
      name: "filter_applied",
      sourceSurface: "activity_list",
      properties: {
        category: selectedCategory,
        fallback_count: activities.length,
        filter_count: 1,
        filter_name: "category_fallback_click",
        result_count: currentCount,
      },
    });
  };

  return (
    <section
      aria-labelledby={titleId}
      className="relative overflow-hidden rounded-[1.35rem] border border-[#D6D5B2] bg-[linear-gradient(135deg,rgba(254,255,249,0.96),rgba(241,242,236,0.62)_58%,rgba(222,235,255,0.42))] p-4 shadow-[0_16px_36px_rgba(21,98,64,0.09)] sm:p-5"
    >
      <div
        className="absolute -right-14 -top-16 h-36 w-36 rounded-full bg-coral/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-normal text-[#156240]">
            {copy.eyebrow}
          </p>
          <h3
            id={titleId}
            className="mt-1 text-lg font-semibold leading-tight text-[#0E2A66] sm:text-xl"
          >
            {copy.title}
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#156240]/78">
            {copy.description}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <span className="inline-flex h-7 items-center rounded-full border border-[#8AB68E] bg-[#FEFFF9]/80 px-2.5 text-[11px] font-bold text-[#156240]">
            {copy.badge}
          </span>
          {fallbackCategoryLabels.map((label) => (
            <span
              key={label}
              className="inline-flex h-7 items-center rounded-full border border-[#D6D5B2] bg-white/64 px-2.5 text-[11px] font-semibold text-[#156240]/86"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        className="relative mt-4 grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4"
        onClickCapture={(event) => {
          const target = event.target;

          if (!(target instanceof HTMLElement)) {
            return;
          }

          if (target.closest("a")) {
            trackFallbackClick();
          }
        }}
      >
        {activities.map((activity) => (
          <ActivityCard
            key={`fallback:${selectedCategory}:${getLobbyActivityKey(activity)}`}
            actionContext="lobby"
            activity={activity}
            detailSourceKey={detailSourceKey}
            detailSourceState={{
              ...detailSourceState,
              fallbackFor: selectedCategory,
            }}
            favoriteRedirectPath={favoriteRedirectPath}
            isAuthenticated={isAuthenticated}
            lobbyCandidate={isPublicEventCard(activity)}
            locale={locale}
            mobileDense
            mobileDetailSheet={isPublicEventCard(activity)}
            showFavoriteButton
            showPrimaryAction={!isPublicEventCard(activity)}
            sourceSurface="activity_list"
          />
        ))}
      </div>

      {onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className="relative mt-4 inline-flex h-9 items-center rounded-full border border-[#D6D5B2] bg-white/80 px-4 text-sm font-semibold text-[#156240] transition hover:border-[#8AB68E] hover:bg-white"
        >
          {copy.resetLabel}
        </button>
      ) : null}
    </section>
  );
}

export function ActivityLobbyPreviewView({
  activities,
  initialCategoryFilter = null,
  locale,
}: {
  activities: ActivityCardViewModel[];
  initialCategoryFilter?: ActivityCategory | null;
  locale: string;
}) {
  const previewCopy = getActivityLobbyPreviewCopy(locale);
  const [activeTypeFilter, setActiveTypeFilter] = useState<LobbyTypeFilterId>(
    initialCategoryFilter ?? "all",
  );
  const [page, setPage] = useState(1);
  const typeFilterOptions: TypeFilterOption[] = useMemo(
    () => [
      {
        id: "all",
        label: getAllLabel(locale),
      },
      ...activityCategoryOptions.map((category) => ({
        id: category,
        label: getCategoryLabel(category, locale),
      })),
    ],
    [locale],
  );
  const dedupedActivities = useMemo(
    () =>
      filterLobbyActivitiesByType(
        dedupeLobbyActivities(activities),
        activeTypeFilter,
      ),
    [activeTypeFilter, activities],
  );
  const totalPages = getLobbyTotalPages(dedupedActivities.length);
  const visibleActivities = useMemo(
    () => getPagedLobbyActivities(dedupedActivities, page),
    [dedupedActivities, page],
  );
  const fallbackActivities = useMemo(
    () =>
      getCategoryFallbackActivities({
        currentActivities: dedupedActivities,
        sourceActivities: activities,
        statusFilter: "all",
        typeFilter: activeTypeFilter,
      }),
    [activeTypeFilter, activities, dedupedActivities],
  );
  const shouldShowFallback =
    activeTypeFilter !== "all" &&
    dedupedActivities.length < CATEGORY_FALLBACK_MIN_RESULTS &&
    fallbackActivities.length > 0;

  useEffect(() => {
    if (activeTypeFilter === "all") {
      return;
    }

    trackClientAnalyticsEvent({
      name: "filter_applied",
      sourceSurface: "activity_list",
      properties: {
        category: activeTypeFilter,
        fallback_count: fallbackActivities.length,
        filter_count: 1,
        filter_name: "lobby_preview_category",
        result_count: dedupedActivities.length,
      },
    });
  }, [activeTypeFilter, dedupedActivities.length, fallbackActivities.length]);

  useEffect(() => {
    setPage(1);
  }, [dedupedActivities.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    syncLobbyCategorySearchParam(activeTypeFilter);
  }, [activeTypeFilter]);

  return (
    <div className="space-y-6">
      <DetailSourceRestore sourceKey="lobby" />

      <section
        id="lobby-preview-results"
        className="space-y-4 sm:rounded-[1.5rem] sm:border sm:border-black/8 sm:bg-white/78 sm:p-5 sm:shadow-sm sm:shadow-black/5"
      >
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-ink">
            {previewCopy.sectionTitle}
          </h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {typeFilterOptions.map((option) => {
              const active = option.id === activeTypeFilter;

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition",
                    active
                      ? "border-[#8AB68E] bg-[#F1F2EC] text-[#156240]"
                      : "border-[#D6D5B2] bg-white/88 text-[#156240]",
                  )}
                  onClick={() => setActiveTypeFilter(option.id)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {dedupedActivities.length === 0 && !shouldShowFallback ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-paper/65 px-4 py-7 text-center">
            <p className="text-sm font-semibold text-zinc-700">
              {previewCopy.emptyTitle}
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              {previewCopy.emptyDescription}
            </p>
          </div>
        ) : (
          <>
            {dedupedActivities.length > 0 ? (
              <>
                <div className="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleActivities.map((activity) => (
                    <ActivityCard
                      key={getLobbyActivityKey(activity)}
                      actionContext="lobby"
                      activity={activity}
                      favoriteRedirectPath="/lobby"
                      isAuthenticated={false}
                      lobbyCandidate={isPublicEventCard(activity)}
                      locale={locale}
                      mobileDense
                      mobileDetailSheet={isPublicEventCard(activity)}
                      showFavoriteButton
                      showPrimaryAction={!isPublicEventCard(activity)}
                      sourceSurface="activity_list"
                      detailSourceKey="lobby"
                      detailSourceState={{
                        category:
                          activeTypeFilter === "all" ? "all" : activeTypeFilter,
                        page,
                      }}
                    />
                  ))}
                </div>
                <LobbyPagination
                  locale={locale}
                  onPageChange={setPage}
                  page={page}
                  scrollTargetId="lobby-preview-results"
                  totalPages={totalPages}
                />
              </>
            ) : null}

            {shouldShowFallback ? (
              <CategoryFallbackSection
                activities={fallbackActivities}
                currentCount={dedupedActivities.length}
                detailSourceKey="lobby"
                detailSourceState={{
                  category: activeTypeFilter,
                  fallback: true,
                }}
                favoriteRedirectPath="/lobby"
                isAuthenticated={false}
                locale={locale}
                onViewAll={() => {
                  setActiveTypeFilter("all");
                }}
                selectedCategory={activeTypeFilter}
                titleId="lobby-preview-category-fallback"
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

export function ActivityLobbyView({
  allActivities,
  allActivityFeed,
  openActivities,
  createdActivities,
  deferredFilters = [],
  joinedActivities,
  favoriteActivities,
  friendHostedActivities,
  friendJoinedActivities,
  initialFilter = "all",
  initialCategoryFilter = null,
  initialStatusFilter = "all",
  starterActivities,
  locale,
  viewerProfileId,
}: ActivityLobbyViewProps) {
  const isDesktopViewport = useMediaQuery(DESKTOP_VIEWPORT_MEDIA_QUERY);
  const appCopy = getCopy(locale);
  const t = appCopy.activityLobby;
  const [activeFilter, setActiveFilter] =
    useState<LobbyFilterId>(initialFilter);
  const [activeStatusFilter, setActiveStatusFilter] =
    useState<LobbyStatusFilterId>(initialStatusFilter);
  const [activeTypeFilter, setActiveTypeFilter] = useState<LobbyTypeFilterId>(
    initialCategoryFilter ?? "all",
  );
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [lazySections, setLazySections] = useState<
    Partial<Record<LobbyFilterId, ActivityCardViewModel[]>>
  >({});
  const lazySectionsRef = useRef(lazySections);
  const inFlightSectionRefs = useRef(new Set<LobbyFilterId>());
  const [loadingFilter, setLoadingFilter] = useState<LobbyFilterId | null>(
    null,
  );
  const [failedFilters, setFailedFilters] = useState<
    Partial<Record<LobbyFilterId, boolean>>
  >({});
  const [feedCache, setFeedCache] = useState<
    Record<string, ActivityLobbyFeedPage>
  >(() => ({
    [getLobbyFeedCacheKey(allActivityFeed.status, allActivityFeed.page, "all")]:
      allActivityFeed,
  }));
  const feedCacheRef = useRef(feedCache);
  const inFlightFeedRefs = useRef(new Set<string>());
  const categoryAnalyticsKeyRef = useRef<string | null>(null);
  const [loadingFeedKey, setLoadingFeedKey] = useState<string | null>(null);
  const [failedFeedKeys, setFailedFeedKeys] = useState<Record<string, boolean>>(
    {},
  );
  const deferredFilterSet = useMemo(
    () => new Set<LobbyFilterId>(deferredFilters),
    [deferredFilters],
  );
  const deferredFilterKey = useMemo(
    () => deferredFilters.join("|"),
    [deferredFilters],
  );

  useEffect(() => {
    lazySectionsRef.current = lazySections;
  }, [lazySections]);
  useEffect(() => {
    const key = getLobbyFeedCacheKey(
      allActivityFeed.status,
      allActivityFeed.page,
      "all",
    );

    setFeedCache((current) => {
      const next = {
        ...current,
        [key]: allActivityFeed,
      };

      feedCacheRef.current = next;

      return next;
    });
  }, [allActivityFeed]);
  useEffect(() => {
    feedCacheRef.current = feedCache;
  }, [feedCache]);
  useEffect(() => {
    const context = readDetailSourceContext();

    if (!context || !isDetailSourceReturnPage(context, "lobby")) {
      return;
    }

    const filter = context.sourceState?.filter;
    const status = context.sourceState?.status;
    const category = context.sourceState?.category;
    const restoredPage = Number(context.sourceState?.page);

    if (
      filter === "all" ||
      filter === "open" ||
      filter === "created" ||
      filter === "joined" ||
      filter === "favorites" ||
      filter === "friendHosted" ||
      filter === "friendJoined"
    ) {
      setActiveFilter(filter);
    }

    if (status === "all" || status === "ongoing" || status === "ended") {
      setActiveStatusFilter(status);
    }

    if (
      typeof category === "string" &&
      activityCategoryOptions.includes(category as ActivityCategory)
    ) {
      setActiveTypeFilter(category as ActivityCategory);
    }

    if (Number.isInteger(restoredPage) && restoredPage > 0) {
      setPage(restoredPage);
    }
  }, []);
  const createdActivityKeys = useMemo(
    () =>
      new Set(
        createdActivities.map((activity) => getLobbyActivityKey(activity)),
      ),
    [createdActivities],
  );
  const allFeedSummary =
    feedCache[getLobbyFeedCacheKey("all", 1, "all")] ?? allActivityFeed;
  const favoriteSectionActivities =
    lazySections.favorites ?? favoriteActivities;
  const friendHostedSectionActivities =
    lazySections.friendHosted ?? friendHostedActivities;
  const friendJoinedSectionActivities =
    lazySections.friendJoined ?? friendJoinedActivities;
  const categoryGroups = useMemo(
    () => [
      {
        id: "all" as const,
        activities: allActivities,
        count: allFeedSummary.countsApproximate
          ? null
          : allFeedSummary.totalCount,
        isDeferred: false,
        label: getAllLabel(locale),
      },
      {
        id: "created" as const,
        activities: createdActivities,
        count: createdActivities.length,
        isDeferred: false,
        label: getFilterLabel(locale, "created", t.createdTitle),
      },
      {
        id: "joined" as const,
        activities: joinedActivities,
        count: joinedActivities.length,
        isDeferred: false,
        label: getFilterLabel(locale, "joined", t.joinedTitle),
      },
      {
        id: "favorites" as const,
        activities: favoriteSectionActivities,
        count: favoriteSectionActivities.length,
        isDeferred:
          deferredFilterSet.has("favorites") && !lazySections.favorites,
        label: getFilterLabel(locale, "favorites", t.favoriteTitle),
      },
      {
        id: "friendHosted" as const,
        activities: friendHostedSectionActivities,
        count: friendHostedSectionActivities.length,
        isDeferred:
          deferredFilterSet.has("friendHosted") && !lazySections.friendHosted,
        label: getFilterLabel(locale, "friendHosted", t.friendHostedTitle),
      },
      {
        id: "friendJoined" as const,
        activities: friendJoinedSectionActivities,
        count: friendJoinedSectionActivities.length,
        isDeferred:
          deferredFilterSet.has("friendJoined") && !lazySections.friendJoined,
        label: getFilterLabel(locale, "friendJoined", t.friendJoinedTitle),
      },
      {
        id: "open" as const,
        activities:
          openActivities.length > 0
            ? openActivities
            : allActivities.filter(
                (activity) => activity.visibility === "PUBLIC",
              ),
        count:
          openActivities.length > 0
            ? openActivities.length
            : allActivities.filter(
                (activity) => activity.visibility === "PUBLIC",
              ).length,
        isDeferred: false,
        label: getFilterLabel(locale, "open", t.openTitle),
      },
    ],
    [
      allActivities,
      allFeedSummary.countsApproximate,
      allFeedSummary.totalCount,
      createdActivities,
      deferredFilterSet,
      favoriteActivities,
      favoriteSectionActivities,
      friendHostedSectionActivities,
      friendJoinedSectionActivities,
      joinedActivities,
      locale,
      lazySections.favorites,
      lazySections.friendHosted,
      lazySections.friendJoined,
      openActivities,
      t.createdTitle,
      t.favoriteTitle,
      t.friendHostedTitle,
      t.friendJoinedTitle,
      t.joinedTitle,
      t.openTitle,
    ],
  );
  const activeAllFeedSummary =
    feedCache[getLobbyFeedCacheKey("all", 1, activeTypeFilter)] ??
    (activeTypeFilter === "all" ? allActivityFeed : null);
  const activeCategoryActivities = useMemo(() => {
    const group = categoryGroups.find((item) => item.id === activeFilter);

    const dedupedActivities = dedupeLobbyActivities(group?.activities ?? []);
    const typeFilteredActivities = filterLobbyActivitiesByType(
      dedupedActivities,
      activeTypeFilter,
    );

    if (activeFilter === "all") {
      return typeFilteredActivities;
    }

    return sortLobbyActivities(typeFilteredActivities, viewerProfileId);
  }, [activeFilter, activeTypeFilter, categoryGroups, viewerProfileId]);
  const statusFilterOptions = useMemo(
    () =>
      activeFilter === "all"
        ? getLobbyFeedStatusFilterOptions(
            activeAllFeedSummary ?? createEmptyLobbyFeedForStatus("all"),
            locale,
          )
        : getStatusFilterOptions(activeCategoryActivities, locale),
    [activeAllFeedSummary, activeCategoryActivities, activeFilter, locale],
  );
  const clientVisibleActivities = useMemo(
    () =>
      filterLobbyActivitiesByStatus(
        activeCategoryActivities,
        activeStatusFilter,
      ),
    [activeCategoryActivities, activeStatusFilter],
  );
  const activeFeedKey = getLobbyFeedCacheKey(
    activeStatusFilter,
    page,
    activeTypeFilter,
  );
  const activeFeed = activeFilter === "all" ? feedCache[activeFeedKey] : null;
  const activeFeedPageSize =
    activeFeed?.pageSize || activeAllFeedSummary?.pageSize || LOBBY_PAGE_SIZE;
  const activeFeedSummaryForCounts = activeFeed ?? activeAllFeedSummary;
  const activeFeedStatusCount =
    activeFilter === "all"
      ? activeFeedSummaryForCounts
        ? getLobbyFeedStatusCount(
            activeFeedSummaryForCounts,
            activeStatusFilter,
          )
        : null
      : clientVisibleActivities.length;
  const activeFeedTotalItems =
    activeFilter === "all"
      ? (activeFeedStatusCount ?? activeFeedSummaryForCounts?.totalCount ?? 0)
      : clientVisibleActivities.length;
  const activeFeedTotalPages =
    activeFilter === "all"
      ? (activeFeedSummaryForCounts?.totalPages ??
        getLobbyTotalPages(activeFeedTotalItems, activeFeedPageSize))
      : getLobbyTotalPages(activeFeedTotalItems, LOBBY_PAGE_SIZE);
  const activeFeedFailed = Boolean(failedFeedKeys[activeFeedKey]);
  const activeFeedNeedsLoad =
    activeFilter === "all" &&
    (activeTypeFilter !== "all" || activeFeedTotalItems > 0) &&
    !activeFeed &&
    !activeFeedFailed;
  const activeFeedLoading =
    activeFilter === "all" &&
    !activeFeedFailed &&
    (loadingFeedKey === activeFeedKey || activeFeedNeedsLoad);
  const visibleActivities =
    activeFilter === "all"
      ? sortLobbyActivities(
          dedupeLobbyActivities(activeFeed?.activities ?? []),
          viewerProfileId,
        )
      : clientVisibleActivities;
  const visibleActivityKeys = useMemo(
    () =>
      new Set(
        visibleActivities.map((activity) => getLobbyActivityKey(activity)),
      ),
    [visibleActivities],
  );
  const starterPanelActivities = useMemo(
    () =>
      starterActivities
        .filter(
          (activity) => !visibleActivityKeys.has(getLobbyActivityKey(activity)),
        )
        .slice(0, 4),
    [starterActivities, visibleActivityKeys],
  );
  const totalPages = activeFeedTotalPages;
  const visiblePageActivities = useMemo(
    () =>
      activeFilter === "all"
        ? visibleActivities
        : getPagedLobbyActivities(visibleActivities, page),
    [activeFilter, page, visibleActivities],
  );
  const categoryFallbackSourceActivities = useMemo(
    () =>
      dedupeLobbyActivities([
        ...allActivities,
        ...allFeedSummary.activities,
        ...openActivities,
        ...starterActivities,
        ...favoriteSectionActivities,
        ...friendHostedSectionActivities,
        ...friendJoinedSectionActivities,
      ]),
    [
      allActivities,
      allFeedSummary.activities,
      favoriteSectionActivities,
      friendHostedSectionActivities,
      friendJoinedSectionActivities,
      openActivities,
      starterActivities,
    ],
  );
  const categoryFallbackActivities = useMemo(
    () =>
      getCategoryFallbackActivities({
        currentActivities: visibleActivities,
        sourceActivities: categoryFallbackSourceActivities,
        statusFilter: activeStatusFilter,
        typeFilter: activeTypeFilter,
      }),
    [
      activeStatusFilter,
      activeTypeFilter,
      categoryFallbackSourceActivities,
      visibleActivities,
    ],
  );
  const filterOptions: FilterOption[] = categoryGroups.map((group) => ({
    id: group.id,
    count: group.isDeferred ? null : group.count,
    label: group.label,
  }));
  const typeFilterOptions: TypeFilterOption[] = useMemo(
    () => [
      {
        id: "all",
        label: getAllLabel(locale),
      },
      ...activityCategoryOptions.map((category) => ({
        id: category,
        label: getCategoryLabel(category, locale),
      })),
    ],
    [locale],
  );
  const hasActivities = allFeedSummary.countsApproximate
    ? allFeedSummary.activities.length > 0
    : allFeedSummary.totalCount > 0;
  const hasPersonalLobbyData =
    createdActivities.length > 0 ||
    joinedActivities.length > 0 ||
    favoriteActivities.length > 0 ||
    friendHostedActivities.length > 0 ||
    friendJoinedActivities.length > 0;
  const isDefaultLobbyView =
    activeFilter === "all" &&
    activeStatusFilter === "all" &&
    activeTypeFilter === "all";
  const shouldShowStarterPanel =
    isDefaultLobbyView &&
    starterPanelActivities.length > 0 &&
    (!hasPersonalLobbyData ||
      allFeedSummary.countsApproximate ||
      allFeedSummary.totalCount < 3);
  const activeCategoryDeferred =
    categoryGroups.find((group) => group.id === activeFilter)?.isDeferred ??
    false;
  const activeFilterFailed =
    activeFilter === "all"
      ? activeFeedFailed
      : Boolean(failedFilters[activeFilter]);
  const activeFilterLoading =
    !activeFilterFailed &&
    (activeFeedLoading ||
      loadingFilter === activeFilter ||
      activeCategoryDeferred);
  const shouldShowCategoryFallback =
    activeFilter === "all" &&
    activeTypeFilter !== "all" &&
    !activeFilterLoading &&
    !activeFilterFailed &&
    activeFeedTotalItems < CATEGORY_FALLBACK_MIN_RESULTS &&
    categoryFallbackActivities.length > 0;
  const emptyCategoryCopy = getEmptyCategoryCopy(locale);
  const emptyCategoryResetLabel = getEmptyCategoryResetLabel(locale);
  const moreActivitiesLabel = getMoreActivitiesLabel(locale);
  const emptyLobbyActions = getEmptyLobbyActions(locale);
  const normalizedEmptyLobbyActions =
    locale === "zh-CN"
      ? emptyLobbyActions.map((action, index) =>
          index === 0
            ? {
                ...action,
                description:
                  "把常一起玩的人先加进来，有新局、新活动时，你马上就能在这里看到。",
              }
            : action,
        )
      : emptyLobbyActions;
  const filterCopy = getLobbyFilterCopy(locale);
  const mobileFilterCopy = getMobileLobbyFilterCopy(locale);
  const activeCategoryLabel =
    filterOptions.find((option) => option.id === activeFilter)?.label ??
    getAllLabel(locale);
  const activeTypeLabel =
    typeFilterOptions.find((option) => option.id === activeTypeFilter)?.label ??
    getAllLabel(locale);
  const activeStatusLabel = getStatusFilterLabel(locale, activeStatusFilter);
  const mobileResultCountLabel = activeFilterFailed
    ? "!"
    : activeFilterLoading
      ? "..."
      : activeFeedTotalItems.toString();

  const openMobileFilter = useCallback(() => {
    setMobileFilterOpen(true);
  }, []);

  const closeMobileFilter = useCallback(() => {
    setMobileFilterOpen(false);
  }, []);

  const handleCategoryFilterChange = useCallback((filter: LobbyFilterId) => {
    setActiveFilter(filter);
    setActiveStatusFilter("all");
  }, []);

  const handleStatusFilterChange = useCallback(
    (status: LobbyStatusFilterId) => {
      setActiveStatusFilter(status);
    },
    [],
  );

  const handleTypeFilterChange = useCallback((type: LobbyTypeFilterId) => {
    setActiveTypeFilter(type);
  }, []);

  const loadLobbyFeedPage = useCallback(
    async (
      status: LobbyStatusFilterId,
      targetPage: number,
      typeFilter: LobbyTypeFilterId,
      options: {
        visual?: boolean;
      } = {},
    ) => {
      if (!isDesktopViewport) {
        return;
      }

      const normalizedPage = Math.max(1, Math.floor(targetPage));
      const cacheKey = getLobbyFeedCacheKey(status, normalizedPage, typeFilter);

      if (
        feedCacheRef.current[cacheKey] ||
        inFlightFeedRefs.current.has(cacheKey)
      ) {
        return;
      }

      inFlightFeedRefs.current.add(cacheKey);

      if (options.visual) {
        setLoadingFeedKey(cacheKey);
      }

      setFailedFeedKeys((current) => ({
        ...current,
        [cacheKey]: false,
      }));

      const controller = new AbortController();
      const timeoutId =
        typeof window === "undefined"
          ? null
          : window.setTimeout(() => controller.abort(), 15000);

      try {
        const params = new URLSearchParams({
          page: normalizedPage.toString(),
          status,
        });
        if (typeFilter !== "all") {
          params.set("category", typeFilter);
        }
        const response = await fetch(`/api/lobby/feed?${params.toString()}`, {
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Lobby feed request failed: ${response.status}`);
        }

        const payload = (await response.json()) as LobbyFeedResponse;

        const feed = payload.feed;

        if (!payload.ok || !feed) {
          throw new Error("Lobby feed payload was not ok.");
        }

        setFeedCache((current) => {
          const responseKey = getLobbyFeedCacheKey(
            feed.status,
            feed.page,
            typeFilter,
          );
          const next = {
            ...current,
            [cacheKey]: feed,
            [responseKey]: feed,
          };

          feedCacheRef.current = next;

          return next;
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to load lobby feed page", error);
        }

        setFailedFeedKeys((current) => ({
          ...current,
          [cacheKey]: true,
        }));
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }

        inFlightFeedRefs.current.delete(cacheKey);
        setLoadingFeedKey((current) => (current === cacheKey ? null : current));
      }
    },
    [isDesktopViewport],
  );

  const loadDeferredSection = useCallback(
    async (
      filter: LobbyFilterId,
      options: {
        visual?: boolean;
      } = {},
    ) => {
      if (
        !isDesktopViewport ||
        !deferredFilterSet.has(filter) ||
        lazySectionsRef.current[filter] ||
        inFlightSectionRefs.current.has(filter)
      ) {
        return;
      }

      inFlightSectionRefs.current.add(filter);

      if (options.visual) {
        setLoadingFilter(filter);
      }

      setFailedFilters((current) => ({
        ...current,
        [filter]: false,
      }));

      const controller = new AbortController();
      const timeoutId =
        typeof window === "undefined"
          ? null
          : window.setTimeout(() => controller.abort(), 15000);

      try {
        const params = new URLSearchParams({
          section: filter,
        });
        const response = await fetch(
          `/api/lobby/section?${params.toString()}`,
          {
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Lobby section request failed: ${response.status}`);
        }

        const payload = (await response.json()) as LobbySectionResponse;

        if (!payload.ok) {
          throw new Error("Lobby section payload was not ok.");
        }

        setLazySections((current) => {
          const next = {
            ...current,
            [filter]: payload.activities ?? [],
          };

          lazySectionsRef.current = next;

          return next;
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to load lobby section", error);
        }

        setFailedFilters((current) => ({
          ...current,
          [filter]: true,
        }));
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }

        inFlightSectionRefs.current.delete(filter);
        setLoadingFilter((current) => (current === filter ? null : current));
      }
    },
    [deferredFilterSet, isDesktopViewport],
  );

  useEffect(() => {
    setPage(1);
  }, [activeFilter, activeStatusFilter, activeTypeFilter]);

  useEffect(() => {
    if (
      !deferredFilterSet.has(activeFilter) ||
      lazySections[activeFilter] ||
      activeFilterFailed
    ) {
      return;
    }

    void loadDeferredSection(activeFilter, { visual: true });
  }, [
    activeFilter,
    activeFilterFailed,
    deferredFilterSet,
    lazySections,
    loadDeferredSection,
  ]);

  useEffect(() => {
    if (
      activeFilter !== "all" ||
      activeFeed ||
      activeFeedFailed ||
      !activeFeedNeedsLoad
    ) {
      return;
    }

    void loadLobbyFeedPage(activeStatusFilter, page, activeTypeFilter, {
      visual: true,
    });
  }, [
    activeFeed,
    activeFeedFailed,
    activeFeedNeedsLoad,
    activeFeedTotalItems,
    activeFilter,
    activeStatusFilter,
    activeTypeFilter,
    loadLobbyFeedPage,
    page,
  ]);

  useEffect(() => {
    if (
      activeFilter !== "all" ||
      activeFeedLoading ||
      activeFeedFailed ||
      activeFeedTotalItems === 0 ||
      typeof window === "undefined"
    ) {
      return;
    }

    const pagesToPrefetch = [page + 1, page - 1].filter(
      (candidate) =>
        candidate >= 1 &&
        candidate <= totalPages &&
        !feedCacheRef.current[
          getLobbyFeedCacheKey(activeStatusFilter, candidate, activeTypeFilter)
        ],
    );

    if (pagesToPrefetch.length === 0) {
      return;
    }

    return scheduleIdleTask(() => {
      for (const targetPage of pagesToPrefetch) {
        void loadLobbyFeedPage(
          activeStatusFilter,
          targetPage,
          activeTypeFilter,
        );
      }
    }, LOBBY_FEED_PREFETCH_IDLE_MS);
  }, [
    activeFeedFailed,
    activeFeedLoading,
    activeFeedTotalItems,
    activeFilter,
    activeStatusFilter,
    activeTypeFilter,
    loadLobbyFeedPage,
    page,
    totalPages,
  ]);

  useEffect(() => {
    if (deferredFilters.length === 0 || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;
    const filters = deferredFilters.filter(
      (filter) =>
        filter === "favorites" ||
        filter === "friendHosted" ||
        filter === "friendJoined",
    );

    const loadNext = async (index: number) => {
      if (cancelled || index >= filters.length) {
        return;
      }

      await loadDeferredSection(filters[index]);

      if (!cancelled) {
        timerId = window.setTimeout(() => {
          void loadNext(index + 1);
        }, LOBBY_DEFERRED_SECTION_STAGGER_MS);
      }
    };

    timerId = window.setTimeout(() => {
      void loadNext(0);
    }, LOBBY_DEFERRED_SECTION_INITIAL_DELAY_MS);

    return () => {
      cancelled = true;

      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [deferredFilterKey, deferredFilters, loadDeferredSection]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    syncLobbyCategorySearchParam(activeTypeFilter);
  }, [activeTypeFilter]);

  useEffect(() => {
    if (
      activeFilter !== "all" ||
      activeTypeFilter === "all" ||
      activeFilterLoading ||
      activeFilterFailed
    ) {
      return;
    }

    const analyticsKey = [
      activeTypeFilter,
      activeStatusFilter,
      activeFeedTotalItems,
      categoryFallbackActivities.length,
    ].join(":");

    if (categoryAnalyticsKeyRef.current === analyticsKey) {
      return;
    }

    categoryAnalyticsKeyRef.current = analyticsKey;
    trackClientAnalyticsEvent({
      name: "filter_applied",
      sourceSurface: "activity_list",
      properties: {
        category: activeTypeFilter,
        fallback_count: categoryFallbackActivities.length,
        filter_count: 1,
        filter_name: "lobby_category",
        is_empty: activeFeedTotalItems === 0,
        result_count: activeFeedTotalItems,
        status: activeStatusFilter,
      },
    });
  }, [
    activeFeedTotalItems,
    activeFilter,
    activeFilterFailed,
    activeFilterLoading,
    activeStatusFilter,
    activeTypeFilter,
    categoryFallbackActivities.length,
  ]);

  return (
    <div className="space-y-3">
      <DetailSourceRestore sourceKey="lobby" />
      <MobileLobbyFilterSheet
        activeFilter={activeFilter}
        activeStatusFilter={activeStatusFilter}
        activeTypeFilter={activeTypeFilter}
        failedFilters={failedFilters}
        filterCopy={filterCopy}
        filterOptions={filterOptions}
        isOpen={mobileFilterOpen}
        loadingFilter={loadingFilter}
        locale={locale}
        onClose={closeMobileFilter}
        onFilterChange={handleCategoryFilterChange}
        onStatusChange={handleStatusFilterChange}
        onTypeChange={handleTypeFilterChange}
        statusFilterOptions={statusFilterOptions}
        typeFilterOptions={typeFilterOptions}
      />
      <section>
        <div className="flex flex-col gap-2 sm:gap-3">
          <h1 className="sr-only">{t.title}</h1>
          <div className="hidden flex-col gap-1 px-1 sm:flex sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <p className="text-[13px] font-semibold leading-5 text-ink sm:text-sm">
                {filterCopy.title}
              </p>
              <p className="mt-0.5 hidden text-xs leading-5 text-zinc-500 min-[430px]:block sm:text-sm">
                {t.description}
              </p>
            </div>
            <p className="text-[11px] font-medium leading-4 text-zinc-500 sm:text-xs">
              {activeCategoryLabel} · {activeTypeLabel} ·{" "}
              {getStatusFilterLabel(locale, activeStatusFilter)} ·{" "}
              {activeFeedTotalItems}
            </p>
          </div>

          <div className="sm:hidden">
            <button
              type="button"
              className="group grid h-11 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-full border border-[#8AB68E] bg-white px-3 text-left transition active:scale-[0.99]"
              onClick={openMobileFilter}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F2EC] text-[#156240] ring-1 ring-[#8AB68E]">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold leading-3 text-[#156240]">
                  {mobileFilterCopy.title}
                </span>
                <span className="mt-0.5 block truncate text-[13px] font-semibold leading-4 text-ink">
                  {activeCategoryLabel} · {activeTypeLabel} ·{" "}
                  {activeStatusLabel}
                </span>
              </span>
              <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#F09182] px-2.5 py-1 text-xs font-bold text-white shadow-[0_4px_10px_rgba(240,145,130,0.24)]">
                {mobileResultCountLabel}
              </span>
            </button>
          </div>

          <div className="hidden gap-1.5 sm:grid sm:gap-2">
            <FilterGroupRow label={filterCopy.category}>
              {filterOptions.map((option) => {
                const active = option.id === activeFilter;
                const pending = option.count === null;
                const optionLoading = pending && loadingFilter === option.id;
                const optionFailed =
                  pending && Boolean(failedFilters[option.id]);

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleCategoryFilterChange(option.id)}
                    className={cn(
                      "inline-flex h-7 max-w-[8.75rem] shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition sm:h-9 sm:max-w-none sm:gap-1.5 sm:px-3.5 sm:text-sm",
                      active
                        ? "border-[#156240] bg-[#156240] text-white"
                        : "border-[#D6D5B2] bg-white text-[#156240] hover:border-[#8AB68E]",
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {!pending || optionLoading || optionFailed ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs",
                          active
                            ? "bg-white text-[#156240]"
                            : "bg-[#F1F2EC] text-[#156240]",
                        )}
                      >
                        {optionFailed
                          ? "!"
                          : optionLoading
                            ? "..."
                            : option.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </FilterGroupRow>

            <FilterGroupRow label={filterCopy.type}>
              {typeFilterOptions.map((option) => {
                const active = option.id === activeTypeFilter;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleTypeFilterChange(option.id)}
                    className={cn(
                      "inline-flex h-7 max-w-[8.75rem] shrink-0 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium transition sm:h-9 sm:max-w-none sm:px-3.5 sm:text-sm",
                      active
                        ? "border-[#156240] bg-[#156240] text-white"
                        : "border-[#D6D5B2] bg-white text-[#156240] hover:border-[#8AB68E]",
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                  </button>
                );
              })}
            </FilterGroupRow>

            <FilterGroupRow label={filterCopy.status}>
              {statusFilterOptions.map((option) => {
                const active = option.id === activeStatusFilter;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleStatusFilterChange(option.id)}
                    className={cn(
                      "inline-flex h-7 max-w-[8.75rem] shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition sm:h-9 sm:max-w-none sm:gap-1.5 sm:px-3 sm:text-sm",
                      active
                        ? "border-[#156240] bg-[#156240] text-white"
                        : "border-[#D6D5B2] bg-white text-[#156240] hover:border-[#8AB68E]",
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs",
                        active
                          ? "bg-white text-[#156240]"
                          : "bg-[#F1F2EC] text-[#156240]",
                      )}
                    >
                      {option.count ?? "..."}
                    </span>
                  </button>
                );
              })}
            </FilterGroupRow>
          </div>
        </div>
      </section>

      {activeFilterLoading ? (
        <LobbySectionLoading locale={locale} />
      ) : activeFilterFailed ? (
        <LobbySectionError
          locale={locale}
          onRetry={() => {
            if (activeFilter === "all") {
              const retryKey = getLobbyFeedCacheKey(
                activeStatusFilter,
                page,
                activeTypeFilter,
              );

              setFailedFeedKeys((current) => ({
                ...current,
                [retryKey]: false,
              }));
              void loadLobbyFeedPage(
                activeStatusFilter,
                page,
                activeTypeFilter,
                {
                  visual: true,
                },
              );

              return;
            }

            setLazySections((current) => {
              const next = { ...current };
              delete next[activeFilter];

              return next;
            });
            setFailedFilters((current) => ({
              ...current,
              [activeFilter]: false,
            }));
          }}
        />
      ) : !hasActivities && isDefaultLobbyView ? (
        <section className="rounded-[1.5rem] border border-[#8AB68E] bg-[linear-gradient(145deg,rgba(255,250,242,0.98),rgba(247,255,243,0.95))] p-4 shadow-[0_12px_30px_rgba(29,29,27,0.06)] sm:p-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[#156240]">
              {locale === "fr"
                ? "Point de depart"
                : locale === "en"
                  ? "Start here"
                  : "从这里开始"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
              {locale === "fr"
                ? "Trouvez une sortie à partager"
                : locale === "en"
                  ? "Find something to do together"
                  : "今天想找谁一起出门？"}
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-600 sm:text-base">
              {locale === "fr"
                ? "Votre hall se remplira avec vos plans, mais vous pouvez déjà partir d'une sortie ouverte ou lancer votre premier groupe."
                : locale === "en"
                  ? "Your own lobby will grow with your plans. For now, start from an open activity or create your first crew."
                  : "你的聚吧记录会慢慢多起来。现在可以先从公开活动找人一起去，或者发起第一个聚吧。"}
            </p>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {normalizedEmptyLobbyActions.map((action) => (
              <div
                key={action.href}
                className={cn(
                  "rounded-xl border p-3 text-left shadow-sm shadow-black/5",
                  action.tone === "primary"
                    ? "border-[#8AB68E] bg-[linear-gradient(145deg,rgba(233,247,227,0.98),rgba(207,226,198,0.92))]"
                    : action.tone === "secondary"
                      ? "border-[#DEAAB3] bg-[linear-gradient(145deg,rgba(255,240,237,0.98),rgba(255,250,242,0.96))]"
                      : "border-[#D6D5B2] bg-[rgba(255,255,255,0.9)]",
                )}
              >
                <p className="text-base font-semibold text-ink">
                  {action.label}
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-600 sm:text-sm sm:leading-6">
                  {action.description}
                </p>
                <Link
                  href={withLocale(locale, action.href)}
                  className={cn(
                    "mt-3 inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition sm:h-9 sm:px-4 sm:text-sm",
                    action.tone === "primary"
                      ? "bg-coral text-white hover:bg-coral-dark"
                      : action.tone === "secondary"
                        ? "bg-white/90 text-[#F09182] hover:bg-white"
                        : "bg-[#F1F2EC] text-[#156240] hover:bg-white",
                  )}
                >
                  {action.label}
                </Link>
              </div>
            ))}
          </div>

          {starterActivities.length > 0 ? (
            <div className="mt-6 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-ink">
                    {locale === "fr"
                      ? "Des occasions pour commencer"
                      : locale === "en"
                        ? "Good first chances"
                        : "适合先聚起来的机会"}
                  </h3>
                  <p className="mt-0.5 text-xs leading-5 text-zinc-500 sm:text-sm">
                    {locale === "fr"
                      ? "Ces sorties ouvertes peuvent devenir votre premier plan."
                      : locale === "en"
                        ? "Open activities that can become your first crew."
                        : "这些公开活动可以直接变成你的第一个聚吧。"}
                  </p>
                </div>
                <Link
                  href={withLocale(locale, "/activities")}
                  className="inline-flex h-9 w-fit items-center rounded-full border border-[#D6D5B2] bg-white/84 px-4 text-sm font-semibold text-[#156240] transition hover:bg-white"
                >
                  {moreActivitiesLabel}
                </Link>
              </div>
              <div className="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {starterActivities.slice(0, 4).map((activity) => (
                  <ActivityCard
                    key={`starter:${getLobbyActivityKey(activity)}`}
                    actionContext="lobby"
                    activity={activity}
                    favoriteRedirectPath="/lobby"
                    isAuthenticated
                    locale={locale}
                    mobileDense
                    showFavoriteButton
                    showPrimaryAction
                    sourceSurface="activity_list"
                    detailSourceKey="lobby"
                    detailSourceState={{ starter: true }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : activeFeedTotalItems === 0 && shouldShowCategoryFallback ? (
        <div className="space-y-3">
          <div className="rounded-[1.25rem] border border-dashed border-[#8AB68E] bg-[#FEFFF9]/86 px-4 py-4">
            <p className="text-base font-semibold text-ink">
              {emptyCategoryCopy.title}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-zinc-500">
              {emptyCategoryCopy.description}
            </p>
          </div>
          <CategoryFallbackSection
            activities={categoryFallbackActivities}
            currentCount={activeFeedTotalItems}
            detailSourceKey="lobby"
            detailSourceState={{
              category: activeTypeFilter,
              fallback: true,
              page,
              status: activeStatusFilter,
            }}
            favoriteRedirectPath="/lobby"
            isAuthenticated
            locale={locale}
            onViewAll={() => {
              setActiveTypeFilter("all");
              setActiveStatusFilter("all");
            }}
            selectedCategory={activeTypeFilter}
            titleId="lobby-category-empty-fallback"
          />
        </div>
      ) : activeFeedTotalItems === 0 ? (
        <div className="rounded-[1.25rem] border border-dashed border-[#8AB68E] bg-[#FEFFF9]/85 px-4 py-5">
          <p className="text-base font-semibold text-ink">
            {emptyCategoryCopy.title}
          </p>
          <p className="mt-1.5 text-sm leading-6 text-zinc-500">
            {emptyCategoryCopy.description}
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveFilter("all");
              setActiveStatusFilter("all");
            }}
            className="mt-3 inline-flex h-9 items-center rounded-full border border-[#D6D5B2] bg-white/86 px-4 text-sm font-semibold text-[#156240] transition hover:border-[#8AB68E] hover:bg-white"
          >
            {emptyCategoryResetLabel}
          </button>
        </div>
      ) : (
        <>
          {shouldShowStarterPanel ? (
            <section className="space-y-3 rounded-[1.25rem] border border-[#8AB68E] bg-white/78 p-4 shadow-sm shadow-black/5 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-[#156240]">
                    {locale === "fr"
                      ? "Pour remplir votre hall"
                      : locale === "en"
                        ? "Build your lobby"
                        : "把大厅热起来"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink sm:text-xl">
                    {locale === "fr"
                      ? "Transformez une sortie ouverte en plan"
                      : locale === "en"
                        ? "Turn an open activity into a crew"
                        : "从公开活动开始约人"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {locale === "fr"
                      ? "Votre reseau est encore leger. Ces sorties donnent tout de suite une raison de contacter quelqu'un."
                      : locale === "en"
                        ? "Your network is still light. These activities give you a concrete reason to start."
                        : "关注和记录还少时，先用这些真实活动作为组局起点。"}
                  </p>
                </div>
                <Link
                  href={withLocale(locale, "/activities")}
                  className="inline-flex h-9 w-fit shrink-0 items-center rounded-full border border-[#D6D5B2] bg-white/84 px-4 text-sm font-semibold text-[#156240] transition hover:bg-white"
                >
                  {moreActivitiesLabel}
                </Link>
              </div>
              <div className="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {starterPanelActivities.map((activity) => (
                  <ActivityCard
                    key={`starter:${getLobbyActivityKey(activity)}`}
                    actionContext="lobby"
                    activity={activity}
                    favoriteRedirectPath="/lobby"
                    isAuthenticated
                    locale={locale}
                    mobileDense
                    showFavoriteButton
                    showPrimaryAction
                    sourceSurface="activity_list"
                    detailSourceKey="lobby"
                    detailSourceState={{ starter: true }}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section
            id="lobby-results"
            className="space-y-3 border-t border-sand pt-4 sm:space-y-4"
          >
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-ink sm:text-xl">
                    {activeCategoryLabel}
                  </h2>
                  <span className="shrink-0 rounded-full bg-white/78 px-2.5 py-1 text-xs font-semibold text-[#156240] ring-1 ring-[#D6D5B2]">
                    {activeFeedTotalItems}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {getStatusFilterLabel(locale, activeStatusFilter)}
                </p>
              </div>
              <Link
                href={withLocale(locale, "/activities/new")}
                className="mobile-home-quick-action inline-flex h-9 min-w-[5.35rem] shrink-0 items-center justify-center gap-1.5 rounded-full bg-coral px-3 text-[11px] font-bold leading-none text-white transition hover:-translate-y-0.5 active:scale-[0.94] sm:h-10 sm:min-w-[6.2rem] sm:px-4 sm:text-sm"
                title={appCopy.nav.newActivity}
              >
                <CalendarPlus
                  className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">
                  {appCopy.nav.newActivity}
                </span>
              </Link>
            </div>

            <div className="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {visiblePageActivities.map((activity) => (
                <ActivityCard
                  key={getLobbyActivityKey(activity)}
                  actionContext="lobby"
                  activity={activity}
                  favoriteRedirectPath="/lobby"
                  isAuthenticated
                  isOwnActivity={createdActivityKeys.has(
                    getLobbyActivityKey(activity),
                  )}
                  locale={locale}
                  mobileDense
                  showFavoriteButton
                  showPrimaryAction
                  sourceSurface="activity_list"
                  detailSourceKey="lobby"
                  detailSourceState={{
                    filter: activeFilter,
                    category: activeTypeFilter,
                    page,
                    status: activeStatusFilter,
                  }}
                />
              ))}
            </div>
            <LobbyPagination
              locale={locale}
              onPageChange={setPage}
              page={page}
              scrollTargetId="lobby-results"
              totalPages={totalPages}
            />
          </section>

          {shouldShowCategoryFallback ? (
            <CategoryFallbackSection
              activities={categoryFallbackActivities}
              currentCount={activeFeedTotalItems}
              detailSourceKey="lobby"
              detailSourceState={{
                category: activeTypeFilter,
                fallback: true,
                page,
                status: activeStatusFilter,
              }}
              favoriteRedirectPath="/lobby"
              isAuthenticated
              locale={locale}
              onViewAll={() => {
                setActiveTypeFilter("all");
                setActiveStatusFilter("all");
              }}
              selectedCategory={activeTypeFilter}
              titleId="lobby-category-fallback"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
