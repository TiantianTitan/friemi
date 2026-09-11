export type UserPreviewPayload = {
  avatarUrl: string | null;
  bio: string | null;
  id: string;
  isCoCreator: boolean;
  isSelf: boolean;
  nickname: string;
  relationship: {
    friendshipId: string | null;
    isFriend: boolean;
    isFollowing: boolean;
    isMutualFollow: boolean;
    pendingFriendRequest: "received" | "sent" | null;
    targetFollowsViewer: boolean;
  };
};

type UserPreviewCacheEntry = {
  payload: UserPreviewPayload | null;
  revalidateAfter: number;
};

const optimisticRevalidationDelayMs = 3_000;
const userPreviewCache = new Map<string, UserPreviewCacheEntry>();

export function getCachedUserPreview(
  profileId: string,
  now = Date.now(),
) {
  const entry = userPreviewCache.get(profileId);

  if (!entry) {
    return undefined;
  }

  return {
    payload: entry.payload,
    shouldRevalidate: now >= entry.revalidateAfter,
  };
}

export function setCachedUserPreview(
  profileId: string,
  payload: UserPreviewPayload | null,
) {
  userPreviewCache.set(profileId, {
    payload,
    revalidateAfter: 0,
  });
}

export function withUserPreviewFollowState(
  preview: UserPreviewPayload,
  isFollowing: boolean,
): UserPreviewPayload {
  const isMutualFollow =
    isFollowing && preview.relationship.targetFollowsViewer;

  return {
    ...preview,
    relationship: {
      ...preview.relationship,
      isFriend: isMutualFollow,
      isFollowing,
      isMutualFollow,
    },
  };
}

export function setCachedUserPreviewFollowState(
  profileId: string,
  isFollowing: boolean,
  options: {
    now?: number;
    optimistic?: boolean;
  } = {},
) {
  const entry = userPreviewCache.get(profileId);

  if (!entry?.payload) {
    return undefined;
  }

  const nextPreview = withUserPreviewFollowState(entry.payload, isFollowing);
  const now = options.now ?? Date.now();

  userPreviewCache.set(profileId, {
    payload: nextPreview,
    revalidateAfter: options.optimistic
      ? now + optimisticRevalidationDelayMs
      : 0,
  });

  return nextPreview;
}

export function clearUserPreviewCache() {
  userPreviewCache.clear();
}
