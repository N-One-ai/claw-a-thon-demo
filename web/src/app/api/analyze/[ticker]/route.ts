import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;

  if (!BACKEND) {
    return NextResponse.json(
      { detail: "Backend chưa được cấu hình. Liên hệ quản trị viên." },
      { status: 503 },
    );
  }

  const search = request.nextUrl.searchParams.toString();
  const url = `${BACKEND}/analyze/${encodeURIComponent(ticker)}${search ? `?${search}` : ""}`;

  // Retry up to 5 times with exponential backoff.
  // AgentBase backend can intermittently crash (vnstock rate limits, cold starts).
  const maxAttempts = 5;
  let lastStatus = 502;
  let lastBody = "Không thể kết nối backend";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, 20000);
      const text = await res.text();

      // Success — parse and return immediately
      if (res.ok) {
        let data: unknown;
        try { data = JSON.parse(text); } catch { data = { detail: text }; }
        return NextResponse.json(data, { status: 200 });
      }

      // 5xx — retry with delay
      lastStatus = res.status;
      const raw = text.trim() || `HTTP ${res.status}`;
      // Extract readable detail from JSON error bodies
      try {
        const parsed = JSON.parse(raw);
        lastBody = (typeof parsed?.detail === "string" ? parsed.detail : null) ?? raw;
      } catch {
        lastBody = raw;
      }

      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * attempt, 4000); // 1s, 2s, 3s, 4s, 4s
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    } catch (err) {
      lastBody = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * attempt, 4000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  return NextResponse.json(
    { detail: `${lastBody}` },
    { status: lastStatus }
  );
}
