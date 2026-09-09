import {
  isHotlinkProtectedCoverUrl,
  isSupabaseActivityCoverUrl,
} from "./activity-cover-shared";

const defaultThumbnailQuality = 75;

export function getActivityCoverDisplayUrl(imageUrl: string) {
  if (!imageUrl) {
    return "";
  }

  if (!isHotlinkProtectedCoverUrl(imageUrl)) {
    return imageUrl;
  }

  return `/api/activity-cover-proxy?url=${encodeURIComponent(imageUrl)}`;
}

export function getActivityCoverThumbnailUrl(
  imageUrl: string | null | undefined,
  size = 192,
) {
  const normalizedUrl = imageUrl?.trim() ?? "";

  if (!normalizedUrl || normalizedUrl.startsWith("/")) {
    return normalizedUrl;
  }

  if (!isSupabaseActivityCoverUrl(normalizedUrl)) {
    return getActivityCoverDisplayUrl(normalizedUrl);
  }

  const normalizedSize = Math.min(640, Math.max(64, Math.round(size)));
  const searchParams = new URLSearchParams({
    quality: String(defaultThumbnailQuality),
    size: String(normalizedSize),
    url: normalizedUrl,
  });

  return `/api/activity-cover-thumbnail?${searchParams.toString()}`;
}
