"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActivityAaAccess } from "../server/access";
import { uploadAaReceipt } from "../server/receiptStorage";
import { getCurrentUserProfileForMutation } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withLocale } from "@/lib/routes";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

export async function retryAaReceiptAction(formData: FormData) {
  const activityId = value(formData, "activityId");
  const attachmentId = value(formData, "attachmentId");
  const locale = value(formData, "locale") || "zh-CN";
  const transactionId = value(formData, "transactionId");
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return;

  const profile = await getCurrentUserProfileForMutation(
    locale,
    `/lobby/${activityId}/aa/transactions/${transactionId}`,
  );
  const context = await prisma.aaAttachment.findFirst({
    where: {
      id: attachmentId,
      transactionId,
      transaction: { ledger: { activityId } },
    },
    include: {
      transaction: {
        include: { ledger: { include: { participants: true } } },
      },
    },
  });
  const access = await getActivityAaAccess(activityId, profile.id);
  const viewer = context?.transaction.ledger.participants.find(
    (participant) => participant.userProfileId === profile.id,
  );
  if (
    !context ||
    !access ||
    !viewer ||
    (context.uploaderParticipantId !== viewer.id && !access.canManage)
  ) {
    throw new Error("FORBIDDEN");
  }

  const uploaded = await uploadAaReceipt({
    file,
    ledgerId: context.transaction.ledgerId,
    participantId: viewer.id,
    transactionId,
  });
  await prisma.$transaction([
    prisma.aaAttachment.update({
      where: { id: context.id },
      data: {
        byteSize: uploaded.byteSize,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        objectKey: uploaded.objectKey,
        status: uploaded.status,
        uploaderParticipantId: viewer.id,
      },
    }),
    prisma.aaAuditEvent.create({
      data: {
        action:
          uploaded.status === "READY"
            ? "RETRY_RECEIPT_SUCCESS"
            : "RETRY_RECEIPT_FAILED",
        actorParticipantId: viewer.id,
        after: { status: uploaded.status },
        entityId: context.id,
        entityType: "ATTACHMENT",
        ledgerId: context.transaction.ledgerId,
        transactionId,
      },
    }),
  ]);

  const path = withLocale(
    locale,
    `/lobby/${activityId}/aa/transactions/${transactionId}`,
  );
  revalidatePath(path);
  redirect(path);
}

export async function addAaReceiptAction(formData: FormData) {
  const activityId = value(formData, "activityId");
  const locale = value(formData, "locale") || "zh-CN";
  const transactionId = value(formData, "transactionId");
  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return;
  const profile = await getCurrentUserProfileForMutation(
    locale,
    `/lobby/${activityId}/aa/transactions/${transactionId}`,
  );
  const transaction = await prisma.aaTransaction.findFirst({
    where: { id: transactionId, ledger: { activityId } },
    include: {
      contributions: true,
      ledger: { include: { participants: true } },
      shares: true,
    },
  });
  const access = await getActivityAaAccess(activityId, profile.id);
  const viewer = transaction?.ledger.participants.find(
    (participant) => participant.userProfileId === profile.id,
  );
  const involved = Boolean(
    transaction &&
      viewer &&
      (access?.canManage ||
        transaction.creatorParticipantId === viewer.id ||
        transaction.contributions.some(
          (item) => item.participantId === viewer.id,
        ) ||
        transaction.shares.some((item) => item.participantId === viewer.id) ||
        transaction.transferFromParticipantId === viewer.id ||
        transaction.transferToParticipantId === viewer.id),
  );
  if (
    !transaction ||
    !access ||
    !viewer ||
    !involved ||
    transaction.ledger.status !== "ACTIVE"
  ) {
    throw new Error("FORBIDDEN");
  }

  const uploaded = await uploadAaReceipt({
    file,
    ledgerId: transaction.ledgerId,
    participantId: viewer.id,
    transactionId,
  });
  const attachment = await prisma.aaAttachment.create({
    data: {
      byteSize: uploaded.byteSize,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      objectKey: uploaded.objectKey,
      status: uploaded.status,
      transactionId,
      uploaderParticipantId: viewer.id,
    },
  });
  await prisma.aaAuditEvent.create({
    data: {
      action:
        uploaded.status === "READY"
          ? "ATTACH_RECEIPT"
          : "RECEIPT_UPLOAD_FAILED",
      actorParticipantId: viewer.id,
      after: { status: uploaded.status },
      entityId: attachment.id,
      entityType: "ATTACHMENT",
      ledgerId: transaction.ledgerId,
      transactionId,
    },
  });

  const path = withLocale(
    locale,
    `/lobby/${activityId}/aa/transactions/${transactionId}`,
  );
  revalidatePath(path);
  redirect(path);
}
