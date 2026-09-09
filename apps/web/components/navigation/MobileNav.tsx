"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { locales } from "@chill-club/shared";
import { Compass, Globe2, Plus, UserRound, UsersRound } from "lucide-react";
import { withLocale } from "@/lib/routes";
import { getCopy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useNotificationBadge } from "@/features/notifications/components/NotificationBadgeProvider";
import { IntentPrefetchLink } from "./IntentPrefetchLink";
import { useMobileNavSection } from "./MobileNavSectionContext";

type MobileNavProps = {
  locale: string;
};

function shouldHideMobileNav(pathname: string, locale: string) {
  return (
    pathname === withLocale(locale, "/game-tools") ||
    pathname.startsWith(`${withLocale(locale, "/game-tools")}/`) ||
    pathname.startsWith(`${withLocale(locale, "/messages")}/`) ||
    pathname.startsWith(`${withLocale(locale, "/top-news")}/`)
  );
}

export function MobileNav({ locale }: MobileNavProps) {
  const t = getCopy(locale);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sectionOverride } = useMobileNavSection();
  const { unreadDirectMessageCount } = useNotificationBadge();
  const currentLocale = locales.includes(locale as (typeof locales)[number])
    ? locale
    : "zh-CN";
  const unreadBadgeText =
    unreadDirectMessageCount > 99 ? "99+" : String(unreadDirectMessageCount);
  const items = useMemo(
    () => [
      {
        href: "/mobile-home",
        label: t.nav.hallShort,
        icon: Compass,
      },
      {
        href: "/lobby",
        label: t.nav.lobbyShort,
        icon: UsersRound,
      },
      {
        href: "/activities/new",
        label: t.nav.newActivity,
        icon: Plus,
        isPrimary: true,
      },
      {
        href: "/footprints?tab=moment",
        label: t.nav.footprintsShort,
        icon: Globe2,
      },
      {
        href: "/profile",
        label: t.nav.profileShort,
        icon: UserRound,
      },
    ],
    [
      t.nav.hallShort,
      t.nav.footprintsShort,
      t.nav.lobbyShort,
      t.nav.newActivity,
      t.nav.profileShort,
    ],
  );

  if (
    searchParams.get("sheet") === "1" ||
    shouldHideMobileNav(pathname, currentLocale)
  ) {
    return null;
  }

  function isItemActive(href: string) {
    const baseHref = href.split("?")[0] ?? href;

    if (sectionOverride === "lobby") {
      return baseHref === "/lobby";
    }

    if (sectionOverride === "activities") {
      return baseHref === "/activities/new";
    }

    const localizedHref = withLocale(currentLocale, baseHref);

    if (baseHref === "/") {
      return pathname === localizedHref;
    }

    if (baseHref === "/activities/new") {
      return (
        pathname === localizedHref || pathname.startsWith(`${localizedHref}/`)
      );
    }

    return (
      pathname === localizedHref || pathname.startsWith(`${localizedHref}/`)
    );
  }

  return (
    <nav className="app-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-[#E9E9E4] bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto grid h-[var(--app-mobile-nav-height)] max-w-md grid-cols-5 gap-1 px-4 py-1">
        {items.map((item) => {
          const Icon = item.icon;
          const baseHref = item.href.split("?")[0] ?? item.href;
          const active = isItemActive(item.href);
          const showUnreadBadge =
            baseHref === "/footprints" && unreadDirectMessageCount > 0;

          return (
            <IntentPrefetchLink
              key={item.href}
              href={withLocale(currentLocale, item.href)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-end gap-0 rounded-[0.85rem] px-1 pb-0.5 pt-0 text-[10px] font-semibold leading-[1.05] transition duration-200 ease-out active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#369758]/30",
                item.isPrimary
                  ? active
                    ? "h-10 w-10 self-center justify-center justify-self-center rounded-full bg-[#156240] p-0 text-white"
                    : "h-10 w-10 self-center justify-center justify-self-center rounded-full bg-[#156240] p-0 text-white"
                  : active
                    ? "-translate-y-0.5 text-forest"
                    : "text-[#1D1D1B]/72",
              )}
            >
              <span
                className={cn(
                  "absolute rounded-full transition duration-200",
                  item.isPrimary
                    ? "top-1.5 h-0 w-0 bg-transparent"
                    : active
                      ? "-top-0.5 h-1 w-4 bg-[#369758]"
                      : "-top-0.5 h-1 w-0 bg-transparent",
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "relative inline-flex h-6 w-6 items-center justify-center rounded-full transition duration-200",
                  item.isPrimary
                    ? active
                      ? "h-8 w-8 text-white"
                      : "h-8 w-8 text-white"
                    : active
                      ? "text-forest"
                      : "text-[#1D1D1B]/64",
                )}
              >
                <Icon
                  className={cn(
                    "shrink-0",
                    item.isPrimary ? "h-[18px] w-[18px]" : "h-[17px] w-[17px]",
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
                {showUnreadBadge ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E7457A] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                    {unreadBadgeText}
                  </span>
                ) : null}
              </span>
              {item.isPrimary ? null : (
                <span
                  className={cn(
                    "max-w-full whitespace-nowrap transition",
                    active ? "font-semibold text-forest" : null,
                  )}
                >
                  {item.label}
                </span>
              )}
            </IntentPrefetchLink>
          );
        })}
      </div>
    </nav>
  );
}
