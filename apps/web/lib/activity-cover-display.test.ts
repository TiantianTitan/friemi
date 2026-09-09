import assert from "node:assert/strict";
import test from "node:test";
import {
  getActivityCoverDisplayUrl,
  getActivityCoverThumbnailUrl,
} from "./activity-cover-display";

test("builds a compact Supabase public image URL for activity cards", () => {
  const source =
    "https://demo.supabase.co/storage/v1/object/public/activity-covers/user/cover.png";
  const thumbnail = new URL(
    getActivityCoverThumbnailUrl(source, 192),
    "https://friemi.example",
  );

  assert.equal(thumbnail.pathname, "/api/activity-cover-thumbnail");
  assert.equal(thumbnail.searchParams.get("url"), source);
  assert.equal(thumbnail.searchParams.get("size"), "192");
  assert.equal(thumbnail.searchParams.get("quality"), "75");
});

test("does not proxy files outside the public activity cover bucket", () => {
  const source =
    "https://demo.supabase.co/storage/v1/object/public/avatars/user/avatar.png";

  assert.equal(getActivityCoverThumbnailUrl(source, 192), source);
});

test("keeps local illustrations unchanged", () => {
  assert.equal(
    getActivityCoverThumbnailUrl("/illustrations/png/dining.png", 192),
    "/illustrations/png/dining.png",
  );
});

test("keeps the existing proxy behavior for protected remote covers", () => {
  const source = "https://cdn.sortiraparis.com/images/event.jpg";

  assert.equal(
    getActivityCoverThumbnailUrl(source, 192),
    getActivityCoverDisplayUrl(source),
  );
});
