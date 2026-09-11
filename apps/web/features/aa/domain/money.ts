export type WeightedParticipant = {
  participantId: string;
  weight: bigint;
};

export type MinorAllocation = {
  participantId: string;
  amountMinor: bigint;
};

const decimalPattern = /^\d+(?:\.\d+)?$/;

export function parseDecimalToScaledInteger(value: string, scale = 6) {
  const normalized = value.trim();

  if (!decimalPattern.test(normalized)) {
    throw new Error("INVALID_DECIMAL");
  }

  const [whole, fraction = ""] = normalized.split(".");

  if (fraction.length > scale) {
    throw new Error("TOO_MANY_DECIMALS");
  }

  return (
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0") || "0")
  );
}

export function parseMoneyToMinor(value: string, exponent = 2) {
  const normalized = value.trim();

  if (!decimalPattern.test(normalized)) {
    throw new Error("INVALID_MONEY");
  }

  const [whole, fraction = ""] = normalized.split(".");

  if (fraction.length > exponent) {
    throw new Error("TOO_MANY_DECIMALS");
  }

  return (
    BigInt(whole) * 10n ** BigInt(exponent) +
    BigInt(fraction.padEnd(exponent, "0") || "0")
  );
}

export function formatMinorAmount(
  amountMinor: bigint,
  currency: string,
  locale: string,
) {
  const normalizedLocale = locale === "zh-CN" ? "zh-CN" : locale;
  const maximumSafeMinor = BigInt(Number.MAX_SAFE_INTEGER);

  if (amountMinor <= maximumSafeMinor && amountMinor >= -maximumSafeMinor) {
    return new Intl.NumberFormat(normalizedLocale, {
      currency,
      style: "currency",
    }).format(Number(amountMinor) / 100);
  }

  const absolute = amountMinor < 0n ? -amountMinor : amountMinor;
  const major = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");

  return `${amountMinor < 0n ? "-" : ""}${currency} ${major}.${fraction}`;
}

export function allocateByWeights(
  totalMinor: bigint,
  participants: WeightedParticipant[],
): MinorAllocation[] {
  if (totalMinor < 0n) {
    throw new Error("NEGATIVE_TOTAL");
  }

  if (participants.length === 0) {
    throw new Error("EMPTY_PARTICIPANTS");
  }

  if (participants.some((participant) => participant.weight <= 0n)) {
    throw new Error("INVALID_WEIGHT");
  }

  const seen = new Set<string>();

  participants.forEach((participant) => {
    if (seen.has(participant.participantId)) {
      throw new Error("DUPLICATE_PARTICIPANT");
    }

    seen.add(participant.participantId);
  });

  const totalWeight = participants.reduce(
    (sum, participant) => sum + participant.weight,
    0n,
  );
  const raw = participants.map((participant) => {
    const numerator = totalMinor * participant.weight;

    return {
      participantId: participant.participantId,
      amountMinor: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  const allocated = raw.reduce((sum, item) => sum + item.amountMinor, 0n);
  let remaining = totalMinor - allocated;
  const remainderOrder = [...raw].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.participantId.localeCompare(right.participantId);
    }

    return left.remainder > right.remainder ? -1 : 1;
  });
  const increments = new Set(
    remainderOrder
      .slice(0, Number(remaining))
      .map((item) => item.participantId),
  );

  return raw.map((item) => ({
    participantId: item.participantId,
    amountMinor:
      item.amountMinor + (increments.has(item.participantId) ? 1n : 0n),
  }));
}

export function allocateEqually(totalMinor: bigint, participantIds: string[]) {
  return allocateByWeights(
    totalMinor,
    participantIds.map((participantId) => ({ participantId, weight: 1n })),
  );
}

export function convertToBaseMinor(
  originalAmountMinor: bigint,
  fxRate: string,
) {
  const scale = 12;
  const scaledRate = parseDecimalToScaledInteger(fxRate, scale);
  const denominator = 10n ** BigInt(scale);
  const numerator = originalAmountMinor * scaledRate;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  // Financial conversion uses half-up rounding once, before any split.
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}
