import type { AnalysisResponse } from "@/types/analysis";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";

export class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export async function analyzeTicker(
  ticker: string,
  options: { wacc?: number; growth?: number; report?: boolean } = {}
): Promise<AnalysisResponse> {
  const params = new URLSearchParams();
  if (options.wacc != null) params.set("wacc", String(options.wacc));
  if (options.growth != null) params.set("growth", String(options.growth));
  params.set("report", String(options.report ?? true));

  const url = `${BACKEND}/analyze/${encodeURIComponent(ticker.toUpperCase())}?${params}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new APIError(res.status, body.detail ?? "Lỗi phân tích");
  }

  return res.json() as Promise<AnalysisResponse>;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function* streamReport(
  ticker: string,
  signal?: AbortSignal
): AsyncGenerator<
  | { type: "metadata"; data: Record<string, unknown> }
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }
> {
  const url = `${BACKEND}/analyze/${encodeURIComponent(ticker.toUpperCase())}/stream`;
  const res = await fetch(url, { signal, cache: "no-store" });

  if (!res.ok || !res.body) {
    yield { type: "error", message: "Không thể kết nối stream" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        try {
          const parsed = JSON.parse(raw);
          if (eventType === "metadata") {
            yield { type: "metadata", data: parsed };
          } else if (eventType === "chunk") {
            yield { type: "chunk", text: parsed as string };
          } else if (eventType === "report_end") {
            yield { type: "done" };
          } else if (eventType === "error") {
            yield { type: "error", message: parsed.error ?? "Stream error" };
          }
        } catch {
          // skip malformed SSE
        }
      }
    }
  }
}
