import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMoneyExpression } from "./calculator";

test("AA calculator respects precedence and parentheses", () => {
  assert.equal(evaluateMoneyExpression("12.5 + 8 * 2"), "28.5");
  assert.equal(evaluateMoneyExpression("(12.5 + 8) * 2"), "41");
});

test("AA calculator rounds to currency input precision", () => {
  assert.equal(evaluateMoneyExpression("100 / 3"), "33.33");
});

test("AA calculator rejects unsafe or invalid expressions", () => {
  assert.throws(() => evaluateMoneyExpression("globalThis.alert(1)"));
  assert.throws(() => evaluateMoneyExpression("1 / 0"));
  assert.throws(() => evaluateMoneyExpression("-1"));
});
