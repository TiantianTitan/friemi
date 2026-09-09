# Preview 内容迁移到 Production

更新时间：2026-09-09

## 目标与当前状态

本文用于将当前 Preview 数据库中的内容迁移到 Production，同时保留生产环境已有的用户、报名、聊天、礼物和交易数据。

已确认的环境关系：

- 本地 `apps/web/.env` 与 Vercel Preview 指向同一个 Supabase 数据库。
- Vercel Production 指向另一个数据库。
- Preview 已执行全部 56 条 Prisma migration。
- Production 已于 2026-09-09 执行全部 56 条 Prisma migration。
- Vercel Production 已配置敏感变量 `DIRECT_URL`，使用已验证的 Production Session Pooler。

本轮实际执行结果：

- Production 迁移前备份：`migration-backups/production-before-preview-content-20260909-091452.dump`
- 备份大小：6,004,246 bytes
- 备份 SHA-256：`b2e86dba932a89f8b52a7175e796782b482fc53a4b28037a6db414ed705b288a`
- 公开 Activity：新增 27 条，更新 70 条，Production 最终共 118 条
- Production 原有的 3 条私密 Activity 已保持私密，业务字段与迁移前备份一致
- `ActivitySourceLink`：新增 2 条
- Preview Storage 的 3 个图片对象已复制到 Production，并更新 4 条 Activity 的图片 URL
- `sourceUrl`、外部 ID 和 `externalUrl` 重复组数量均为 0

默认使用本文的“方案 A：合并公开内容”。不要把 Preview 全库直接覆盖到 Production，除非明确接受删除生产现有业务数据。

## 迁移范围

### 方案 A：合并公开内容，推荐

使用现有脚本 `apps/web/prisma/copy-public-content.ts`，迁移：

- `Merchant`
- `visibility = PUBLIC` 的 `Activity`
- 对应的 `ActivitySourceLink`

脚本会根据来源 URL、外部 ID、外部 URL，以及标题、城市、地址、开始时间去重。已有内容会更新，但保留 Production 的组织者和已有封面；匹配到 Production 私密活动时会跳过。新内容优先通过 `clerkUserId` 映射组织者，只有找不到对应 Production 用户时才使用迁移运营账号。发生主键 ID 冲突时，由 Production 生成新 ID。

此方案不会迁移：

- 用户账号、好友关系和关注关系
- 报名、游客报名和收藏
- 聊天、通知、晒晒和评论
- 星球、狼人杀房间和游戏记录
- 礼物、魅力值、Friemi 币和交易记录
- `PublicEvent`、`TopNewsItem`
- Supabase Storage 中的实际图片文件

### 方案 B：完整覆盖 Production，高风险

完整恢复 `public` schema 会使 Production 与 Preview 基本一致，但会删除或覆盖 Production 当前的用户、报名、聊天、交易和游戏数据。仅在确认生产数据可以全部舍弃并安排维护窗口时使用。

## 1. 准备连接信息

所有连接串只写入被 Git 忽略的本地文件，不要放进本文、聊天、提交或终端截图。

```bash
cd /home/ubuntu23/Bureau/friemi

touch migration-backups/preview-to-production.env
chmod 600 migration-backups/preview-to-production.env
git check-ignore migration-backups/preview-to-production.env
```

编辑 `migration-backups/preview-to-production.env`：

```bash
# Preview 的 Direct connection 或 Session pooler，禁止使用 6543 Transaction pooler。
SOURCE_DIRECT_URL="postgresql://..."

# Production 的运行时连接，可使用 Transaction pooler。
TARGET_DATABASE_URL="postgresql://..."

# Production 的 Direct connection 或 Session pooler，用于 migration、dump 和 restore。
TARGET_DIRECT_URL="postgresql://..."

# Production 中用于承接公开内容的真实管理员 UserProfile.id。
CONTENT_TARGET_ORGANIZER_ID="..."
```

Production 目前缺少 Vercel `DIRECT_URL`。正式发布前应在 Vercel Production 增加 `DIRECT_URL`，值为 Production 的 Direct connection 或 Session pooler；不要把 Preview 的 `DIRECT_URL` 填入 Production。

加载变量并阻止源库、目标库误设为同一地址：

```bash
set -a
source migration-backups/preview-to-production.env
set +a

test -n "$SOURCE_DIRECT_URL"
test -n "$TARGET_DIRECT_URL"
test -n "$CONTENT_TARGET_ORGANIZER_ID"
test "$SOURCE_DIRECT_URL" != "$TARGET_DIRECT_URL"
```

## 2. 备份 Production

任何生产写入前都必须先备份：

```bash
cd /home/ubuntu23/Bureau/friemi

PRODUCTION_BACKUP="migration-backups/production-before-content-$(date +%Y%m%d-%H%M%S).dump"

pg_dump "$TARGET_DIRECT_URL" \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-acl \
  --file="$PRODUCTION_BACKUP"

pg_restore --list "$PRODUCTION_BACKUP" | sed -n '1,40p'
```

确认 dump 文件非空并妥善保存：

```bash
test -s "$PRODUCTION_BACKUP"
ls -lh "$PRODUCTION_BACKUP"
```

## 3. 先更新 Production 数据库结构

只使用 `prisma migrate deploy`。禁止对 Production 使用 `prisma db push`、`prisma migrate dev` 或 `prisma migrate reset`。

```bash
cd /home/ubuntu23/Bureau/friemi/apps/web

DATABASE_URL="$TARGET_DATABASE_URL" \
DIRECT_URL="$TARGET_DIRECT_URL" \
npx prisma migrate status --schema=prisma/schema.prisma

DATABASE_URL="$TARGET_DATABASE_URL" \
DIRECT_URL="$TARGET_DIRECT_URL" \
npx prisma migrate deploy --schema=prisma/schema.prisma

DATABASE_URL="$TARGET_DATABASE_URL" \
DIRECT_URL="$TARGET_DIRECT_URL" \
npx prisma migrate status --schema=prisma/schema.prisma
```

期望最终输出：

```text
Database schema is up to date!
```

本轮最近两条 migration 是：

- `20260831110000_trust_score_check_in_decimal`
- `20260909110000_replace_werewolf_icon`

执行 Production 迁移前，确认这些 migration 文件已经进入待发布分支，不能只存在于本地未跟踪文件中。

## 4. 记录迁移前数量

分别记录 Preview 和 Production 的公开内容数量：

```bash
for URL in "$SOURCE_DIRECT_URL" "$TARGET_DIRECT_URL"; do
  psql "$URL" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT 'Merchant' AS table_name, COUNT(*) AS row_count FROM "Merchant"
UNION ALL
SELECT 'Public Activity', COUNT(*) FROM "Activity" WHERE "visibility" = 'PUBLIC'
UNION ALL
SELECT 'ActivitySourceLink', COUNT(*) FROM "ActivitySourceLink";
SQL
done
```

同时确认承接内容的生产管理员存在：

```bash
psql "$TARGET_DIRECT_URL" -v ON_ERROR_STOP=1 \
  -v organizer_id="$CONTENT_TARGET_ORGANIZER_ID" <<'SQL'
SELECT id, nickname, status
FROM "UserProfile"
WHERE id = :'organizer_id';
SQL
```

查询必须返回且只能返回一名预期管理员。

## 5. Dry-run

Dry-run 只读取数据并输出预计处理数量，不写入 Production：

```bash
cd /home/ubuntu23/Bureau/friemi

CONTENT_SOURCE_DATABASE_URL="$SOURCE_DIRECT_URL" \
CONTENT_TARGET_DATABASE_URL="$TARGET_DIRECT_URL" \
CONTENT_TARGET_ORGANIZER_ID="$CONTENT_TARGET_ORGANIZER_ID" \
npm run db:copy-public-content --workspace=apps/web
```

检查输出中的：

- `dryRun` 必须为 `true`
- `activities.read` 应与 Preview 的公开 Activity 数量相符
- `skipped` 数量应可解释
- 不应出现连接、枚举、外键或 Prisma schema 错误

## 6. 正式合并公开内容

建议暂停生产内容导入任务，选择低峰期执行。该操作会写入 Production：

```bash
cd /home/ubuntu23/Bureau/friemi

printf 'Type PROMOTE_PREVIEW_CONTENT to continue: '
read -r CONFIRM
test "$CONFIRM" = "PROMOTE_PREVIEW_CONTENT"

CONTENT_SOURCE_DATABASE_URL="$SOURCE_DIRECT_URL" \
CONTENT_TARGET_DATABASE_URL="$TARGET_DIRECT_URL" \
CONTENT_TARGET_ORGANIZER_ID="$CONTENT_TARGET_ORGANIZER_ID" \
npm run db:copy-public-content --workspace=apps/web -- --write
```

保存脚本输出。重复执行会按脚本现有去重规则更新或跳过已有内容，不应重复创建同一条来源活动。

## 7. 图片与 Storage

数据库只保存图片 URL，不会复制 Supabase Storage 对象。

先抽查刚迁移的 `coverImageUrl`：

```bash
psql "$TARGET_DIRECT_URL" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT id, title, "coverImageUrl"
FROM "Activity"
WHERE "visibility" = 'PUBLIC'
ORDER BY "updatedAt" DESC
LIMIT 20;
SQL
```

处理规则：

- `/game-tools/...` 等站内静态资源无需复制，随 Web 代码部署。
- 第三方公开 URL 无需复制，但需要确认来源允许长期访问。
- 指向 Preview Supabase Storage 的 URL，需要把对应对象复制到 Production Storage，并将数据库 URL 改为 Production 项目地址。

仓库已有 `scripts/migrate-supabase-storage.mjs`，但当前脚本会把 bucket 上传上限设置为 4 MB，与项目计划中的 10 MB 上传上限不一致。在修正该限制并完成 dry-run 前，不要直接对 Production 运行该脚本。

## 8. 验收

完成写入后重复第 4 步的数量查询，并检查：

- Production Prisma migration 状态为最新
- 首页和 `/lobby` 能看到迁移后的公开组局
- 搜索结果没有因本次迁移产生重复项
- 活动详情页可以打开，图片不是 Preview 灰色占位
- 管理员可以编辑迁移后的公开内容
- 普通用户、报名、聊天、通知和交易数据仍然存在
- Production 新建一条测试内容后确实写入 Production，而不是 Preview
- Vercel Production 的 `DATABASE_URL`、`DIRECT_URL`、Supabase 和 Upstash 配置均属于 Production

验收后再恢复 cron 和后台导入任务。

## 9. 回滚

方案 A 是合并写入，当前脚本没有自动反向删除功能。发生严重问题时：

1. 立即暂停生产写入和 cron。
2. 保存故障现场和迁移脚本输出。
3. 使用第 2 步的 Production dump 恢复。
4. 恢复前再次确认连接的是 Production。

完整恢复会覆盖故障后新产生的数据，必须在维护窗口执行：

```bash
pg_restore --dbname="$TARGET_DIRECT_URL" \
  --schema=public \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  "$PRODUCTION_BACKUP"
```

恢复后执行：

```bash
cd /home/ubuntu23/Bureau/friemi/apps/web

DATABASE_URL="$TARGET_DATABASE_URL" \
DIRECT_URL="$TARGET_DIRECT_URL" \
npx prisma migrate status --schema=prisma/schema.prisma
```

## 10. 方案 B：完整覆盖 Production

只有明确要让 Production 完全采用 Preview 的全部 `public` 数据时才执行本节。它会覆盖生产用户、报名、聊天、礼物、交易、游戏记录和管理数据。

前置条件：

- 已完成 Production dump 备份
- 已开启维护窗口并停止 Production 写入、cron 和 webhook 消费
- Preview 与 Production 使用同一个 Clerk 实例，或已确认 `clerkUserId` 的兼容策略
- 已准备 Storage 对象迁移和 URL 重写方案
- 已明确接受备份之后产生的生产数据丢失

```bash
cd /home/ubuntu23/Bureau/friemi

PREVIEW_DUMP="migration-backups/preview-full-$(date +%Y%m%d-%H%M%S).dump"

pg_dump "$SOURCE_DIRECT_URL" \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-acl \
  --file="$PREVIEW_DUMP"

test -s "$PREVIEW_DUMP"

printf 'Type REPLACE_PRODUCTION_WITH_PREVIEW to continue: '
read -r CONFIRM
test "$CONFIRM" = "REPLACE_PRODUCTION_WITH_PREVIEW"

pg_restore --dbname="$TARGET_DIRECT_URL" \
  --schema=public \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  "$PREVIEW_DUMP"
```

恢复后重新执行第 3、7、8 步。不要 dump 或 restore Supabase 的 `auth`、`storage`、`realtime` 等托管 schema；只迁移 `public` schema，Storage 文件单独处理。

## 11. 收尾

```bash
unset SOURCE_DIRECT_URL
unset TARGET_DATABASE_URL
unset TARGET_DIRECT_URL
unset CONTENT_TARGET_ORGANIZER_ID
unset CONTENT_SOURCE_DATABASE_URL
unset CONTENT_TARGET_DATABASE_URL
unset CONFIRM
```

Production 备份至少保留 14 天。在 Production 完成登录、报名、聊天、图片和后台写入验收前，不要删除 Preview 数据库或备份文件。
