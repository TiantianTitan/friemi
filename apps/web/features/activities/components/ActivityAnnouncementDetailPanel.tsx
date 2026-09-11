"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Bell, ChevronDown } from "lucide-react";
import { acknowledgeActivityAnnouncementAction } from "@/features/activity-room-chat/actions/activityRoomChatActions";
import type { ActivityAnnouncementViewModel } from "@/features/activities/types";

type ActivityAnnouncementDetailPanelProps = {
  activityId: string;
  announcements: ActivityAnnouncementViewModel[];
  editor?: ReactNode;
  hasUnread: boolean;
  locale: string;
};

function getCopy(locale: string) {
  if (locale === "fr") {
    return {
      collapse: "Réduire",
      empty: "Aucune annonce pour le moment.",
      latest: "Dernière",
      markRead: "Marquer l'annonce comme lue",
      title: "Annonce de groupe",
      viewAll: "Voir les annonces",
    };
  }

  if (locale === "en") {
    return {
      collapse: "Collapse",
      empty: "No announcement yet.",
      latest: "Latest",
      markRead: "Mark announcement as read",
      title: "Group announcement",
      viewAll: "View announcements",
    };
  }

  return {
    collapse: "收起公告",
    empty: "暂无群公告",
    latest: "最新",
    markRead: "标记群公告为已读",
    title: "群公告",
    viewAll: "查看公告列表",
  };
}

function formatTimestamp(locale: string, value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ActivityAnnouncementDetailPanel({
  activityId,
  announcements,
  editor,
  hasUnread,
  locale,
}: ActivityAnnouncementDetailPanelProps) {
  const latestAnnouncement = announcements[0];
  const [acknowledgedAnnouncementId, setAcknowledgedAnnouncementId] = useState<
    string | null
  >(null);
  const copy = getCopy(locale);
  const showUnreadDot = Boolean(
    hasUnread &&
    latestAnnouncement &&
    latestAnnouncement.id !== acknowledgedAnnouncementId,
  );

  useEffect(() => {
    setAcknowledgedAnnouncementId(null);
  }, [latestAnnouncement?.id]);

  function handleAcknowledge() {
    if (!showUnreadDot || !latestAnnouncement) {
      return;
    }

    const formData = new FormData();
    formData.set("activityId", activityId);
    formData.set("announcementId", latestAnnouncement.id);
    formData.set("locale", locale);

    setAcknowledgedAnnouncementId(latestAnnouncement.id);
    void acknowledgeActivityAnnouncementAction(formData).catch(() => {
      setAcknowledgedAnnouncementId(null);
    });
  }

  return (
    <section className="rounded-xl border border-[#E3DFD0] bg-white px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <button
          aria-label={showUnreadDot ? copy.markRead : undefined}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left transition active:opacity-70 disabled:cursor-default"
          disabled={!latestAnnouncement}
          onClick={handleAcknowledge}
          type="button"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ECF5EF] text-[#156240] ring-1 ring-[#D8E8DC]">
            <Bell className="h-4 w-4" />
            {showUnreadDot ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#E7457A] ring-2 ring-white"
              />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[13px] font-bold leading-4 text-ink">
                {copy.title}
              </span>
              {latestAnnouncement ? (
                <>
                  <span className="text-[10px] font-bold text-[#E7457A]">
                    {copy.latest}
                  </span>
                  <span className="text-[10px] font-semibold text-[#8B907F]">
                    {formatTimestamp(locale, latestAnnouncement.createdAt)}
                  </span>
                </>
              ) : null}
            </span>
            <span className="mt-0.5 block whitespace-pre-wrap break-words text-[12px] font-semibold leading-[1.15rem] text-[#111210]/72">
              {latestAnnouncement?.content ?? copy.empty}
            </span>
          </span>
        </button>
        {editor ? <div className="shrink-0">{editor}</div> : null}
      </div>

      {announcements.length > 1 ? (
        <details className="group mt-2.5">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#D6D5B2] bg-[#FEFFF9] px-2.5 text-[11px] font-bold text-[#156240] transition active:scale-[0.98] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{copy.viewAll}</span>
            <span className="hidden group-open:inline">{copy.collapse}</span>
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <div className="mt-2.5 grid gap-2">
            {announcements.map((announcement) => (
              <article
                className="rounded-[1rem] border border-[#E7E2D6] bg-[#FEFFF9] px-3.5 py-3"
                key={announcement.id}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] font-bold text-[#8B907F]">
                  <span className="rounded-full bg-white px-2 py-1 text-[#156240] ring-1 ring-[#D8E8DC]">
                    {announcement.authorName}
                  </span>
                  <span>{formatTimestamp(locale, announcement.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#111210]">
                  {announcement.content}
                </p>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
