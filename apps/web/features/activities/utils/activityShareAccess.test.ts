import assert from "node:assert/strict";
import test from "node:test";
import { getPrivateActivitySharePath } from "./activityShareAccess";

test("private activity share links include the invitation token", () => {
  assert.equal(
    getPrivateActivitySharePath({
      activityId: "private_1",
      locale: "zh-CN",
      shareToken: "invite token/+",
    }),
    "/zh-CN/lobby/private_1?access=invite+token%2F%2B",
  );
});

test("private activity share links preserve supported presentation state", () => {
  assert.equal(
    getPrivateActivitySharePath({
      activityId: "private_1",
      extraSearchParams: {
        claimed: "1",
        sheet: "1",
      },
      locale: "fr",
      shareToken: "invite_token",
    }),
    "/fr/lobby/private_1?access=invite_token&claimed=1&sheet=1",
  );
});
