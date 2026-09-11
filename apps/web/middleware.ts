import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "@chill-club/shared";
import { getRequestRedirectTarget, getSignInHref } from "./lib/auth-redirect";
import { hasClerkKeys } from "./lib/clerk";
import {
  getMobileRootLobbyRedirectPath,
  getRootHomeRedirectPath,
  isSearchCrawlerUserAgent,
  localeCookieName,
} from "./lib/mobile-root-lobby-entry";
import {
  getReferralCodeToStore,
  referralCookieMaxAgeSeconds,
  referralCookieName,
} from "./features/referrals/referralCode";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});
const canonicalProductionHost = "www.friemi.com";
const productionHostRedirects = new Set(["friemi.com", "friemi.vercel.app"]);

const isProtectedRoute = createRouteMatcher([
  "/:locale/activities/:activityId/edit(.*)",
  "/:locale/friends(.*)",
  "/:locale/messages(.*)",
  "/:locale/notifications(.*)",
  "/:locale/profile/achievements(.*)",
  "/:locale/profile/bag(.*)",
  "/:locale/profile/hangouts(.*)",
  "/:locale/profile/invite(.*)",
  "/:locale/profile/network(.*)",
  "/:locale/profile/shop(.*)",
  "/:locale/profile/visitors(.*)",
]);
const isAdminPageRoute = createRouteMatcher(["/:locale/admin(.*)"]);
const isAdminApiRoute = createRouteMatcher(["/api/admin(.*)"]);
const isAaApiRoute = createRouteMatcher(["/api/aa(.*)"]);
const isUploadApiRoute = createRouteMatcher(["/api/uploads(.*)"]);
const isActivityRoomChatApiRoute = createRouteMatcher([
  "/api/activity-room-chat(.*)",
]);
const isActivityRoomCursorApiRoute = createRouteMatcher([
  "/api/activity-room(.*)",
]);
const isChatApiRoute = createRouteMatcher(["/api/chat(.*)"]);
const isGameToolsApiRoute = createRouteMatcher(["/api/game-tools(.*)"]);
const isPlanetsApiRoute = createRouteMatcher(["/api/planets(.*)"]);
const isUserPreviewApiRoute = createRouteMatcher(["/api/user-preview(.*)"]);
const isFriendsApiRoute = createRouteMatcher(["/api/friends(.*)"]);
const isFootprintsApiRoute = createRouteMatcher(["/api/footprints(.*)"]);
const isDirectMessagesApiRoute = createRouteMatcher([
  "/api/direct-messages(.*)",
]);
const isNotificationsApiRoute = createRouteMatcher(["/api/notifications(.*)"]);
const isProfileVisitsApiRoute = createRouteMatcher(["/api/profile-visits(.*)"]);
const isProfileApiRoute = createRouteMatcher(["/api/profile(.*)"]);
const isReferralsApiRoute = createRouteMatcher(["/api/referrals(.*)"]);
const isLobbyApiRoute = createRouteMatcher(["/api/lobby(.*)"]);
const isNavigationApiRoute = createRouteMatcher(["/api/navigation(.*)"]);
const isAnalyticsApiRoute = createRouteMatcher(["/api/analytics(.*)"]);
const isSearchApiRoute = createRouteMatcher(["/api/search(.*)"]);
const isTranslationsApiRoute = createRouteMatcher(["/api/translations(.*)"]);
const isMobileApiRoute = createRouteMatcher(["/api/mobile(.*)"]);

function getLocaleFromPath(pathname: string) {
  const locale = pathname.split("/").filter(Boolean)[0];

  return locales.some((supportedLocale) => supportedLocale === locale)
    ? locale
    : defaultLocale;
}

function getLocaleRootHomeRedirectPath(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);

  if (segments.length !== 1) {
    return null;
  }

  const [locale] = segments;

  if (!locales.some((supportedLocale) => supportedLocale === locale)) {
    return null;
  }

  return `/${locale}/home${request.nextUrl.search}`;
}

function redirectToSignIn(request: NextRequest) {
  const locale = getLocaleFromPath(request.nextUrl.pathname);
  const redirectTarget = getRequestRedirectTarget({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });

  return withReferralCookie(
    request,
    NextResponse.redirect(
      new URL(getSignInHref(locale, redirectTarget), request.url),
    ),
  );
}

function withReferralCookie<TResponse extends NextResponse>(
  request: NextRequest,
  response: TResponse,
) {
  const referralCode = getReferralCodeToStore({
    existingCookie: request.cookies.get(referralCookieName)?.value,
    incomingRef: request.nextUrl.searchParams.get("ref"),
  });

  if (referralCode) {
    response.cookies.set(referralCookieName, referralCode, {
      httpOnly: true,
      maxAge: referralCookieMaxAgeSeconds,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

function getCanonicalHostRedirectUrl(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return null;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return null;
  }

  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const normalizedHost = host
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

  if (!productionHostRedirects.has(normalizedHost)) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = "https:";
  redirectUrl.host = canonicalProductionHost;

  return redirectUrl;
}

export default clerkMiddleware(async (auth, request) => {
  const canonicalHostRedirectUrl = getCanonicalHostRedirectUrl(request);

  if (canonicalHostRedirectUrl) {
    return withReferralCookie(
      request,
      NextResponse.redirect(canonicalHostRedirectUrl, 308),
    );
  }

  const mobileRootLobbyPath = getMobileRootLobbyRedirectPath({
    acceptLanguage: request.headers.get("accept-language"),
    localeCookie: request.cookies.get(localeCookieName)?.value,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    userAgent: request.headers.get("user-agent"),
  });

  if (mobileRootLobbyPath) {
    return withReferralCookie(
      request,
      NextResponse.redirect(new URL(mobileRootLobbyPath, request.url)),
    );
  }

  const rootHomePath = getRootHomeRedirectPath({
    acceptLanguage: request.headers.get("accept-language"),
    localeCookie: request.cookies.get(localeCookieName)?.value,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    userAgent: request.headers.get("user-agent"),
  });

  if (rootHomePath) {
    const redirectStatus = isSearchCrawlerUserAgent(
      request.headers.get("user-agent"),
    )
      ? 308
      : 307;

    return withReferralCookie(
      request,
      NextResponse.redirect(new URL(rootHomePath, request.url), redirectStatus),
    );
  }

  const localeRootHomePath = getLocaleRootHomeRedirectPath(request);

  if (localeRootHomePath) {
    return withReferralCookie(
      request,
      NextResponse.redirect(new URL(localeRootHomePath, request.url), 308),
    );
  }

  if (hasClerkKeys() && isProtectedRoute(request)) {
    const { userId } = await auth();

    if (!userId) {
      return redirectToSignIn(request);
    }
  }

  if (
    hasClerkKeys() &&
    (isAdminPageRoute(request) || isAdminApiRoute(request))
  ) {
    const authState = await auth();

    if (!authState.userId) {
      if (isAdminApiRoute(request)) {
        return withReferralCookie(
          request,
          NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        );
      }

      return redirectToSignIn(request);
    }

    if (isAdminApiRoute(request)) {
      return withReferralCookie(request, NextResponse.next());
    }
  }

  if (isUploadApiRoute(request)) {
    if (hasClerkKeys()) {
      const { userId } = await auth();

      if (!userId) {
        return withReferralCookie(
          request,
          NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
        );
      }
    }

    return withReferralCookie(request, NextResponse.next());
  }

  if (isAaApiRoute(request)) {
    if (hasClerkKeys()) {
      const { userId } = await auth();

      if (!userId) {
        return withReferralCookie(
          request,
          NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }),
        );
      }
    }

    return withReferralCookie(request, NextResponse.next());
  }

  if (isActivityRoomChatApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isActivityRoomCursorApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isChatApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isGameToolsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isPlanetsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isUserPreviewApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isFriendsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isFootprintsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isDirectMessagesApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isNotificationsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isProfileVisitsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isProfileApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isReferralsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isLobbyApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isNavigationApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isAnalyticsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isSearchApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isTranslationsApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  if (isMobileApiRoute(request)) {
    return withReferralCookie(request, NextResponse.next());
  }

  return withReferralCookie(request, intlMiddleware(request));
});

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
    "/:locale/updates",
    "/:locale/updates/:path*",
    "/api/admin/:path*",
    "/api/aa/:path*",
    "/api/activity-room-chat/:path*",
    "/api/activity-room/:path*",
    "/api/chat/:path*",
    "/api/game-tools/:path*",
    "/api/planets/:path*",
    "/api/uploads/:path*",
    "/api/user-preview/:path*",
    "/api/friends/:path*",
    "/api/footprints/:path*",
    "/api/direct-messages/:path*",
    "/api/notifications/:path*",
    "/api/profile/:path*",
    "/api/profile-visits/:path*",
    "/api/referrals/:path*",
    "/api/lobby/:path*",
    "/api/navigation/:path*",
    "/api/analytics/:path*",
    "/api/search/:path*",
    "/api/translations/:path*",
    "/api/mobile/:path*",
  ],
};
