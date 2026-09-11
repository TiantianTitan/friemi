"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Bell, Info, MessageCircle, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";

type ParticipantPreview = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};

type ParticipantToolCardProps = {
  aaActionCount: number;
  aaContent?: ReactNode;
  aaHref: string;
  aaUnavailable?: boolean;
  announcementContent?: ReactNode;
  announcementHref: string;
  announcementUnread?: boolean;
  canAccessAa: boolean;
  chatDisabled?: boolean;
  chatHref: string;
  chatUnreadCount?: number;
  detailContent?: ReactNode;
  detailHref: string;
  locale: string;
  participantCount: number;
  participants: ParticipantPreview[];
  variant?: "card" | "bare";
};

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      aa: "AA",
      announcement: "Annonce",
      chat: "Discussion",
      detail: "Détails",
      joined: "Participants",
      unavailable: "Indisponible",
    };
  }

  if (locale === "en") {
    return {
      aa: "AA",
      announcement: "Notice",
      chat: "Chat",
      detail: "Details",
      joined: "Participants",
      unavailable: "Unavailable",
    };
  }

  return {
    aa: "AA",
    announcement: "公告",
    chat: "聊天",
    detail: "详情",
    joined: "参与者",
    unavailable: "暂不可用",
  };
}

function ToolButton({
  expanded,
  icon,
  label,
  onClick,
  unread,
}: {
  expanded: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  unread?: boolean;
}) {
  return (
    <button
      aria-expanded={expanded}
      className={cn(
        "group relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#369758] active:scale-[0.97]",
        expanded
          ? "bg-[#F2F8F3] text-[#156240]"
          : "text-[#607268] hover:bg-[#F2F8F3] hover:text-[#156240]",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="relative flex h-6 w-6 items-center justify-center text-[#5C8A6C] transition group-hover:text-[#156240]">
        {icon}
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#E7457A] ring-2 ring-white" />
        ) : null}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function getInitial(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

function Avatar({
  participant,
  index,
}: {
  participant: ParticipantPreview;
  index: number;
}) {
  return (
    <span
      aria-label={participant.nickname}
      className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#ECF5EF] text-[11px] font-bold text-[#156240] shadow-sm ring-1 ring-[#C7DCCB]"
      style={{ marginLeft: index === 0 ? 0 : -7 }}
      title={participant.nickname}
    >
      {participant.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="h-full w-full object-cover"
          src={participant.avatarUrl}
        />
      ) : (
        getInitial(participant.nickname)
      )}
    </span>
  );
}

function ToolLink({
  badge,
  disabled,
  href,
  icon,
  label,
  unread,
}: {
  badge?: number;
  disabled?: boolean;
  href: string;
  icon: React.ReactNode;
  label: string;
  unread?: boolean;
}) {
  return (
    <Link
      aria-disabled={disabled || undefined}
      className={cn(
        "group relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#369758] active:scale-[0.97]",
        disabled
          ? "pointer-events-none text-[#8B907F]/60"
          : "text-[#607268] hover:bg-[#F2F8F3] hover:text-[#156240]",
      )}
      href={href}
      target="_top"
    >
      <span className="relative flex h-6 w-6 items-center justify-center text-[#5C8A6C] transition group-hover:text-[#156240]">
        {icon}
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#E7457A] ring-2 ring-white" />
        ) : null}
        {badge ? (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E7457A] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

export function ParticipantToolCard({
  aaActionCount,
  aaContent,
  aaHref,
  aaUnavailable = false,
  announcementContent,
  announcementHref,
  announcementUnread = false,
  canAccessAa,
  chatDisabled = false,
  chatHref,
  chatUnreadCount = 0,
  detailContent,
  detailHref,
  locale,
  participantCount,
  participants,
  variant = "card",
}: ParticipantToolCardProps) {
  const copy = getCopy(locale);
  const preview = participants.slice(0, 5);
  const extraCount = Math.max(participantCount - preview.length, 0);
  const [openPanel, setOpenPanel] = useState<
    "aa" | "announcement" | "detail" | null
  >(null);
  const bare = variant === "bare";
  const togglePanel = (panel: "aa" | "announcement" | "detail") => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <section
      className={cn(
        bare
          ? "min-w-0"
          : "rounded-[1.1rem] border border-[#E3DFD0] bg-white px-3 py-3 shadow-[0_8px_22px_rgba(21,98,64,0.04)]",
      )}
    >
      {!bare ? (
        <div className="flex min-w-0 items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#111210]/56">
              {copy.joined}
            </p>
            <p className="mt-0.5 text-[12px] font-bold text-[#111210]">
              {participantCount}
            </p>
          </div>
          <div className="flex min-w-0 items-center justify-end pr-1">
            {preview.map((participant, index) => (
              <Avatar
                index={index}
                key={participant.id}
                participant={participant}
              />
            ))}
            {extraCount > 0 ? (
              <span className="-ml-1 flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-[#F1F2EC] px-1.5 text-[10px] font-bold text-[#111210]/58 shadow-sm ring-1 ring-[#D6D5B2]">
                +{extraCount}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "grid grid-cols-4",
          bare ? "py-1" : "mt-2 border-t border-[#EEEBDD] pt-1",
        )}
      >
        <ToolLink
          badge={chatUnreadCount}
          disabled={chatDisabled}
          href={chatHref}
          icon={<MessageCircle className="h-[18px] w-[18px]" />}
          label={copy.chat}
        />
        {bare && detailContent ? (
          <ToolButton
            expanded={openPanel === "detail"}
            icon={<Info className="h-[18px] w-[18px]" />}
            label={copy.detail}
            onClick={() => togglePanel("detail")}
          />
        ) : (
          <ToolLink
            href={detailHref}
            icon={<Info className="h-[18px] w-[18px]" />}
            label={copy.detail}
          />
        )}
        {bare && announcementContent ? (
          <ToolButton
            expanded={openPanel === "announcement"}
            icon={<Bell className="h-[18px] w-[18px]" />}
            label={copy.announcement}
            onClick={() => togglePanel("announcement")}
            unread={announcementUnread}
          />
        ) : (
          <ToolLink
            href={announcementHref}
            icon={<Bell className="h-[18px] w-[18px]" />}
            label={copy.announcement}
            unread={announcementUnread}
          />
        )}
        {bare && aaContent && !aaUnavailable ? (
          <ToolButton
            expanded={openPanel === "aa"}
            icon={<ReceiptText className="h-[18px] w-[18px]" />}
            label={copy.aa}
            onClick={() => togglePanel("aa")}
            unread={canAccessAa && aaActionCount > 0}
          />
        ) : (
          <ToolLink
            badge={canAccessAa && !aaUnavailable ? aaActionCount : undefined}
            disabled={aaUnavailable}
            href={aaHref}
            icon={<ReceiptText className="h-[18px] w-[18px]" />}
            label={aaUnavailable ? copy.unavailable : copy.aa}
          />
        )}
      </div>
      {bare && openPanel ? (
        <div className="mt-2 border-t border-[#EEEBDD] pt-4">
          {openPanel === "detail"
            ? detailContent
            : openPanel === "announcement"
              ? announcementContent
              : aaContent}
        </div>
      ) : null}
    </section>
  );
}
