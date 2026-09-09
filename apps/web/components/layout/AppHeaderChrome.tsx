"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { withLocale } from "@/lib/routes";
import { cn } from "@/lib/utils";

type AppHeaderChromeProps = {
  children: ReactNode;
  locale: string;
};

function shouldHideHeaderOnMobile(pathname: string, locale: string) {
  const localizedLobbyPrefix = `${withLocale(locale, "/lobby")}/`;
  const localizedActivitiesPrefix = `${withLocale(locale, "/activities")}/`;
  const localizedAdminActivityPriorityPath = withLocale(
    locale,
    "/admin/activity-priority",
  );
  const localizedFootprintsPrefix = `${withLocale(locale, "/footprints")}/`;
  const localizedGameToolsPrefix = `${withLocale(locale, "/game-tools")}/`;
  const localizedMessagesPrefix = `${withLocale(locale, "/messages")}/`;
  const localizedPlanetsPrefix = `${withLocale(locale, "/planets")}/`;
  const localizedProfilePrefix = `${withLocale(locale, "/profile")}/`;
  const localizedAccountPrefix = `${withLocale(locale, "/account")}/`;
  const localizedPublicEventsPrefix = `${withLocale(locale, "/public-events")}/`;
  const localizedTopNewsPrefix = `${withLocale(locale, "/top-news")}/`;

  return (
    pathname === withLocale(locale, "/mobile-home") ||
    pathname === withLocale(locale, "/footprints") ||
    pathname === withLocale(locale, "/planets") ||
    pathname === withLocale(locale, "/profile") ||
    pathname === withLocale(locale, "/lobby") ||
    pathname === withLocale(locale, "/activities") ||
    pathname === withLocale(locale, "/notifications") ||
    pathname === withLocale(locale, "/search") ||
    pathname === localizedAdminActivityPriorityPath ||
    pathname.startsWith(localizedActivitiesPrefix) ||
    pathname.startsWith(localizedFootprintsPrefix) ||
    pathname.startsWith(localizedLobbyPrefix) ||
    pathname.startsWith(localizedMessagesPrefix) ||
    pathname.startsWith(localizedPlanetsPrefix) ||
    pathname.startsWith(localizedProfilePrefix) ||
    pathname.startsWith(localizedAccountPrefix) ||
    pathname.startsWith(localizedPublicEventsPrefix) ||
    pathname.startsWith(localizedTopNewsPrefix) ||
    pathname === withLocale(locale, "/activities/new") ||
    pathname === withLocale(locale, "/game-tools") ||
    pathname.startsWith(localizedGameToolsPrefix)
  );
}

export function AppHeaderChrome({ children, locale }: AppHeaderChromeProps) {
  const pathname = usePathname();
  const hideOnMobile = shouldHideHeaderOnMobile(pathname, locale);

  return (
    <header
      className={cn(
        "app-header sticky top-0 z-40 border-b border-[#D6D5B2] bg-[#F1F2EC]",
        hideOnMobile && "max-md:hidden",
      )}
    >
      {children}
    </header>
  );
}
