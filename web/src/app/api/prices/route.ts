import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export const maxDuration = 30;

interface PriceResult {
  sym: string;
  price: number | null;
  prevClose: number | null;
}

async function fetchPrice(sym: string, signal: AbortSignal): Promise<PriceResult> {
  try {
    const res = await fetch(`${BACKEND}/analyze/${encodeURIComponent(sym)}?report=false`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return { sym, price: null, prevClose: null };
    const data = await res.json();
    const price = data.current_price ?? null;
    const candles = data.technical?.chart_data;
    const prevClose =
      candles && candles.length >= 2
        ? (candles[candles.length - 2]?.close ?? price)
        : price;
    return { sym, price, prevClose };
  } catch {
    return { sym, price: null, prevClose: null };
  }
}

// Fetch in batches of N to avoid overwhelming the backend
async function fetchBatched(syms: string[], batchSize = 4): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  const controller = new AbortController();

  for (let i = 0; i < syms.length; i += batchSize) {
    const batch = syms.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(sym => fetchPrice(sym, controller.signal)));
    results.push(...batchResults);
    // Small pause between batches to avoid rate limiting
    if (i + batchSize < syms.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return results;
}

export async function GET(request: NextRequest) {
  const symsParam = request.nextUrl.searchParams.get("syms");
  if (!symsParam) {
    return NextResponse.json({ error: "Missing syms param" }, { status: 400 });
  }

  const syms = symsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  const results = await fetchBatched(syms, 4);

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
