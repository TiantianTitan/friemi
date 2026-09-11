import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = currencySchema.safeParse(url.searchParams.get("base"));
  const quote = currencySchema.safeParse(url.searchParams.get("quote"));

  if (!base.success || !quote.success || base.data === quote.data) {
    return NextResponse.json({ error: "INVALID_CURRENCY" }, { status: 400 });
  }

  const apiBase = (
    process.env.AA_FX_API_BASE_URL ?? "https://api.frankfurter.dev"
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `${apiBase}/v2/rate/${encodeURIComponent(base.data)}/${encodeURIComponent(quote.data)}`,
      {
        headers: { accept: "application/json" },
        next: { revalidate: 60 * 60 },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return NextResponse.json({ error: "FX_UNAVAILABLE" }, { status: 503 });
    }

    const payload = (await response.json()) as {
      date?: unknown;
      rate?: unknown;
    };
    const rate = Number(payload.rate);
    const date = typeof payload.date === "string" ? payload.date : "";

    if (!Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "INVALID_FX_RESPONSE" }, { status: 503 });
    }

    return NextResponse.json(
      { date, rate, source: "FRANKFURTER_V2" },
      {
        headers: {
          "cache-control": "public, max-age=900, s-maxage=3600",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "FX_UNAVAILABLE" }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
