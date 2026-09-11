import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales } from "@chill-club/shared";
import { AppHeader } from "@/components/layout/AppHeader";
import { AndroidAuthReturnRefresh } from "@/features/auth/components/AndroidAuthReturnRefresh";
import { AuthSessionRefresh } from "@/features/auth/components/AuthSessionRefresh";
import { MobileNav } from "@/components/navigation/MobileNav";
import { MobileNavSectionProvider } from "@/components/navigation/MobileNavSectionContext";
import { MobileScrollProgress } from "@/components/navigation/MobileScrollProgress";
import { IdleRoutePrefetcher } from "@/components/navigation/IdleRoutePrefetcher";
import { RouteProgress } from "@/components/navigation/RouteProgress";
import { RouteTransitionMetrics } from "@/components/navigation/RouteTransitionMetrics";
import { FriemiAlertProvider } from "@/components/ui/FriemiAlertProvider";
import { NotificationBadgeProvider } from "@/features/notifications/components/NotificationBadgeProvider";
import { resolveUnreadBadgeFreshnessGuardEnabled } from "@/features/notifications/unreadBadgePolling";
import { AndroidAppBridge } from "@/features/mobile/components/AndroidAppBridge";
import { IOSAppBridge } from "@/features/mobile/components/IOSAppBridge";
import { ActiveGameToolFloatingWindow } from "@/features/game-tools/components/ActiveGameToolFloatingWindow";
import {
  getActiveGameToolRoomForProfile,
  getGameToolPrivateSeatPath,
  getGameToolRoomPath,
} from "@/features/game-tools/gameToolRooms";
import { NicknameRequiredGate } from "@/features/profile/components/NicknameRequiredGate";
import { PresenceHeartbeat } from "@/features/profile/components/PresenceHeartbeat";
import { ViewerProfileProvider } from "@/features/profile/components/ViewerProfileProvider";
import { getOptionalLayoutViewerState } from "@/lib/auth";
import { hasClerkKeys } from "@/lib/clerk";
import { createPerformanceTracker } from "@/lib/performance";
import { withLocale } from "@/lib/routes";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  const perf = createPerformanceTracker({
    locale,
    route: "/[locale]/layout",
  });
  const [messages, viewerState] = await Promise.all([
    perf.measure("i18n.messages", getMessages),
    perf.measure("viewer.identity", getOptionalLayoutViewerState),
  ]);
  const viewerProfile = viewerState.profile;
  const activeGameToolRoom = viewerProfile
    ? await perf.measure("gameTool.activeRoom", () =>
        getActiveGameToolRoomForProfile({
          profileId: viewerProfile.id,
        }),
      )
    : null;
  const activeGameToolPrivateSeatPath = activeGameToolRoom?.privateSeatToken
    ? getGameToolPrivateSeatPath({
        kind: activeGameToolRoom.kind,
        privateSeatToken: activeGameToolRoom.privateSeatToken,
      })
    : null;
  const activeGameToolFloatingRoom = activeGameToolRoom
    ? {
        code: activeGameToolRoom.code,
        href: withLocale(
          locale,
          getGameToolRoomPath({
            kind: activeGameToolRoom.kind,
            roomId: activeGameToolRoom.id,
          }),
        ),
        id: activeGameToolRoom.id,
        kind: activeGameToolRoom.kind,
        privateSeatHref: activeGameToolPrivateSeatPath
          ? withLocale(locale, activeGameToolPrivateSeatPath)
          : null,
        seatNumber: activeGameToolRoom.seatNumber,
        title: activeGameToolRoom.title,
      }
    : null;
  perf.finish({
    hasViewer: Boolean(viewerProfile),
    showAdminNav: viewerState.showAdminNav,
  });
  const clerkEnabled = hasClerkKeys();
  const unreadBadgeFreshnessGuardEnabled =
    resolveUnreadBadgeFreshnessGuardEnabled({
      configuredValue: process.env.UNREAD_BADGE_FRESHNESS_GUARD_ENABLED,
      vercelEnvironment: process.env.VERCEL_ENV,
    });
  const content = (
    <NextIntlClientProvider messages={messages}>
      <ViewerProfileProvider initialNickname={viewerProfile?.nickname ?? null}>
        <NotificationBadgeProvider
          enabled={Boolean(viewerProfile)}
          freshnessGuardEnabled={unreadBadgeFreshnessGuardEnabled}
          initialUnreadNotificationCount={
            viewerState.initialUnreadNotificationCount
          }
          key={viewerProfile?.id ?? "anonymous"}
        >
          <MobileNavSectionProvider>
            <div className="app-layout-shell min-h-screen pb-24 md:pb-0">
              <RouteProgress />
              <RouteTransitionMetrics locale={locale} />
              <AndroidAppBridge locale={locale} />
              {clerkEnabled ? <IOSAppBridge /> : null}
              <AppHeader
                locale={locale}
                isAuthenticated={Boolean(viewerProfile)}
                showNotificationNav={Boolean(viewerProfile)}
                showAdminNav={viewerState.showAdminNav}
                viewerContactEmail={viewerProfile?.contactEmail ?? null}
                viewerEmail={viewerProfile?.email ?? null}
                viewerFriendCode={viewerProfile?.friendCode ?? null}
                viewerPhone={viewerProfile?.phone ?? null}
                viewerWechatId={viewerProfile?.wechatId ?? null}
                viewerNickname={viewerProfile?.nickname ?? null}
                unreadNotificationCount={
                  viewerState.initialUnreadNotificationCount
                }
              />
              <MobileScrollProgress />
              {clerkEnabled ? (
                <>
                  <AndroidAuthReturnRefresh
                    locale={locale}
                    serverAuthenticated={Boolean(viewerProfile)}
                  />
                  <AuthSessionRefresh
                    serverAuthenticated={Boolean(viewerProfile)}
                  />
                </>
              ) : null}
              {viewerProfile ? <NicknameRequiredGate locale={locale} /> : null}
              {viewerProfile ? <PresenceHeartbeat /> : null}
              {children}
              <ActiveGameToolFloatingWindow
                activeRoom={activeGameToolFloatingRoom}
                locale={locale}
              />
              <IdleRoutePrefetcher locale={locale} />
              <MobileNav locale={locale} />
              <FriemiAlertProvider locale={locale} />
            </div>
          </MobileNavSectionProvider>
        </NotificationBadgeProvider>
      </ViewerProfileProvider>
    </NextIntlClientProvider>
  );

  return clerkEnabled ? <ClerkProvider>{content}</ClerkProvider> : content;
}
