import { NextResponse } from "next/server";
import { getActivityAaAccess } from "@/features/aa/server/access";
import { getAaReceiptSignedUrl } from "@/features/aa/server/receiptStorage";
import { getOptionalCurrentUserProfileSnapshot } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ activityId: string; attachmentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { activityId, attachmentId } = await context.params;
  const profile = await getOptionalCurrentUserProfileSnapshot();

  if (!profile) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const access = await getActivityAaAccess(activityId, profile.id);
  if (!access) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const attachment = await prisma.aaAttachment.findFirst({
    where: {
      id: attachmentId,
      status: "READY",
      transaction: { ledger: { activityId } },
    },
    select: { objectKey: true },
  });

  if (!attachment) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const signedUrl = await getAaReceiptSignedUrl(attachment.objectKey);
  if (!signedUrl) {
    return NextResponse.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
  }

  return NextResponse.redirect(signedUrl, 302);
}
