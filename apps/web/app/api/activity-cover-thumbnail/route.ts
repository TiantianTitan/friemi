import { NextResponse } from "next/server";
import sharp from "sharp";
import { isSupabaseActivityCoverUrl } from "@/lib/activity-cover-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxSourceBytes = 10 * 1024 * 1024;
const defaultSize = 192;
const defaultQuality = 75;

function getBoundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

async function readResponseBody(response: Response) {
  const reader = response.body?.getReader();

  if (!reader) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxSourceBytes) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes,
  );
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const imageUrl = searchParams.get("url")?.trim() ?? "";

  if (!isSupabaseActivityCoverUrl(imageUrl)) {
    return NextResponse.json({ error: "UNSUPPORTED_URL" }, { status: 400 });
  }

  const size = getBoundedInteger(
    searchParams.get("size"),
    defaultSize,
    64,
    640,
  );
  const quality = getBoundedInteger(
    searchParams.get("quality"),
    defaultQuality,
    40,
    85,
  );

  try {
    const response = await fetch(imageUrl, {
      cache: "no-store",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "FETCH_FAILED" }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length"));

    if (
      !contentType.toLowerCase().startsWith("image/") ||
      (Number.isFinite(contentLength) && contentLength > maxSourceBytes)
    ) {
      return NextResponse.json({ error: "INVALID_IMAGE" }, { status: 415 });
    }

    const source = await readResponseBody(response);

    if (!source) {
      return NextResponse.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 });
    }

    const thumbnail = await sharp(source)
      .rotate()
      .resize(size, size, { fit: "cover", position: "centre" })
      .webp({ quality })
      .toBuffer();
    const responseBody = Uint8Array.from(thumbnail).buffer;

    return new NextResponse(responseBody, {
      headers: {
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "Content-Length": String(thumbnail.byteLength),
        "Content-Type": "image/webp",
      },
    });
  } catch (error) {
    console.error("Failed to create activity cover thumbnail", error);

    return NextResponse.json({ error: "THUMBNAIL_FAILED" }, { status: 502 });
  }
}
