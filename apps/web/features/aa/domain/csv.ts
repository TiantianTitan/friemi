export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (quoted) throw new Error("UNCLOSED_QUOTE");
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function csvRowsToObjects(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = rows[0]?.map((header) => header.trim()) ?? [];

  if (headers.length === 0 || new Set(headers).size !== headers.length) {
    throw new Error("INVALID_HEADERS");
  }

  return rows.slice(1).map((row, index) => ({
    line: index + 2,
    values: Object.fromEntries(
      headers.map((header, column) => [header, row[column] ?? ""]),
    ),
  }));
}

export function parseNamedMinorAmounts(value: string) {
  if (!value.trim()) return [];
  return value.split(" | ").map((part) => {
    const separator = part.lastIndexOf(":");
    if (separator <= 0) throw new Error("INVALID_NAMED_AMOUNT");
    const displayName = part.slice(0, separator).trim();
    const amountMinor = BigInt(part.slice(separator + 1).trim());
    if (!displayName || amountMinor < 0n) {
      throw new Error("INVALID_NAMED_AMOUNT");
    }
    return { amountMinor, displayName };
  });
}
