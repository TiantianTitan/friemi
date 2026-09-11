import { NextResponse } from "next/server";
import { z } from "zod";
import { createAaTransactionAction } from "@/features/aa/actions/aaTransactionActions";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  entries: z
    .array(z.tuple([z.string().min(1).max(100), z.string().max(4000)]))
    .min(1)
    .max(250),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const formData = new FormData();
  parsed.data.entries.forEach(([key, value]) => formData.append(key, value));
  formData.set("responseMode", "json");

  const result = await createAaTransactionAction({}, formData);

  if (!result.success) {
    return NextResponse.json(
      { error: result.formError ?? "SYNC_FAILED" },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    transactionId: result.transactionId,
  });
}
