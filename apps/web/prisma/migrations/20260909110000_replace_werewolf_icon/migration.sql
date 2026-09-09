UPDATE "public"."TopNewsItem"
SET
  "imageUrl" = '/game-tools/werewolf/werewolf.png',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "imageUrl" = '/game-tools/werewolf/werewolf.jpeg';
