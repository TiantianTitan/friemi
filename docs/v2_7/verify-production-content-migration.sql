-- Friemi Preview -> Production migration verification
-- Updated: 2026-09-09
-- Read-only: every statement in this file is SELECT-only.
-- Run this in the Supabase SQL Editor for the Production project.

-- 1. Confirm the SQL Editor is connected to the intended database.
SELECT
  current_database() AS database_name,
  current_schema() AS schema_name,
  current_user AS database_user,
  current_setting('server_version') AS postgres_version,
  now() AS checked_at;

-- 2. One-row-per-check migration summary.
WITH checks AS (
  SELECT
    'Prisma migrations recorded'::text AS check_name,
    'at least 56'::text AS expected,
    COUNT(*)::text AS actual,
    COUNT(*) >= 56 AS passed
  FROM public."_prisma_migrations"
  WHERE finished_at IS NOT NULL
    AND rolled_back_at IS NULL

  UNION ALL

  SELECT
    'Required September migrations applied',
    '2',
    COUNT(*)::text,
    COUNT(*) = 2
  FROM public."_prisma_migrations"
  WHERE migration_name IN (
    '20260831110000_trust_score_check_in_decimal',
    '20260909110000_replace_werewolf_icon'
  )
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL

  UNION ALL

  SELECT
    'Unresolved failed migrations',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM public."_prisma_migrations"
  WHERE finished_at IS NULL
    AND rolled_back_at IS NULL

  UNION ALL

  SELECT
    'TrustScoreEvent.delta type',
    'double precision',
    COALESCE(MAX(data_type), '<missing>'),
    COALESCE(BOOL_AND(data_type = 'double precision'), false)
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'TrustScoreEvent'
    AND column_name = 'delta'

  UNION ALL

  SELECT
    'Legacy +1 check-in rewards',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM public."TrustScoreEvent"
  WHERE type = 'ACTIVITY_CHECK_IN'
    AND delta = 1

  UNION ALL

  SELECT
    'Converted +0.1 check-in rewards',
    'at least 2',
    COUNT(*)::text,
    COUNT(*) >= 2
  FROM public."TrustScoreEvent"
  WHERE type = 'ACTIVITY_CHECK_IN'
    AND delta = 0.1

  UNION ALL

  SELECT
    'Old werewolf.jpeg TopNews references',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM public."TopNewsItem"
  WHERE "imageUrl" = '/game-tools/werewolf/werewolf.jpeg'

  UNION ALL

  SELECT
    'Public activities after merge',
    'at least 118',
    COUNT(*)::text,
    COUNT(*) >= 118
  FROM public."Activity"
  WHERE visibility = 'PUBLIC'

  UNION ALL

  SELECT
    'Migrated activity source links',
    'at least 2',
    COUNT(*)::text,
    COUNT(*) >= 2
  FROM public."ActivitySourceLink"

  UNION ALL

  SELECT
    'Protected activities still private',
    '3',
    COUNT(*)::text,
    COUNT(*) = 3
  FROM public."Activity"
  WHERE id IN (
    'manual_group_20260620_dage_bbq',
    'legacy_activity_007',
    'legacy_activity_017'
  )
    AND visibility = 'PRIVATE'

  UNION ALL

  SELECT
    'Preview Storage URLs remaining',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM public."Activity"
  WHERE "coverImageUrl" LIKE '%dryhbxognbrljslzciuh.supabase.co%'

  UNION ALL

  SELECT
    'Migrated image rows using Production Storage',
    '4',
    COUNT(*)::text,
    COUNT(*) = 4
  FROM public."Activity"
  WHERE id IN (
    'cmr22mmqj000xxfqw02777lyf',
    'cmr9cpy0f000gxfpck1i4qous',
    'cmrkx4ugw0002jj04q3o9ngla',
    'cmrwmkf2i000jl50478auu41o'
  )
    AND "coverImageUrl" LIKE 'https://xyavgkupjnoumlzwkzoq.supabase.co/%'

  UNION ALL

  SELECT
    'Duplicate non-null sourceUrl groups',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM (
    SELECT "sourceUrl"
    FROM public."Activity"
    WHERE "sourceUrl" IS NOT NULL
    GROUP BY "sourceUrl"
    HAVING COUNT(*) > 1
  ) AS duplicates

  UNION ALL

  SELECT
    'Duplicate external source/id groups',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM (
    SELECT "externalSource", "externalId"
    FROM public."Activity"
    WHERE "externalSource" IS NOT NULL
      AND "externalId" IS NOT NULL
    GROUP BY "externalSource", "externalId"
    HAVING COUNT(*) > 1
  ) AS duplicates

  UNION ALL

  SELECT
    'Duplicate non-null externalUrl groups',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM (
    SELECT "externalUrl"
    FROM public."Activity"
    WHERE "externalUrl" IS NOT NULL
    GROUP BY "externalUrl"
    HAVING COUNT(*) > 1
  ) AS duplicates

  UNION ALL

  SELECT
    'Orphan ActivitySourceLink rows',
    '0',
    COUNT(*)::text,
    COUNT(*) = 0
  FROM public."ActivitySourceLink" AS source_link
  LEFT JOIN public."Activity" AS activity
    ON activity.id = source_link."activityId"
  WHERE activity.id IS NULL
)
SELECT
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status,
  check_name,
  expected,
  actual
FROM checks
ORDER BY passed ASC, check_name ASC;

-- 3. Inspect the two migrations directly.
SELECT
  migration_name,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count
FROM public."_prisma_migrations"
WHERE migration_name IN (
  '20260831110000_trust_score_check_in_decimal',
  '20260909110000_replace_werewolf_icon'
)
ORDER BY migration_name;

-- 4. Inspect the protected private activities.
SELECT
  id,
  title,
  type,
  status,
  visibility,
  "organizerId",
  "updatedAt"
FROM public."Activity"
WHERE id IN (
  'manual_group_20260620_dage_bbq',
  'legacy_activity_007',
  'legacy_activity_017'
)
ORDER BY id;

-- 5. Inspect the four migrated image rows without printing full URLs.
SELECT
  id,
  title,
  split_part(split_part("coverImageUrl", '://', 2), '/', 1) AS image_host,
  visibility
FROM public."Activity"
WHERE id IN (
  'cmr22mmqj000xxfqw02777lyf',
  'cmr9cpy0f000gxfpck1i4qous',
  'cmrkx4ugw0002jj04q3o9ngla',
  'cmrwmkf2i000jl50478auu41o'
)
ORDER BY id;

-- 6. Current public activity distribution. Counts may grow after release.
SELECT
  type,
  COALESCE(source, '<none>') AS source,
  COUNT(*) AS activity_count
FROM public."Activity"
WHERE visibility = 'PUBLIC'
GROUP BY type, source
ORDER BY activity_count DESC, type, source;

-- 7. Return concrete duplicate rows only if a later import introduces them.
SELECT
  'sourceUrl' AS duplicate_kind,
  "sourceUrl" AS duplicate_key,
  COUNT(*) AS duplicate_count
FROM public."Activity"
WHERE "sourceUrl" IS NOT NULL
GROUP BY "sourceUrl"
HAVING COUNT(*) > 1

UNION ALL

SELECT
  'externalSource/externalId',
  "externalSource" || '/' || "externalId",
  COUNT(*)
FROM public."Activity"
WHERE "externalSource" IS NOT NULL
  AND "externalId" IS NOT NULL
GROUP BY "externalSource", "externalId"
HAVING COUNT(*) > 1

UNION ALL

SELECT
  'externalUrl',
  "externalUrl",
  COUNT(*)
FROM public."Activity"
WHERE "externalUrl" IS NOT NULL
GROUP BY "externalUrl"
HAVING COUNT(*) > 1
ORDER BY duplicate_kind, duplicate_count DESC;
