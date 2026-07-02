import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

export async function GET() {
  if (!BACKEND) {
    return NextResponse.json({ status: "error", data: null }, { status: 503 });
  }

  try {
    const res = await fetch(`${BACKEND}/market`, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    const json = await res.json();
    return NextResponse.json(json, {
      status: res.ok ? 200 : res.status,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ status: "error", data: null, message: msg }, { status: 502 });
  }
}
