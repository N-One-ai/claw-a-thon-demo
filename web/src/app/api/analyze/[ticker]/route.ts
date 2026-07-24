import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ─── API endpoints ─────────────────────────────────────────────────────────────
const VPS_FEED = "https://histdatafeed.vps.com.vn/tradingview/history";
const VCI_IQ = "https://iq.vietcap.com.vn/api/iq-insight-service";
const RISK_FREE_RATE = parseFloat(process.env.RISK_FREE_RATE ?? "0.048");

const VCI_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9,vi-VN;q=0.8",
  "Cache-Control": "no-cache",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Referer: "https://trading.vietcap.com.vn/",
  Origin: "https://trading.vietcap.com.vn",
};

const VPS_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Referer: "https://www.vps.com.vn/",
};

// ─── Sector benchmarks ─────────────────────────────────────────────────────────
interface SectorCfg {
  pe: number; pb: number; wacc: number; g: number;
  wPE: number; wPB: number; wGr: number; wDCF: number;
}
const SECTOR: Record<string, SectorCfg> = {
  NH:  { pe: 12, pb: 1.8, wacc: 0.10, g: 0.04, wPE: 0.25, wPB: 0.35, wGr: 0.20, wDCF: 0.20 },
  CK:  { pe: 15, pb: 2.0, wacc: 0.12, g: 0.05, wPE: 0.30, wPB: 0.25, wGr: 0.20, wDCF: 0.25 },
  BH:  { pe: 14, pb: 2.0, wacc: 0.11, g: 0.04, wPE: 0.30, wPB: 0.30, wGr: 0.20, wDCF: 0.20 },
  _:   { pe: 15, pb: 2.5, wacc: 0.12, g: 0.05, wPE: 0.30, wPB: 0.25, wGr: 0.20, wDCF: 0.25 },
};

// ─── Utilities ─────────────────────────────────────────────────────────────────

async function safeFetch(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sma(prices: number[], period: number): (number | null)[] {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += prices[j];
    return s / period;
  });
}

function ema(prices: number[], period: number): number[] {
  const out = new Array<number>(prices.length).fill(NaN);
  if (prices.length < period) return out;
  const k = 2 / (period + 1);
  let cur = 0;
  for (let i = 0; i < period; i++) cur += prices[i];
  cur /= period;
  out[period - 1] = cur;
  for (let i = period; i < prices.length; i++) {
    cur = prices[i] * k + cur * (1 - k);
    out[i] = cur;
  }
  return out;
}

function rsi(prices: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(prices.length).fill(null);
  if (prices.length <= period) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

function macd(prices: number[], fast = 12, slow = 26, sig = 9) {
  const fe = ema(prices, fast);
  const se = ema(prices, slow);
  const ml: (number | null)[] = prices.map((_, i) =>
    isNaN(fe[i]) || isNaN(se[i]) ? null : fe[i] - se[i]
  );
  const firstV = ml.findIndex(v => v !== null);
  const sl: (number | null)[] = new Array(prices.length).fill(null);
  const hl: (number | null)[] = new Array(prices.length).fill(null);
  if (firstV !== -1) {
    const ve = ema(ml.slice(firstV) as number[], sig);
    for (let i = 0; i < ve.length; i++) {
      const abs = firstV + i;
      if (!isNaN(ve[i]) && ml[abs] !== null) {
        sl[abs] = ve[i];
        hl[abs] = (ml[abs] as number) - ve[i];
      }
    }
  }
  return { ml, sl, hl };
}

function beta(stock: number[], market: number[]): number | null {
  const n = Math.min(stock.length, market.length);
  if (n < 30) return null;
  const s = stock.slice(0, n), m = market.slice(0, n);
  const ms = s.reduce((a, b) => a + b, 0) / n;
  const mm = m.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (s[i] - ms) * (m[i] - mm);
    varM += (m[i] - mm) ** 2;
  }
  return varM === 0 ? null : cov / varM;
}

function dcf(fcf: number, g: number, wacc: number, gT: number, years = 5): number {
  let pv = 0;
  for (let t = 1; t <= years; t++) {
    pv += fcf * Math.pow(1 + g, t) / Math.pow(1 + wacc, t);
  }
  const tv = fcf * Math.pow(1 + g, years) * (1 + gT) / (wacc - gT);
  return pv + tv / Math.pow(1 + wacc, years);
}

function label(disc: number): string {
  if (disc >= 30) return "Rất hấp dẫn";
  if (disc >= 15) return "Hấp dẫn";
  if (disc >= -15) return "Trung lập";
  if (disc >= -30) return "Đắt";
  return "Rất đắt";
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();
  const errors: Record<string, string> = {};
  const now = Math.floor(Date.now() / 1000);
  const from = now - 520 * 86400; // ~520 trading-day window

  const t0 = Date.now();

  // Parallel fetch: company, ratios, income stmt, balance sheet, OHLCV stock, OHLCV index
  const [cmpRaw, ratioRaw, incRaw, balRaw, ohlcvRaw, vnxRaw] = await Promise.all([
    safeFetch(`${VCI_IQ}/v1/company/${sym}`, VCI_HEADERS),
    safeFetch(`${VCI_IQ}/v1/company/${sym}/statistics-financial`, VCI_HEADERS),
    safeFetch(`${VCI_IQ}/v1/company/${sym}/financial-statement?section=INCOME_STATEMENT`, VCI_HEADERS),
    safeFetch(`${VCI_IQ}/v1/company/${sym}/financial-statement?section=BALANCE_SHEET`, VCI_HEADERS),
    safeFetch(`${VPS_FEED}?symbol=${sym}&resolution=D&from=${from}&to=${now}`, VPS_HEADERS),
    safeFetch(`${VPS_FEED}?symbol=VNINDEX&resolution=D&from=${from}&to=${now}`, VPS_HEADERS),
  ]);

  const fetchMs = Date.now() - t0;
  const t1 = Date.now();

  // ── Company ──────────────────────────────────────────────────────────────────
  const cmp = (cmpRaw as any)?.data;
  if (!cmp) errors.company = "Không tìm thấy thông tin công ty";

  const name: string = cmp?.viOrganName ?? cmp?.enOrganName ?? sym;
  const exchange: string = cmp?.comGroupCode ?? "HOSE";
  const sectorVn: string = cmp?.sectorVn ?? cmp?.sector ?? "Không xác định";
  const comType: string = cmp?.comTypeCode ?? "_";
  const sharesOutstanding: number = cmp?.numberOfSharesMktCap ?? 0;
  const currentPrice: number | null = cmp?.currentPrice ?? null;
  if (!currentPrice) errors.price = "Không lấy được giá hiện tại";

  const cfg: SectorCfg = SECTOR[comType] ?? SECTOR._;

  // ── Financial ratios ─────────────────────────────────────────────────────────
  const ratios: any[] = (ratioRaw as any)?.data ?? [];
  // Prefer TTM ratios; fall back to most recent
  const ttm = ratios.filter(r => r.ratioType === "RATIO_TTM");
  const latestR = (ttm.at(-1) ?? ratios.at(-1)) as any;

  const peTTM: number | null = latestR?.pe ?? null;
  const pbTTM: number | null = latestR?.pb ?? null;
  const deTTM: number | null = latestR?.debtToEquity ?? null;
  const sharesR: number = latestR?.numberOfSharesMktCap ?? sharesOutstanding;

  // ── Income statement — TTM EPS (sum of last 4 quarters' isa23) ───────────────
  const incQs: any[] = (incRaw as any)?.data?.quarters ?? [];
  if (!incQs.length) errors.income = "Không lấy được BCTC thu nhập";

  // Only include quarters where isa23 is a positive number (exclude NaN, 0, null)
  const epsQs = incQs
    .slice(-8)  // look at last 8 quarters, take best 4
    .filter((q: any) => typeof q.isa23 === "number" && q.isa23 > 0)
    .slice(-4);

  let epsTTM: number | null = null;
  if (epsQs.length >= 1) {
    const sum = epsQs.reduce((s: number, q: any) => s + q.isa23, 0);
    // Annualise if we have fewer than 4 quarters
    epsTTM = epsQs.length === 4 ? sum : sum * (4 / epsQs.length);
  }
  // Fallback: derive EPS from P/E × current price
  if (epsTTM === null && peTTM && currentPrice && peTTM > 0) {
    epsTTM = currentPrice / peTTM;
  }

  // ── Balance sheet — BVPS ─────────────────────────────────────────────────────
  const balQs: any[] = (balRaw as any)?.data?.quarters ?? [];
  if (!balQs.length) errors.balance = "Không lấy được BCTC cân đối";

  let bvps: number | null = null;
  const latestB = balQs.at(-1);
  const ownersEquity: number | null = latestB?.bsa78 ?? null;
  if (ownersEquity && sharesR > 0) {
    bvps = ownersEquity / sharesR;
  } else if (pbTTM && currentPrice && pbTTM > 0) {
    bvps = currentPrice / pbTTM;
  }

  // ── OHLCV & technicals ───────────────────────────────────────────────────────
  const ohlcv = ohlcvRaw as any;
  const ts: number[] = ohlcv?.t ?? [];
  // VPS returns prices in thousands of VND — scale to VND to match VCI
  const PRICE_SCALE = 1000;
  const cl: number[] = (ohlcv?.c ?? []).map((v: number) => v * PRICE_SCALE);
  const op: number[] = (ohlcv?.o ?? []).map((v: number) => v * PRICE_SCALE);
  const hi: number[] = (ohlcv?.h ?? []).map((v: number) => v * PRICE_SCALE);
  const lo: number[] = (ohlcv?.l ?? []).map((v: number) => v * PRICE_SCALE);
  const vo: number[] = ohlcv?.v ?? [];

  let technical: object | null = null;

  if (cl.length >= 20) {
    const sma20  = sma(cl, 20);
    const sma50  = sma(cl, 50);
    const sma200 = sma(cl, 200);
    const rsiV   = rsi(cl);
    const { ml, sl, hl } = macd(cl);

    const price   = currentPrice ?? cl.at(-1)!;
    const last    = cl.length - 1;
    const s20     = sma20[last];
    const s50     = sma50[last];
    const s200    = sma200[last];
    const rsi14   = rsiV[last];
    const macdCur = ml[last];
    const sigCur  = sl[last];

    // Price trend
    let priceTrend = "Tích lũy";
    if (s50 && price > s50 && s20 && s20 > s50) priceTrend = "Tăng mạnh";
    else if (s50 && price < s50 * 0.95) priceTrend = "Giảm";

    // RSI label
    const rsiLabel = rsi14 === null ? "Không xác định"
      : rsi14 > 70 ? "Quá mua"
      : rsi14 < 30 ? "Quá bán"
      : "Trung lập";

    // MACD label
    const macdLabel = macdCur === null || sigCur === null ? "Chờ"
      : macdCur > sigCur ? "Mua"
      : "Bán";

    // 52-week range (last 252 bars)
    const hi252 = hi.slice(-252);
    const lo252 = lo.slice(-252);
    const high52w = hi252.length ? Math.max(...hi252) : null;
    const low52w  = lo252.length ? Math.min(...lo252) : null;
    const pos52w  = high52w && low52w && high52w > low52w
      ? (price - low52w) / (high52w - low52w) * 100
      : null;

    // Volume trend
    const avgVol20 = vo.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vo.length);
    const avgVol60 = vo.slice(-60).reduce((a, b) => a + b, 0) / Math.min(60, vo.length);
    const volTrend = avgVol20 > avgVol60 * 1.2 ? "Tăng"
      : avgVol20 < avgVol60 * 0.8 ? "Giảm"
      : "Ổn định";

    // Chart data — last 120 bars
    const cStart = Math.max(0, ts.length - 120);
    const chartData = ts.slice(cStart).map((t, ri) => {
      const ai = cStart + ri;
      return {
        date: new Date(t * 1000).toISOString().split("T")[0],
        open: op[ai] ?? cl[ai],
        high: hi[ai] ?? cl[ai],
        low:  lo[ai] ?? cl[ai],
        close: cl[ai],
        volume: vo[ai] ?? 0,
        sma20:  sma20[ai]  ?? null,
        sma50:  sma50[ai]  ?? null,
        sma200: sma200[ai] ?? null,
        rsi:    rsiV[ai]   ?? null,
        macd:   ml[ai]     ?? null,
        macd_signal:    sl[ai] ?? null,
        macd_histogram: hl[ai] ?? null,
      };
    });

    technical = {
      current_price: price,
      sma_20: s20, sma_50: s50, sma_200: s200,
      rsi_14: rsi14, rsi_label: rsiLabel,
      macd_label: macdLabel,
      price_trend: priceTrend,
      high_52w: high52w, low_52w: low52w,
      position_52w_pct: pos52w,
      volume_trend: volTrend,
      chart_data: chartData,
    };
  } else {
    errors.ohlcv = "Không đủ dữ liệu giá lịch sử";
  }

  // ── Risk ────────────────────────────────────────────────────────────────────
  let risk: object | null = null;

  if (cl.length >= 30) {
    const sRet = cl.slice(1).map((c, i) => (c - cl[i]) / cl[i]);
    // VNINDEX also returns in thousands — returns are scale-invariant so we can use raw
    const vnx: number[] = (vnxRaw as any)?.c ?? [];
    const mRet = vnx.slice(1).map((c, i) => (c - vnx[i]) / vnx[i]);
    const b = beta(sRet, mRet);

    const n = sRet.length;
    const mean = sRet.reduce((a, c) => a + c, 0) / n;
    const vol = Math.sqrt(sRet.reduce((a, c) => a + (c - mean) ** 2, 0) / (n - 1) * 252) * 100;

    const flags: object[] = [];
    if (b !== null && b > 1.5)
      flags.push({ flag_type: "high_beta",       severity: "warning", description: `Beta ${b.toFixed(2)} — biến động cao hơn thị trường` });
    if (deTTM !== null && deTTM > 2)
      flags.push({ flag_type: "high_leverage",   severity: "warning", description: `Nợ/Vốn chủ ${deTTM.toFixed(2)} — đòn bẩy cao` });
    if (vol > 40)
      flags.push({ flag_type: "high_volatility", severity: "warning", description: `Biến động ${vol.toFixed(1)}%/năm — cổ phiếu rủi ro cao` });

    const overallRisk = flags.length >= 2 || (b !== null && b > 1.8) || vol > 50
      ? "Cao"
      : flags.length === 0 && (b === null || b <= 1.0) && vol < 25
        ? "Thấp"
        : "Trung bình";

    risk = {
      ticker: sym,
      beta: b,
      annualized_volatility_pct: vol,
      debt_to_equity: deTTM,
      overall_risk: overallRisk,
      flags,
      avg_daily_volume: vo.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vo.length),
    };
  }

  // ── Valuation ───────────────────────────────────────────────────────────────
  let valuation: object | null = null;

  if (currentPrice && (epsTTM || bvps)) {
    const price = currentPrice;

    const peResult = {
      model_name: "P/E Fair Value",
      fair_value: epsTTM ? Math.round(epsTTM * cfg.pe) : null,
      is_available: epsTTM !== null,
      weight: cfg.wPE,
      inputs: { eps_ttm: epsTTM ?? 0, pe_benchmark: cfg.pe },
    };

    const pbResult = {
      model_name: "P/B Fair Value",
      fair_value: bvps ? Math.round(bvps * cfg.pb) : null,
      is_available: bvps !== null,
      weight: cfg.wPB,
      inputs: { bvps: bvps ?? 0, pb_benchmark: cfg.pb },
    };

    const grahamOk = epsTTM !== null && epsTTM > 0 && bvps !== null && bvps > 0;
    const grahamFV = grahamOk ? Math.round(Math.sqrt(22.5 * epsTTM! * bvps!)) : null;
    const grahamResult = {
      model_name: "Graham Number",
      fair_value: grahamFV,
      is_available: grahamOk,
      weight: cfg.wGr,
      inputs: { eps_ttm: epsTTM ?? 0, bvps: bvps ?? 0 },
    };

    // FCF proxy = EPS_TTM per share (earnings-based DCF)
    const fcf0 = epsTTM ?? null;
    let dcfResult = {
      model_name: "DCF (5 năm)",
      fair_value: null as number | null,
      is_available: false,
      weight: cfg.wDCF,
      inputs: {} as Record<string, number>,
    };
    if (fcf0 && cfg.wacc > cfg.g) {
      dcfResult = {
        model_name: "DCF (5 năm)",
        fair_value: Math.round(dcf(fcf0, 0.08, cfg.wacc, cfg.g)),
        is_available: true,
        weight: cfg.wDCF,
        inputs: { fcf_per_share: fcf0, growth: 0.08, wacc: cfg.wacc, terminal_g: cfg.g },
      };
    }

    const ey = epsTTM ? epsTTM / price : 0;
    const eyResult = {
      earnings_yield: ey,
      risk_free_rate: RISK_FREE_RATE,
      spread: ey - RISK_FREE_RATE,
      is_attractive: ey - RISK_FREE_RATE > 0.03,
    };

    // Weighted consensus
    const models = [
      { fv: peResult.fair_value,   w: cfg.wPE,   ok: peResult.is_available },
      { fv: pbResult.fair_value,   w: cfg.wPB,   ok: pbResult.is_available },
      { fv: grahamResult.fair_value, w: cfg.wGr, ok: grahamResult.is_available },
      { fv: dcfResult.fair_value,  w: cfg.wDCF,  ok: dcfResult.is_available },
    ].filter(m => m.ok && m.fv !== null);

    let consensus = price; // fallback
    if (models.length > 0) {
      const totalW = models.reduce((s, m) => s + m.w, 0);
      consensus = Math.round(models.reduce((s, m) => s + m.fv! * m.w, 0) / totalW);
    }

    const discountPct = ((consensus - price) / price) * 100;

    const scenarios = fcf0 ? [
      {
        name: "Bi quan", growth_rate: 0.05,
        terminal_growth: Math.max(cfg.g - 0.01, 0.01),
        wacc: cfg.wacc + 0.02,
        fair_value: Math.round(dcf(fcf0, 0.05, cfg.wacc + 0.02, Math.max(cfg.g - 0.01, 0.01))),
        probability: 0.30,
      },
      {
        name: "Cơ sở", growth_rate: 0.08,
        terminal_growth: cfg.g, wacc: cfg.wacc,
        fair_value: Math.round(dcf(fcf0, 0.08, cfg.wacc, cfg.g)),
        probability: 0.50,
      },
      {
        name: "Lạc quan", growth_rate: 0.12,
        terminal_growth: cfg.g + 0.01,
        wacc: Math.max(cfg.wacc - 0.01, 0.05),
        fair_value: Math.round(dcf(fcf0, 0.12, Math.max(cfg.wacc - 0.01, 0.05), cfg.g + 0.01)),
        probability: 0.20,
      },
    ] : [];

    const pwv = scenarios.length > 0
      ? Math.round(scenarios.reduce((s, sc) => s + sc.fair_value * sc.probability, 0))
      : consensus;

    valuation = {
      ticker: sym,
      current_price: price,
      pe_result: peResult,
      pb_result: pbResult,
      graham_result: grahamResult,
      dcf_result: dcfResult,
      earnings_yield: eyResult,
      consensus_value: consensus,
      discount_pct: discountPct,
      label: label(discountPct),
      scenarios,
      probability_weighted_value: pwv,
    };
  }

  // ── Data quality ─────────────────────────────────────────────────────────────
  const dataQuality = {
    periods_income: epsQs.length,
    periods_balance: balQs.length,
    price_trading_days: cl.length,
    has_eps_ttm: epsTTM !== null,
    has_bvps: bvps !== null,
    has_fcf_ttm: false,
  };

  return NextResponse.json(
    {
      ticker: sym,
      generated_at: new Date().toISOString(),
      current_price: currentPrice,
      company: {
        ticker: sym,
        name,
        exchange,
        sector: sectorVn,
        shares_outstanding: sharesOutstanding,
      },
      valuation,
      technical,
      risk,
      data_quality: dataQuality,
      fetch_ms: fetchMs,
      analysis_ms: Date.now() - t1,
      errors,
      report: null,
    },
    {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    }
  );
}
