import assert from "node:assert/strict";
import test from "node:test";
import { csvRowsToObjects, parseNamedMinorAmounts } from "./csv";

test("AA CSV parser handles commas, quotes and BOM", () => {
  const rows = csvRowsToObjects('\uFEFF"id","title"\n"1","Dinner, drinks"\n"2","A ""quote"""\n');
  assert.deepEqual(rows, [
    { line: 2, values: { id: "1", title: "Dinner, drinks" } },
    { line: 3, values: { id: "2", title: 'A "quote"' } },
  ]);
});

test("AA CSV named amount parser uses the last separator", () => {
  assert.deepEqual(parseNamedMinorAmounts("Mia:1200 | Leo:800"), [
    { displayName: "Mia", amountMinor: 1200n },
    { displayName: "Leo", amountMinor: 800n },
  ]);
});
