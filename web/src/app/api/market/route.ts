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

// ── VPS data feed (works from Node.js — used for index OHLC) ─────────────────
const VPS_FEED = "https://histdatafeed.vps.com.vn/tradingview/history";
const VPS_HEADERS: Record<string, string> = {
  "Accept": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Referer": "https://www.vps.com.vn/",
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

interface IndexData {
  value: number;
  change: number;
  change_pct: number;
}

async function fetchVpsSymbol(symbol: string): Promise<{ closes: number[]; volumes: number[] } | null> {
  const now  = Math.floor(Date.now() / 1000);
  const from = now - 86400 * 37; // ~37 calendar days ≈ 25 trading days
  const url  = `${VPS_FEED}?symbol=${symbol}&resolution=D&from=${from}&to=${now + 86400}`;
  const res  = await fetch(url, { headers: VPS_HEADERS, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.s !== "ok") return null;
  return { closes: data.c ?? [], volumes: data.v ?? [] };
}

function toIndexData(closes: number[]): IndexData | null {
  if (closes.length < 2) return null;
  const value  = closes[closes.length - 1];
  const prev   = closes[closes.length - 2];
  const change = +(value - prev).toFixed(2);
  const pct    = prev ? +(change / prev * 100).toFixed(2) : 0;
  return { value: +value.toFixed(2), change, change_pct: pct };
}

async function fetchIndexData(): Promise<{
  vnindex:   IndexData | null;
  hnxindex:  IndexData | null;
  vn30:      IndexData | null;
  sparklines: { vnindex: number[]; hnxindex: number[]; vn30: number[]; volume: number[] };
}> {
  const [vnRes, hnxRes, vn30Res] = await Promise.allSettled([
    fetchVpsSymbol("VNINDEX"),
    fetchVpsSymbol("HNXINDEX"),
    fetchVpsSymbol("VN30"),
  ]);
  const vn   = vnRes.status   === "fulfilled" ? vnRes.value   : null;
  const hnx  = hnxRes.status  === "fulfilled" ? hnxRes.value  : null;
  const vn30 = vn30Res.status === "fulfilled" ? vn30Res.value : null;
  return {
    vnindex:   vn   ? toIndexData(vn.closes)   : null,
    hnxindex:  hnx  ? toIndexData(hnx.closes)  : null,
    vn30:      vn30 ? toIndexData(vn30.closes)  : null,
    sparklines: {
      vnindex:  vn?.closes   ?? [],
      hnxindex: hnx?.closes  ?? [],
      vn30:     vn30?.closes ?? [],
      volume:   vn?.volumes  ?? [],
    },
  };
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

function sumForeignFlow(board: any[]): number | null {
  // foreignBuyValue / foreignSellValue in triệu VND → divide by 1 000 → tỷ VND
  let buy = 0, sell = 0;
  for (const item of board) {
    buy  += item?.matchPrice?.foreignBuyValue  ?? 0;
    sell += item?.matchPrice?.foreignSellValue ?? 0;
  }
  if (buy === 0 && sell === 0) return null;
  return +((buy - sell) / 1_000).toFixed(1);
}

function calcHealthScore(
  changePct: number | null,
  hose: { advance: number; decline: number; unchanged: number } | null,
): number {
  const total = hose ? (hose.advance + hose.decline + hose.unchanged) : 0;
  const breadth   = total > 0 ? Math.round((hose!.advance / total) * 100) : 50;
  const momentum  = Math.max(0, Math.min(100, Math.round(50 + ((changePct ?? 0) / 3) * 50)));
  return Math.round(0.6 * breadth + 0.4 * momentum);
}

// ── VCI fallback ─────────────────────────────────────────────────────────────

async function fetchFromVci() {
  const errors: string[] = [];

  const [indexRes, hoseRes, hnxRes] = await Promise.allSettled([
    fetchIndexData(),
    fetchPriceBoard(HOSE_SAMPLE),
    fetchPriceBoard(HNX_SAMPLE),
  ]);

  const indexResult = indexRes.status === "fulfilled" ? indexRes.value : null;
  if (indexRes.status === "rejected")
    errors.push(`index_data: ${indexRes.reason}`);

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

  // HNX: only include when we have the index value
  const hnxIdx  = indexResult?.hnxindex ?? null;
  const hnxBrd  = calcBreadth(hnxBoard, 10);

  const foreignFlow = sumForeignFlow(hoseBoard);
  const hoseBreadth = hose.advance + hose.decline + hose.unchanged > 0 ? hose : null;
  const healthScore = calcHealthScore(
    indexResult?.vnindex?.change_pct ?? null,
    hoseBreadth,
  );

  return {
    vnindex:     indexResult?.vnindex ?? null,
    vn30:        indexResult?.vn30    ?? null,
    hose:        hoseBreadth,
    hnx:         hnxIdx ? { ...hnxIdx, ...hnxBrd } : null,
    liquidity:   liq > 0  ? liq : null,
    volume:      vol > 0  ? vol : null,
    foreignFlow,
    healthScore,
    sparklines:  indexResult?.sparklines ?? { vnindex: [], hnxindex: [], vn30: [], volume: [] },
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
