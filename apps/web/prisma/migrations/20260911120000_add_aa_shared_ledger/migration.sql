ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AA_REVIEW_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AA_ENTRY_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AA_TRANSFER_CONFIRMATION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AA_DISPUTE_OPENED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AA_PAYMENT_REQUEST';

CREATE TYPE "AaLedgerStatus" AS ENUM ('ACTIVE', 'FROZEN', 'ARCHIVED');
CREATE TYPE "AaParticipantRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');
CREATE TYPE "AaParticipantStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AaTransactionType" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');
CREATE TYPE "AaTransactionStatus" AS ENUM ('PENDING_REVIEW', 'POSTED', 'REJECTED', 'PENDING_CONFIRMATION', 'DISPUTED', 'VOIDED');
CREATE TYPE "AaSplitMode" AS ENUM ('EQUAL', 'WEIGHT', 'PERCENT', 'CUSTOM');
CREATE TYPE "AaAttachmentStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED');
CREATE TYPE "AaPaymentRequestStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'COMPLETED');
CREATE TYPE "AaConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "AaChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AaLedger" (
  "id" TEXT NOT NULL,
  "activityId" TEXT,
  "creatorId" TEXT,
  "titleSnapshot" VARCHAR(160) NOT NULL,
  "coverImageUrlSnapshot" TEXT,
  "baseCurrency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Paris',
  "status" "AaLedgerStatus" NOT NULL DEFAULT 'ACTIVE',
  "requireMemberReview" BOOLEAN NOT NULL DEFAULT true,
  "requireTransferConfirmation" BOOLEAN NOT NULL DEFAULT true,
  "allowMemberCorrections" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "frozenAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "settlementStartedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AaLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaLedger_currency_check" CHECK ("baseCurrency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "AaLedger_version_check" CHECK ("version" > 0)
);

CREATE TABLE "AaParticipant" (
  "id" TEXT NOT NULL,
  "ledgerId" TEXT NOT NULL,
  "userProfileId" TEXT,
  "guestActivityParticipantId" TEXT,
  "displayNameSnapshot" VARCHAR(80) NOT NULL,
  "avatarUrlSnapshot" TEXT,
  "role" "AaParticipantRole" NOT NULL DEFAULT 'MEMBER',
  "status" "AaParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AaParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaParticipant_identity_check" CHECK (
    NOT ("userProfileId" IS NOT NULL AND "guestActivityParticipantId" IS NOT NULL)
  )
);

CREATE TABLE "AaCategory" (
  "id" TEXT NOT NULL,
  "ledgerId" TEXT NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "iconKey" VARCHAR(32) NOT NULL DEFAULT 'receipt',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AaCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AaTransaction" (
  "id" TEXT NOT NULL,
  "ledgerId" TEXT NOT NULL,
  "categoryId" TEXT,
  "categoryNameSnapshot" VARCHAR(60) NOT NULL DEFAULT '其他',
  "type" "AaTransactionType" NOT NULL,
  "status" "AaTransactionStatus" NOT NULL DEFAULT 'POSTED',
  "splitMode" "AaSplitMode",
  "title" VARCHAR(120) NOT NULL,
  "note" TEXT,
  "originalCurrency" CHAR(3) NOT NULL,
  "originalAmountMinor" BIGINT NOT NULL,
  "baseAmountMinor" BIGINT NOT NULL,
  "fxRate" DECIMAL(24,12) NOT NULL DEFAULT 1,
  "fxRateSource" VARCHAR(80),
  "fxRateDate" TIMESTAMP(3),
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "creatorParticipantId" TEXT NOT NULL,
  "reviewedByParticipantId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" VARCHAR(240),
  "transferFromParticipantId" TEXT,
  "transferToParticipantId" TEXT,
  "payerConfirmedById" TEXT,
  "payerConfirmedAt" TIMESTAMP(3),
  "payeeConfirmedById" TEXT,
  "payeeConfirmedAt" TIMESTAMP(3),
  "clientMutationId" VARCHAR(120),
  "importSource" VARCHAR(40),
  "importRecordId" VARCHAR(160),
  "version" INTEGER NOT NULL DEFAULT 1,
  "voidedAt" TIMESTAMP(3),
  "voidedByParticipantId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AaTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaTransaction_positive_amount_check" CHECK (
    "originalAmountMinor" > 0 AND "baseAmountMinor" > 0 AND "fxRate" > 0
  ),
  CONSTRAINT "AaTransaction_currency_check" CHECK ("originalCurrency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "AaTransaction_shape_check" CHECK (
    ("type" = 'TRANSFER' AND "splitMode" IS NULL AND "transferFromParticipantId" IS NOT NULL AND "transferToParticipantId" IS NOT NULL AND "transferFromParticipantId" <> "transferToParticipantId")
    OR ("type" <> 'TRANSFER' AND "splitMode" IS NOT NULL AND "transferFromParticipantId" IS NULL AND "transferToParticipantId" IS NULL)
  ),
  CONSTRAINT "AaTransaction_version_check" CHECK ("version" > 0)
);

CREATE TABLE "AaContribution" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AaContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaContribution_amount_check" CHECK ("amountMinor" >= 0)
);

CREATE TABLE "AaShare" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "ruleValue" DECIMAL(24,12),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AaShare_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaShare_amount_check" CHECK ("amountMinor" >= 0),
  CONSTRAINT "AaShare_rule_check" CHECK ("ruleValue" IS NULL OR "ruleValue" >= 0)
);

CREATE TABLE "AaAttachment" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "uploaderParticipantId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileName" VARCHAR(180) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "status" "AaAttachmentStatus" NOT NULL DEFAULT 'UPLOADING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AaAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaAttachment_size_check" CHECK ("byteSize" > 0)
);

CREATE TABLE "AaTransactionRevision" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "actorParticipantId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changeSummary" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AaTransactionRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaTransactionRevision_version_check" CHECK ("version" > 0)
);

CREATE TABLE "AaChangeRequest" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "actorParticipantId" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "proposedPayload" JSONB NOT NULL,
  "status" "AaChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByParticipantId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AaChangeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaChangeRequest_version_check" CHECK ("expectedVersion" > 0)
);

CREATE TABLE "AaConflict" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "clientVersion" INTEGER NOT NULL,
  "serverVersion" INTEGER NOT NULL,
  "proposedPayload" JSONB NOT NULL,
  "status" "AaConflictStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedByParticipantId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AaConflict_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AaPaymentRequest" (
  "id" TEXT NOT NULL,
  "ledgerId" TEXT NOT NULL,
  "fromParticipantId" TEXT NOT NULL,
  "toParticipantId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "ledgerVersion" INTEGER NOT NULL,
  "status" "AaPaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByParticipantId" TEXT NOT NULL,
  "linkedTransferId" TEXT,
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AaPaymentRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AaPaymentRequest_amount_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "AaPaymentRequest_participant_check" CHECK ("fromParticipantId" <> "toParticipantId"),
  CONSTRAINT "AaPaymentRequest_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "AaAuditEvent" (
  "id" TEXT NOT NULL,
  "ledgerId" TEXT NOT NULL,
  "transactionId" TEXT,
  "actorParticipantId" TEXT,
  "action" VARCHAR(60) NOT NULL,
  "entityType" VARCHAR(40) NOT NULL,
  "entityId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AaAuditEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "aaTransactionId" TEXT;

CREATE UNIQUE INDEX "AaLedger_activityId_key" ON "AaLedger"("activityId");
CREATE INDEX "AaLedger_creatorId_createdAt_idx" ON "AaLedger"("creatorId", "createdAt");
CREATE INDEX "AaLedger_status_updatedAt_idx" ON "AaLedger"("status", "updatedAt");

CREATE INDEX "AaParticipant_ledgerId_status_idx" ON "AaParticipant"("ledgerId", "status");
CREATE INDEX "AaParticipant_userProfileId_idx" ON "AaParticipant"("userProfileId");
CREATE INDEX "AaParticipant_guestActivityParticipantId_idx" ON "AaParticipant"("guestActivityParticipantId");
CREATE UNIQUE INDEX "AaParticipant_ledgerId_userProfileId_key" ON "AaParticipant"("ledgerId", "userProfileId");
CREATE UNIQUE INDEX "AaParticipant_ledgerId_guestActivityParticipantId_key" ON "AaParticipant"("ledgerId", "guestActivityParticipantId");

CREATE INDEX "AaCategory_ledgerId_isActive_sortOrder_idx" ON "AaCategory"("ledgerId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "AaCategory_ledgerId_name_key" ON "AaCategory"("ledgerId", "name");

CREATE UNIQUE INDEX "AaTransaction_clientMutationId_key" ON "AaTransaction"("clientMutationId");
CREATE UNIQUE INDEX "AaTransaction_ledgerId_importSource_importRecordId_key" ON "AaTransaction"("ledgerId", "importSource", "importRecordId");
CREATE INDEX "AaTransaction_ledgerId_occurredAt_id_idx" ON "AaTransaction"("ledgerId", "occurredAt", "id");
CREATE INDEX "AaTransaction_ledgerId_status_updatedAt_idx" ON "AaTransaction"("ledgerId", "status", "updatedAt");
CREATE INDEX "AaTransaction_creatorParticipantId_createdAt_idx" ON "AaTransaction"("creatorParticipantId", "createdAt");
CREATE INDEX "AaTransaction_transferFromParticipantId_idx" ON "AaTransaction"("transferFromParticipantId");
CREATE INDEX "AaTransaction_transferToParticipantId_idx" ON "AaTransaction"("transferToParticipantId");

CREATE INDEX "AaContribution_participantId_transactionId_idx" ON "AaContribution"("participantId", "transactionId");
CREATE UNIQUE INDEX "AaContribution_transactionId_participantId_key" ON "AaContribution"("transactionId", "participantId");
CREATE INDEX "AaShare_participantId_transactionId_idx" ON "AaShare"("participantId", "transactionId");
CREATE UNIQUE INDEX "AaShare_transactionId_participantId_key" ON "AaShare"("transactionId", "participantId");

CREATE UNIQUE INDEX "AaAttachment_objectKey_key" ON "AaAttachment"("objectKey");
CREATE INDEX "AaAttachment_transactionId_createdAt_idx" ON "AaAttachment"("transactionId", "createdAt");
CREATE INDEX "AaAttachment_uploaderParticipantId_createdAt_idx" ON "AaAttachment"("uploaderParticipantId", "createdAt");

CREATE INDEX "AaTransactionRevision_actorParticipantId_createdAt_idx" ON "AaTransactionRevision"("actorParticipantId", "createdAt");
CREATE UNIQUE INDEX "AaTransactionRevision_transactionId_version_key" ON "AaTransactionRevision"("transactionId", "version");
CREATE INDEX "AaChangeRequest_transactionId_status_createdAt_idx" ON "AaChangeRequest"("transactionId", "status", "createdAt");
CREATE INDEX "AaChangeRequest_actorParticipantId_status_createdAt_idx" ON "AaChangeRequest"("actorParticipantId", "status", "createdAt");
CREATE INDEX "AaChangeRequest_reviewedByParticipantId_createdAt_idx" ON "AaChangeRequest"("reviewedByParticipantId", "createdAt");
CREATE INDEX "AaConflict_transactionId_status_createdAt_idx" ON "AaConflict"("transactionId", "status", "createdAt");
CREATE INDEX "AaConflict_resolvedByParticipantId_createdAt_idx" ON "AaConflict"("resolvedByParticipantId", "createdAt");

CREATE UNIQUE INDEX "AaPaymentRequest_linkedTransferId_key" ON "AaPaymentRequest"("linkedTransferId");
CREATE INDEX "AaPaymentRequest_ledgerId_status_updatedAt_idx" ON "AaPaymentRequest"("ledgerId", "status", "updatedAt");
CREATE INDEX "AaPaymentRequest_fromParticipantId_status_idx" ON "AaPaymentRequest"("fromParticipantId", "status");
CREATE INDEX "AaPaymentRequest_toParticipantId_status_idx" ON "AaPaymentRequest"("toParticipantId", "status");

CREATE INDEX "AaAuditEvent_ledgerId_createdAt_idx" ON "AaAuditEvent"("ledgerId", "createdAt");
CREATE INDEX "AaAuditEvent_transactionId_createdAt_idx" ON "AaAuditEvent"("transactionId", "createdAt");
CREATE INDEX "AaAuditEvent_actorParticipantId_createdAt_idx" ON "AaAuditEvent"("actorParticipantId", "createdAt");
CREATE INDEX "Notification_aaTransactionId_idx" ON "Notification"("aaTransactionId");

ALTER TABLE "AaLedger" ADD CONSTRAINT "AaLedger_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaLedger" ADD CONSTRAINT "AaLedger_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaParticipant" ADD CONSTRAINT "AaParticipant_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "AaLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaParticipant" ADD CONSTRAINT "AaParticipant_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaParticipant" ADD CONSTRAINT "AaParticipant_guestActivityParticipantId_fkey" FOREIGN KEY ("guestActivityParticipantId") REFERENCES "GuestActivityParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaCategory" ADD CONSTRAINT "AaCategory_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "AaLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "AaLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AaCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_creatorParticipantId_fkey" FOREIGN KEY ("creatorParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_reviewedByParticipantId_fkey" FOREIGN KEY ("reviewedByParticipantId") REFERENCES "AaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_transferFromParticipantId_fkey" FOREIGN KEY ("transferFromParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_transferToParticipantId_fkey" FOREIGN KEY ("transferToParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_payerConfirmedById_fkey" FOREIGN KEY ("payerConfirmedById") REFERENCES "AaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_payeeConfirmedById_fkey" FOREIGN KEY ("payeeConfirmedById") REFERENCES "AaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaTransaction" ADD CONSTRAINT "AaTransaction_voidedByParticipantId_fkey" FOREIGN KEY ("voidedByParticipantId") REFERENCES "AaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aaTransactionId_fkey" FOREIGN KEY ("aaTransactionId") REFERENCES "AaTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AaContribution" ADD CONSTRAINT "AaContribution_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AaTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaContribution" ADD CONSTRAINT "AaContribution_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaShare" ADD CONSTRAINT "AaShare_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AaTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaShare" ADD CONSTRAINT "AaShare_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaAttachment" ADD CONSTRAINT "AaAttachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AaTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaAttachment" ADD CONSTRAINT "AaAttachment_uploaderParticipantId_fkey" FOREIGN KEY ("uploaderParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaTransactionRevision" ADD CONSTRAINT "AaTransactionRevision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AaTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaTransactionRevision" ADD CONSTRAINT "AaTransactionRevision_actorParticipantId_fkey" FOREIGN KEY ("actorParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaChangeRequest" ADD CONSTRAINT "AaChangeRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AaTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaChangeRequest" ADD CONSTRAINT "AaChangeRequest_actorParticipantId_fkey" FOREIGN KEY ("actorParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaChangeRequest" ADD CONSTRAINT "AaChangeRequest_reviewedByParticipantId_fkey" FOREIGN KEY ("reviewedByParticipantId") REFERENCES "AaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaConflict" ADD CONSTRAINT "AaConflict_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AaTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaConflict" ADD CONSTRAINT "AaConflict_resolvedByParticipantId_fkey" FOREIGN KEY ("resolvedByParticipantId") REFERENCES "AaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AaPaymentRequest" ADD CONSTRAINT "AaPaymentRequest_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "AaLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaPaymentRequest" ADD CONSTRAINT "AaPaymentRequest_fromParticipantId_fkey" FOREIGN KEY ("fromParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaPaymentRequest" ADD CONSTRAINT "AaPaymentRequest_toParticipantId_fkey" FOREIGN KEY ("toParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaPaymentRequest" ADD CONSTRAINT "AaPaymentRequest_createdByParticipantId_fkey" FOREIGN KEY ("createdByParticipantId") REFERENCES "AaParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AaPaymentRequest" ADD CONSTRAINT "AaPaymentRequest_linkedTransferId_fkey" FOREIGN KEY ("linkedTransferId") REFERENCES "AaTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AaAuditEvent" ADD CONSTRAINT "AaAuditEvent_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "AaLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AaAuditEvent" ADD CONSTRAINT "AaAuditEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AaTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AaAuditEvent" ADD CONSTRAINT "AaAuditEvent_actorParticipantId_fkey" FOREIGN KEY ("actorParticipantId") REFERENCES "AaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
