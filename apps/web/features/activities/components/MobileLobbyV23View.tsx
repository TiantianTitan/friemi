"use client";

import Image from "next/image";
import Link from "next/link";
import type { ActivityCategory } from "@chill-club/shared";
import type { CSSProperties } from "react";
import { preload } from "react-dom";
import {
  ChevronRight,
  CircleEllipsis,
  Dice5,
  Dumbbell,
  Film,
  Footprints,
  LayoutGrid,
  Music2,
  Palette,
  Plane,
  Rows3,
  Sprout,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileActivityListRow } from "@/features/activities/components/MobileActivityListRow";
import { retainImageSources } from "@/components/media/RetainedImage";
import type { ActivityCardViewModel } from "@/features/activities/types";
import { getActivityDisplayStatus } from "@/features/activities/utils/activityDisplay";
import {
  dedupeActivityCards,
  filterUniqueActivityCards,
} from "@/features/activities/utils/activityCardIdentity";
import { activityCategoryOptions } from "@/features/activities/utils/activityFilters";
import {
  activityCategoryIllustrationImages,
  getActivityListCoverSrc,
} from "@/features/activities/utils/activityCategoryVisuals";
import { brand } from "@/lib/brand";
import { getActivityCoverThumbnailUrl } from "@/lib/activity-cover-display";
import { getCategoryLabel } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type MobileLobbyV23TabId =
  | "nearby"
  | "friends"
  | "today"
  | "popular"
  | "mine";

type MobileLobbyV23ViewProps = {
  activeTab: MobileLobbyV23TabId;
  activities: ActivityCardViewModel[];
  initialHasMore?: boolean;
  initialCategoryFilter?: ActivityCategory | null;
  initialFreeOnly?: boolean;
  isSignedIn: boolean;
  locale: string;
  swipeActivities?: ActivityCardViewModel[];
  viewerProfileId?: string | null;
};

type MobileLobbyV23CategoryFilterId = ActivityCategory | "all";

type MobileLobbyV23CategoryFilterOption = {
  Icon: LucideIcon;
  id: MobileLobbyV23CategoryFilterId;
  image?: string;
  label: string;
};

type MobileLobbyV23Copy = {
  emptyDescription: string;
  emptyTitle: string;
  friendEmptyTitle: string;
  friendEmptyDescription: string;
  friendGoing: (count: number) => string;
  recommendationTitle: string;
  loadingLabel: string;
  loadFailedTitle: string;
  mineEmptyTitle: string;
  mineEmptyDescription: string;
  endedLabel: string;
  hostedBadge: string;
  participants: string;
  retryLabel: string;
  tabs: Record<MobileLobbyV23TabId, string>;
  title: string;
};

const mobileLobbyV23Tabs: MobileLobbyV23TabId[] = [
  "nearby",
  "mine",
  "friends",
  "today",
  "popular",
];
const publicMobileLobbyV23Tabs = mobileLobbyV23Tabs.filter(
  (tab) => tab !== "mine" && tab !== "friends",
);
const mobileLobbySparseResultThreshold = 3;
const mobileLobbySwipePreviewLimit = 8;
type MobileLobbyTabPageState = {
  activities: ActivityCardViewModel[];
  hasMore: boolean;
  page: number;
};

type MobileLobbyTabCacheEntry = {
  cachedAt: number;
  page: MobileLobbyTabPageState;
};

type MobileLobbyTabCache = Partial<
  Record<MobileLobbyV23TabId, MobileLobbyTabCacheEntry>
>;

type MobileLobbyPageResponse = {
  ok: boolean;
  page?: MobileLobbyTabPageState & { tab: MobileLobbyV23TabId };
};

const mobileLobbyTabMemoryCache = new Map<string, MobileLobbyTabCache>();
const mobileLobbyTabCacheFreshMs = 45_000;
const mobileLobbyTabCacheLimit = 8;
const mobileLobbyWarmupDelayMs = 1_400;
const mobileLobbyWarmupIntervalMs = 650;

function getMobileLobbyTabCacheKey(
  locale: string,
  viewerProfileId: string | null,
) {
  return `${viewerProfileId ?? "anonymous"}:${locale}`;
}

function getMobileLobbyTabCacheEntry(
  cacheKey: string,
  tab: MobileLobbyV23TabId,
) {
  return mobileLobbyTabMemoryCache.get(cacheKey)?.[tab];
}

function isMobileLobbyTabCacheFresh(
  cacheKey: string,
  tab: MobileLobbyV23TabId,
) {
  const entry = getMobileLobbyTabCacheEntry(cacheKey, tab);

  return Boolean(
    entry && Date.now() - entry.cachedAt < mobileLobbyTabCacheFreshMs,
  );
}

function cacheMobileLobbyTabPage(
  cacheKey: string,
  tab: MobileLobbyV23TabId,
  page: MobileLobbyTabPageState,
) {
  const current = mobileLobbyTabMemoryCache.get(cacheKey) ?? {};

  mobileLobbyTabMemoryCache.delete(cacheKey);
  mobileLobbyTabMemoryCache.set(cacheKey, {
    ...current,
    [tab]: {
      cachedAt: Date.now(),
      page,
    },
  });

  if (mobileLobbyTabMemoryCache.size <= mobileLobbyTabCacheLimit) {
    return;
  }

  const oldestKey = mobileLobbyTabMemoryCache.keys().next().value;

  if (typeof oldestKey === "string" && oldestKey !== cacheKey) {
    mobileLobbyTabMemoryCache.delete(oldestKey);
  }
}

const mobileLobbyV23CategoryIcons = {
  FOOD: Utensils,
  WANDER: Footprints,
  AUDIO_VISUAL: Film,
  ART: Palette,
  BOARD_GAME: Dice5,
  GROWTH: Sprout,
  TRAVEL: Plane,
  MUSIC: Music2,
  SPORTS: Dumbbell,
  OTHER: CircleEllipsis,
} satisfies Record<ActivityCategory, LucideIcon>;

function getMobileLobbyAllLabel(locale: string) {
  if (locale === "fr") {
    return "Tout";
  }

  if (locale === "en") {
    return "All";
  }

  return "全部";
}

function getMobileLobbyCategoryFilterLabel(locale: string) {
  if (locale === "fr") {
    return "Types";
  }

  if (locale === "en") {
    return "Types";
  }

  return "分类";
}

function syncMobileLobbyTabSearchParam({
  category,
  freeOnly,
  tab,
}: {
  category: MobileLobbyV23CategoryFilterId;
  freeOnly?: boolean;
  tab: MobileLobbyV23TabId;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  url.searchParams.set("tab", tab);

  if (freeOnly) {
    url.searchParams.set("price", "free");
  } else {
    url.searchParams.delete("price");
  }

  if (category !== "all") {
    url.searchParams.set("category", category);
  } else {
    url.searchParams.delete("category");
  }

  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextHref !== currentHref) {
    window.history.replaceState(window.history.state, "", nextHref);
  }
}

function syncMobileLobbyCategorySearchParam(
  typeFilter: MobileLobbyV23CategoryFilterId,
) {
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

function isFreeMobileLobbyActivity(activity: ActivityCardViewModel) {
  const priceText = activity.priceText.trim().toLowerCase();

  return (
    priceText.length === 0 ||
    priceText === "0" ||
    priceText === "free" ||
    priceText === "gratuit" ||
    priceText === "免费" ||
    priceText.includes("gratuit") ||
    priceText.includes("free")
  );
}

function getMobileLobbyV23Copy(locale: string): MobileLobbyV23Copy {
  if (locale === "fr") {
    return {
      emptyDescription: "Les nouvelles sorties apparaîtront ici.",
      emptyTitle: "Aucun groupe pour le moment",
      friendEmptyTitle: "Aucune sortie suivie",
      friendEmptyDescription:
        "Connectez-vous pour voir les sorties des personnes que vous suivez.",
      friendGoing: (count) => `${count} suivi${count > 1 ? "s" : ""}`,
      recommendationTitle: "Groupes susceptibles de vous plaire",
      loadingLabel: "Chargement...",
      loadFailedTitle: "Chargement impossible",
      endedLabel: "Terminé",
      mineEmptyTitle: "Aucune de vos sorties",
      mineEmptyDescription:
        "Connectez-vous pour voir les sorties que vous organisez ou rejoignez.",
      hostedBadge: "Créé",
      participants: "pers.",
      retryLabel: "Réessayer",
      tabs: {
        nearby: "Proche",
        friends: "Suivis",
        today: "Aujourd'hui",
        popular: "Populaire",
        mine: "Les miens",
      },
      title: "Groupes",
    };
  }

  if (locale === "en") {
    return {
      emptyDescription: "Fresh plans will appear here.",
      emptyTitle: "No plans yet",
      friendEmptyTitle: "Nothing from people you follow",
      friendEmptyDescription:
        "Sign in to see plans joined by people you follow.",
      friendGoing: (count) =>
        `${count} ${count === 1 ? "followed person" : "followed people"}`,
      recommendationTitle: "Plans you may like",
      loadingLabel: "Loading...",
      loadFailedTitle: "Could not load",
      endedLabel: "Ended",
      mineEmptyTitle: "No personal plans yet",
      mineEmptyDescription: "Sign in to see plans you're hosting or joining.",
      hostedBadge: "Host",
      participants: "people",
      retryLabel: "Retry",
      tabs: {
        nearby: "Nearby",
        friends: "Following",
        today: "Today",
        popular: "Popular",
        mine: "Mine",
      },
      title: "Plans",
    };
  }

  return {
    emptyDescription: "新的聚吧会显示在这里。",
    emptyTitle: "暂时没有聚吧",
    friendEmptyTitle: "暂无关注动态",
    friendEmptyDescription: "登录后可以看到你关注的人参加的聚吧。",
    friendGoing: (count) => `${count} 位关注的人`,
    recommendationTitle: "可能感兴趣的聚吧",
    loadingLabel: "加载中...",
    loadFailedTitle: "加载失败",
    endedLabel: "已结束",
    mineEmptyTitle: "暂无我的聚吧",
    mineEmptyDescription: "登录后可以看到你发起和参加的聚吧。",
    hostedBadge: "我发起的",
    participants: "人",
    retryLabel: "重试",
    tabs: {
      nearby: "附近",
      friends: "关注",
      today: "今天",
      popular: "热门",
      mine: "我的",
    },
    title: "聚吧",
  };
}

function getActivityKey(activity: ActivityCardViewModel) {
  return `${activity.type}:${activity.id}`;
}

function dedupeActivities(activities: ActivityCardViewModel[]) {
  return dedupeActivityCards(activities);
}

async function fetchMobileLobbyPage(
  tab: MobileLobbyV23TabId,
  page: number,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    page: String(page),
    tab,
  });
  const response = await fetch(`/api/lobby/mobile?${params.toString()}`, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Mobile lobby request failed: ${response.status}`);
  }

  const payload = (await response.json()) as MobileLobbyPageResponse;

  if (!payload.ok || !payload.page) {
    throw new Error("Mobile lobby payload was not ok.");
  }

  return payload.page;
}

function getPrioritizedMobileLobbySwipeActivities({
  activities,
  category,
  excludedActivities,
}: {
  activities: ActivityCardViewModel[];
  category: MobileLobbyV23CategoryFilterId;
  excludedActivities: ActivityCardViewModel[];
}) {
  const matchingCategoryActivities: ActivityCardViewModel[] = [];
  const fallbackActivities: ActivityCardViewModel[] = [];

  for (const activity of filterUniqueActivityCards(
    excludedActivities,
    activities,
  )) {
    if (category !== "all" && activity.category === category) {
      matchingCategoryActivities.push(activity);
    } else {
      fallbackActivities.push(activity);
    }
  }

  return [...matchingCategoryActivities, ...fallbackActivities].slice(
    0,
    mobileLobbySwipePreviewLimit,
  );
}

function filterMobileLobbyActivitiesByCategory(
  activities: ActivityCardViewModel[],
  category: MobileLobbyV23CategoryFilterId,
) {
  if (category === "all") {
    return activities;
  }

  return activities.filter((activity) => activity.category === category);
}

function filterMobileLobbyActivitiesByPrice(
  activities: ActivityCardViewModel[],
  freeOnly: boolean,
) {
  if (!freeOnly) {
    return activities;
  }

  return activities.filter(isFreeMobileLobbyActivity);
}

function MobileLobbyV23CategoryRail({
  activeCategory,
  isOpen,
  locale,
  onClose,
  onSelectCategory,
  options,
}: {
  activeCategory: MobileLobbyV23CategoryFilterId;
  isOpen: boolean;
  locale: string;
  onClose: () => void;
  onSelectCategory: (category: MobileLobbyV23CategoryFilterId) => void;
  options: MobileLobbyV23CategoryFilterOption[];
}) {
  const title = getMobileLobbyCategoryFilterLabel(locale);
  const closeLabel =
    locale === "fr" ? "Fermer" : locale === "en" ? "Close" : "关闭";

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
      aria-modal="true"
      aria-labelledby="mobile-lobby-category-rail-title"
      className="mobile-lobby-category-drawer fixed inset-0 z-50"
      role="dialog"
    >
      <button
        aria-label={closeLabel}
        className="mobile-lobby-category-drawer__backdrop absolute inset-0 bg-[#111210]/22 backdrop-blur-[2px]"
        type="button"
        onClick={onClose}
      />
      <aside className="mobile-lobby-category-drawer__panel absolute inset-y-0 right-0 flex w-[min(68vw,15.75rem)] flex-col overflow-hidden border-l border-[#D6D5B2] bg-white pb-[calc(1.1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-[-18px_0_34px_rgba(17,18,16,0.12)]">
        <div className="flex items-center justify-between gap-3 px-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[#096B45]/62">
              Friemi
            </p>
            <p
              id="mobile-lobby-category-rail-title"
              className="mt-1 truncate text-[22px] font-bold leading-none text-[#111210]"
            >
              {title}
            </p>
          </div>
          <button
            aria-label={closeLabel}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D6D5B2] bg-white text-[#111210] shadow-[0_10px_24px_rgba(17,18,16,0.08)] transition active:scale-95"
            type="button"
            onClick={onClose}
          >
            <X className="h-[1.125rem] w-[1.125rem]" />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex flex-col gap-2">
            {options.map(({ Icon, id, image, label }, index) => {
              const active = id === activeCategory;
              const isAll = id === "all";

              return (
                <button
                  key={id}
                  aria-pressed={active}
                  className={cn(
                    "mobile-lobby-category-drawer__item group relative flex items-center overflow-hidden rounded-[1rem] text-left transition active:scale-[0.98]",
                    isAll
                      ? "min-h-[3.05rem] gap-2 px-3 py-1.5"
                      : "min-h-[4.7rem] gap-4 px-1 py-1",
                    active
                      ? "bg-[#096B45] text-white"
                      : "bg-transparent text-[#111210] hover:bg-[#F7F4EA]",
                  )}
                  style={
                    {
                      animationDelay: `${70 + index * 34}ms`,
                    } as CSSProperties
                  }
                  type="button"
                  onClick={() => onSelectCategory(id)}
                >
                  <span
                    className={cn(
                      "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
                      active
                        ? "bg-[radial-gradient(circle_at_80%_15%,rgba(255,255,255,0.18),transparent_38%)] opacity-100"
                        : "group-active:opacity-100 group-active:bg-[#F8F2E4]",
                    )}
                  />
                  <span
                    className={cn(
                      "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[0.9rem]",
                      isAll
                        ? "h-10 w-10 items-center"
                        : "h-[4.15rem] w-[5.35rem]",
                      active ? "bg-white/14" : "bg-[#F7F4EA]",
                    )}
                  >
                    {image ? (
                      <Image
                        alt=""
                        className={cn(
                          "h-full w-full object-contain object-center p-0 transition duration-300 group-active:scale-95",
                          !isAll && "scale-[1.1]",
                        )}
                        height={124}
                        src={`/illustrations/png/${image}`}
                        width={148}
                      />
                    ) : (
                      <Icon
                        className={cn(
                          isAll ? "h-7 w-7" : "h-8 w-8",
                          active ? "text-white" : "text-[#096B45]",
                        )}
                        strokeWidth={2.35}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "relative inline-flex min-w-0 items-center gap-2",
                      !isAll && "flex-1 justify-between",
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 truncate text-[15px] font-semibold leading-tight",
                        isAll && "text-[15px]",
                      )}
                    >
                      {label}
                    </span>
                    {isAll ? null : (
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active ? "text-white/82" : "text-[#096B45]/70",
                        )}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

function MobileLobbyV23RecommendationSection({
  activities,
  className,
  copy,
  locale,
}: {
  activities: ActivityCardViewModel[];
  className?: string;
  copy: MobileLobbyV23Copy;
  locale: string;
}) {
  if (activities.length === 0) {
    return null;
  }

  return (
    <section className={cn("grid gap-4", className)}>
      <h2 className="px-1 text-[18px] font-bold leading-tight text-[#111210]">
        {copy.recommendationTitle}
      </h2>
      <div className="grid gap-4">
        {activities.map((activity) => (
          <MobileActivityListRow
            activity={activity}
            key={getActivityKey(activity)}
            locale={locale}
          />
        ))}
      </div>
    </section>
  );
}

export function MobileLobbyV23View({
  activeTab,
  activities,
  initialHasMore = false,
  initialCategoryFilter = null,
  initialFreeOnly = false,
  isSignedIn,
  locale,
  swipeActivities = [],
  viewerProfileId = null,
}: MobileLobbyV23ViewProps) {
  const copy = getMobileLobbyV23Copy(locale);
  const tabCacheKey = getMobileLobbyTabCacheKey(locale, viewerProfileId);
  const initialTabPage = {
    activities: dedupeActivities(activities),
    hasMore: initialHasMore,
    page: 1,
  };
  const [selectedTab, setSelectedTab] =
    useState<MobileLobbyV23TabId>(activeTab);
  const [activeCategory, setActiveCategory] =
    useState<MobileLobbyV23CategoryFilterId>(initialCategoryFilter ?? "all");
  const [categoryRailOpen, setCategoryRailOpen] = useState(false);
  const [tabPages, setTabPages] = useState<
    Partial<Record<MobileLobbyV23TabId, MobileLobbyTabPageState>>
  >(() => {
    const cachedTabs = mobileLobbyTabMemoryCache.get(tabCacheKey) ?? {};
    const cachedPages = Object.fromEntries(
      Object.entries(cachedTabs).map(([tab, entry]) => [tab, entry.page]),
    ) as Partial<Record<MobileLobbyV23TabId, MobileLobbyTabPageState>>;

    return {
      ...cachedPages,
      [activeTab]: initialTabPage,
    };
  });
  const [loadingTabs, setLoadingTabs] = useState<
    Partial<Record<MobileLobbyV23TabId, boolean>>
  >({});
  const [failedTabs, setFailedTabs] = useState<
    Partial<Record<MobileLobbyV23TabId, boolean>>
  >({});
  const tabPagesRef = useRef(tabPages);
  const inFlightTabsRef = useRef(new Set<MobileLobbyV23TabId>());
  const hasScheduledWarmupRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const categoryFilterOptions = useMemo<MobileLobbyV23CategoryFilterOption[]>(
    () => [
      {
        Icon: LayoutGrid,
        id: "all",
        label: getMobileLobbyAllLabel(locale),
      },
      ...activityCategoryOptions.map((category) => ({
        Icon: mobileLobbyV23CategoryIcons[category],
        id: category,
        image: activityCategoryIllustrationImages[category],
        label: getCategoryLabel(category, locale),
      })),
    ],
    [locale],
  );
  const activeCategoryLabel =
    categoryFilterOptions.find((option) => option.id === activeCategory)
      ?.label ?? getMobileLobbyAllLabel(locale);
  const visibleTabs = isSignedIn
    ? mobileLobbyV23Tabs
    : publicMobileLobbyV23Tabs;
  const displayedActiveTab = visibleTabs.includes(selectedTab)
    ? selectedTab
    : "nearby";
  const activePage = tabPages[displayedActiveTab];
  const visibleActivities = filterMobileLobbyActivitiesByPrice(
    filterMobileLobbyActivitiesByCategory(
      activePage?.activities ?? [],
      activeCategory,
    ),
    initialFreeOnly,
  );
  const canShowColdStartSwipe =
    displayedActiveTab !== "friends" && displayedActiveTab !== "mine";
  const shouldShowColdStartSwipe =
    canShowColdStartSwipe &&
    (visibleActivities.length === 0 ||
      (activeCategory !== "all" &&
        visibleActivities.length < mobileLobbySparseResultThreshold));
  const coldStartSwipeActivities = useMemo(
    () =>
      shouldShowColdStartSwipe
        ? getPrioritizedMobileLobbySwipeActivities({
            activities: [...swipeActivities, ...activities],
            category: activeCategory,
            excludedActivities:
              visibleActivities.length > 0 ? visibleActivities : [],
          })
        : [],
    [
      activeCategory,
      activities,
      shouldShowColdStartSwipe,
      swipeActivities,
      visibleActivities,
    ],
  );
  const loadTabPage = useCallback(
    async (tab: MobileLobbyV23TabId, loadNext = false, background = false) => {
      const currentPage = tabPagesRef.current[tab];
      const nextPage = loadNext ? (currentPage?.page ?? 0) + 1 : 1;
      const exposeLoadingState = !background || !currentPage;

      if (
        inFlightTabsRef.current.has(tab) ||
        (loadNext && !currentPage?.hasMore)
      ) {
        return;
      }

      inFlightTabsRef.current.add(tab);
      if (exposeLoadingState) {
        setLoadingTabs((current) => ({ ...current, [tab]: true }));
        setFailedTabs((current) => ({ ...current, [tab]: false }));
      }

      const controller = new AbortController();
      const timeoutId =
        typeof window === "undefined"
          ? null
          : window.setTimeout(() => controller.abort(), 15000);

      try {
        const result = await fetchMobileLobbyPage(
          tab,
          nextPage,
          controller.signal,
        );

        const previous = tabPagesRef.current[tab];
        const nextTabPage = {
          activities: loadNext
            ? dedupeActivities([
                ...(previous?.activities ?? []),
                ...result.activities,
              ])
            : dedupeActivities(result.activities),
          hasMore: result.hasMore,
          page: result.page,
        };
        const nextState = {
          ...tabPagesRef.current,
          [tab]: nextTabPage,
        };

        tabPagesRef.current = nextState;
        setTabPages(nextState);
        cacheMobileLobbyTabPage(tabCacheKey, tab, nextTabPage);
        retainImageSources(
          nextTabPage.activities.map((activity) =>
            getActivityCoverThumbnailUrl(
              getActivityListCoverSrc(
                activity.coverImageUrl,
                activity.category,
              ),
              192,
            ),
          ),
          4,
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to load mobile lobby tab", error);
        }

        if (exposeLoadingState) {
          setFailedTabs((current) => ({ ...current, [tab]: true }));
        }
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }

        inFlightTabsRef.current.delete(tab);
        if (exposeLoadingState) {
          setLoadingTabs((current) => ({ ...current, [tab]: false }));
        }
      }
    },
    [tabCacheKey],
  );
  const handleSelectCategory = useCallback(
    (category: MobileLobbyV23CategoryFilterId) => {
      setActiveCategory(category);
      setCategoryRailOpen(false);
      syncMobileLobbyCategorySearchParam(category);
    },
    [],
  );
  const handleSelectTab = useCallback(
    (tab: MobileLobbyV23TabId) => {
      setSelectedTab(tab);
      syncMobileLobbyTabSearchParam({
        category: activeCategory,
        freeOnly: initialFreeOnly,
        tab,
      });
    },
    [activeCategory, initialFreeOnly],
  );

  useEffect(() => {
    setSelectedTab(activeTab);
  }, [activeTab]);
  useEffect(() => {
    const nextState = {
      activities: dedupeActivities(activities),
      hasMore: initialHasMore,
      page: 1,
    };

    setTabPages((current) => {
      const next = { ...current, [activeTab]: nextState };
      tabPagesRef.current = next;
      return next;
    });
    cacheMobileLobbyTabPage(tabCacheKey, activeTab, nextState);
  }, [activeTab, activities, initialHasMore, tabCacheKey]);
  useEffect(() => {
    if (!tabPagesRef.current[displayedActiveTab]) {
      void loadTabPage(displayedActiveTab);
      return;
    }

    if (!isMobileLobbyTabCacheFresh(tabCacheKey, displayedActiveTab)) {
      void loadTabPage(displayedActiveTab, false, true);
    }
  }, [displayedActiveTab, loadTabPage, tabCacheKey]);
  useEffect(() => {
    if (hasScheduledWarmupRef.current) {
      return;
    }

    hasScheduledWarmupRef.current = true;
    const warmupTabs = (
      isSignedIn
        ? ["mine", "friends", "today", "popular"]
        : ["today", "popular"]
    ) satisfies MobileLobbyV23TabId[];
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const browserWindow = window as Window &
      typeof globalThis & {
        cancelIdleCallback?: (handle: number) => void;
        requestIdleCallback?: (
          callback: () => void,
          options?: { timeout?: number },
        ) => number;
      };

    const runWarmup = async () => {
      for (const tab of warmupTabs) {
        if (cancelled) {
          return;
        }

        if (!isMobileLobbyTabCacheFresh(tabCacheKey, tab)) {
          await loadTabPage(tab, false, true);
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, mobileLobbyWarmupIntervalMs);
        });
      }
    };

    const startWarmup = () => {
      if (!cancelled) {
        void runWarmup();
      }
    };

    timeoutHandle = window.setTimeout(() => {
      timeoutHandle = null;

      if (typeof browserWindow.requestIdleCallback === "function") {
        idleHandle = browserWindow.requestIdleCallback(startWarmup, {
          timeout: 3_000,
        });
      } else {
        startWarmup();
      }
    }, mobileLobbyWarmupDelayMs);

    return () => {
      cancelled = true;

      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }

      if (
        idleHandle !== null &&
        typeof browserWindow.cancelIdleCallback === "function"
      ) {
        browserWindow.cancelIdleCallback(idleHandle);
      }
    };
  }, [isSignedIn, loadTabPage, tabCacheKey]);
  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !activePage?.hasMore || loadingTabs[displayedActiveTab]) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadTabPage(displayedActiveTab, true);
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, [activePage?.hasMore, displayedActiveTab, loadTabPage, loadingTabs]);
  const emptyTitle =
    displayedActiveTab === "friends"
      ? copy.friendEmptyTitle
      : displayedActiveTab === "mine"
        ? copy.mineEmptyTitle
        : copy.emptyTitle;
  const emptyDescription =
    displayedActiveTab === "friends"
      ? copy.friendEmptyDescription
      : displayedActiveTab === "mine"
        ? copy.mineEmptyDescription
        : copy.emptyDescription;
  const shouldShowTabLoading =
    !activePage &&
    loadingTabs[displayedActiveTab] &&
    !failedTabs[displayedActiveTab];
  const shouldShowTabFailed =
    !activePage && Boolean(failedTabs[displayedActiveTab]);

  visibleActivities.slice(0, 4).forEach((activity) => {
    const source = getActivityCoverThumbnailUrl(
      getActivityListCoverSrc(activity.coverImageUrl, activity.category),
      192,
    );

    if (source) {
      preload(source, {
        as: "image",
        fetchPriority: "high",
        referrerPolicy: "no-referrer",
      });
    }
  });

  return (
    <section className="mobile-v23-lobby app-mobile-page-shell [--app-mobile-page-top-gap:1.25rem] [--app-mobile-page-bottom-gap:1.1rem] bg-white text-[#111210]">
      <MobileLobbyV23CategoryRail
        activeCategory={activeCategory}
        isOpen={categoryRailOpen}
        locale={locale}
        onClose={() => setCategoryRailOpen(false)}
        onSelectCategory={handleSelectCategory}
        options={categoryFilterOptions}
      />
      <div className="mx-auto flex w-full max-w-[430px] flex-col px-5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-h-[31px] text-[31px] font-bold leading-none tracking-normal text-[#111210]">
            {copy.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label={getMobileLobbyCategoryFilterLabel(locale)}
              className={cn(
                "mt-1 inline-flex h-10 items-center justify-center gap-1 rounded-full px-3 text-[12px] font-semibold shadow-[0_12px_24px_rgba(17,18,16,0.08)] transition active:scale-[0.96]",
                activeCategory === "all"
                  ? "border border-[#D6D5B2] bg-white text-[#096B45]"
                  : "bg-[#096B45] text-white",
              )}
              type="button"
              onClick={() => setCategoryRailOpen(true)}
            >
              <Rows3 className="h-4 w-4" strokeWidth={2.4} />
              <span className="max-w-[3.25rem] truncate">
                {activeCategoryLabel}
              </span>
            </button>
          </div>
        </div>

        <nav
          aria-label={copy.title}
          className="-mx-5 mt-9 flex gap-8 overflow-x-auto border-b border-[#EEEDE4] px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleTabs.map((tab) => (
            <button
              aria-current={displayedActiveTab === tab ? "page" : undefined}
              className={cn(
                "relative shrink-0 pb-4 text-left text-[19px] font-bold tracking-normal transition active:scale-[0.98]",
                displayedActiveTab === tab
                  ? "text-[#111210]"
                  : "text-[#111210]/28",
              )}
              key={tab}
              type="button"
              onClick={() => handleSelectTab(tab)}
            >
              {copy.tabs[tab]}
              {displayedActiveTab === tab ? (
                <span className="absolute bottom-0 left-0 h-1.5 w-full rounded-full bg-[#369758] shadow-[0_7px_15px_rgba(54,151,88,0.28)]" />
              ) : null}
            </button>
          ))}
        </nav>

        {shouldShowTabLoading ? (
          <div className="mt-10 rounded-[1.35rem] border border-[#D7D5C8] bg-white px-5 py-6 text-center shadow-[0_16px_38px_rgba(17,18,16,0.05)]">
            <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[#D6D5B2] border-t-[#096B45]" />
            <p className="mt-3 text-[16px] font-bold">{copy.loadingLabel}</p>
          </div>
        ) : shouldShowTabFailed ? (
          <div className="mt-10 rounded-[1.35rem] border border-[#D7D5C8] bg-white px-5 py-6 text-center shadow-[0_16px_38px_rgba(17,18,16,0.05)]">
            <p className="text-[18px] font-bold">{copy.loadFailedTitle}</p>
            <button
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#096B45] px-5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(9,107,69,0.18)] active:scale-[0.98]"
              type="button"
              onClick={() => loadTabPage(displayedActiveTab)}
            >
              {copy.retryLabel}
            </button>
          </div>
        ) : visibleActivities.length > 0 ? (
          <>
            <div className="mt-5 grid gap-5">
              {visibleActivities.map((activity, index) => (
                <MobileActivityListRow
                  activity={activity}
                  key={getActivityKey(activity)}
                  locale={locale}
                  prioritizeImage={index < 4}
                  showHostedBadge={
                    displayedActiveTab === "mine" &&
                    Boolean(viewerProfileId) &&
                    activity.organizerId === viewerProfileId
                  }
                />
              ))}
            </div>
            <div
              ref={loadMoreRef}
              className="flex min-h-12 items-center justify-center"
            >
              {loadingTabs[displayedActiveTab] ? (
                <span
                  aria-label={copy.loadingLabel}
                  className="h-5 w-5 animate-spin rounded-full border-2 border-[#D6D5B2] border-t-[#096B45]"
                />
              ) : failedTabs[displayedActiveTab] && activePage?.hasMore ? (
                <button
                  className="text-sm font-semibold text-[#096B45]"
                  type="button"
                  onClick={() => loadTabPage(displayedActiveTab, true)}
                >
                  {copy.retryLabel}
                </button>
              ) : null}
            </div>
            {coldStartSwipeActivities.length > 0 ? (
              <div className="mt-7 border-t border-[#EEEDE4] pb-10 pt-5">
                <MobileLobbyV23RecommendationSection
                  activities={coldStartSwipeActivities}
                  copy={copy}
                  locale={locale}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="mt-10 bg-white px-5 py-6 text-center">
              <Image
                alt=""
                className="mx-auto h-28 w-28 scale-[1.45] object-contain"
                height={2048}
                src={brand.emptyContentIllustrationPath}
                width={2048}
              />
              <p className="mt-3 text-[18px] font-bold">{emptyTitle}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#111210]/58">
                {emptyDescription}
              </p>
            </div>
            {coldStartSwipeActivities.length > 0 ? (
              <div className="mt-7 pb-10">
                <MobileLobbyV23RecommendationSection
                  activities={coldStartSwipeActivities}
                  copy={copy}
                  locale={locale}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
