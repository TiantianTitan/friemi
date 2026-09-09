const hotlinkProtectedHostSuffixes = [
  "cdn.sortiraparis.com",
  "img.evbuc.com",
  "cdn.evbuc.com",
  "secure-content.meetupstatic.com",
  "secure.meetupstatic.com",
  "i0.wp.com",
  "i1.wp.com",
  "i2.wp.com",
];

export function isHotlinkProtectedCoverUrl(imageUrl: string) {
  try {
    const hostname = new URL(imageUrl).hostname.toLowerCase();

    return hotlinkProtectedHostSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function isSupabaseActivityCoverUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl);

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.startsWith("/storage/v1/object/public/activity-covers/")
    );
  } catch {
    return false;
  }
}
