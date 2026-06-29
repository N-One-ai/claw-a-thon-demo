export interface AnalysisResponse {
  ticker: string;
  generated_at: string;
  current_price: number | null;
  company: CompanyInfo;
  valuation: ValuationResults | null;
  technical: TechnicalSignal | null;
  risk: RiskProfile | null;
  data_quality: DataQuality;
  fetch_ms: number | null;
  analysis_ms: number | null;
  errors: Record<string, string>;
  report: string | null;
}

export interface CompanyInfo {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  shares_outstanding: number;
}

export interface ValuationResults {
  ticker: string;
  current_price: number;
  pe_result: ModelResult;
  pb_result: ModelResult;
  graham_result: ModelResult;
  dcf_result: ModelResult;
  earnings_yield: EarningsYieldResult;
  consensus_value: number;
  discount_pct: number;
  label: string;
  scenarios: DCFScenario[];
  probability_weighted_value: number;
}

export interface ModelResult {
  model_name: string;
  fair_value: number | null;
  is_available: boolean;
  weight: number;
  inputs: Record<string, number | string>;
}

export interface EarningsYieldResult {
  earnings_yield: number;
  risk_free_rate: number;
  spread: number;
  is_attractive: boolean;
}

export interface DCFScenario {
  name: string;
  growth_rate: number;
  terminal_growth: number;
  wacc: number;
  fair_value: number;
  probability: number;
}

export interface OHLCVPoint {
  date: string;             // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
}

export interface TechnicalSignal {
  current_price: number;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  rsi_label: string;
  macd_label: string;
  price_trend: string;
  high_52w: number | null;
  low_52w: number | null;
  position_52w_pct: number | null;
  volume_trend?: string;
  chart_data?: OHLCVPoint[];
}

export interface RiskProfile {
  ticker: string;
  beta: number | null;
  annualized_volatility_pct?: number | null;
  debt_to_equity: number | null;
  interest_coverage?: number | null;
  earnings_stability?: string | null;
  avg_daily_volume?: number | null;
  overall_risk: string;
  flags?: RiskFlag[];
  risk_summary?: string;
}

export interface RiskFlag {
  flag_type: string;
  severity: string;
  description: string;
}

export interface DataQuality {
  periods_income: number;
  periods_balance?: number;
  periods_cashflow?: number;
  price_trading_days?: number;
  has_eps_ttm: boolean;
  has_bvps: boolean;
  has_fcf_ttm: boolean;
}

export type AnalysisTab =
  | "valuation"
  | "health"
  | "risk"
  | "technical"
  | "scenarios"
  | "report";
