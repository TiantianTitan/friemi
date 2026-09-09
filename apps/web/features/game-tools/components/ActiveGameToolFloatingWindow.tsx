"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Moon, UsersRound } from "lucide-react";
import {
  ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT,
  ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
  DISMISSED_ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
  type StoredActiveGameToolRoom,
} from "@/features/game-tools/activeGameToolRoomStorage";
import { withLocale } from "@/lib/routes";
import { cn } from "@/lib/utils";

type ActiveGameToolFloatingWindowProps = {
  activeRoom: {
    code: string;
    href: string;
    id: string;
    kind: "AVALON" | "STORYTELLER" | "WEREWOLF";
    privateSeatHref: string | null;
    seatNumber: number | null;
    title: string;
  } | null;
  locale: string;
};

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      action: "Revenir",
      avalon: "Avalon en cours",
      seat: "Place",
      storyteller: "Table en cours",
      werewolf: "Loups-garous en cours",
    };
  }

  if (locale === "en") {
    return {
      action: "Return",
      avalon: "Avalon running",
      seat: "Seat",
      storyteller: "Game running",
      werewolf: "Werewolf running",
    };
  }

  return {
    action: "回到本局",
    avalon: "阿瓦隆进行中",
    seat: "座位",
    storyteller: "桌游进行中",
    werewolf: "狼人杀进行中",
  };
}

function getKindLabel(
  kind: NonNullable<ActiveGameToolFloatingWindowProps["activeRoom"]>["kind"],
  copy: ReturnType<typeof getCopy>,
) {
  if (kind === "AVALON") {
    return copy.avalon;
  }

  if (kind === "WEREWOLF") {
    return copy.werewolf;
  }

  return copy.storyteller;
}

function readStoredActiveRoom(locale: string) {
  try {
    const rawValue = window.localStorage.getItem(
      ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
    );

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredActiveGameToolRoom>;

    if (
      parsed.locale !== locale ||
      !parsed.id ||
      !parsed.href ||
      !parsed.kind ||
      !parsed.title
    ) {
      return null;
    }

    return {
      code: parsed.code ?? "",
      href: parsed.href,
      id: parsed.id,
      kind: parsed.kind,
      locale: parsed.locale,
      privateSeatHref: parsed.privateSeatHref ?? null,
      seatNumber:
        typeof parsed.seatNumber === "number" ? parsed.seatNumber : null,
      title: parsed.title,
    } satisfies StoredActiveGameToolRoom;
  } catch {
    return null;
  }
}

export function ActiveGameToolFloatingWindow({
  activeRoom,
  locale,
}: ActiveGameToolFloatingWindowProps) {
  const pathname = usePathname();
  const [storedRoom, setStoredRoom] = useState<StoredActiveGameToolRoom | null>(
    null,
  );
  const [dismissedRoomId, setDismissedRoomId] = useState<string | null>(null);

  useEffect(() => {
    const syncStoredRoom = () => {
      setStoredRoom(readStoredActiveRoom(locale));

      try {
        setDismissedRoomId(
          window.sessionStorage.getItem(
            DISMISSED_ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
          ),
        );
      } catch {
        setDismissedRoomId(null);
      }
    };

    syncStoredRoom();
    window.addEventListener("storage", syncStoredRoom);
    window.addEventListener(
      ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT,
      syncStoredRoom,
    );

    return () => {
      window.removeEventListener("storage", syncStoredRoom);
      window.removeEventListener(
        ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT,
        syncStoredRoom,
      );
    };
  }, [locale]);

  useEffect(() => {
    if (!activeRoom) {
      return;
    }

    try {
      const dismissedId = window.sessionStorage.getItem(
        DISMISSED_ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
      );

      if (dismissedId === activeRoom.id) {
        return;
      }

      window.localStorage.setItem(
        ACTIVE_GAME_TOOL_ROOM_STORAGE_KEY,
        JSON.stringify({
          ...activeRoom,
          locale,
        } satisfies StoredActiveGameToolRoom),
      );
      window.dispatchEvent(new Event(ACTIVE_GAME_TOOL_ROOM_STORAGE_EVENT));
    } catch {
      // Floating room persistence is a convenience; the server value still works.
    }
  }, [activeRoom, locale]);

  const currentRoom =
    activeRoom && activeRoom.id !== dismissedRoomId
      ? activeRoom
      : storedRoom && storedRoom.id !== dismissedRoomId
        ? storedRoom
        : null;

  if (pathname.startsWith(`${withLocale(locale, "/top-news")}/`)) {
    return null;
  }

  if (!currentRoom) {
    return null;
  }

  const isInsideActiveRoom =
    pathname.startsWith(currentRoom.href) ||
    (currentRoom.privateSeatHref
      ? pathname.startsWith(currentRoom.privateSeatHref)
      : false);

  if (isInsideActiveRoom) {
    return null;
  }

  const copy = getCopy(locale);
  const kindLabel = getKindLabel(currentRoom.kind, copy);
  const Icon = currentRoom.kind === "WEREWOLF" ? Moon : UsersRound;
  const targetHref =
    currentRoom.kind === "WEREWOLF"
      ? currentRoom.href
      : (currentRoom.privateSeatHref ?? currentRoom.href);
  const label = `${copy.action}: ${kindLabel} · ${currentRoom.title}`;

  return (
    <Link
      href={targetHref}
      aria-label={label}
      className={cn(
        "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[55] grid h-12 w-12 place-items-center rounded-full border border-[#F1F2E3]/58 bg-[#052F28] text-[#F1F2E3] shadow-[0_14px_30px_rgba(5,47,40,0.28)] md:bottom-5 md:right-5 md:h-[3.25rem] md:w-[3.25rem]",
        "transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#063A30] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F1F2E3]/70",
      )}
      title={label}
    >
      <span className="absolute inset-1 rounded-full bg-[#F1F2E3]/12" />
      <Icon className="relative h-5 w-5 text-[#F1F2E3]" strokeWidth={2.35} />
      {currentRoom.seatNumber ? (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#F1F2E3] px-1 text-[10px] font-bold leading-none text-[#052F28] ring-2 ring-white">
          {currentRoom.seatNumber}
        </span>
      ) : null}
      <span className="sr-only">
        {kindLabel} {currentRoom.code}
      </span>
    </Link>
  );
}
