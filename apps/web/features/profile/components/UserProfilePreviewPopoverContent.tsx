"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@chill-club/ui";
import { CharmGiftDialog } from "@/features/charm/components/CharmGiftDialog";
import { FollowButton } from "@/features/follow/components/FollowButton";
import { withLocale } from "@/lib/routes";
import { CoCreatorIdentityBadge } from "./CoCreatorIdentityBadge";
import {
  getCachedUserPreview,
  setCachedUserPreview,
  setCachedUserPreviewFollowState,
  type UserPreviewPayload,
  withUserPreviewFollowState,
} from "../utils/userPreviewCache";

type UserProfilePreviewPopoverContentProps = {
  avatarUrl: string | null;
  giftSourceContextId?: string;
  giftSourceSurface?:
    | "PROFILE"
    | "ACTIVITY"
    | "MOMENT"
    | "PLANET"
    | "DIRECT_MESSAGE"
    | "OTHER";
  isAuthenticated: boolean;
  isGuest?: boolean;
  locale: string;
  nickname: string;
  onPersistentOverlayOpenChange?: (open: boolean) => void;
  profileId: string;
  redirectPath: string;
};

const fallbackRelationship: UserPreviewPayload["relationship"] = {
  friendshipId: null,
  isFriend: false,
  isFollowing: false,
  isMutualFollow: false,
  pendingFriendRequest: null,
  targetFollowsViewer: false,
};
function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "N";
}

function getPreviewCopy(locale: string) {
  if (locale === "fr") {
    return {
      follow: "Suivre",
      followed: "Suivi",
      followBack: "Suivre aussi",
      mutualFollow: "Mutuel",
      emptyBio: "Pas encore de présentation.",
      failed: "Échec du chargement.",
      guestNotice: "Cet utilisateur est encore visiteur.",
      openProfile: "Profil",
      selfNotice: "C'est votre profil.",
    };
  }

  if (locale === "en") {
    return {
      follow: "Follow",
      followed: "Following",
      followBack: "Follow back",
      mutualFollow: "Mutual",
      emptyBio: "No bio yet.",
      failed: "Failed to load.",
      guestNotice: "This user is still a guest.",
      openProfile: "Profile",
      selfNotice: "This is you.",
    };
  }

  return {
    follow: "关注",
    followed: "已关注",
    followBack: "回关",
    mutualFollow: "互相关注",
    emptyBio: "这个人还没有写简介。",
    failed: "加载失败。",
    guestNotice: "该用户还是游客哦",
    openProfile: "主页",
    selfNotice: "这是你自己。",
  };
}

function AddFriendQuickButton({
  isAuthenticated,
  locale,
  onFollowStateChange,
  onOptimisticFollowStateChange,
  profileId,
  redirectPath,
  relationship,
}: {
  isAuthenticated: boolean;
  locale: string;
  onFollowStateChange: (isFollowing: boolean) => void;
  onOptimisticFollowStateChange: (isFollowing: boolean) => void;
  profileId: string;
  redirectPath: string;
  relationship: UserPreviewPayload["relationship"];
}) {
  const previewCopy = getPreviewCopy(locale);
  const activeLabel = relationship.targetFollowsViewer
    ? previewCopy.mutualFollow
    : previewCopy.followed;
  const inactiveLabel = relationship.targetFollowsViewer
    ? previewCopy.followBack
    : previewCopy.follow;

  return (
    <FollowButton
      activeButtonClassName="!h-7 !min-h-7 w-full min-w-0 rounded-full border border-[#8AB68E]/80 bg-[#F1F2EC] !px-2 !text-[11px] font-semibold leading-none text-[#156240] shadow-none"
      activeLabel={activeLabel}
      buttonClassName="!h-7 !min-h-7 w-full min-w-0 rounded-full border border-[#F09182]/70 bg-[#F09182] !px-2 !text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(240,145,130,0.18)] hover:bg-[#E98272]"
      fullWidth
      inactiveLabel={inactiveLabel}
      isAuthenticated={isAuthenticated}
      isFollowing={relationship.isFollowing}
      locale={locale}
      onOptimisticStateChange={onOptimisticFollowStateChange}
      onStateChange={onFollowStateChange}
      redirectPath={redirectPath}
      targetUserProfileId={profileId}
    />
  );
}

export function UserProfilePreviewPopoverContent({
  avatarUrl,
  giftSourceContextId,
  giftSourceSurface = "PROFILE",
  isAuthenticated,
  isGuest = false,
  locale,
  nickname,
  onPersistentOverlayOpenChange,
  profileId,
  redirectPath,
}: UserProfilePreviewPopoverContentProps) {
  const [data, setData] = useState<UserPreviewPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorType, setErrorType] = useState<
    "load_failed" | "not_found" | null
  >(null);
  const previewCopy = getPreviewCopy(locale);
  const resolvedNickname = data?.nickname ?? nickname;
  const resolvedAvatarUrl = data?.avatarUrl ?? avatarUrl;
  const resolvedBio = data?.bio?.trim() || previewCopy.emptyBio;
  const isCoCreator = Boolean(data?.isCoCreator);
  const isSelf = Boolean(data?.isSelf);
  const relationship = data?.relationship ?? fallbackRelationship;
  const showBio = errorType !== "not_found";
  const showProfileLink =
    !isLoading && Boolean(profileId) && !isGuest && errorType !== "not_found";
  const showActionButtons = !isLoading && !isSelf && errorType !== "not_found";
  const showGiftButton = showActionButtons && !isGuest && Boolean(profileId);
  const actionCount = [
    showProfileLink,
    showActionButtons,
    showGiftButton,
  ].filter(Boolean).length;

  useEffect(() => {
    if (isGuest || !profileId) {
      setData(null);
      setIsLoading(false);
      setErrorType("not_found");
      return;
    }

    const cachedPreview = getCachedUserPreview(profileId);

    if (cachedPreview !== undefined) {
      setData(cachedPreview.payload);
      setIsLoading(false);
      setErrorType(cachedPreview.payload ? null : "not_found");

      if (!cachedPreview.shouldRevalidate) {
        return;
      }
    }

    const controller = new AbortController();
    if (cachedPreview === undefined) {
      setIsLoading(true);
      setErrorType(null);
    }

    fetch(`/api/user-preview/${encodeURIComponent(profileId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("NOT_FOUND");
          }

          throw new Error("LOAD_FAILED");
        }

        const payload = (await response.json()) as UserPreviewPayload;
        setCachedUserPreview(profileId, payload);
        setData(payload);
        setErrorType(null);
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name === "AbortError") {
          return;
        }

        if ((fetchError as Error).message === "NOT_FOUND") {
          setCachedUserPreview(profileId, null);
          setData(null);
          setErrorType("not_found");
          return;
        }

        if (cachedPreview === undefined) {
          setErrorType("load_failed");
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [isGuest, profileId]);

  function handleFollowStateChange(
    isFollowing: boolean,
    optimistic = false,
  ) {
    setData((current) => {
      if (!current) {
        return current;
      }

      const nextPreview = withUserPreviewFollowState(current, isFollowing);
      const cachedNextPreview = setCachedUserPreviewFollowState(
        profileId,
        isFollowing,
        { optimistic },
      );

      if (!cachedNextPreview) {
        setCachedUserPreview(profileId, nextPreview);
      }

      return nextPreview;
    });
  }

  return (
    <div className="w-full overflow-hidden rounded-[1.35rem] border border-[#8AB68E]/45 bg-white p-3.5 shadow-[0_16px_36px_rgba(21,98,64,0.12)]">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F09182] text-sm font-semibold text-white shadow-[0_10px_20px_rgba(21,98,64,0.12)] ring-2 ring-[#FEFFF9]">
            {resolvedAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedAvatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitial(resolvedNickname)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-[#1D1D1B]">
                {resolvedNickname}
              </p>
              {isCoCreator ? (
                <CoCreatorIdentityBadge locale={locale} variant="icon" />
              ) : null}
            </div>
            {showBio ? (
              <p className="mt-2 text-[11px] leading-5 text-[#156240]/70">
                {resolvedBio}
              </p>
            ) : null}
          </div>
        </div>

        {showProfileLink || showActionButtons || showGiftButton ? (
          <div
            className={
              actionCount > 1 ? "grid grid-cols-2 gap-2" : "grid gap-2"
            }
          >
            {showProfileLink ? (
              <Link
                className="inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-full border border-[#D6D5B2]/80 bg-white px-2 text-[11px] font-semibold text-[#156240] transition hover:bg-[#FFF5E6]"
                href={withLocale(locale, `/profile/${profileId}`)}
                prefetch={false}
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{previewCopy.openProfile}</span>
              </Link>
            ) : null}
            {showActionButtons ? (
              <AddFriendQuickButton
                isAuthenticated={isAuthenticated}
                locale={locale}
                onFollowStateChange={(isFollowing) =>
                  handleFollowStateChange(isFollowing)
                }
                onOptimisticFollowStateChange={(isFollowing) =>
                  handleFollowStateChange(isFollowing, true)
                }
                profileId={profileId}
                redirectPath={redirectPath}
                relationship={relationship}
              />
            ) : null}
            {showGiftButton ? (
              <CharmGiftDialog
                isAuthenticated={isAuthenticated}
                locale={locale}
                onOpenChange={onPersistentOverlayOpenChange}
                recipientName={resolvedNickname}
                recipientProfileId={profileId}
                redirectPath={redirectPath}
                sourceContextId={giftSourceContextId}
                sourceSurface={giftSourceSurface}
                triggerClassName="!h-7 w-full min-w-0 justify-center border border-[#F5D7DC]/80 bg-white !px-2 !text-[11px] font-semibold text-[#B5301F] hover:bg-[#FFF5E6]"
              />
            ) : null}
          </div>
        ) : null}

        {isSelf ? (
          <p className="rounded-xl bg-[#F1F2EC]/82 px-3 py-2 text-center text-[10px] font-medium text-[#156240]/70 ring-1 ring-[#D6D5B2]/70">
            {previewCopy.selfNotice}
          </p>
        ) : null}

        {errorType ? (
          <p className="rounded-xl bg-[#FFF5E6] px-3 py-2 text-center text-[10px] font-semibold text-[#B5301F] ring-1 ring-[#F09182]/40">
            {errorType === "not_found"
              ? previewCopy.guestNotice
              : previewCopy.failed}
          </p>
        ) : null}
      </div>
    </div>
  );
}
