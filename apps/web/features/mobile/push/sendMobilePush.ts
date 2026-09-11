import { createSign } from "node:crypto";
import { connect } from "node:http2";
import type { NotificationType } from "@prisma/client";
import { getUnreadActivityRoomTotalMessageCount } from "@/features/activity-room-chat/services/activityRoomChat";
import { formatGiftNotificationText } from "@/features/charm/giftNotificationText";
import { getUnreadDirectMessageCount } from "@/features/direct-messages/queries/getDirectMessages";
import { getUnreadNotificationCount } from "@/features/notifications/queries/getNotifications";
import { getUnreadOfficialMessageCount } from "@/features/official-messages/services/officialMessages";
import { getUnreadPlanetChatTotalMessageCount } from "@/features/planets/services/planetChat";
import { prisma } from "@/lib/prisma";
import {
  getNotificationCopy,
  getNotificationPath,
  isInvalidAPNsTokenResponse,
  isInvalidFirebaseTokenResponse,
  normalizePushLocale,
} from "./pushDelivery";

async function getTotalBadgeCount(recipientId: string) {
  const [
    unreadNotificationCount,
    unreadDirectMessageCount,
    unreadOfficialMessageCount,
    unreadActivityRoomCount,
    unreadPlanetChatCount,
  ] = await Promise.all([
    getUnreadNotificationCount(recipientId),
    getUnreadDirectMessageCount(recipientId),
    getUnreadOfficialMessageCount(recipientId),
    getUnreadActivityRoomTotalMessageCount(recipientId),
    getUnreadPlanetChatTotalMessageCount(recipientId),
  ]);

  return (
    unreadNotificationCount +
    unreadDirectMessageCount +
    unreadOfficialMessageCount +
    unreadActivityRoomCount +
    unreadPlanetChatCount
  );
}

const firebaseTokenUrl = "https://oauth2.googleapis.com/token";
const firebaseScope = "https://www.googleapis.com/auth/firebase.messaging";

let cachedAccessToken: {
  expiresAt: number;
  token: string;
} | null = null;

type APNsConfig = {
  bundleId: string;
  keyId: string;
  privateKey: string;
  teamId: string;
  useSandbox: boolean;
};

function getFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    clientEmail,
    privateKey,
    projectId,
  };
}

function getAPNsConfig(): APNsConfig | null {
  const teamId = process.env.APPLE_PUSH_TEAM_ID?.trim();
  const keyId = process.env.APPLE_PUSH_KEY_ID?.trim();
  const bundleId = process.env.APPLE_PUSH_BUNDLE_ID?.trim();
  const privateKey = process.env.APPLE_PUSH_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!teamId || !keyId || !bundleId || !privateKey) {
    return null;
  }

  return {
    bundleId,
    keyId,
    privateKey,
    teamId,
    useSandbox: process.env.APPLE_PUSH_USE_SANDBOX === "true",
  };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createServiceAccountJwt(config: {
  clientEmail: string;
  privateKey: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claimSet = {
    aud: firebaseTokenUrl,
    exp: now + 3600,
    iat: now,
    iss: config.clientEmail,
    scope: firebaseScope,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claimSet),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(config.privateKey);

  return `${unsigned}.${base64Url(signature)}`;
}

function createAPNsJwt(config: APNsConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "ES256",
    kid: config.keyId,
  };
  const claimSet = {
    iat: now,
    iss: config.teamId,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claimSet),
  )}`;
  const signature = createSign("SHA256").update(unsigned).sign({
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${unsigned}.${base64Url(signature)}`;
}

async function getFirebaseAccessToken(config: {
  clientEmail: string;
  privateKey: string;
}) {
  const now = Date.now();

  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > now) {
    return cachedAccessToken.token;
  }

  const jwt = createServiceAccountJwt(config);
  const response = await fetch(firebaseTokenUrl, {
    body: new URLSearchParams({
      assertion: jwt,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Firebase token request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    throw new Error("Firebase token response did not include access_token.");
  }

  cachedAccessToken = {
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
    token: payload.access_token,
  };

  return payload.access_token;
}

async function sendIOSPushNotification(input: {
  badge: number;
  config: APNsConfig;
  copy: { body: string; title: string };
  notificationId: string;
  path: string;
  token: string;
  type: NotificationType;
}) {
  const authority = input.config.useSandbox
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  const jwt = createAPNsJwt(input.config);
  const client = connect(authority);

  return await new Promise<{ ok: boolean; status: number; text: string }>(
    (resolve, reject) => {
      client.on("error", reject);

      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${input.token}`,
        authorization: `bearer ${jwt}`,
        "apns-priority": "10",
        "apns-push-type": "alert",
        "apns-topic": input.config.bundleId,
        "content-type": "application/json",
      });

      let body = "";
      let status = 0;

      request.setEncoding("utf8");
      request.on("response", (headers) => {
        const headerStatus = headers[":status"];
        status = typeof headerStatus === "number" ? headerStatus : 0;
      });
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        client.close();
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: body,
        });
      });
      request.on("error", (error) => {
        client.destroy();
        reject(error);
      });

      request.end(
        JSON.stringify({
          aps: {
            alert: {
              body: input.copy.body,
              title: input.copy.title,
            },
            badge: input.badge,
            sound: "default",
          },
          notificationId: input.notificationId,
          path: input.path,
          type: input.type,
          url: input.path,
        }),
      );
    },
  );
}

export async function sendMobilePushForNotification(notificationId: string) {
  const config = getFirebaseConfig();
  const apnsConfig = getAPNsConfig();

  if (!config && !apnsConfig) {
    return {
      ok: false,
      skipped: true,
      reason: "PUSH_NOT_CONFIGURED",
    };
  }

  const notification = await prisma.notification.findUnique({
    where: {
      id: notificationId,
    },
    select: {
      aaTransactionId: true,
      activity: {
        select: {
          coManagers: {
            select: {
              managerProfileId: true,
            },
          },
          organizerId: true,
          title: true,
        },
      },
      activityId: true,
      actor: {
        select: {
          nickname: true,
        },
      },
      actorDisplayName: true,
      actorId: true,
      charmGiftEvent: {
        select: {
          giftEmoji: true,
          giftLabel: true,
          quantity: true,
        },
      },
      momentId: true,
      planetId: true,
      planet: {
        select: {
          name: true,
          slug: true,
        },
      },
      recipientId: true,
      type: true,
    },
  });

  if (!notification) {
    return { ok: false, skipped: true, reason: "NOTIFICATION_NOT_FOUND" };
  }

  const latestDirectMessage =
    notification.type === "DIRECT_MESSAGE" && notification.actorId
      ? await prisma.directMessage.findFirst({
          where: {
            senderId: notification.actorId,
            conversation: {
              OR: [
                {
                  userAId: notification.actorId,
                  userBId: notification.recipientId,
                },
                {
                  userAId: notification.recipientId,
                  userBId: notification.actorId,
                },
              ],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            body: true,
            conversationId: true,
          },
        })
      : null;
  const messageBody = latestDirectMessage?.body ?? null;
  const directMessageConversationId = latestDirectMessage?.conversationId ?? null;

  const devices = await prisma.mobileDevice.findMany({
    where: {
      disabledAt: null,
      platform: {
        in: ["ANDROID", "IOS"],
      },
      userProfileId: notification.recipientId,
    },
    select: {
      fcmToken: true,
      locale: true,
      platform: true,
    },
  });

  if (devices.length === 0) {
    return { ok: true, sentCount: 0 };
  }

  const actorActivityRole =
    notification.actorId && notification.activity
      ? notification.activity.organizerId === notification.actorId
        ? "ORGANIZER"
        : notification.activity.coManagers.some(
              (coManager) =>
                coManager.managerProfileId === notification.actorId,
            )
          ? "CO_MANAGER"
          : null
      : undefined;
  const accessToken = config ? await getFirebaseAccessToken(config) : null;
  const badgeCount = await getTotalBadgeCount(notification.recipientId);
  let sentCount = 0;

  for (const device of devices) {
    const locale = normalizePushLocale(device.locale);
    const copy = getNotificationCopy({
      activityTitle: notification.activity?.title ?? null,
      actorActivityRole,
      actorName:
        notification.actor?.nickname ?? notification.actorDisplayName ?? null,
      giftText: notification.charmGiftEvent
        ? formatGiftNotificationText(notification.charmGiftEvent)
        : null,
      locale,
      messageBody,
      planetName: notification.planet?.name ?? null,
      type: notification.type,
    });
    const path = getNotificationPath({
      aaTransactionId: notification.aaTransactionId,
      actorId: notification.actorId,
      activityId: notification.activityId,
      conversationId: directMessageConversationId,
      momentId: notification.momentId,
      planetSlug: notification.planet?.slug ?? null,
      type: notification.type,
    });
    if (device.platform === "ANDROID") {
      if (!config || !accessToken) {
        continue;
      }

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
        {
          body: JSON.stringify({
            message: {
              android: {
                notification: {
                  channel_id: "friemi_activity_updates",
                  notification_count: badgeCount,
                },
              },
              data: {
                badgeCount: String(badgeCount),
                notificationId,
                path,
                type: notification.type,
                unreadCount: String(badgeCount),
                url: path,
              },
              notification: copy,
              token: device.fcmToken,
            },
          }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      if (response.ok) {
        sentCount += 1;
        continue;
      }

      const errorText = await response.text();

      if (isInvalidFirebaseTokenResponse(response.status, errorText)) {
        await prisma.mobileDevice.updateMany({
          where: {
            fcmToken: device.fcmToken,
          },
          data: {
            disabledAt: new Date(),
          },
        });
      } else {
        console.error("Failed to send mobile push notification", {
          notificationId,
          platform: device.platform,
          status: response.status,
          body: errorText,
        });
      }

      continue;
    }

    if (!apnsConfig) {
      continue;
    }

    const response = await sendIOSPushNotification({
      badge: badgeCount,
      config: apnsConfig,
      copy,
      notificationId,
      path,
      token: device.fcmToken,
      type: notification.type,
    });

    if (response.ok) {
      sentCount += 1;
      continue;
    }

    if (isInvalidAPNsTokenResponse(response.status, response.text)) {
      await prisma.mobileDevice.updateMany({
        where: {
          fcmToken: device.fcmToken,
        },
        data: {
          disabledAt: new Date(),
        },
      });
    } else {
      console.error("Failed to send mobile push notification", {
        notificationId,
        platform: device.platform,
        status: response.status,
        body: response.text,
      });
    }
  }

  return { ok: true, sentCount };
}
