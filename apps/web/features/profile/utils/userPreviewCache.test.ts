import assert from "node:assert/strict";
import test from "node:test";
import {
  clearUserPreviewCache,
  getCachedUserPreview,
  setCachedUserPreview,
  setCachedUserPreviewFollowState,
  type UserPreviewPayload,
} from "./userPreviewCache";

function createPreview(
  relationship: Partial<UserPreviewPayload["relationship"]> = {},
): UserPreviewPayload {
  return {
    avatarUrl: null,
    bio: null,
    id: "target",
    isCoCreator: false,
    isSelf: false,
    nickname: "Target",
    relationship: {
      friendshipId: null,
      isFriend: false,
      isFollowing: false,
      isMutualFollow: false,
      pendingFriendRequest: null,
      targetFollowsViewer: false,
      ...relationship,
    },
  };
}

test("optimistic follow state survives an immediate popover reopen", () => {
  clearUserPreviewCache();
  setCachedUserPreview("target", createPreview());

  setCachedUserPreviewFollowState("target", true, {
    now: 1_000,
    optimistic: true,
  });

  const cached = getCachedUserPreview("target", 1_100);

  assert.equal(cached?.payload?.relationship.isFollowing, true);
  assert.equal(cached?.shouldRevalidate, false);
  assert.equal(getCachedUserPreview("target", 4_001)?.shouldRevalidate, true);
});

test("follow state keeps mutual relationship fields consistent", () => {
  clearUserPreviewCache();
  setCachedUserPreview(
    "target",
    createPreview({ targetFollowsViewer: true }),
  );

  const followed = setCachedUserPreviewFollowState("target", true);
  assert.equal(followed?.relationship.isFollowing, true);
  assert.equal(followed?.relationship.isFriend, true);
  assert.equal(followed?.relationship.isMutualFollow, true);

  const unfollowed = setCachedUserPreviewFollowState("target", false);
  assert.equal(unfollowed?.relationship.isFollowing, false);
  assert.equal(unfollowed?.relationship.isFriend, false);
  assert.equal(unfollowed?.relationship.isMutualFollow, false);
});
