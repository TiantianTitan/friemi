export type LedgerTransactionInput = {
  id: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  status:
    | "PENDING_REVIEW"
    | "POSTED"
    | "REJECTED"
    | "PENDING_CONFIRMATION"
    | "DISPUTED"
    | "VOIDED";
  baseAmountMinor: bigint;
  contributions: Array<{
    participantId: string;
    amountMinor: bigint;
  }>;
  shares: Array<{
    participantId: string;
    amountMinor: bigint;
  }>;
  transferFromParticipantId?: string | null;
  transferToParticipantId?: string | null;
};

export type ParticipantBalance = {
  participantId: string;
  balanceMinor: bigint;
};

export type SettlementSuggestion = {
  fromParticipantId: string;
  toParticipantId: string;
  amountMinor: bigint;
};

function addToBalance(
  balances: Map<string, bigint>,
  participantId: string,
  amountMinor: bigint,
) {
  balances.set(
    participantId,
    (balances.get(participantId) ?? 0n) + amountMinor,
  );
}

function sumAmounts(values: Array<{ amountMinor: bigint }>) {
  return values.reduce((sum, value) => sum + value.amountMinor, 0n);
}

export function assertTransactionInvariant(
  transaction: LedgerTransactionInput,
) {
  if (transaction.baseAmountMinor <= 0n) {
    throw new Error("INVALID_TRANSACTION_AMOUNT");
  }

  if (transaction.type === "TRANSFER") {
    if (
      !transaction.transferFromParticipantId ||
      !transaction.transferToParticipantId ||
      transaction.transferFromParticipantId ===
        transaction.transferToParticipantId
    ) {
      throw new Error("INVALID_TRANSFER_PARTICIPANTS");
    }

    if (transaction.contributions.length || transaction.shares.length) {
      throw new Error("TRANSFER_HAS_SPLITS");
    }

    return;
  }

  if (
    transaction.contributions.length === 0 ||
    transaction.shares.length === 0
  ) {
    throw new Error("MISSING_TRANSACTION_SPLITS");
  }

  if (sumAmounts(transaction.contributions) !== transaction.baseAmountMinor) {
    throw new Error("CONTRIBUTION_TOTAL_MISMATCH");
  }

  if (sumAmounts(transaction.shares) !== transaction.baseAmountMinor) {
    throw new Error("SHARE_TOTAL_MISMATCH");
  }
}

export function calculateBalances(
  participantIds: string[],
  transactions: LedgerTransactionInput[],
): ParticipantBalance[] {
  const balances = new Map(
    participantIds.map((participantId) => [participantId, 0n] as const),
  );

  transactions.forEach((transaction) => {
    if (transaction.status !== "POSTED") {
      return;
    }

    assertTransactionInvariant(transaction);

    if (transaction.type === "TRANSFER") {
      addToBalance(
        balances,
        transaction.transferFromParticipantId!,
        transaction.baseAmountMinor,
      );
      addToBalance(
        balances,
        transaction.transferToParticipantId!,
        -transaction.baseAmountMinor,
      );
      return;
    }

    const contributionSign = transaction.type === "EXPENSE" ? 1n : -1n;
    const shareSign = transaction.type === "EXPENSE" ? -1n : 1n;

    transaction.contributions.forEach((contribution) => {
      addToBalance(
        balances,
        contribution.participantId,
        contribution.amountMinor * contributionSign,
      );
    });
    transaction.shares.forEach((share) => {
      addToBalance(
        balances,
        share.participantId,
        share.amountMinor * shareSign,
      );
    });
  });

  const result = [...balances.entries()]
    .map(([participantId, balanceMinor]) => ({ participantId, balanceMinor }))
    .sort((left, right) =>
      left.participantId.localeCompare(right.participantId),
    );

  if (result.reduce((sum, balance) => sum + balance.balanceMinor, 0n) !== 0n) {
    throw new Error("LEDGER_BALANCE_INVARIANT_FAILED");
  }

  return result;
}

export function buildSettlementSuggestions(
  balances: ParticipantBalance[],
): SettlementSuggestion[] {
  const total = balances.reduce(
    (sum, balance) => sum + balance.balanceMinor,
    0n,
  );

  if (total !== 0n) {
    throw new Error("LEDGER_BALANCE_INVARIANT_FAILED");
  }

  const creditors = balances
    .filter((balance) => balance.balanceMinor > 0n)
    .map((balance) => ({ ...balance }))
    .sort((left, right) => {
      if (left.balanceMinor === right.balanceMinor) {
        return left.participantId.localeCompare(right.participantId);
      }

      return left.balanceMinor > right.balanceMinor ? -1 : 1;
    });
  const debtors = balances
    .filter((balance) => balance.balanceMinor < 0n)
    .map((balance) => ({ ...balance }))
    .sort((left, right) => {
      if (left.balanceMinor === right.balanceMinor) {
        return left.participantId.localeCompare(right.participantId);
      }

      return left.balanceMinor < right.balanceMinor ? -1 : 1;
    });
  const suggestions: SettlementSuggestion[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountMinor =
      creditor.balanceMinor < -debtor.balanceMinor
        ? creditor.balanceMinor
        : -debtor.balanceMinor;

    suggestions.push({
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amountMinor,
    });

    creditor.balanceMinor -= amountMinor;
    debtor.balanceMinor += amountMinor;

    if (creditor.balanceMinor === 0n) {
      creditorIndex += 1;
    }

    if (debtor.balanceMinor === 0n) {
      debtorIndex += 1;
    }
  }

  return suggestions;
}
