import type { NotificationType } from "@prisma/client";
import { getActivityDetailPath } from "@/features/activities/utils/activityRoutes";

export type PushCopyLocale = "zh-CN" | "en" | "fr";

export function normalizePushLocale(value: string | null): PushCopyLocale {
  if (value === "zh-CN" || value?.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }

  if (value === "en" || value?.toLowerCase().startsWith("en")) {
    return "en";
  }

  return "fr";
}

export function getNotificationPath(input: {
  aaTransactionId?: string | null;
  activityId: string | null;
  actorId?: string | null;
  conversationId?: string | null;
  momentId?: string | null;
  planetSlug?: string | null;
  type: NotificationType;
}) {
  if (input.type.startsWith("AA_") && input.activityId) {
    return input.aaTransactionId
      ? `/lobby/${input.activityId}/aa/transactions/${input.aaTransactionId}`
      : `/lobby/${input.activityId}/aa`;
  }
  if (
    input.type === "MOMENT_LIKED" ||
    input.type === "MOMENT_COMMENTED" ||
    input.type === "MOMENT_COMMENT_REPLY" ||
    input.type === "MOMENT_REPOSTED"
  ) {
    return input.momentId ? `/footprints/${input.momentId}` : "/footprints";
  }

  if (input.type === "ACTIVITY_ROOM_MESSAGE") {
    return input.activityId ? `/lobby/${input.activityId}/room` : "/lobby";
  }

  if (
    input.type === "PLANET_MESSAGE" ||
    input.type === "PLANET_JOIN_REQUEST"
  ) {
    return input.planetSlug
      ? `/planets/${input.planetSlug}/chat`
      : "/planets";
  }

  if (input.activityId) {
    if (input.type === "ACTIVITY_COMMENTED" || input.type === "COMMENT_REPLY") {
      return `${getActivityDetailPath(input.activityId)}#comments`;
    }

    if (input.type === "PARTICIPATION_PENDING") {
      return `${getActivityDetailPath(input.activityId)}#participation-approval`;
    }

    return getActivityDetailPath(input.activityId);
  }

  if (input.type === "DIRECT_MESSAGE") {
    return input.conversationId
      ? `/messages/${input.conversationId}`
      : "/messages";
  }

  if (input.type === "CHARM_GIFT_RECEIVED") {
    return "/profile/gift-wall";
  }

  return "/notifications";
}

const directMessagePreviewMaxLength = 120;

function truncateMessagePreview(body: string) {
  const trimmed = body.trim();

  return trimmed.length > directMessagePreviewMaxLength
    ? `${trimmed.slice(0, directMessagePreviewMaxLength).trim()}…`
    : trimmed;
}

export function getNotificationCopy(input: {
  activityTitle: string | null;
  actorActivityRole?: "ORGANIZER" | "CO_MANAGER" | null;
  actorName: string | null;
  giftText?: string | null;
  locale: PushCopyLocale;
  messageBody?: string | null;
  planetName?: string | null;
  type: NotificationType;
}) {
  const activityTitle =
    input.activityTitle ||
    (input.locale === "zh-CN"
      ? "你的活动"
      : input.locale === "en"
        ? "your plan"
        : "votre sortie");
  const planetName =
    input.planetName ||
    (input.locale === "zh-CN"
      ? "星球"
      : input.locale === "en"
        ? "your planet"
        : "votre planète");
  const hasActorName = Boolean(input.actorName?.trim());
  const actorName =
    input.actorName ||
    (input.locale === "zh-CN"
      ? "有人"
      : input.locale === "en"
        ? "Someone"
        : "Quelqu'un");
  const isCheckInRequest =
    input.type === "ACTIVITY_CHECK_IN" &&
    hasActorName &&
    input.actorActivityRole === null;

  const copy: Record<
    PushCopyLocale,
    Partial<Record<NotificationType, string>>
  > = {
    "zh-CN": {
      ACTIVITY_ANNOUNCEMENT: `${activityTitle} 有新公告`,
      ACTIVITY_CHECK_IN: isCheckInRequest
        ? `${actorName} 提交了签到`
        : `${activityTitle} 签到成功`,
      ACTIVITY_CANCELLED: `${activityTitle} 已取消`,
      ACTIVITY_COMMENTED: `${actorName} 评论了 ${activityTitle}`,
      ACTIVITY_UPDATED: `${activityTitle} 有更新`,
      COMMENT_REPLY: `${actorName} 回复了你`,
      DIRECT_MESSAGE: `${actorName} 给你发来新消息`,
      FRIEND_REQUEST: `${actorName} 关注了你`,
      CHARM_GIFT_RECEIVED: `${actorName} 给你送了礼物`,
      MOMENT_COMMENTED: `${actorName} 评论了你的足迹`,
      MOMENT_COMMENT_REPLY: `${actorName} 回复了你的评论`,
      MOMENT_LIKED: `${actorName} 点赞了你的足迹`,
      MOMENT_REPOSTED: `${actorName} 转发了你的足迹`,
      PARTICIPATION_APPROVED: `${activityTitle} 已通过你的报名`,
      PARTICIPATION_CANCELLED: `${actorName} 取消了报名`,
      PARTICIPATION_CONFIRMED: hasActorName
        ? `${actorName} 已报名`
        : `${activityTitle} 报名已确认`,
      PARTICIPATION_PENDING: `${actorName} 提交了报名申请`,
      PARTICIPATION_REJECTED: `${activityTitle} 未通过报名`,
      REPORT_CREATED: "有新的举报需要处理",
      PLANET_MESSAGE: `「${planetName}」有新消息`,
      ACTIVITY_ROOM_MESSAGE: `「${activityTitle}」群聊有新消息`,
      PLANET_JOIN_REQUEST: `${actorName} 申请加入「${planetName}」`,
      AA_REVIEW_REQUIRED: `${activityTitle} 有一笔 AA 记录待审核`,
      AA_ENTRY_UPDATED: `${activityTitle} 的 AA 记录有变更`,
      AA_TRANSFER_CONFIRMATION: `${activityTitle} 有一笔转账待确认`,
      AA_DISPUTE_OPENED: `${activityTitle} 有一笔核算争议`,
      AA_PAYMENT_REQUEST: `${activityTitle} 有新的付款请求`,
    },
    en: {
      ACTIVITY_ANNOUNCEMENT: `${activityTitle} has a new announcement`,
      ACTIVITY_CHECK_IN: isCheckInRequest
        ? `${actorName} checked in`
        : `Check-in confirmed for ${activityTitle}`,
      ACTIVITY_CANCELLED: `${activityTitle} was cancelled`,
      ACTIVITY_COMMENTED: `${actorName} commented on ${activityTitle}`,
      ACTIVITY_UPDATED: `${activityTitle} was updated`,
      COMMENT_REPLY: `${actorName} replied to you`,
      DIRECT_MESSAGE: `${actorName} sent you a message`,
      FRIEND_REQUEST: `${actorName} started following you`,
      CHARM_GIFT_RECEIVED: `${actorName} sent you a gift`,
      MOMENT_COMMENTED: `${actorName} commented on your moment`,
      MOMENT_COMMENT_REPLY: `${actorName} replied to your comment`,
      MOMENT_LIKED: `${actorName} liked your moment`,
      MOMENT_REPOSTED: `${actorName} reposted your moment`,
      PARTICIPATION_APPROVED: `You're approved for ${activityTitle}`,
      PARTICIPATION_CANCELLED: `${actorName} cancelled their join`,
      PARTICIPATION_CONFIRMED: hasActorName
        ? `${actorName} joined ${activityTitle}`
        : `You're confirmed for ${activityTitle}`,
      PARTICIPATION_PENDING: `${actorName} asked to join`,
      PARTICIPATION_REJECTED: `${activityTitle} could not approve you`,
      REPORT_CREATED: "A new report needs review",
      PLANET_MESSAGE: `New messages in ${planetName}`,
      ACTIVITY_ROOM_MESSAGE: `New messages in ${activityTitle}`,
      PLANET_JOIN_REQUEST: `${actorName} asked to join ${planetName}`,
      AA_REVIEW_REQUIRED: `${activityTitle} has an AA entry to review`,
      AA_ENTRY_UPDATED: `${activityTitle} AA ledger was updated`,
      AA_TRANSFER_CONFIRMATION: `${activityTitle} has a payment to confirm`,
      AA_DISPUTE_OPENED: `${activityTitle} has a ledger dispute`,
      AA_PAYMENT_REQUEST: `${activityTitle} has a payment request`,
    },
    fr: {
      ACTIVITY_ANNOUNCEMENT: `${activityTitle} a une nouvelle annonce`,
      ACTIVITY_CHECK_IN: isCheckInRequest
        ? `${actorName} a envoye son pointage`
        : `Pointage confirmé pour ${activityTitle}`,
      ACTIVITY_CANCELLED: `${activityTitle} a été annulée`,
      ACTIVITY_COMMENTED: `${actorName} a commenté ${activityTitle}`,
      ACTIVITY_UPDATED: `${activityTitle} a été mise à jour`,
      COMMENT_REPLY: `${actorName} vous a répondu`,
      DIRECT_MESSAGE: `${actorName} vous a envoyé un message`,
      FRIEND_REQUEST: `${actorName} vous suit`,
      CHARM_GIFT_RECEIVED: `${actorName} vous a envoyé un cadeau`,
      MOMENT_COMMENTED: `${actorName} a commenté votre moment`,
      MOMENT_COMMENT_REPLY: `${actorName} a répondu à votre commentaire`,
      MOMENT_LIKED: `${actorName} a aimé votre moment`,
      MOMENT_REPOSTED: `${actorName} a republié votre moment`,
      PARTICIPATION_APPROVED: `Votre inscription à ${activityTitle} est validée`,
      PARTICIPATION_CANCELLED: `${actorName} a annulé son inscription`,
      PARTICIPATION_CONFIRMED: hasActorName
        ? `${actorName} a rejoint ${activityTitle}`
        : `Votre inscription à ${activityTitle} est confirmée`,
      PARTICIPATION_PENDING: `${actorName} demande à participer`,
      PARTICIPATION_REJECTED: `${activityTitle} n'a pas pu vous accepter`,
      REPORT_CREATED: "Un nouveau signalement est à traiter",
      PLANET_MESSAGE: `Nouveaux messages dans ${planetName}`,
      ACTIVITY_ROOM_MESSAGE: `Nouveaux messages dans ${activityTitle}`,
      PLANET_JOIN_REQUEST: `${actorName} demande à rejoindre ${planetName}`,
      AA_REVIEW_REQUIRED: `${activityTitle} a une opération AA à valider`,
      AA_ENTRY_UPDATED: `Le compte AA de ${activityTitle} a été mis à jour`,
      AA_TRANSFER_CONFIRMATION: `${activityTitle} a un paiement à confirmer`,
      AA_DISPUTE_OPENED: `${activityTitle} a un désaccord de compte`,
      AA_PAYMENT_REQUEST: `${activityTitle} a une demande de paiement`,
    },
  };

  if (input.type === "DIRECT_MESSAGE" && input.messageBody?.trim()) {
    return {
      body: truncateMessagePreview(input.messageBody),
      title: actorName,
    };
  }

  if (input.type === "CHARM_GIFT_RECEIVED" && input.giftText?.trim()) {
    return {
      body: input.giftText,
      title: copy[input.locale].CHARM_GIFT_RECEIVED ?? "Friemi",
    };
  }

  if (input.type === "ACTIVITY_CHECK_IN" && !isCheckInRequest) {
    return {
      body:
        input.locale === "zh-CN"
          ? "信用值 +0.1"
          : input.locale === "en"
            ? "Credit +0.1"
            : "Crédit +0,1",
      title:
        input.locale === "zh-CN"
          ? "签到成功"
          : input.locale === "en"
            ? "Check-in confirmed"
            : "Présence confirmée",
    };
  }

  return {
    body: copy[input.locale][input.type] ?? activityTitle,
    title: "Friemi",
  };
}

export function isInvalidFirebaseTokenResponse(status: number, text: string) {
  return (
    status === 400 ||
    status === 404 ||
    text.includes("UNREGISTERED") ||
    text.includes("INVALID_ARGUMENT")
  );
}

export function getAPNsErrorReason(text: string) {
  try {
    const payload = JSON.parse(text) as { reason?: unknown };
    return typeof payload.reason === "string" ? payload.reason : null;
  } catch {
    return null;
  }
}

export function isInvalidAPNsTokenResponse(status: number, text: string) {
  if (status === 410) {
    return true;
  }

  const reason = getAPNsErrorReason(text);

  return (
    reason === "BadDeviceToken" ||
    reason === "DeviceTokenNotForTopic" ||
    reason === "Unregistered"
  );
}
