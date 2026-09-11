import type {
  AaParticipantRole,
  AaTransactionStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildSettlementSuggestions,
  calculateBalances,
  type LedgerTransactionInput,
} from "../domain/ledger";
import { getActivityAaAccess } from "./access";

export const maxAaParticipants = 50;

export class AaLedgerError extends Error {
  constructor(
    public readonly code:
      | "ACTIVITY_NOT_FOUND"
      | "FORBIDDEN"
      | "MAX_PARTICIPANTS"
      | "LEDGER_NOT_FOUND",
  ) {
    super(code);
  }
}

const defaultCategories = [
  ["餐饮", "utensils"],
  ["交通", "car"],
  ["住宿", "bed"],
  ["门票", "ticket"],
  ["购物", "shopping-bag"],
  ["其他", "receipt"],
] as const;

function isActivityFinished(activity: { status: string; endAt: Date | null }) {
  return (
    activity.status === "CANCELLED" ||
    activity.status === "ENDED" ||
    Boolean(activity.endAt && activity.endAt <= new Date())
  );
}

type DesiredParticipant = {
  userProfileId?: string;
  guestActivityParticipantId?: string;
  displayNameSnapshot: string;
  avatarUrlSnapshot?: string | null;
  role: AaParticipantRole;
};

function collectDesiredParticipants(activity: {
  organizer: { id: string; nickname: string; avatarUrl: string | null };
  coManagers: Array<{
    manager: { id: string; nickname: string; avatarUrl: string | null };
  }>;
  participants: Array<{
    userProfile: { id: string; nickname: string; avatarUrl: string | null };
  }>;
  guestParticipants: Array<{ id: string; displayName: string }>;
}) {
  const result: DesiredParticipant[] = [];
  const seenProfiles = new Set<string>();

  const addProfile = (
    profile: { id: string; nickname: string; avatarUrl: string | null },
    role: AaParticipantRole,
  ) => {
    if (seenProfiles.has(profile.id)) {
      const existing = result.find(
        (participant) => participant.userProfileId === profile.id,
      );

      if (existing && (role === "OWNER" || role === "ADMIN")) {
        existing.role = role;
      }
      return;
    }

    seenProfiles.add(profile.id);
    result.push({
      userProfileId: profile.id,
      displayNameSnapshot: profile.nickname,
      avatarUrlSnapshot: profile.avatarUrl,
      role,
    });
  };

  addProfile(activity.organizer, "OWNER");
  activity.coManagers.forEach(({ manager }) => addProfile(manager, "ADMIN"));
  activity.participants.forEach(({ userProfile }) =>
    addProfile(userProfile, "MEMBER"),
  );
  activity.guestParticipants.forEach((guest) => {
    result.push({
      guestActivityParticipantId: guest.id,
      displayNameSnapshot: guest.displayName,
      avatarUrlSnapshot: null,
      role: "GUEST",
    });
  });

  return result;
}

export async function ensureActivityAaLedger(
  activityId: string,
  profileId: string,
) {
  const access = await getActivityAaAccess(activityId, profileId);

  if (!access) {
    throw new AaLedgerError("FORBIDDEN");
  }

  return prisma.$transaction(async (tx) => {
    const activity = await tx.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        title: true,
        coverImageUrl: true,
        status: true,
        startAt: true,
        endAt: true,
        organizer: {
          select: { id: true, nickname: true, avatarUrl: true },
        },
        coManagers: {
          select: {
            manager: {
              select: { id: true, nickname: true, avatarUrl: true },
            },
          },
        },
        participants: {
          where: { status: { in: ["JOINED", "APPROVED"] } },
          select: {
            userProfile: {
              select: { id: true, nickname: true, avatarUrl: true },
            },
          },
        },
        guestParticipants: {
          where: {
            linkedParticipantId: null,
            status: { in: ["JOINED", "APPROVED"] },
          },
          select: { id: true, displayName: true },
        },
      },
    });

    if (!activity) {
      throw new AaLedgerError("ACTIVITY_NOT_FOUND");
    }

    const stillAuthorized =
      activity.organizer.id === profileId ||
      activity.coManagers.some(({ manager }) => manager.id === profileId) ||
      activity.participants.some(
        ({ userProfile }) => userProfile.id === profileId,
      );

    if (!stillAuthorized) {
      const historicalParticipant = await tx.aaParticipant.findFirst({
        where: { ledger: { activityId }, userProfileId: profileId },
        select: { id: true },
      });

      if (!historicalParticipant) {
        throw new AaLedgerError("FORBIDDEN");
      }
    }

    const desiredParticipants = collectDesiredParticipants(activity);

    if (desiredParticipants.length > maxAaParticipants) {
      throw new AaLedgerError("MAX_PARTICIPANTS");
    }

    const ledger = await tx.aaLedger.upsert({
      where: { activityId: activity.id },
      create: {
        activityId: activity.id,
        creatorId: activity.organizer.id,
        titleSnapshot: activity.title,
        coverImageUrlSnapshot: activity.coverImageUrl,
        status: isActivityFinished(activity) ? "FROZEN" : "ACTIVE",
        categories: {
          create: defaultCategories.map(([name, iconKey], sortOrder) => ({
            name,
            iconKey,
            sortOrder,
          })),
        },
      },
      update: {
        titleSnapshot: activity.title,
        coverImageUrlSnapshot: activity.coverImageUrl,
      },
      select: {
        id: true,
        status: true,
        _count: { select: { participants: true } },
      },
    });

    // A ledger created after an activity has ended starts frozen, but it still
    // needs its initial participant snapshot so the organizer and attendees can
    // open and settle the historical activity. Once populated, frozen ledgers
    // deliberately stop following later roster changes.
    if (ledger.status === "ACTIVE" || ledger._count.participants === 0) {
      const activeIds: string[] = [];

      for (const participant of desiredParticipants) {
        if (participant.userProfileId) {
          const synced = await tx.aaParticipant.upsert({
            where: {
              ledgerId_userProfileId: {
                ledgerId: ledger.id,
                userProfileId: participant.userProfileId,
              },
            },
            create: {
              ledgerId: ledger.id,
              userProfileId: participant.userProfileId,
              displayNameSnapshot: participant.displayNameSnapshot,
              avatarUrlSnapshot: participant.avatarUrlSnapshot,
              role: participant.role,
            },
            update: {
              displayNameSnapshot: participant.displayNameSnapshot,
              avatarUrlSnapshot: participant.avatarUrlSnapshot,
              role: participant.role,
              status: "ACTIVE",
              inactivatedAt: null,
            },
            select: { id: true },
          });
          activeIds.push(synced.id);
          continue;
        }

        if (participant.guestActivityParticipantId) {
          const synced = await tx.aaParticipant.upsert({
            where: {
              ledgerId_guestActivityParticipantId: {
                ledgerId: ledger.id,
                guestActivityParticipantId:
                  participant.guestActivityParticipantId,
              },
            },
            create: {
              ledgerId: ledger.id,
              guestActivityParticipantId:
                participant.guestActivityParticipantId,
              displayNameSnapshot: participant.displayNameSnapshot,
              role: participant.role,
            },
            update: {
              displayNameSnapshot: participant.displayNameSnapshot,
              role: participant.role,
              status: "ACTIVE",
              inactivatedAt: null,
            },
            select: { id: true },
          });
          activeIds.push(synced.id);
        }
      }

      await tx.aaParticipant.updateMany({
        where: {
          ledgerId: ledger.id,
          id: { notIn: activeIds },
          status: "ACTIVE",
        },
        data: { status: "INACTIVE", inactivatedAt: new Date() },
      });
    }

    return ledger;
  });
}

const ledgerSnapshotInclude = {
  participants: {
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
  },
  transactions: {
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    include: {
      contributions: true,
      shares: true,
      creator: true,
      reviewer: true,
      transferFrom: true,
      transferTo: true,
      attachments: true,
      conflicts: { where: { status: "OPEN" } },
      changeRequests: {
        where: { status: "PENDING" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        include: { actor: true },
      },
    },
  },
  categories: {
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  },
  auditEvents: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    include: { actor: true },
  },
} satisfies Prisma.AaLedgerInclude;

function toLedgerInput(
  transaction: Prisma.AaTransactionGetPayload<{
    include: { contributions: true; shares: true };
  }>,
): LedgerTransactionInput {
  return {
    id: transaction.id,
    type: transaction.type,
    status: transaction.status,
    baseAmountMinor: transaction.baseAmountMinor,
    contributions: transaction.contributions.map((contribution) => ({
      participantId: contribution.participantId,
      amountMinor: contribution.amountMinor,
    })),
    shares: transaction.shares.map((share) => ({
      participantId: share.participantId,
      amountMinor: share.amountMinor,
    })),
    transferFromParticipantId: transaction.transferFromParticipantId,
    transferToParticipantId: transaction.transferToParticipantId,
  };
}

function isManagerRole(role: AaParticipantRole) {
  return role === "OWNER" || role === "ADMIN";
}

export async function getActivityAaSnapshot(
  activityId: string,
  profileId: string,
) {
  await ensureActivityAaLedger(activityId, profileId);
  const ledger = await prisma.aaLedger.findUnique({
    where: { activityId },
    include: ledgerSnapshotInclude,
  });

  if (!ledger) {
    throw new AaLedgerError("LEDGER_NOT_FOUND");
  }

  const viewer = ledger.participants.find(
    (participant) => participant.userProfileId === profileId,
  );

  if (!viewer) {
    throw new AaLedgerError("FORBIDDEN");
  }

  const currentAccess = await getActivityAaAccess(activityId, profileId);

  const calculationInputs = ledger.transactions.map(toLedgerInput);
  const balances = calculateBalances(
    ledger.participants.map((participant) => participant.id),
    calculationInputs,
  );
  const suggestions = buildSettlementSuggestions(balances);
  const participantById = new Map(
    ledger.participants.map((participant) => [participant.id, participant]),
  );
  const balanceById = new Map(
    balances.map((balance) => [balance.participantId, balance.balanceMinor]),
  );
  const canManage = Boolean(currentAccess?.canManage);
  const pendingReviewCount = canManage
    ? ledger.transactions.filter(
        (transaction) => transaction.status === "PENDING_REVIEW",
      ).length
    : 0;
  const pendingChangeCount = canManage
    ? ledger.transactions.filter(
        (transaction) => transaction.changeRequests.length > 0,
      ).length
    : 0;
  const pendingConfirmationCount = ledger.transactions.filter(
    (transaction) =>
      transaction.status === "PENDING_CONFIRMATION" &&
      ((transaction.transferFromParticipantId === viewer.id &&
        !transaction.payerConfirmedAt) ||
        (transaction.transferToParticipantId === viewer.id &&
          !transaction.payeeConfirmedAt)),
  ).length;
  const viewerSettlementCount = suggestions.filter(
    (suggestion) => suggestion.fromParticipantId === viewer.id,
  ).length;
  const postedTransactions = ledger.transactions.filter(
    (transaction) => transaction.status === "POSTED",
  );
  const categoryTotals = new Map<string, bigint>();
  postedTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .forEach((transaction) => {
      categoryTotals.set(
        transaction.categoryNameSnapshot,
        (categoryTotals.get(transaction.categoryNameSnapshot) ?? 0n) +
          transaction.baseAmountMinor,
      );
    });

  return {
    id: ledger.id,
    activityId,
    title: ledger.titleSnapshot,
    coverImageUrl: ledger.coverImageUrlSnapshot,
    baseCurrency: ledger.baseCurrency,
    timezone: ledger.timezone,
    status: ledger.status,
    version: ledger.version,
    requireMemberReview: ledger.requireMemberReview,
    requireTransferConfirmation: ledger.requireTransferConfirmation,
    allowMemberCorrections: ledger.allowMemberCorrections,
    canManage,
    viewer: {
      id: viewer.id,
      role: viewer.role,
      status: viewer.status,
      displayName: viewer.displayNameSnapshot,
      balanceMinor: (balanceById.get(viewer.id) ?? 0n).toString(),
    },
    summary: {
      expenseTotalMinor: ledger.transactions
        .filter(
          (transaction) =>
            transaction.type === "EXPENSE" && transaction.status === "POSTED",
        )
        .reduce((sum, transaction) => sum + transaction.baseAmountMinor, 0n)
        .toString(),
      incomeTotalMinor: postedTransactions
        .filter((transaction) => transaction.type === "INCOME")
        .reduce((sum, transaction) => sum + transaction.baseAmountMinor, 0n)
        .toString(),
      transferTotalMinor: postedTransactions
        .filter((transaction) => transaction.type === "TRANSFER")
        .reduce((sum, transaction) => sum + transaction.baseAmountMinor, 0n)
        .toString(),
      futurePostedCount: postedTransactions.filter(
        (transaction) => transaction.occurredAt > new Date(),
      ).length,
      postedCount: ledger.transactions.filter(
        (transaction) => transaction.status === "POSTED",
      ).length,
      pendingReviewCount,
      pendingConfirmationCount,
      pendingChangeCount,
      actionCount:
        pendingReviewCount +
        pendingChangeCount +
        pendingConfirmationCount +
        viewerSettlementCount,
      isSettled: balances.every((balance) => balance.balanceMinor === 0n),
      settlementBlocked: ledger.transactions.some(
        (transaction) =>
          ["PENDING_REVIEW", "PENDING_CONFIRMATION", "DISPUTED"].includes(
            transaction.status,
          ) ||
          transaction.conflicts.length > 0 ||
          transaction.changeRequests.length > 0,
      ),
    },
    participants: ledger.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayNameSnapshot,
      avatarUrl: participant.avatarUrlSnapshot,
      role: participant.role,
      status: participant.status,
      isViewer: participant.id === viewer.id,
      balanceMinor: (balanceById.get(participant.id) ?? 0n).toString(),
    })),
    categories: ledger.categories
      .filter((category) => category.isActive)
      .map((category) => ({
        id: category.id,
        name: category.name,
        iconKey: category.iconKey,
      })),
    categorySettings: ledger.categories.map((category) => ({
      id: category.id,
      name: category.name,
      iconKey: category.iconKey,
      isActive: category.isActive,
    })),
    transactions: ledger.transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      status: transaction.status,
      splitMode: transaction.splitMode,
      title: transaction.title,
      note: transaction.note,
      categoryName: transaction.categoryNameSnapshot,
      originalCurrency: transaction.originalCurrency,
      originalAmountMinor: transaction.originalAmountMinor.toString(),
      baseAmountMinor: transaction.baseAmountMinor.toString(),
      fxRate: transaction.fxRate.toString(),
      fxRateSource: transaction.fxRateSource,
      fxRateDate: transaction.fxRateDate?.toISOString() ?? null,
      occurredAt: transaction.occurredAt.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      version: transaction.version,
      creator: {
        id: transaction.creator.id,
        displayName: transaction.creator.displayNameSnapshot,
      },
      reviewer: transaction.reviewer
        ? {
            id: transaction.reviewer.id,
            displayName: transaction.reviewer.displayNameSnapshot,
          }
        : null,
      rejectionReason: transaction.rejectionReason,
      transferFrom: transaction.transferFrom
        ? {
            id: transaction.transferFrom.id,
            displayName: transaction.transferFrom.displayNameSnapshot,
          }
        : null,
      transferTo: transaction.transferTo
        ? {
            id: transaction.transferTo.id,
            displayName: transaction.transferTo.displayNameSnapshot,
          }
        : null,
      payerConfirmedAt: transaction.payerConfirmedAt?.toISOString() ?? null,
      payeeConfirmedAt: transaction.payeeConfirmedAt?.toISOString() ?? null,
      contributionNames: transaction.contributions.map(
        (contribution) =>
          participantById.get(contribution.participantId)
            ?.displayNameSnapshot ?? "—",
      ),
      relatedParticipantIds: [
        ...new Set([
          ...transaction.contributions.map((item) => item.participantId),
          ...transaction.shares.map((item) => item.participantId),
          ...(transaction.transferFromParticipantId
            ? [transaction.transferFromParticipantId]
            : []),
          ...(transaction.transferToParticipantId
            ? [transaction.transferToParticipantId]
            : []),
        ]),
      ],
      contributions: transaction.contributions.map((contribution) => ({
        participantId: contribution.participantId,
        displayName:
          participantById.get(contribution.participantId)
            ?.displayNameSnapshot ?? "—",
        amountMinor: contribution.amountMinor.toString(),
      })),
      shares: transaction.shares.map((share) => ({
        participantId: share.participantId,
        displayName:
          participantById.get(share.participantId)?.displayNameSnapshot ?? "—",
        amountMinor: share.amountMinor.toString(),
      })),
      attachmentCount: transaction.attachments.length,
      attachments: transaction.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        status: attachment.status,
      })),
      hasConflict: transaction.conflicts.length > 0,
      pendingChange: transaction.changeRequests[0]
        ? {
            id: transaction.changeRequests[0].id,
            actorName: transaction.changeRequests[0].actor.displayNameSnapshot,
            createdAt: transaction.changeRequests[0].createdAt.toISOString(),
          }
        : null,
      canReviewChange: canManage && transaction.changeRequests.length > 0,
      canReview: canManage && transaction.status === "PENDING_REVIEW",
      canConfirm:
        transaction.status === "PENDING_CONFIRMATION" &&
        ((transaction.transferFromParticipantId === viewer.id &&
          !transaction.payerConfirmedAt) ||
          (transaction.transferToParticipantId === viewer.id &&
            !transaction.payeeConfirmedAt)),
      canEdit:
        ledger.status === "ACTIVE" &&
        transaction.status !== "VOIDED" &&
        (canManage ||
          (viewer.status === "ACTIVE" &&
            transaction.changeRequests.length === 0 &&
            ((transaction.creatorParticipantId === viewer.id &&
              [
                "POSTED",
                "PENDING_REVIEW",
                "REJECTED",
                "PENDING_CONFIRMATION",
              ].includes(transaction.status)) ||
              (ledger.allowMemberCorrections &&
                transaction.status === "POSTED")))),
      canVoid:
        ledger.status === "ACTIVE" &&
        transaction.status !== "VOIDED" &&
        (canManage ||
          (transaction.creatorParticipantId === viewer.id &&
            transaction.status !== "POSTED")),
      canDispute:
        transaction.status === "POSTED" &&
        (transaction.creatorParticipantId === viewer.id ||
          transaction.contributions.some(
            (item) => item.participantId === viewer.id,
          ) ||
          transaction.shares.some((item) => item.participantId === viewer.id) ||
          transaction.transferFromParticipantId === viewer.id ||
          transaction.transferToParticipantId === viewer.id),
      canAttach:
        ledger.status === "ACTIVE" &&
        viewer.status === "ACTIVE" &&
        (canManage ||
          transaction.creatorParticipantId === viewer.id ||
          transaction.contributions.some(
            (item) => item.participantId === viewer.id,
          ) ||
          transaction.shares.some((item) => item.participantId === viewer.id) ||
          transaction.transferFromParticipantId === viewer.id ||
          transaction.transferToParticipantId === viewer.id),
    })),
    statistics: {
      categories: [...categoryTotals.entries()]
        .map(([name, amountMinor]) => ({
          name,
          amountMinor: amountMinor.toString(),
        }))
        .sort((left, right) =>
          BigInt(left.amountMinor) === BigInt(right.amountMinor)
            ? left.name.localeCompare(right.name)
            : BigInt(left.amountMinor) > BigInt(right.amountMinor)
              ? -1
              : 1,
        ),
    },
    activityLog: ledger.auditEvents.map((event) => ({
      id: event.id,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      actorName: event.actor?.displayNameSnapshot ?? null,
      createdAt: event.createdAt.toISOString(),
    })),
    settlements: suggestions.map((suggestion) => ({
      fromParticipantId: suggestion.fromParticipantId,
      fromName:
        participantById.get(suggestion.fromParticipantId)
          ?.displayNameSnapshot ?? "—",
      toParticipantId: suggestion.toParticipantId,
      toName:
        participantById.get(suggestion.toParticipantId)?.displayNameSnapshot ??
        "—",
      amountMinor: suggestion.amountMinor.toString(),
      involvesViewer:
        suggestion.fromParticipantId === viewer.id ||
        suggestion.toParticipantId === viewer.id,
    })),
  };
}

export type ActivityAaSnapshot = Awaited<
  ReturnType<typeof getActivityAaSnapshot>
>;

export async function getActivityAaEntryState(
  activityId: string,
  profileId: string | null | undefined,
) {
  if (!profileId) {
    return {
      canAccess: false,
      actionCount: 0,
      summary: null,
      unavailable: false,
    };
  }

  try {
    const access = await getActivityAaAccess(activityId, profileId);
    if (!access) {
      return {
        canAccess: false,
        actionCount: 0,
        summary: null,
        unavailable: false,
      };
    }

    const ledger = await prisma.aaLedger.findUnique({
      where: { activityId },
      select: { id: true },
    });

    if (!ledger) {
      return {
        canAccess: true,
        actionCount: 0,
        summary: null,
        unavailable: false,
      };
    }

    const snapshot = await getActivityAaSnapshot(activityId, profileId);
    return {
      canAccess: true,
      actionCount: Math.min(snapshot.summary.actionCount, 10),
      summary: {
        baseCurrency: snapshot.baseCurrency,
        participantCount: snapshot.participants.filter(
          (participant) => participant.status === "ACTIVE",
        ).length,
        pendingCount:
          snapshot.summary.pendingReviewCount +
          snapshot.summary.pendingChangeCount +
          snapshot.summary.pendingConfirmationCount,
        postedCount: snapshot.summary.postedCount,
        totalExpenseMinor: snapshot.summary.expenseTotalMinor,
        viewerBalanceMinor: snapshot.viewer.balanceMinor,
      },
      unavailable: false,
    };
  } catch (error) {
    console.error("Failed to load AA entry state", error);
    return {
      canAccess: true,
      actionCount: 0,
      summary: null,
      unavailable: true,
    };
  }
}

export function shouldTransactionAffectBalance(status: AaTransactionStatus) {
  return status === "POSTED";
}
