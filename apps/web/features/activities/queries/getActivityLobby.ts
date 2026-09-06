import { unstable_cache } from "next/cache";
import type { ActivityCategory } from "@chill-club/shared";
import { prisma } from "@/lib/prisma";
import { attachActivityFavoriteStates } from "@/features/favorites/queries/getViewerActivityFavorite";
import { attachPublicEventFavoriteStates } from "@/features/favorites/queries/getViewerActivityFavorite";
import { getActivityFriendSignalMap } from "@/features/friends/queries/getActivityFriendSignals";
import {
  getViewerFollowedProfileIds,
  getViewerFriendIds,
} from "@/features/friends/queries/getViewerFriendIds";
import {
  getPublicEventCardViewModel,
  publicEventSelect,
} from "@/features/public-events/queries/getPublicEvents";
import type { ActivityCardViewModel } from "../types";
import {
  activityCardSelect,
  getActivityCoverTone,
  getActivityCardViewModel,
  getLegacyPublicActivityInfoWhere,
  getVisibleActivityWhere,
} from "./getActivities";
import {
  getActivityFloatingNow,
  getActivityTimeState,
} from "../utils/activityDisplay";
import { applyOrganizerParticipationDefaults } from "./applyOrganizerParticipationDefaults";
import { compareLobbyActivityStatusAndOwnership } from "../utils/lobbyActivitySort";
import { dedupeActivityCards } from "../utils/activityCardIdentity";
import {
  applyPrivateActivityCardAccess,
  canAccessPrivateActivityCard,
} from "../utils/privateActivityCardAccess";
import type { Prisma } from "@prisma/client";

const activityLobbyFeedPageSize = 8;
const activityLobbySectionLimit = activityLobbyFeedPageSize * 6;
const activityLobbyPreviewLimit = activityLobbyFeedPageSize * 2;
const activityLobbyStarterLimit = 8;
const activityLobbySwipeLimit = 24;
const activityLobbySwipeExcludeLimit = 160;
const activityLobbySwipePublicEventRatio = 3;
const activityLobbySwipeTeamRatio = 1;
const mobileHomeTrendingTeamLimit = 8;
const mobileHomeTrendingTeamCandidateLimit = 48;
const visibleLobbyParticipationStatuses = [
  "JOINED",
  "APPROVED",
  "PENDING",
] as const;
export const OPEN_LOBBY_ACTIVITIES_TAG = "open-lobby-activities";

const baseTeamCardWhere: Prisma.ActivityWhereInput = {
  type: { not: "PUBLIC_EVENT" },
};

const strictTeamCardWhere: Prisma.ActivityWhereInput = {
  AND: [baseTeamCardWhere, { NOT: getLegacyPublicActivityInfoWhere() }],
};

const lobbyParticipationSelect = {
  activity: {
    select: activityCardSelect,
  },
} as const;

const lobbyFavoriteSelect = {
  createdAt: true,
  activity: {
    select: activityCardSelect,
  },
} as const;

const getCachedOpenLobbyActivities = unstable_cache(
  async () =>
    prisma.activity.findMany({
      where: {
        AND: [
          getVisibleActivityWhere({
            includeEnded: false,
            includePast: false,
            visibility: null,
          }),
          strictTeamCardWhere,
        ],
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: activityLobbySectionLimit,
      select: activityCardSelect,
    }),
  ["open-lobby-activities"],
  { revalidate: 60, tags: [OPEN_LOBBY_ACTIVITIES_TAG] },
);

export type ActivityLobbySectionId =
  | "open"
  | "created"
  | "joined"
  | "favorites"
  | "friendHosted"
  | "friendJoined";

export type ActivityLobbyFeedStatus = "all" | "ongoing" | "ended";

export type MobileActivityLobbyTabId =
  | "nearby"
  | "mine"
  | "friends"
  | "today"
  | "popular";

export type MobileActivityLobbyPage = {
  activities: ActivityCardViewModel[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  tab: MobileActivityLobbyTabId;
};

export type ActivityLobbyFeedPage = {
  activities: ActivityCardViewModel[];
  countsApproximate?: boolean;
  endedCount: number;
  ongoingCount: number;
  page: number;
  pageSize: number;
  status: ActivityLobbyFeedStatus;
  totalCount: number;
  totalPages: number;
};

export type ActivityLobbyViewModel = {
  allActivities: ActivityCardViewModel[];
  allActivityFeed: ActivityLobbyFeedPage;
  openActivities: ActivityCardViewModel[];
  createdActivities: ActivityCardViewModel[];
  joinedActivities: ActivityCardViewModel[];
  favoriteActivities: ActivityCardViewModel[];
  friendHostedActivities: ActivityCardViewModel[];
  friendJoinedActivities: ActivityCardViewModel[];
  starterActivities: ActivityCardViewModel[];
};

type LobbyActivityRecord = Prisma.ActivityGetPayload<{
  select: typeof activityCardSelect;
}>;

type ActivityLobbyQueryContext = {
  accessibleActiveWhere: Prisma.ActivityWhereInput;
  accessibleWhere: Prisma.ActivityWhereInput;
  activeVisibleWhere: Prisma.ActivityWhereInput;
  archivedWhere: Prisma.ActivityWhereInput;
  mutualFollowIds: string[];
  friendIds: string[];
  ownTeamCardWhere: Prisma.ActivityWhereInput;
  teamCardWhere: Prisma.ActivityWhereInput;
  visibleWhere: Prisma.ActivityWhereInput;
};

async function decorateLobbyActivities(
  activities: ActivityCardViewModel[],
  viewerProfileId: string,
  viewerFriendIds: string[],
  viewerAccessFriendIds: string[] = viewerFriendIds,
) {
  const publicEventActivities = activities.filter(
    (activity) =>
      activity.type === "PUBLIC_EVENT" && Boolean(activity.publicEventId),
  );
  const teamActivities = activities.filter(
    (activity) => activity.type !== "PUBLIC_EVENT",
  );
  const [publicEventActivitiesWithState, teamActivitiesWithState] =
    await Promise.all([
      attachPublicEventFavoriteStates(
        publicEventActivities.map((activity) => ({
          id: activity.publicEventId ?? activity.id,
          title: activity.title,
          description: activity.description,
          category: activity.category,
          city: activity.city,
          address: activity.address,
          latitude: activity.latitude,
          longitude: activity.longitude,
          startAt: activity.startAt,
          endAt: activity.endAt,
          priceType: "FREE",
          priceText: activity.priceText,
          coverImageUrl: activity.coverImageUrl,
          officialUrl: activity.officialUrl ?? null,
          ticketUrl: activity.ticketUrl ?? null,
          ticketLabel: activity.ticketLabel ?? null,
          status: "SCHEDULED",
          favoriteCount: activity.favoriteCount,
          teamCount: activity.participantCount,
          isFavorited: activity.isFavorited,
        })),
        viewerProfileId,
      ),
      attachActivityFavoriteStates(teamActivities, viewerProfileId),
    ]);
  const [teamActivitySignalMap, viewerParticipationByActivityId] =
    await Promise.all([
      getActivityFriendSignalMap(
        teamActivities.map((activity) => activity.id),
        viewerProfileId,
        viewerFriendIds,
      ),
      prisma.activityParticipant
        .findMany({
          where: {
            userProfileId: viewerProfileId,
            activityId: {
              in: teamActivitiesWithState.map((activity) => activity.id),
            },
          },
          select: {
            activityId: true,
            status: true,
          },
          orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
        })
        .then(
          (participations) =>
            new Map(
              participations.map((participation) => [
                participation.activityId,
                participation.status,
              ]),
            ),
        ),
    ]);
  const publicEventFavoriteById = new Map(
    publicEventActivitiesWithState.map((activity) => [activity.id, activity]),
  );
  const teamActivityById = new Map(
    teamActivitiesWithState.map((activity) => {
      const viewerParticipationStatus =
        viewerParticipationByActivityId.get(activity.id) ?? null;
      const viewerCanAccess = canAccessPrivateActivityCard(activity, {
        friendIds: viewerAccessFriendIds,
        viewerParticipationStatus,
        viewerProfileId,
      });
      const activityWithViewerState: ActivityCardViewModel = {
        ...activity,
        friendSignal: teamActivitySignalMap.get(activity.id) ?? null,
        viewerCanAccess,
        viewerParticipationStatus,
      };

      return [
        activity.id,
        applyPrivateActivityCardAccess(
          activityWithViewerState,
          viewerCanAccess,
        ),
      ] as const;
    }),
  );

  const activitiesWithViewerState = activities.map((activity) => {
    if (activity.type === "PUBLIC_EVENT" && activity.publicEventId) {
      const publicEventId = activity.publicEventId ?? activity.id;

      return {
        ...activity,
        isFavorited: publicEventFavoriteById.get(publicEventId)?.isFavorited,
      };
    }

    return teamActivityById.get(activity.id) ?? activity;
  });

  return applyOrganizerParticipationDefaults(activitiesWithViewerState);
}

function mapPublicEventToActivityCard(
  publicEvent: ReturnType<typeof getPublicEventCardViewModel>,
): ActivityCardViewModel {
  return {
    id: publicEvent.id,
    publicEventId: publicEvent.id,
    title: publicEvent.title,
    description: publicEvent.description,
    type: "PUBLIC_EVENT",
    category: publicEvent.category,
    city: publicEvent.city,
    address: publicEvent.address,
    latitude: publicEvent.latitude,
    longitude: publicEvent.longitude,
    startAt: publicEvent.startAt,
    endAt: publicEvent.endAt,
    capacity: 0,
    coverImageUrl: publicEvent.coverImageUrl,
    favoriteCount: publicEvent.favoriteCount,
    participantCount: publicEvent.teamCount,
    priceText: publicEvent.priceText ?? "",
    status: "RECRUITING",
    visibility: "PUBLIC",
    coverTone: getActivityCoverTone(publicEvent.id),
    autoCreatedTeam: null,
    isActivityInfo: true,
    officialUrl: publicEvent.officialUrl,
    ticketUrl: publicEvent.ticketUrl,
    ticketLabel: publicEvent.ticketLabel,
    merchant: null,
    isFavorited: publicEvent.isFavorited,
  };
}

export async function getLobbySwipePublicEventActivities(
  viewerProfileId?: string | null,
  options: {
    excludeIds?: string[];
    limit?: number;
  } = {},
) {
  const page = await getLobbySwipePublicEventActivityPage(
    viewerProfileId,
    options,
  );

  return page.activities;
}

export async function getLobbySwipePublicEventActivityPage(
  viewerProfileId?: string | null,
  options: {
    excludeIds?: string[];
    limit?: number;
  } = {},
) {
  const limit = getLobbySwipeLimit(options.limit);
  const excludeIds = getLobbySwipeExcludeIds(options.excludeIds);

  if (
    !viewerProfileId &&
    excludeIds.activityIds.length === 0 &&
    excludeIds.publicEventIds.length === 0
  ) {
    return getCachedAnonymousLobbySwipePublicEventActivityPage(limit);
  }

  return getLobbySwipePublicEventActivityPageUncached(viewerProfileId, {
    excludeIds,
    limit,
  });
}

function getLobbySwipeLimit(limit?: number) {
  return Math.min(
    Math.max(Math.floor(limit ?? activityLobbySwipeLimit), 1),
    activityLobbySwipeLimit,
  );
}

function getLobbySwipeExcludeIds(excludeIds?: string[]) {
  const activityIds = new Set<string>();
  const publicEventIds = new Set<string>();

  for (const rawId of excludeIds ?? []) {
    const id = rawId.trim();

    if (!id) {
      continue;
    }

    if (id.startsWith("activity:")) {
      activityIds.add(id.slice("activity:".length));
      continue;
    }

    if (id.startsWith("public:")) {
      publicEventIds.add(id.slice("public:".length));
      continue;
    }

    activityIds.add(id);
    publicEventIds.add(id);
  }

  return {
    activityIds: Array.from(activityIds).slice(
      0,
      activityLobbySwipeExcludeLimit,
    ),
    publicEventIds: Array.from(publicEventIds).slice(
      0,
      activityLobbySwipeExcludeLimit,
    ),
  };
}

function getRatioedLobbySwipeActivities({
  limit,
  publicEventActivities,
  teamActivities,
}: {
  limit: number;
  publicEventActivities: ActivityCardViewModel[];
  teamActivities: ActivityCardViewModel[];
}) {
  const activities: ActivityCardViewModel[] = [];
  const targetCount = limit + 1;
  let publicEventIndex = 0;
  let teamIndex = 0;

  while (
    activities.length < targetCount &&
    (publicEventIndex < publicEventActivities.length ||
      teamIndex < teamActivities.length)
  ) {
    let added = 0;

    for (
      let count = 0;
      count < activityLobbySwipePublicEventRatio &&
      activities.length < targetCount &&
      publicEventIndex < publicEventActivities.length;
      count += 1
    ) {
      activities.push(publicEventActivities[publicEventIndex]);
      publicEventIndex += 1;
      added += 1;
    }

    for (
      let count = 0;
      count < activityLobbySwipeTeamRatio &&
      activities.length < targetCount &&
      teamIndex < teamActivities.length;
      count += 1
    ) {
      activities.push(teamActivities[teamIndex]);
      teamIndex += 1;
      added += 1;
    }

    if (added === 0) {
      break;
    }
  }

  return {
    activities: activities.slice(0, limit),
    hasMore:
      activities.length > limit ||
      publicEventIndex < publicEventActivities.length ||
      teamIndex < teamActivities.length,
  };
}

async function getLobbySwipePublicEventActivityPageUncached(
  viewerProfileId?: string | null,
  options: {
    excludeIds?: ReturnType<typeof getLobbySwipeExcludeIds>;
    limit?: number;
  } = {},
) {
  const now = new Date();
  const limit = getLobbySwipeLimit(options.limit);
  const excludeIds = options.excludeIds ?? getLobbySwipeExcludeIds();
  const [publicEvents, teamActivities] = await Promise.all([
    prisma.publicEvent.findMany({
      where: {
        id:
          excludeIds.publicEventIds.length > 0
            ? {
                notIn: excludeIds.publicEventIds,
              }
            : undefined,
        OR: [
          {
            startAt: {
              gt: now,
            },
          },
          {
            endAt: {
              gte: now,
            },
          },
        ],
        status: "SCHEDULED",
        visibility: "PUBLIC",
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: publicEventSelect,
    }),
    prisma.activity.findMany({
      where: {
        AND: [
          getVisibleActivityWhere({
            includeEnded: false,
            includePast: false,
            visibility: null,
          }),
          { visibility: "PUBLIC" },
          strictTeamCardWhere,
          excludeIds.activityIds.length > 0
            ? {
                id: {
                  notIn: excludeIds.activityIds,
                },
              }
            : {},
        ],
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: activityCardSelect,
    }),
  ]);
  const publicEventCards = publicEvents.map(getPublicEventCardViewModel);
  const cardsWithFavoriteState = await attachPublicEventFavoriteStates(
    publicEventCards,
    viewerProfileId,
  );
  const teamCards = teamActivities.map(getActivityCardViewModel);
  const decoratedTeamCards = viewerProfileId
    ? await decorateLobbyActivities(
        teamCards,
        viewerProfileId,
        await getViewerFollowedProfileIds(viewerProfileId),
      )
    : teamCards;
  const publicEventActivities = cardsWithFavoriteState.map(
    mapPublicEventToActivityCard,
  );
  const ratioedActivities = getRatioedLobbySwipeActivities({
    limit,
    publicEventActivities,
    teamActivities: decoratedTeamCards,
  });

  return {
    activities: ratioedActivities.activities,
    hasMore: ratioedActivities.hasMore,
  };
}

const getCachedAnonymousLobbySwipePublicEventActivityPage = unstable_cache(
  async (limit: number) =>
    getLobbySwipePublicEventActivityPageUncached(null, { limit }),
  ["anonymous-lobby-swipe-mixed-activities-v2"],
  { revalidate: 60 },
);

function isJoinableTeamCard(activity: ActivityCardViewModel) {
  return activity.type !== "PUBLIC_EVENT" && !activity.isActivityInfo;
}

function getLobbyActivityKey(activity: ActivityCardViewModel) {
  if (activity.type === "PUBLIC_EVENT" && activity.publicEventId) {
    return `public:${activity.publicEventId}`;
  }

  return `activity:${activity.id}`;
}

function isEndedLobbyActivity(activity: ActivityCardViewModel) {
  return getActivityTimeState(activity) === "ENDED";
}

function compareLobbyActivityTime(
  left: ActivityCardViewModel,
  right: ActivityCardViewModel,
) {
  const leftEnded = isEndedLobbyActivity(left);
  const rightEnded = isEndedLobbyActivity(right);

  if (leftEnded !== rightEnded) {
    return leftEnded ? 1 : -1;
  }

  const leftTime = new Date(left.startAt).getTime();
  const rightTime = new Date(right.startAt).getTime();

  return leftEnded
    ? rightTime - leftTime || left.id.localeCompare(right.id)
    : leftTime - rightTime || left.id.localeCompare(right.id);
}

function getMobileHomeTrendingFreshnessScore(
  activity: ActivityCardViewModel,
  now: Date,
) {
  const timeState = getActivityTimeState(activity, now);

  if (timeState === "ENDED") {
    return -1000;
  }

  if (timeState === "ONGOING") {
    return 28;
  }

  const hoursUntilStart =
    (new Date(activity.startAt).getTime() - now.getTime()) / (60 * 60 * 1000);

  if (hoursUntilStart <= 24) {
    return 22;
  }

  if (hoursUntilStart <= 72) {
    return 14;
  }

  if (hoursUntilStart <= 168) {
    return 8;
  }

  return 2;
}

export function getMobileHomeTrendingTeamScore(
  activity: ActivityCardViewModel,
  now = getActivityFloatingNow(),
) {
  return (
    activity.participantCount * 120 +
    activity.favoriteCount * 24 +
    (activity.friendSignal?.count ?? 0) * 40 +
    getMobileHomeTrendingFreshnessScore(activity, now)
  );
}

export function sortMobileHomeTrendingTeamActivities(
  activities: ActivityCardViewModel[],
  now = getActivityFloatingNow(),
) {
  return activities.filter(isJoinableTeamCard).sort((left, right) => {
    const scoreDiff =
      getMobileHomeTrendingTeamScore(right, now) -
      getMobileHomeTrendingTeamScore(left, now);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return compareLobbyActivityTime(left, right);
  });
}

function getMobileHomeTrendingTeamLimit(limit?: number) {
  return Math.min(
    Math.max(Math.floor(limit ?? mobileHomeTrendingTeamLimit), 1),
    mobileHomeTrendingTeamLimit,
  );
}

export async function getMobileHomeTrendingTeamActivities(
  viewerProfileId?: string | null,
  options: { limit?: number } = {},
) {
  const limit = getMobileHomeTrendingTeamLimit(options.limit);

  if (!viewerProfileId) {
    return getCachedAnonymousMobileHomeTrendingTeamActivities(limit);
  }

  return getMobileHomeTrendingTeamActivitiesUncached(viewerProfileId, {
    limit,
  });
}

async function getMobileHomeTrendingTeamActivitiesUncached(
  viewerProfileId?: string | null,
  options: { limit?: number } = {},
) {
  const now = getActivityFloatingNow();
  const limit = getMobileHomeTrendingTeamLimit(options.limit);
  const activityRows = await prisma.activity.findMany({
    where: {
      AND: [
        getVisibleActivityWhere({
          includeEnded: false,
          includePast: false,
          visibility: null,
          now,
        }),
        { visibility: "PUBLIC" },
        strictTeamCardWhere,
      ],
    },
    orderBy: [
      {
        participants: {
          _count: "desc",
        },
      },
      {
        favorites: {
          _count: "desc",
        },
      },
      { startAt: "asc" },
      { id: "asc" },
    ],
    take: mobileHomeTrendingTeamCandidateLimit,
    select: activityCardSelect,
  });
  const teamCards = activityRows.map(getActivityCardViewModel);
  const decoratedCards = viewerProfileId
    ? await decorateLobbyActivities(
        teamCards,
        viewerProfileId,
        await getViewerFollowedProfileIds(viewerProfileId),
      )
    : await applyOrganizerParticipationDefaults(teamCards);

  return sortMobileHomeTrendingTeamActivities(decoratedCards, now).slice(
    0,
    limit,
  );
}

const getCachedAnonymousMobileHomeTrendingTeamActivities = unstable_cache(
  async (limit: number) =>
    getMobileHomeTrendingTeamActivitiesUncached(null, { limit }),
  ["anonymous-mobile-home-trending-team-activities-v3"],
  { revalidate: 60, tags: [OPEN_LOBBY_ACTIVITIES_TAG] },
);

function getActivityFloatingDayStart(now = getActivityFloatingNow()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function getArchivedLobbyActivityWhere(
  now = getActivityFloatingNow(),
): Prisma.ActivityWhereInput {
  const todayStart = getActivityFloatingDayStart(now);

  return {
    OR: [
      {
        status: "CANCELLED",
      },
      {
        status: "ENDED",
      },
      {
        endAt: {
          lt: now,
        },
      },
      {
        AND: [
          {
            endAt: null,
          },
          {
            startAt: {
              lt: todayStart,
            },
          },
        ],
      },
    ],
  };
}

function getActivityLobbyTotalPages(totalCount: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

function getActivityLobbyPage(requestedPage: number, totalPages: number) {
  if (!Number.isFinite(requestedPage)) {
    return 1;
  }

  return Math.min(Math.max(Math.floor(requestedPage), 1), totalPages);
}

export function createEmptyActivityLobbyFeedPage(
  status: ActivityLobbyFeedStatus = "all",
): ActivityLobbyFeedPage {
  return {
    activities: [],
    endedCount: 0,
    ongoingCount: 0,
    page: 1,
    pageSize: activityLobbyFeedPageSize,
    status,
    totalCount: 0,
    totalPages: 1,
  };
}

function buildLobbyPriorityFeed({
  createdActivities,
  favoriteActivities,
  feedActivities,
  friendHostedActivities,
  friendJoinedActivities,
  joinedActivities,
  openActivities,
  viewerProfileId,
}: {
  createdActivities: ActivityCardViewModel[];
  favoriteActivities: ActivityCardViewModel[];
  feedActivities: ActivityCardViewModel[];
  friendHostedActivities: ActivityCardViewModel[];
  friendJoinedActivities: ActivityCardViewModel[];
  joinedActivities: ActivityCardViewModel[];
  openActivities: ActivityCardViewModel[];
  viewerProfileId: string;
}) {
  const priorityGroups = [
    createdActivities,
    joinedActivities,
    favoriteActivities,
    friendHostedActivities,
    friendJoinedActivities,
    openActivities,
  ].map((activities) => [...activities].sort(compareLobbyActivityTime));
  const priorityKeys = new Set(
    priorityGroups.flatMap((activities) => activities.map(getLobbyActivityKey)),
  );
  const remainingFeedActivities = [...feedActivities]
    .filter((activity) => !priorityKeys.has(getLobbyActivityKey(activity)))
    .sort(compareLobbyActivityTime);
  const orderedActivities = [
    ...priorityGroups.flat(),
    ...remainingFeedActivities,
  ];

  return Array.from(
    new Map(
      orderedActivities.map((activity) => [
        getLobbyActivityKey(activity),
        activity,
      ]),
    ).values(),
  ).sort((left, right) =>
    compareLobbyActivityStatusAndOwnership(left, right, {
      viewerProfileId,
    }),
  );
}

async function getLobbyQueryContext(
  viewerProfileId: string,
  mutualFollowIds: string[],
  followedProfileIds: string[] = mutualFollowIds,
): Promise<ActivityLobbyQueryContext> {
  const activityNow = getActivityFloatingNow();
  const visibleWhere = getVisibleActivityWhere({
    includeEnded: true,
    includePast: true,
    visibility: null,
    now: activityNow,
  });
  const activeVisibleWhere = getVisibleActivityWhere({
    includeEnded: false,
    includePast: false,
    visibility: null,
    now: activityNow,
  });
  const teamCardWhere = strictTeamCardWhere;
  const ownTeamCardWhere = baseTeamCardWhere;
  const getAccessibleWhere = (
    baseWhere: Prisma.ActivityWhereInput,
  ): Prisma.ActivityWhereInput => ({
    AND: [
      baseWhere,
      {
        OR: [
          {
            visibility: {
              in: ["PUBLIC", "PRIVATE"],
            },
          },
          {
            organizerId: viewerProfileId,
          },
          {
            participants: {
              some: {
                userProfileId: viewerProfileId,
                status: {
                  in: [...visibleLobbyParticipationStatuses],
                },
              },
            },
          },
        ],
      },
    ],
  });
  const accessibleWhere = getAccessibleWhere(visibleWhere);
  const accessibleActiveWhere = getAccessibleWhere(activeVisibleWhere);
  const archivedWhere = getArchivedLobbyActivityWhere(activityNow);

  return {
    accessibleActiveWhere,
    accessibleWhere,
    activeVisibleWhere,
    archivedWhere,
    mutualFollowIds,
    friendIds: followedProfileIds,
    ownTeamCardWhere,
    teamCardWhere,
    visibleWhere,
  };
}

export async function getActivityLobbyFeedPage(
  viewerProfileId: string,
  options: {
    category?: ActivityCategory;
    context?: ActivityLobbyQueryContext;
    decorate?: boolean;
    page?: number;
    skipCounts?: boolean;
    status?: ActivityLobbyFeedStatus;
  } = {},
): Promise<ActivityLobbyFeedPage> {
  let context = options.context;

  if (!context) {
    const [mutualFollowIds, followedProfileIds] = await Promise.all([
      getViewerFriendIds(viewerProfileId),
      getViewerFollowedProfileIds(viewerProfileId),
    ]);

    context = await getLobbyQueryContext(
      viewerProfileId,
      mutualFollowIds,
      followedProfileIds,
    );
  }

  const decorate = options.decorate ?? true;
  const status = options.status ?? "all";
  const requestedPage = options.page ?? 1;
  const categoryWhere: Prisma.ActivityWhereInput = options.category
    ? { category: options.category }
    : {};
  const ongoingWhere: Prisma.ActivityWhereInput = {
    AND: [context.accessibleActiveWhere, strictTeamCardWhere, categoryWhere],
  };
  const endedWhere: Prisma.ActivityWhereInput = {
    AND: [
      context.accessibleWhere,
      strictTeamCardWhere,
      context.archivedWhere,
      categoryWhere,
    ],
  };

  if (options.skipCounts && requestedPage === 1 && status === "all") {
    const ongoingRaw = await prisma.activity.findMany({
      where: ongoingWhere,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: activityLobbyFeedPageSize + 1,
      select: activityCardSelect,
    });
    const ongoingHasMore = ongoingRaw.length > activityLobbyFeedPageSize;
    const ongoingActivities = ongoingRaw.slice(0, activityLobbyFeedPageSize);
    let endedActivities: LobbyActivityRecord[] = [];
    let endedHasMore = false;

    if (ongoingActivities.length < activityLobbyFeedPageSize) {
      const endedTake =
        activityLobbyFeedPageSize - ongoingActivities.length + 1;
      const endedRaw = await prisma.activity.findMany({
        where: endedWhere,
        orderBy: [{ startAt: "desc" }, { id: "asc" }],
        take: endedTake,
        select: activityCardSelect,
      });
      endedHasMore =
        endedRaw.length > activityLobbyFeedPageSize - ongoingActivities.length;
      endedActivities = endedRaw.slice(
        0,
        activityLobbyFeedPageSize - ongoingActivities.length,
      );
    }

    const activities = [...ongoingActivities, ...endedActivities];
    const ongoingCount = ongoingHasMore
      ? activityLobbyFeedPageSize + 1
      : ongoingActivities.length;
    const endedCount = endedHasMore
      ? Math.max(endedActivities.length + 1, 1)
      : endedActivities.length;
    const totalCount = ongoingCount + endedCount;
    const hasMorePages =
      activities.length === activityLobbyFeedPageSize &&
      (ongoingHasMore || endedHasMore);
    const totalPages = hasMorePages
      ? Math.max(
          2,
          getActivityLobbyTotalPages(totalCount, activityLobbyFeedPageSize),
        )
      : getActivityLobbyTotalPages(totalCount, activityLobbyFeedPageSize);
    const activityCards = activities.map(getActivityCardViewModel);

    return {
      activities: decorate
        ? await decorateLobbyActivities(
            activityCards,
            viewerProfileId,
            context.friendIds,
            context.mutualFollowIds,
          )
        : activityCards,
      countsApproximate: true,
      endedCount,
      ongoingCount,
      page: 1,
      pageSize: activityLobbyFeedPageSize,
      status,
      totalCount,
      totalPages,
    };
  }

  const [ongoingCount, endedCount] = await Promise.all([
    prisma.activity.count({ where: ongoingWhere }),
    prisma.activity.count({ where: endedWhere }),
  ]);
  const totalCount =
    status === "ongoing"
      ? ongoingCount
      : status === "ended"
        ? endedCount
        : ongoingCount + endedCount;
  const totalPages = getActivityLobbyTotalPages(
    totalCount,
    activityLobbyFeedPageSize,
  );
  const page = getActivityLobbyPage(options.page ?? 1, totalPages);
  const offset = (page - 1) * activityLobbyFeedPageSize;
  let activities: LobbyActivityRecord[] = [];

  if (totalCount > 0 && status === "ongoing") {
    activities = await prisma.activity.findMany({
      where: ongoingWhere,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      skip: offset,
      take: activityLobbyFeedPageSize,
      select: activityCardSelect,
    });
  } else if (totalCount > 0 && status === "ended") {
    activities = await prisma.activity.findMany({
      where: endedWhere,
      orderBy: [{ startAt: "desc" }, { id: "asc" }],
      skip: offset,
      take: activityLobbyFeedPageSize,
      select: activityCardSelect,
    });
  } else if (totalCount > 0) {
    const activeTake =
      offset < ongoingCount
        ? Math.min(activityLobbyFeedPageSize, ongoingCount - offset)
        : 0;
    const endedTake = activityLobbyFeedPageSize - activeTake;
    const endedSkip = Math.max(0, offset - ongoingCount);
    const [ongoingActivities, endedActivities] = await Promise.all([
      activeTake > 0
        ? prisma.activity.findMany({
            where: ongoingWhere,
            orderBy: [{ startAt: "asc" }, { id: "asc" }],
            skip: offset,
            take: activeTake,
            select: activityCardSelect,
          })
        : Promise.resolve([]),
      endedTake > 0
        ? prisma.activity.findMany({
            where: endedWhere,
            orderBy: [{ startAt: "desc" }, { id: "asc" }],
            skip: endedSkip,
            take: endedTake,
            select: activityCardSelect,
          })
        : Promise.resolve([]),
    ]);

    activities = [...ongoingActivities, ...endedActivities];
  }

  const activityCards = activities.map(getActivityCardViewModel);

  return {
    activities: decorate
      ? await decorateLobbyActivities(
          activityCards,
          viewerProfileId,
          context.friendIds,
          context.mutualFollowIds,
        )
      : activityCards,
    endedCount,
    ongoingCount,
    page,
    pageSize: activityLobbyFeedPageSize,
    status,
    totalCount,
    totalPages,
  };
}

async function getOpenLobbySection(
  viewerProfileId: string,
  context: ActivityLobbyQueryContext,
) {
  const [openActivities, ownedOpenActivities] = await Promise.all([
    getCachedOpenLobbyActivities(),
    prisma.activity.findMany({
      where: {
        AND: [
          context.activeVisibleWhere,
          { organizerId: viewerProfileId },
          context.ownTeamCardWhere,
        ],
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: activityLobbySectionLimit,
      select: activityCardSelect,
    }),
  ]);

  return Array.from(
    new Map(
      [...openActivities, ...ownedOpenActivities].map((activity) => [
        activity.id,
        getActivityCardViewModel(activity),
      ]),
    ).values(),
  );
}

async function getCreatedLobbySection(
  viewerProfileId: string,
  context: ActivityLobbyQueryContext,
) {
  const createdActivities = await prisma.activity.findMany({
    where: {
      AND: [
        context.visibleWhere,
        { organizerId: viewerProfileId },
        context.ownTeamCardWhere,
      ],
    },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: activityLobbySectionLimit,
    select: activityCardSelect,
  });

  return createdActivities.map(getActivityCardViewModel);
}

async function getJoinedLobbySection(
  viewerProfileId: string,
  context: ActivityLobbyQueryContext,
) {
  const joinedParticipations = await prisma.activityParticipant.findMany({
    where: {
      userProfileId: viewerProfileId,
      status: {
        in: [...visibleLobbyParticipationStatuses],
      },
      activity: {
        AND: [context.visibleWhere, context.teamCardWhere],
      },
    },
    orderBy: [{ joinedAt: "desc" }, { id: "asc" }],
    take: activityLobbySectionLimit,
    select: lobbyParticipationSelect,
  });

  return joinedParticipations
    .map((item) => getActivityCardViewModel(item.activity))
    .filter(isJoinableTeamCard);
}

async function getFavoriteLobbySection(
  viewerProfileId: string,
  context: ActivityLobbyQueryContext,
) {
  const favoriteRecords = await prisma.activityFavorite.findMany({
    where: {
      userProfileId: viewerProfileId,
      activity: {
        AND: [context.accessibleWhere, context.teamCardWhere],
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: activityLobbySectionLimit,
    select: lobbyFavoriteSelect,
  });

  return favoriteRecords
    .map((item) => ({
      activity: getActivityCardViewModel(item.activity),
      createdAt: item.createdAt,
    }))
    .sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() ||
        left.activity.id.localeCompare(right.activity.id),
    )
    .map((item) => item.activity)
    .slice(0, activityLobbySectionLimit);
}

async function getFriendHostedLobbySection(context: ActivityLobbyQueryContext) {
  if (context.friendIds.length === 0) {
    return [];
  }

  const friendHostedActivities = await prisma.activity.findMany({
    where: {
      AND: [
        context.visibleWhere,
        { organizerId: { in: context.friendIds } },
        context.teamCardWhere,
      ],
    },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: activityLobbySectionLimit,
    select: activityCardSelect,
  });

  return friendHostedActivities.map(getActivityCardViewModel);
}

async function getFriendJoinedLobbySection(context: ActivityLobbyQueryContext) {
  if (context.friendIds.length === 0) {
    return [];
  }

  const friendJoinedParticipations = await prisma.activityParticipant.findMany({
    where: {
      userProfileId: {
        in: context.friendIds,
      },
      status: {
        in: [...visibleLobbyParticipationStatuses],
      },
      activity: {
        AND: [context.accessibleWhere, context.teamCardWhere],
      },
    },
    orderBy: [{ joinedAt: "desc" }, { id: "asc" }],
    take: activityLobbySectionLimit * 2,
    select: lobbyParticipationSelect,
  });

  return Array.from(
    new Map(
      friendJoinedParticipations.map((item) => {
        const activity = getActivityCardViewModel(item.activity);
        return [activity.id, activity] as const;
      }),
    ).values(),
  ).slice(0, activityLobbySectionLimit);
}

export async function getActivityLobbyInitial(
  viewerProfileId: string,
): Promise<ActivityLobbyViewModel> {
  const [mutualFollowIds, followedProfileIds] = await Promise.all([
    getViewerFriendIds(viewerProfileId),
    getViewerFollowedProfileIds(viewerProfileId),
  ]);
  const sectionContext = await getLobbyQueryContext(viewerProfileId, [], []);
  const feedContext = await getLobbyQueryContext(
    viewerProfileId,
    mutualFollowIds,
    followedProfileIds,
  );
  const [allActivityFeed, openActivities, createdActivities, joinedActivities] =
    await Promise.all([
      getActivityLobbyFeedPage(viewerProfileId, {
        context: feedContext,
        decorate: false,
      }),
      getOpenLobbySection(viewerProfileId, sectionContext),
      getCreatedLobbySection(viewerProfileId, sectionContext),
      getJoinedLobbySection(viewerProfileId, sectionContext),
    ]);
  const uniqueActivities = Array.from(
    new Map(
      [
        ...allActivityFeed.activities,
        ...openActivities,
        ...createdActivities,
        ...joinedActivities,
      ].map((activity) => [getLobbyActivityKey(activity), activity]),
    ).values(),
  );
  const decoratedActivities = await decorateLobbyActivities(
    uniqueActivities,
    viewerProfileId,
    followedProfileIds,
    mutualFollowIds,
  );
  const decoratedByKey = new Map(
    decoratedActivities.map((activity) => [
      getLobbyActivityKey(activity),
      activity,
    ]),
  );
  const pickDecorated = (activities: ActivityCardViewModel[]) =>
    activities.map(
      (activity) =>
        decoratedByKey.get(getLobbyActivityKey(activity)) ?? activity,
    );
  const decoratedOpenActivities = pickDecorated(openActivities);
  const decoratedCreatedActivities = pickDecorated(createdActivities);
  const decoratedJoinedActivities = pickDecorated(joinedActivities);
  const decoratedFeedActivities = pickDecorated(allActivityFeed.activities);
  const shouldOfferStarterActivities =
    (createdActivities.length === 0 && joinedActivities.length === 0) ||
    allActivityFeed.totalCount < 3;
  const starterActivityCards = shouldOfferStarterActivities
    ? decoratedOpenActivities.slice(0, activityLobbyStarterLimit)
    : [];

  return {
    allActivities: decoratedFeedActivities,
    allActivityFeed: {
      ...allActivityFeed,
      activities: decoratedFeedActivities,
    },
    openActivities: decoratedOpenActivities,
    createdActivities: decoratedCreatedActivities,
    joinedActivities: decoratedJoinedActivities,
    favoriteActivities: [],
    friendHostedActivities: [],
    friendJoinedActivities: [],
    starterActivities: starterActivityCards,
  };
}

export async function getActivityLobbySection(
  viewerProfileId: string,
  sectionId: ActivityLobbySectionId,
) {
  const [mutualFollowIds, followedProfileIds] = await Promise.all([
    getViewerFriendIds(viewerProfileId),
    getViewerFollowedProfileIds(viewerProfileId),
  ]);
  const context = await getLobbyQueryContext(
    viewerProfileId,
    mutualFollowIds,
    followedProfileIds,
  );
  const activities =
    sectionId === "open"
      ? await getOpenLobbySection(viewerProfileId, context)
      : sectionId === "created"
        ? await getCreatedLobbySection(viewerProfileId, context)
        : sectionId === "joined"
          ? await getJoinedLobbySection(viewerProfileId, context)
          : sectionId === "favorites"
            ? await getFavoriteLobbySection(viewerProfileId, context)
            : sectionId === "friendHosted"
              ? await getFriendHostedLobbySection(context)
              : await getFriendJoinedLobbySection(context);

  return decorateLobbyActivities(
    activities,
    viewerProfileId,
    context.friendIds,
    context.mutualFollowIds,
  );
}

export async function getActivityLobby(
  viewerProfileId: string,
): Promise<ActivityLobbyViewModel> {
  const [
    initialLobby,
    favoriteActivities,
    friendHostedActivities,
    friendJoinedActivities,
  ] = await Promise.all([
    getActivityLobbyInitial(viewerProfileId),
    getActivityLobbySection(viewerProfileId, "favorites"),
    getActivityLobbySection(viewerProfileId, "friendHosted"),
    getActivityLobbySection(viewerProfileId, "friendJoined"),
  ]);

  const priorityFeedActivities = buildLobbyPriorityFeed({
    feedActivities: initialLobby.allActivities,
    openActivities: initialLobby.openActivities,
    createdActivities: initialLobby.createdActivities,
    joinedActivities: initialLobby.joinedActivities,
    favoriteActivities,
    friendHostedActivities,
    friendJoinedActivities,
    viewerProfileId,
  });

  return {
    allActivities: priorityFeedActivities,
    allActivityFeed: initialLobby.allActivityFeed,
    openActivities: initialLobby.openActivities,
    createdActivities: initialLobby.createdActivities,
    joinedActivities: initialLobby.joinedActivities,
    favoriteActivities,
    friendHostedActivities,
    friendJoinedActivities,
    starterActivities: initialLobby.starterActivities,
  };
}

async function getActivityLobbyPreviewUncached(category?: ActivityCategory) {
  const now = getActivityFloatingNow();
  const categoryWhere: Prisma.ActivityWhereInput = category ? { category } : {};
  const visibleTeamWhere: Prisma.ActivityWhereInput = {
    AND: [
      getVisibleActivityWhere({
        includeEnded: true,
        includePast: true,
        visibility: null,
        now,
      }),
      strictTeamCardWhere,
      categoryWhere,
    ],
  };
  const visibleActiveTeamWhere: Prisma.ActivityWhereInput = {
    AND: [
      getVisibleActivityWhere({
        includeEnded: false,
        includePast: false,
        visibility: null,
        now,
      }),
      strictTeamCardWhere,
      categoryWhere,
    ],
  };
  const [activeActivities, archivedActivities] = await Promise.all([
    prisma.activity.findMany({
      where: visibleActiveTeamWhere,
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: activityLobbyPreviewLimit,
      select: activityCardSelect,
    }),
    prisma.activity.findMany({
      where: {
        AND: [visibleTeamWhere, getArchivedLobbyActivityWhere(now)],
      },
      orderBy: [{ startAt: "desc" }, { id: "asc" }],
      take: activityLobbyPreviewLimit,
      select: activityCardSelect,
    }),
  ]);
  const activities = [...activeActivities, ...archivedActivities].map(
    (activity) => {
      const card = getActivityCardViewModel(activity);

      return applyPrivateActivityCardAccess(card, false);
    },
  );

  return Array.from(
    new Map(
      activities
        .sort(compareLobbyActivityTime)
        .map((activity) => [activity.id, activity]),
    ).values(),
  ).slice(0, activityLobbyPreviewLimit);
}

const getCachedActivityLobbyPreview = unstable_cache(
  async (category?: ActivityCategory) =>
    getActivityLobbyPreviewUncached(category),
  ["activity-lobby-preview"],
  { revalidate: 60, tags: [OPEN_LOBBY_ACTIVITIES_TAG] },
);

export async function getActivityLobbyPreview(category?: ActivityCategory) {
  return getCachedActivityLobbyPreview(category);
}

const mobileActivityLobbyPageSize = 8;

function getMobileLobbyDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric",
  }).format(new Date(value));
}

function getMobileLobbyPopularScore(activity: ActivityCardViewModel) {
  return (
    activity.participantCount * 2 +
    activity.favoriteCount +
    (activity.friendSignal?.count ?? 0) * 3
  );
}

function sortMobileLobbyPageActivities(
  activities: ActivityCardViewModel[],
  viewerProfileId: string | null,
  tieBreaker?: (
    left: ActivityCardViewModel,
    right: ActivityCardViewModel,
  ) => number,
) {
  return [...activities].sort(
    (left, right) =>
      compareLobbyActivityStatusAndOwnership(left, right, {
        viewerProfileId,
      }) ||
      tieBreaker?.(left, right) ||
      compareLobbyActivityTime(left, right),
  );
}

function paginateMobileLobbyActivities(
  activities: ActivityCardViewModel[],
  page: number,
) {
  const normalizedPage = Math.max(1, Math.floor(page));
  const start = (normalizedPage - 1) * mobileActivityLobbyPageSize;
  const deduped = dedupeActivityCards(activities);

  return {
    activities: deduped.slice(start, start + mobileActivityLobbyPageSize),
    hasMore: start + mobileActivityLobbyPageSize < deduped.length,
    page: normalizedPage,
  };
}

export async function getMobileActivityLobbyPage({
  page = 1,
  tab,
  viewerProfileId,
}: {
  page?: number;
  tab: MobileActivityLobbyTabId;
  viewerProfileId: string | null;
}): Promise<MobileActivityLobbyPage> {
  const normalizedPage = Math.max(1, Math.floor(page));

  if (tab === "nearby" && viewerProfileId) {
    const feed = await getActivityLobbyFeedPage(viewerProfileId, {
      page: normalizedPage,
    });

    return {
      activities: feed.activities,
      hasMore: feed.page < feed.totalPages,
      page: feed.page,
      pageSize: mobileActivityLobbyPageSize,
      tab,
    };
  }

  let activities: ActivityCardViewModel[] = [];

  if (!viewerProfileId) {
    activities = await getActivityLobbyPreview();
  } else if (tab === "mine") {
    const [created, joined] = await Promise.all([
      getActivityLobbySection(viewerProfileId, "created"),
      getActivityLobbySection(viewerProfileId, "joined"),
    ]);
    activities = sortMobileLobbyPageActivities(
      [...created, ...joined],
      viewerProfileId,
    );
  } else if (tab === "friends") {
    const [hosted, joined] = await Promise.all([
      getActivityLobbySection(viewerProfileId, "friendHosted"),
      getActivityLobbySection(viewerProfileId, "friendJoined"),
    ]);
    activities = sortMobileLobbyPageActivities(
      [...hosted, ...joined],
      viewerProfileId,
    );
  } else {
    activities = await getActivityLobbySection(viewerProfileId, "open");
  }

  if (tab === "today") {
    const today = getMobileLobbyDateKey(new Date());
    activities = activities.filter(
      (activity) => getMobileLobbyDateKey(activity.startAt) === today,
    );
  } else if (tab === "popular") {
    activities = sortMobileLobbyPageActivities(
      activities,
      viewerProfileId,
      (left, right) =>
        getMobileLobbyPopularScore(right) - getMobileLobbyPopularScore(left),
    );
  } else if (tab === "nearby") {
    activities = sortMobileLobbyPageActivities(activities, viewerProfileId);
  }

  const result = paginateMobileLobbyActivities(activities, normalizedPage);

  return {
    ...result,
    pageSize: mobileActivityLobbyPageSize,
    tab,
  };
}
