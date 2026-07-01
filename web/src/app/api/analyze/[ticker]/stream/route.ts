import { NextRequest } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const url = `${BACKEND}/analyze/${encodeURIComponent(ticker)}/stream`;

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok && res.body) {
        return new Response(res.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
        });
      }
      if (res.status >= 500 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      return new Response(JSON.stringify({ error: "Backend error" }), { status: 502 });
    } catch {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      return new Response(JSON.stringify({ error: "Backend unreachable" }), { status: 502 });
    }
  }
  return new Response(JSON.stringify({ error: "Backend unreachable" }), { status: 502 });
}
