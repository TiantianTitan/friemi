import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import {
  allocateByWeights,
  allocateEqually,
  convertToBaseMinor,
  parseMoneyToMinor,
} from "./money";
import { buildSettlementSuggestions, calculateBalances } from "./ledger";

test("equal split assigns remainder deterministically and preserves the total", () => {
  const result = allocateEqually(1000n, ["c", "a", "b"]);

  assert.deepEqual(result, [
    { participantId: "c", amountMinor: 333n },
    { participantId: "a", amountMinor: 334n },
    { participantId: "b", amountMinor: 333n },
  ]);
  assert.equal(
    result.reduce((sum, item) => sum + item.amountMinor, 0n),
    1000n,
  );
});

test("weighted split uses largest remainder", () => {
  assert.deepEqual(
    allocateByWeights(10n, [
      { participantId: "a", weight: 1n },
      { participantId: "b", weight: 2n },
      { participantId: "c", weight: 3n },
    ]),
    [
      { participantId: "a", amountMinor: 2n },
      { participantId: "b", amountMinor: 3n },
      { participantId: "c", amountMinor: 5n },
    ],
  );
});

test("money and exchange-rate parsing avoid floating point", () => {
  assert.equal(parseMoneyToMinor("12.30"), 1230n);
  assert.equal(convertToBaseMinor(1000n, "1.0755"), 1076n);
});

test("expense, income, and transfer share one zero-sum balance model", () => {
  const balances = calculateBalances(
    ["a", "b", "c"],
    [
      {
        id: "dinner",
        type: "EXPENSE",
        status: "POSTED",
        baseAmountMinor: 3000n,
        contributions: [{ participantId: "a", amountMinor: 3000n }],
        shares: [
          { participantId: "a", amountMinor: 1000n },
          { participantId: "b", amountMinor: 1000n },
          { participantId: "c", amountMinor: 1000n },
        ],
      },
      {
        id: "refund",
        type: "INCOME",
        status: "POSTED",
        baseAmountMinor: 300n,
        contributions: [{ participantId: "a", amountMinor: 300n }],
        shares: [
          { participantId: "a", amountMinor: 100n },
          { participantId: "b", amountMinor: 100n },
          { participantId: "c", amountMinor: 100n },
        ],
      },
      {
        id: "partial-payment",
        type: "TRANSFER",
        status: "POSTED",
        baseAmountMinor: 500n,
        contributions: [],
        shares: [],
        transferFromParticipantId: "b",
        transferToParticipantId: "a",
      },
    ],
  );

  assert.deepEqual(balances, [
    { participantId: "a", balanceMinor: 1300n },
    { participantId: "b", balanceMinor: -400n },
    { participantId: "c", balanceMinor: -900n },
  ]);
  assert.deepEqual(buildSettlementSuggestions(balances), [
    { fromParticipantId: "c", toParticipantId: "a", amountMinor: 900n },
    { fromParticipantId: "b", toParticipantId: "a", amountMinor: 400n },
  ]);
});

test("pending, disputed, and voided records never affect balances", () => {
  const ignoredStatuses = [
    "PENDING_REVIEW",
    "REJECTED",
    "PENDING_CONFIRMATION",
    "DISPUTED",
    "VOIDED",
  ] as const;
  const balances = calculateBalances(
    ["a", "b"],
    ignoredStatuses.map((status) => ({
      id: status,
      type: "EXPENSE" as const,
      status,
      baseAmountMinor: 100n,
      contributions: [{ participantId: "a", amountMinor: 100n }],
      shares: [{ participantId: "b", amountMinor: 100n }],
    })),
  );

  assert.deepEqual(balances, [
    { participantId: "a", balanceMinor: 0n },
    { participantId: "b", balanceMinor: 0n },
  ]);
});

test("50 participants and 10,000 entries settle within the v2.8 budget", () => {
  const participantIds = Array.from({ length: 50 }, (_, index) => `p-${index}`);
  const transactions = Array.from({ length: 10_000 }, (_, index) => ({
    id: `expense-${index}`,
    type: "EXPENSE" as const,
    status: "POSTED" as const,
    baseAmountMinor: 100n,
    contributions: [{ participantId: "p-0", amountMinor: 100n }],
    shares: [
      {
        participantId: `p-${(index % 49) + 1}`,
        amountMinor: 100n,
      },
    ],
  }));
  const startedAt = performance.now();
  const balances = calculateBalances(participantIds, transactions);
  const suggestions = buildSettlementSuggestions(balances);
  const durationMs = performance.now() - startedAt;

  assert.ok(durationMs < 500, `calculation took ${durationMs.toFixed(1)} ms`);
  assert.ok(suggestions.length <= 49);
  assert.equal(
    balances.reduce((sum, balance) => sum + balance.balanceMinor, 0n),
    0n,
  );
});
