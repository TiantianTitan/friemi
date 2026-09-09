"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultActivityCategoryIllustrationSrc,
  isActivityCategoryIllustrationSrc,
} from "@/features/activities/utils/activityCategoryVisuals";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

type ActivityCoverImageProps = {
  alt?: string;
  fallbackSrc?: string | null;
  fetchPriority?: "auto" | "high" | "low";
  imageClassName?: string;
  loading?: "eager" | "lazy";
  overlayClassName?: string;
  recoverySrc?: string | null;
  src: string | null;
};

export function ActivityCoverImage({
  alt = "",
  fallbackSrc,
  fetchPriority = "auto",
  imageClassName,
  loading = "lazy",
  overlayClassName = "bg-black/20",
  recoverySrc,
  src,
}: ActivityCoverImageProps) {
  const [hasFailed, setHasFailed] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [usesRecovery, setUsesRecovery] = useState(false);
  const normalizedFallbackSrc = fallbackSrc?.trim() || null;
  const normalizedPrimarySrc = src?.trim() || null;
  const normalizedRecoverySrc = recoverySrc?.trim() || null;
  const activeSrc = usesRecovery ? normalizedRecoverySrc : normalizedPrimarySrc;
  const usesCategoryArtworkCrop =
    isActivityCategoryIllustrationSrc(activeSrc) &&
    activeSrc !== defaultActivityCategoryIllustrationSrc;
  const fallbackUsesCategoryArtworkCrop =
    isActivityCategoryIllustrationSrc(normalizedFallbackSrc) &&
    normalizedFallbackSrc !== defaultActivityCategoryIllustrationSrc;
  const primarySrc =
    activeSrc && !hasFailed && activeSrc !== normalizedFallbackSrc
      ? activeSrc
      : null;

  const handleSourceFailure = useCallback(() => {
    setHasLoaded(false);

    if (
      !usesRecovery &&
      normalizedRecoverySrc &&
      normalizedRecoverySrc !== normalizedPrimarySrc
    ) {
      setUsesRecovery(true);
      return;
    }

    setHasFailed(true);
  }, [normalizedPrimarySrc, normalizedRecoverySrc, usesRecovery]);

  useEffect(() => {
    setHasFailed(false);
    setHasLoaded(false);
    setUsesRecovery(false);
  }, [recoverySrc, src]);

  useEffect(() => {
    if (!activeSrc || hasLoaded || hasFailed) {
      return;
    }

    const timeoutId = window.setTimeout(handleSourceFailure, 12_000);

    return () => window.clearTimeout(timeoutId);
  }, [activeSrc, handleSourceFailure, hasFailed, hasLoaded]);

  if ((!src || hasFailed) && !normalizedFallbackSrc) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#FEFFF9]"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(54,151,88,0.16),transparent_34%),radial-gradient(circle_at_78%_84%,rgba(240,145,130,0.13),transparent_30%),linear-gradient(135deg,rgba(254,255,249,0.95),rgba(241,242,236,0.92))]" />
        <div className="absolute inset-x-8 top-1/2 h-px bg-[#D6D5B2]/80" />
        <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-[#8AB68E] bg-[#FEFFF9] shadow-[0_16px_36px_rgba(21,98,64,0.12)] sm:h-16 sm:w-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.logoFullBackgroundPath}
            alt=""
            className="h-full w-full scale-[1.18] object-cover"
            decoding="async"
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(145deg,#F1F2EC_0%,#FEFFF9_58%,#EAF3EC_100%)]"
      />
      {normalizedFallbackSrc ? (
        // Category artwork is visible immediately while a remote custom cover loads.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={cn(
            "absolute w-full object-cover",
            fallbackUsesCategoryArtworkCrop
              ? "inset-x-0 bottom-0 h-[124%] object-bottom"
              : "inset-0 h-full",
          )}
          decoding="sync"
          fetchPriority={fetchPriority}
          loading="eager"
          src={normalizedFallbackSrc}
        />
      ) : null}
      {/* Public cover URLs can come from Supabase Storage or Paris OpenData. */}
      {primarySrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={primarySrc}
          alt={alt}
          className={cn(
            "absolute w-full object-cover transition-[opacity,transform] duration-300 ease-out",
            usesCategoryArtworkCrop
              ? "inset-x-0 bottom-0 h-[124%] object-bottom"
              : "inset-0 h-full group-hover/card:scale-[1.035]",
            hasLoaded ? "opacity-100" : "opacity-0",
            imageClassName,
          )}
          decoding="async"
          fetchPriority={fetchPriority}
          loading={loading}
          referrerPolicy="no-referrer"
          onError={handleSourceFailure}
          onLoad={() => setHasLoaded(true)}
        />
      ) : null}
      <div className={cn("absolute inset-0", overlayClassName)} aria-hidden />
    </>
  );
}
