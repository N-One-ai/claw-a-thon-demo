# Stock Valuation Agent — N-One

## Project Overview

An AI-powered stock valuation agent that computes intrinsic value using multiple financial models, compares against current market price, and delivers a structured analyst-style report covering valuation, momentum, technicals, risk, and scenarios.

The agent targets Vietnamese retail investors and analysts. Vietnamese is the primary output language; English is used for code, identifiers, and formula names.

---

## Core Capabilities

### 1. Valuation Models

| Model | Formula |
|---|---|
| **P/E Fair Value** | `EPS_TTM × Sector_PE_Benchmark` |
| **P/B Fair Value** | `Book_Value_Per_Share × Sector_PB_Benchmark` |
| **Graham Number** | `√(22.5 × EPS_TTM × BVPS)` |
| **Earnings Yield** | `EPS_TTM / Current_Price × 100%` (compare vs 10Y bond yield) |
| **DCF (5-year)** | Free cash flow discounted at WACC; terminal value at perpetuity growth |

All five valuations are computed and then aggregated into a **consensus fair value** (weighted average configurable per sector).

### 2. Valuation Output

- Consensus fair value (VND)
- Current market price (VND)
- Discount / Premium to fair value (%)
- Upside potential label: `Rất hấp dẫn / Hấp dẫn / Trung lập / Đắt / Rất đắt`

### 3. Momentum & Trend Analysis

- Price vs 20/50/200-day SMA — classify as `Tăng mạnh / Tích lũy / Giảm`
- 52-week high/low positioning
- Volume trend (20-day avg vs 60-day avg)
- RSI (14) — label `Quá mua (>70) / Trung lập / Quá bán (<30)`
- MACD signal — `Mua / Bán / Chờ`

### 4. Risk Analysis

- Beta vs VN-Index
- Debt-to-equity ratio
- Interest coverage ratio
- Earnings stability (std dev of last 4 quarters EPS)
- Qualitative flags: regulatory risk, concentration risk, liquidity risk

### 5. Scenario Analysis

Three DCF scenarios with distinct growth and WACC assumptions:

| Scenario | Description |
|---|---|
| **Bi quan** | Slower growth, higher WACC |
| **Cơ sở** | Base-case projections |
| **Lạc quan** | Accelerated growth, stable WACC |

Each scenario outputs a fair value and probability-weighted contribution to the consensus.

---

## Architecture

```
agent/
├── CLAUDE.md                  # This file
├── src/
│   ├── main.py                # Entry point — CLI and API server modes
│   ├── agent.py               # LangChain/Claude agent orchestrator
│   ├── tools/
│   │   ├── fetch_data.py      # Pull financials + price data
│   │   ├── valuation.py       # P/E, P/B, Graham, EY, DCF calculators
│   │   ├── technicals.py      # RSI, MACD, SMA, volume trend
│   │   ├── risk.py            # Beta, D/E, coverage, stability
│   │   └── report.py          # Assemble final structured report
│   └── prompts/
│       └── system_prompt.txt  # Agent system prompt (Vietnamese output)
├── config/
│   ├── sector_benchmarks.yaml # Sector P/E and P/B reference values
│   ├── wacc_defaults.yaml     # Default WACC by sector
│   └── settings.yaml          # API keys refs, model choice, output format
├── tests/
│   ├── test_valuation.py
│   ├── test_technicals.py
│   └── test_report.py
├── requirements.txt
└── .env.example
```

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | Python 3.11+ | Ecosystem for finance (pandas, yfinance) |
| LLM | Claude claude-sonnet-4-6 via Anthropic SDK | Structured output, tool use |
| Agent framework | LangChain or raw tool-use loop | Claude native tool use preferred |
| Data — price | `vnstock` library (HOSE/HNX) or `yfinance` for foreign stocks | Free, real-time |
| Data — financials | `vnstock` fundamental data or SSI/TCBS API | Vietnamese market coverage |
| Output | Rich terminal table + optional JSON + optional PDF | Multi-format |

---

## Data Sources

- **vnstock** (`pip install vnstock`) — primary source for Vietnamese stocks (VN-Index constituents, financials, price history)
- **yfinance** — fallback for US-listed stocks or ADRs
- Sector P/E / P/B benchmarks stored in `config/sector_benchmarks.yaml` and updated quarterly
- Risk-free rate: 10Y Vietnamese Government Bond yield (fetched or configured manually)

---

## Valuation Formula Reference

### DCF (5-year explicit + terminal)
```
FCF_t = FCF_0 × (1 + g)^t       for t = 1..5
Terminal_Value = FCF_5 × (1 + g_terminal) / (WACC - g_terminal)
Intrinsic_Value = Σ FCF_t/(1+WACC)^t + TV/(1+WACC)^5
Per_Share = Intrinsic_Value / Shares_Outstanding
```

### Graham Number
```
Graham = √(22.5 × EPS_TTM × BVPS)
```
Only meaningful when both EPS and BVPS are positive.

### Earnings Yield vs Risk-Free
```
EY = EPS_TTM / Price
Spread = EY - Risk_Free_Rate
Attractive when Spread > 3%
```

### Consensus Fair Value
```
Consensus = w_PE×FV_PE + w_PB×FV_PB + w_Graham×FV_Graham + w_DCF×FV_DCF
```
Weights defined per sector in `config/sector_benchmarks.yaml`. DCF weight is higher for growth companies; P/B weight is higher for banks and real estate.

---

## Report Output Structure

```
╔══════════════════════════════════════════════════════╗
║  PHÂN TÍCH ĐỊNH GIÁ: [TICKER] — [Tên công ty]       ║
║  Ngày: [DD/MM/YYYY]  |  Giá hiện tại: [X,XXX] VND   ║
╠══════════════════════════════════════════════════════╣
║  ĐỊNH GIÁ                                            ║
║  P/E Fair Value    : X,XXX VND                       ║
║  P/B Fair Value    : X,XXX VND                       ║
║  Graham Number     : X,XXX VND                       ║
║  DCF (Cơ sở)       : X,XXX VND                       ║
║  Earnings Yield    : X.X%  (Spread vs RF: +X.X%)     ║
║  ─────────────────────────────────────────────────   ║
║  Giá trị hợp lý    : X,XXX VND                       ║
║  Chiết khấu/Premia : -XX%  (Đang CHIẾT KHẤU)         ║
║  Tiềm năng         : Hấp dẫn ★★★★☆                   ║
╠══════════════════════════════════════════════════════╣
║  KỸ THUẬT & XU HƯỚNG                                 ║
║  Xu hướng giá      : Đang tích lũy (dưới MA50)       ║
║  RSI(14)           : 42 — Trung lập                  ║
║  MACD              : Tín hiệu Mua                    ║
║  Vùng giá 52 tuần  : [Low] — [High]  (vị trí: XX%)  ║
╠══════════════════════════════════════════════════════╣
║  RỦI RO                                              ║
║  Beta              : 1.12 (Cao hơn thị trường)       ║
║  Nợ/Vốn chủ        : 0.45 (Trung bình)               ║
║  Ổn định lợi nhuận : Cao                             ║
╠══════════════════════════════════════════════════════╣
║  KỊCH BẢN                                            ║
║  Bi quan  (30%)    : X,XXX VND                       ║
║  Cơ sở    (50%)    : X,XXX VND                       ║
║  Lạc quan (20%)    : X,XXX VND                       ║
║  Kỳ vọng xác suất  : X,XXX VND                       ║
╚══════════════════════════════════════════════════════╝
```

---

## Agent Behavior Rules

1. **Always compute all five valuation models.** If data for one model is unavailable (e.g., negative EPS for Graham), flag it clearly rather than skipping silently.
2. **Never fabricate financial data.** If a data fetch fails, report the error and which models are affected.
3. **Sector benchmarks override generic multiples.** Banks use P/B-weighted consensus; tech/growth use DCF-weighted.
4. **Momentum signals are descriptive, not predictive.** RSI and MACD inform "current state" labels — the agent does not give buy/sell orders.
5. **Risk flags are absolute, not relative.** Flag high D/E (>2×), negative interest coverage, or beta >1.5 regardless of other signals.
6. **Scenario probabilities must sum to 100%.** Default: Bi quan 30% / Cơ sở 50% / Lạc quan 20%.
7. **Output language is Vietnamese.** Labels, conclusions, and narrative are in Vietnamese. Numbers use Vietnamese formatting (dấu phẩy as thousands separator).

---

## Development Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Run agent for a single ticker (CLI)
python src/main.py --ticker VCB

# Run as local API server
python src/main.py --serve --port 8080

# Run tests
pytest tests/ -v

# Lint
ruff check src/
```

---

## Environment Variables

```
ANTHROPIC_API_KEY=          # Required — Claude API key
TCBS_API_KEY=               # Optional — TCBS financial data
SSI_API_KEY=                # Optional — SSI data feed
RISK_FREE_RATE=0.048        # 10Y VGB yield, update quarterly
```

---

## Sector Benchmark Config Example (`config/sector_benchmarks.yaml`)

```yaml
banking:
  pe_benchmark: 12
  pb_benchmark: 1.8
  dcf_weight: 0.20
  pe_weight: 0.25
  pb_weight: 0.35
  graham_weight: 0.20

real_estate:
  pe_benchmark: 18
  pb_benchmark: 2.2
  dcf_weight: 0.30
  pe_weight: 0.25
  pb_weight: 0.30
  graham_weight: 0.15

technology:
  pe_benchmark: 25
  pb_benchmark: 4.0
  dcf_weight: 0.50
  pe_weight: 0.25
  pb_weight: 0.10
  graham_weight: 0.15
```

---

## Out of Scope

- Real-time trading execution or order routing
- Portfolio optimization or allocation advice
- Macroeconomic forecasting
- US GAAP vs VAS reconciliation (assume VAS financials throughout)
