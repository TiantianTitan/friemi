"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { MessageCircle } from "lucide-react";
import { Button } from "@chill-club/ui";
import {
  createDirectConversationAction,
  openDirectConversationAction,
} from "@/features/direct-messages/actions/directMessageActions";
import { saveMessageThreadReturnHref } from "@/features/direct-messages/utils/messageThreadReturn";
import { getSignInHref } from "@/lib/auth-redirect";
import { withLocale } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  toggleFollowUserAction,
  type ToggleFollowState,
} from "../actions/toggleFollowUser";
import { getFollowCopy } from "../copy";

type FollowButtonProps = {
  activeButtonClassName?: string;
  activeLabel?: string;
  buttonClassName?: string;
  fullWidth?: boolean;
  icon?: LucideIcon;
  inactiveLabel?: string;
  isAuthenticated: boolean;
  isFollowing: boolean;
  locale: string;
  onOptimisticStateChange?: (isFollowing: boolean) => void;
  onStateChange?: (isFollowing: boolean) => void;
  redirectPath: string;
  targetUserProfileId: string;
  unfollowConfirm?: {
    cancelLabel: string;
    confirmLabel: string;
    description?: string;
    title: string;
  };
};

const initialState: ToggleFollowState = {};

function SubmitButton({
  activeButtonClassName,
  activeLabel,
  buttonClassName,
  fullWidth,
  icon: Icon,
  inactiveLabel,
  isDisabled,
  isFollowing,
  locale,
}: {
  activeButtonClassName?: string;
  activeLabel?: string;
  buttonClassName?: string;
  fullWidth: boolean;
  icon?: LucideIcon;
  inactiveLabel?: string;
  isDisabled: boolean;
  isFollowing: boolean;
  locale: string;
}) {
  const t = getFollowCopy(locale);
  const label = isFollowing
    ? (activeLabel ?? t.unfollow)
    : (inactiveLabel ?? t.follow);

  return (
    <Button
      className={cn(
        fullWidth ? "w-full" : "w-auto",
        isFollowing && activeButtonClassName
          ? activeButtonClassName
          : buttonClassName,
      )}
      type="submit"
      variant={isFollowing ? "secondary" : "primary"}
      disabled={isDisabled}
    >
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap leading-none">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </span>
    </Button>
  );
}

export function FollowButton({
  activeButtonClassName,
  activeLabel,
  buttonClassName,
  fullWidth = true,
  icon,
  inactiveLabel,
  isAuthenticated,
  isFollowing,
  locale,
  onOptimisticStateChange,
  onStateChange,
  redirectPath,
  targetUserProfileId,
  unfollowConfirm,
}: FollowButtonProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    toggleFollowUserAction,
    initialState,
  );
  const t = getFollowCopy(locale);
  const Icon = icon;
  const formRef = useRef<HTMLFormElement | null>(null);
  const skipConfirmRef = useRef(false);
  const openingMutualConversationRef = useRef(false);
  const onOptimisticStateChangeRef = useRef(onOptimisticStateChange);
  const onStateChangeRef = useRef(onStateChange);
  const previousFollowingRef = useRef<boolean | null>(null);
  const [optimisticIsFollowing, setOptimisticIsFollowing] =
    useState(isFollowing);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mutualPromptOpen, setMutualPromptOpen] = useState(false);
  const effectiveIsFollowing = state.isFollowing ?? optimisticIsFollowing;
  onOptimisticStateChangeRef.current = onOptimisticStateChange;
  onStateChangeRef.current = onStateChange;

  useEffect(() => {
    setOptimisticIsFollowing(isFollowing);
  }, [isFollowing]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (state.formError) {
      const previousIsFollowing =
        previousFollowingRef.current ?? isFollowing;
      previousFollowingRef.current = null;
      setOptimisticIsFollowing(previousIsFollowing);
      onOptimisticStateChangeRef.current?.(previousIsFollowing);
      setIsSubmitting(false);
      openingMutualConversationRef.current = false;
      return;
    }

    if (typeof state.isFollowing === "boolean") {
      previousFollowingRef.current = null;
      onStateChangeRef.current?.(state.isFollowing);

      if (state.becameMutualFollow && !openingMutualConversationRef.current) {
        openingMutualConversationRef.current = true;
        const formData = new FormData();
        formData.set("locale", locale);
        formData.set("friendProfileId", targetUserProfileId);
        formData.set("redirectPath", redirectPath);
        saveMessageThreadReturnHref();

        void createDirectConversationAction({}, formData)
          .then((result) => {
            if (result.ok && result.conversationId) {
              router.push(
                withLocale(
                  locale,
                  `/messages/${result.conversationId}?mutual=1`,
                ),
              );
              return;
            }

            openingMutualConversationRef.current = false;
            setMutualPromptOpen(true);
            setIsSubmitting(false);
            router.refresh();
          })
          .catch((error: unknown) => {
            console.error("Failed to open mutual follow conversation", error);
            openingMutualConversationRef.current = false;
            setMutualPromptOpen(true);
            setIsSubmitting(false);
            router.refresh();
          });

        return;
      }

      setIsSubmitting(false);
      router.refresh();
      return;
    }

    if (state.ok) {
      setIsSubmitting(false);
    }
  }, [
    isFollowing,
    router,
    state.formError,
    state.isFollowing,
    state.becameMutualFollow,
    state.ok,
    locale,
    redirectPath,
    targetUserProfileId,
  ]);

  if (!isAuthenticated) {
    return (
      <Link href={getSignInHref(locale, redirectPath)}>
        <Button
          className={cn(fullWidth ? "w-full" : "w-auto", buttonClassName)}
          variant="secondary"
        >
          <span className="inline-flex items-center gap-1">
            {Icon ? <Icon className="h-3 w-3" /> : null}
            {t.signInToFollow}
          </span>
        </Button>
      </Link>
    );
  }

  const confirmDialog =
    mounted && confirmOpen && unfollowConfirm
      ? createPortal(
          <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/35 px-5"
            role="presentation"
          >
            <div
              aria-modal="true"
              className="w-full max-w-[19rem] rounded-[1.4rem] border border-[#E8B8B1] bg-white p-4 shadow-[0_18px_42px_rgba(17,18,16,0.2)]"
              role="dialog"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF0EE] text-lg font-bold text-[#D94A38]">
                !
              </div>
              <h2 className="text-base font-bold text-[#111210]">
                {unfollowConfirm.title}
              </h2>
              {unfollowConfirm.description ? (
                <p className="mt-2 text-sm font-semibold leading-5 text-[#6C746A]">
                  {unfollowConfirm.description}
                </p>
              ) : null}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="h-10 rounded-full border border-[#D6D5B2] bg-white text-sm font-bold text-[#156240] active:scale-[0.98]"
                  onClick={() => setConfirmOpen(false)}
                  type="button"
                >
                  {unfollowConfirm.cancelLabel}
                </button>
                <button
                  className="h-10 rounded-full bg-[#E86D60] text-sm font-bold text-white shadow-[0_10px_22px_rgba(232,109,96,0.22)] active:scale-[0.98]"
                  onClick={() => {
                    skipConfirmRef.current = true;
                    setConfirmOpen(false);
                    window.requestAnimationFrame(() => {
                      formRef.current?.requestSubmit();
                    });
                  }}
                  type="button"
                >
                  {unfollowConfirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;
  const mutualPrompt =
    mounted && mutualPromptOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/32 px-5"
            role="presentation"
          >
            <button
              aria-label={t.mutualPromptLater}
              className="absolute inset-0 cursor-default"
              onClick={() => setMutualPromptOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <div
              aria-modal="true"
              className="relative w-full max-w-[19rem] rounded-[1.4rem] border border-[#D6D5B2] bg-white p-4 shadow-[0_20px_46px_rgba(17,18,16,0.2)]"
              role="dialog"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#ECF5EF] text-[#156240] ring-1 ring-[#CFE3D2]">
                <MessageCircle className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-[#111210]">
                {t.mutualPromptTitle}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-5 text-[#6C746A]">
                {t.mutualPromptDescription}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="h-10 rounded-full border border-[#D6D5B2] bg-white text-sm font-bold text-[#156240] active:scale-[0.98]"
                  onClick={() => setMutualPromptOpen(false)}
                  type="button"
                >
                  {t.mutualPromptLater}
                </button>
                <form action={openDirectConversationAction}>
                  <input name="locale" type="hidden" value={locale} />
                  <input
                    name="friendProfileId"
                    type="hidden"
                    value={targetUserProfileId}
                  />
                  <input
                    name="redirectPath"
                    type="hidden"
                    value={redirectPath}
                  />
                  <button
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[#156240] px-3 text-sm font-bold text-white shadow-[0_10px_22px_rgba(21,98,64,0.18)] active:scale-[0.98]"
                    type="submit"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {t.mutualPromptCta}
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <form
        action={formAction}
        className="inline-grid gap-1 justify-items-center"
        ref={formRef}
        onSubmit={(event) => {
          if (
            effectiveIsFollowing &&
            unfollowConfirm &&
            !skipConfirmRef.current
          ) {
            event.preventDefault();
            setConfirmOpen(true);
            return;
          }

          skipConfirmRef.current = false;
          const nextIsFollowing = !effectiveIsFollowing;
          previousFollowingRef.current = effectiveIsFollowing;
          setOptimisticIsFollowing(nextIsFollowing);
          onOptimisticStateChangeRef.current?.(nextIsFollowing);
          setIsSubmitting(true);
        }}
      >
        <input name="locale" type="hidden" value={locale} />
        <input
          name="targetUserProfileId"
          type="hidden"
          value={targetUserProfileId}
        />
        <input name="redirectPath" type="hidden" value={redirectPath} />
        {state.formError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {state.formError}
          </p>
        ) : null}
        <SubmitButton
          activeButtonClassName={activeButtonClassName}
          activeLabel={activeLabel}
          buttonClassName={buttonClassName}
          fullWidth={fullWidth}
          icon={icon}
          inactiveLabel={inactiveLabel}
          isDisabled={isSubmitting}
          isFollowing={effectiveIsFollowing}
          locale={locale}
        />
      </form>
      {confirmDialog}
      {mutualPrompt}
    </>
  );
}
