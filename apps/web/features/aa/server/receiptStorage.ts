import { randomUUID } from "node:crypto";
import { StorageClient } from "@supabase/storage-js";
import {
  allowedImageMimeTypes,
  getAllowedImageMimeTypes,
  maxImageBucketFileSize,
} from "@/lib/image-upload-policy";
import { validateImageUploadFile } from "@/lib/activity-cover-storage";

const defaultBucket = "aa-receipts";
const readyBuckets = new Set<string>();

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.AA_RECEIPT_STORAGE_BUCKET || defaultBucket;

  if (!supabaseUrl || !serviceRoleKey) return null;
  return { bucket, serviceRoleKey, supabaseUrl };
}

function createStorageClient(config: NonNullable<ReturnType<typeof getConfig>>) {
  return new StorageClient(
    `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1`,
    {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
  );
}

async function ensurePrivateBucket(
  storage: StorageClient,
  bucket: string,
) {
  if (readyBuckets.has(bucket)) return true;
  const current = await storage.getBucket(bucket);
  const result = current.error
    ? await storage.createBucket(bucket, {
        allowedMimeTypes: getAllowedImageMimeTypes(),
        fileSizeLimit: maxImageBucketFileSize,
        public: false,
      })
    : await storage.updateBucket(bucket, {
        allowedMimeTypes: getAllowedImageMimeTypes(),
        fileSizeLimit: maxImageBucketFileSize,
        public: false,
      });

  if (result.error) {
    console.error("Failed to prepare private AA receipt bucket", {
      code: "AA_RECEIPT_BUCKET_UNAVAILABLE",
    });
    return false;
  }

  readyBuckets.add(bucket);
  return true;
}

export type AaReceiptUploadResult = {
  byteSize: number;
  fileName: string;
  mimeType: string;
  objectKey: string;
  status: "READY" | "FAILED";
};

export async function uploadAaReceipt(input: {
  file: File;
  ledgerId: string;
  participantId: string;
  transactionId: string;
}): Promise<AaReceiptUploadResult> {
  const fallbackKey = `${safeSegment(input.ledgerId)}/${safeSegment(input.transactionId)}/${randomUUID()}.failed`;
  const fallback = {
    byteSize: input.file.size,
    fileName: input.file.name.slice(0, 180) || "receipt",
    mimeType: input.file.type.slice(0, 100) || "application/octet-stream",
    objectKey: fallbackKey,
    status: "FAILED" as const,
  };
  const config = getConfig();

  if (!config) return fallback;
  const validated = await validateImageUploadFile(input.file);
  if ("error" in validated) return fallback;
  const storage = createStorageClient(config);
  if (!(await ensurePrivateBucket(storage, config.bucket))) return fallback;

  const extension = allowedImageMimeTypes[validated.detectedMimeType];
  const objectKey = `${safeSegment(input.ledgerId)}/${safeSegment(input.transactionId)}/${safeSegment(input.participantId)}-${randomUUID()}.${extension}`;
  const uploaded = await storage.from(config.bucket).upload(
    objectKey,
    validated.fileBuffer,
    {
      cacheControl: "3600",
      contentType: validated.detectedMimeType,
      upsert: false,
    },
  );

  if (uploaded.error) {
    console.error("Failed to upload private AA receipt", {
      code: "AA_RECEIPT_UPLOAD_FAILED",
    });
    return fallback;
  }

  return {
    byteSize: input.file.size,
    fileName: fallback.fileName,
    mimeType: validated.detectedMimeType,
    objectKey,
    status: "READY",
  };
}

export async function getAaReceiptSignedUrl(objectKey: string) {
  const config = getConfig();
  if (!config) return null;
  const storage = createStorageClient(config);
  const signed = await storage
    .from(config.bucket)
    .createSignedUrl(objectKey, 5 * 60);
  return signed.error ? null : signed.data.signedUrl;
}
