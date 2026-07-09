import { NextResponse } from "next/server";

// ── Backend (Python on AgentBase) ────────────────────────────────────────────
const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

// ── VCI (Vietcap) public APIs ────────────────────────────────────────────────
const VCI_BASE = "https://trading.vietcap.com.vn/api";

const VCI_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36 CocCocBrowser/137.0.258",
  "Referer": "https://trading.vietcap.com.vn/",
  "Origin": "https://trading.vietcap.com.vn/",
};

// VN30 + mid-cap sample for HOSE breadth / liquidity / volume
const HOSE_SAMPLE = [
  "ACB","BCM","BID","BVH","CTG","FPT","GAS","GVR","HDB","HPG",
  "MBB","MSN","MWG","PLX","POW","SAB","SSI","STB","TCB","TPB",
  "VCB","VHM","VIC","VJC","VNM","VPB","VRE","PDR","NVL","VND",
  "DXG","KDH","NLG","DIG","REE","GMD","PNJ","DGC","DCM","DHG",
  "HSG","NKG","HBC","CTD","GEX","CII","SHB","EIB","OCB","LPB",
  "VIB","MSB","SSB","DBC","VHC","ANV","CNG","VSH","BWE","TDC",
  "CEO","HDG","AGG","IMP","TRA","MIG","HAH","ACV","SCS","PVD",
  "PVS","PVT","BSR","CHP","KBC","CMG","FRT","BMP","NTP","STK",
  "MCH","HAG","SRC","PHR","QNS","SBT","HT1","VGC",
];

const HNX_SAMPLE = [
  "PVB","SHN","NVB","BAB","VGS","DHT","VCS","HUT","L14",
  "PVC","VC3","DNP","CMC","NTP","CAN","MBS",
];

export const maxDuration = 20;
export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * VCI chart API requires `to` = next midnight Vietnam time (UTC+7) in seconds.
 * That's the only timestamp that reliably returns today's bar.
 */
function nextVnMidnightSec(): number {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const vnNow = new Date(Date.now() + VN_OFFSET_MS);
  vnNow.setUTCDate(vnNow.getUTCDate() + 1);
  vnNow.setUTCHours(0, 0, 0, 0);
  return Math.floor((vnNow.getTime() - VN_OFFSET_MS) / 1000);
}

interface IndexData {
  value: number;
  change: number;
  change_pct: number;
}

async function fetchIndexChart(): Promise<Record<string, IndexData | null>> {
  const to = nextVnMidnightSec();
  const res = await fetch(`${VCI_BASE}/chart/OHLCChart/gap-chart`, {
    method: "POST",
    headers: VCI_HEADERS,
    body: JSON.stringify({
      timeFrame: "ONE_DAY",
      symbols: ["VNINDEX", "HNXIndex"],
      to,
      countBack: 5,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return {};
  const data: any[] = await res.json();
  if (!Array.isArray(data) || data.length === 0) return {};

  const result: Record<string, IndexData | null> = {};
  for (const item of data) {
    const closes: number[] = item.c ?? [];
    if (closes.length < 2) { result[item.symbol] = null; continue; }
    const value   = closes[closes.length - 1];
    const prev    = closes[closes.length - 2];
    const change  = +(value - prev).toFixed(2);
    const pct     = prev ? +(change / prev * 100).toFixed(2) : 0;
    result[item.symbol] = { value: +value.toFixed(2), change, change_pct: pct };
  }
  return result;
}

async function fetchPriceBoard(symbols: string[]): Promise<any[]> {
  const res = await fetch(`${VCI_BASE}/price/symbols/getList`, {
    method: "POST",
    headers: VCI_HEADERS,
    body: JSON.stringify({ symbols }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function calcBreadth(board: any[], threshold = 100) {
  let advance = 0, decline = 0, unchanged = 0;
  for (const item of board) {
    const mp    = item?.matchPrice;
    const price = mp?.matchPrice    ?? 0;
    const ref   = mp?.referencePrice ?? 0;
    if (price > 0 && ref > 0) {
      const diff = price - ref;
      if (diff > threshold)  advance++;
      else if (diff < -threshold) decline++;
      else unchanged++;
    }
  }
  return { advance, decline, unchanged };
}

function sumLiquidity(board: any[]): number {
  // accumulatedValue unit: triệu VND → divide by 1 000 → tỷ VND
  return +(board.reduce((s, x) => s + (x?.matchPrice?.accumulatedValue ?? 0), 0) / 1_000).toFixed(1);
}

function sumVolume(board: any[]): number {
  // accumulatedVolume unit: shares → divide by 1 000 000 → triệu CP
  return +(board.reduce((s, x) => s + (x?.matchPrice?.accumulatedVolume ?? 0), 0) / 1_000_000).toFixed(1);
}

// ── VCI fallback ─────────────────────────────────────────────────────────────

async function fetchFromVci() {
  const errors: string[] = [];

  const [chartRes, hoseRes, hnxRes] = await Promise.allSettled([
    fetchIndexChart(),
    fetchPriceBoard(HOSE_SAMPLE),
    fetchPriceBoard(HNX_SAMPLE),
  ]);

  const chart: Record<string, IndexData | null> =
    chartRes.status === "fulfilled" ? chartRes.value : {};
  if (chartRes.status === "rejected")
    errors.push(`index_chart: ${chartRes.reason}`);

  const hoseBoard: any[] = hoseRes.status === "fulfilled" ? hoseRes.value : [];
  if (hoseRes.status === "rejected")
    errors.push(`hose_board: ${hoseRes.reason}`);

  const hnxBoard: any[]  = hnxRes.status  === "fulfilled" ? hnxRes.value  : [];
  if (hnxRes.status === "rejected")
    errors.push(`hnx_board: ${hnxRes.reason}`);

  // HOSE breadth + totals
  const hose    = calcBreadth(hoseBoard, 100);
  const liq     = sumLiquidity(hoseBoard);
  const vol     = sumVolume(hoseBoard);

  // HNX: merge index value + breadth
  const hnxIdx  = chart["HNXIndex"] ?? null;
  const hnxBrd  = calcBreadth(hnxBoard, 10);
  const hasHnx  = hnxIdx || (hnxBrd.advance + hnxBrd.decline + hnxBrd.unchanged > 0);

  return {
    vnindex:   chart["VNINDEX"]   ?? null,
    hose:      hose.advance + hose.decline + hose.unchanged > 0 ? hose : null,
    hnx:       hasHnx ? { ...(hnxIdx ?? {}), ...hnxBrd } : null,
    liquidity: liq > 0  ? liq : null,
    volume:    vol > 0  ? vol : null,
    errors,
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  // 1. Try Python backend (when deployed image includes /market endpoint)
  if (BACKEND) {
    try {
      const res = await fetch(`${BACKEND}/market`, {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        // Verify it has the expected market data shape (not a "not found" response)
        if (json?.data != null && "vnindex" in json.data) {
          return NextResponse.json(json, {
            headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
          });
        }
      }
    } catch {
      // backend down or /market not deployed yet — fall through
    }
  }

  // 2. Fallback: fetch directly from VCI public APIs
  try {
    const data = await fetchFromVci();
    return NextResponse.json(
      { status: "ok", data, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", data: null, message: String(err) },
      { status: 502 },
    );
  }
}
