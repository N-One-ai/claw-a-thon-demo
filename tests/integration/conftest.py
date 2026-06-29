"""
Fixtures thực tế cho integration tests — dựa trên dữ liệu FPT (2025-2026).

Không kết nối vnstock hay Claude API. Tất cả là static fixture data.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

import pytest

from src.data.models import (
    OHLCV,
    BalanceSheet,
    CashFlowStatement,
    CompanyInfo,
    Exchange,
    FinancialStatements,
    IncomeStatement,
    PriceHistory,
    Sector,
)
from src.data.schemas import StockData

# ------------------------------------------------------------------ #
# Price history generator (deterministic)                              #
# ------------------------------------------------------------------ #

def _gen_candles(
    n_days: int = 320,
    start: float = 55_000,
    end: float = 73_200,
    seed: int = 42,
    volume_base: int = 2_500_000,
) -> list[OHLCV]:
    """
    Tạo n_days nến OHLCV với xu hướng tăng từ start đến end.

    Dùng trend-based approach (price = trend_line + noise) thay vì random walk
    để đảm bảo giá cuối luôn gần end và SMA20 > SMA200 trong xu hướng tăng.

    Output: candles[0] = mới nhất (để PriceHistory.current_price == ≈end).
    """
    rng = random.Random(seed)
    candles_oldest_first: list[OHLCV] = []
    base_date = date(2026, 6, 17)

    for i in range(n_days):
        day = base_date - timedelta(days=n_days - 1 - i)
        t = i / max(n_days - 1, 1)                    # 0.0 (oldest) → 1.0 (newest)
        trend = start + (end - start) * t
        price = max(30_000.0, trend + rng.gauss(0, 300))

        spread = rng.uniform(200, 800)
        high = price + spread
        low = max(30_000.0, price - spread)
        open_ = max(30_000.0, price + rng.gauss(0, 150))
        volume = int(rng.uniform(0.5, 1.5) * volume_base)

        candles_oldest_first.append(OHLCV(
            date=day,
            open=round(open_),
            high=round(high),
            low=round(low),
            close=round(price),
            volume=volume,
        ))

    # Reverse: candles[0] = newest (PriceHistory convention)
    return list(reversed(candles_oldest_first))


def _gen_high_beta_candles(n_days: int = 320, seed: int = 99) -> list[OHLCV]:
    """
    Chuỗi giá biến động mạnh (high-beta) — dùng để test beta/volatility risk flag.
    Output: candles[0] = mới nhất.
    """
    rng = random.Random(seed)
    candles_oldest_first: list[OHLCV] = []
    price = 15_000.0
    base_date = date(2026, 6, 17)

    for i in range(n_days):
        day = base_date - timedelta(days=n_days - 1 - i)
        price += rng.gauss(0, 1_200)   # σ rất lớn = beta cao
        price = max(5_000.0, price)

        spread = rng.uniform(500, 2_000)
        high = price + spread
        low = max(1_000.0, price - spread)
        open_ = price + rng.gauss(0, 600)
        volume = int(rng.uniform(500_000, 2_000_000))

        candles_oldest_first.append(OHLCV(
            date=day,
            open=round(open_),
            high=round(high),
            low=round(low),
            close=round(price),
            volume=volume,
        ))

    return list(reversed(candles_oldest_first))


# ------------------------------------------------------------------ #
# Shared VNINDEX fixture                                               #
# ------------------------------------------------------------------ #

def _gen_vnindex(n_days: int = 320, seed: int = 7) -> PriceHistory:
    """
    VNINDEX nhẹ nhàng tăng — cơ sở tính beta.
    Output: candles[0] = mới nhất.
    """
    rng = random.Random(seed)
    candles_oldest_first: list[OHLCV] = []
    idx = 1_200.0
    base_date = date(2026, 6, 17)

    for i in range(n_days):
        day = base_date - timedelta(days=n_days - 1 - i)
        idx += rng.gauss(0, 10)
        idx = max(800.0, idx)
        candles_oldest_first.append(OHLCV(
            date=day,
            open=round(idx + rng.gauss(0, 5)),
            high=round(idx + abs(rng.gauss(0, 8))),
            low=round(max(800.0, idx - abs(rng.gauss(0, 8)))),
            close=round(idx),
            volume=rng.randint(200_000_000, 400_000_000),
        ))

    return PriceHistory(ticker="VNINDEX", candles=list(reversed(candles_oldest_first)))


# ------------------------------------------------------------------ #
# FPT-like company fixtures                                            #
# ------------------------------------------------------------------ #

@pytest.fixture(scope="session")
def vnindex_history() -> PriceHistory:
    return _gen_vnindex()


@pytest.fixture(scope="session")
def fpt_company() -> CompanyInfo:
    return CompanyInfo(
        ticker="FPT",
        name="Công ty Cổ phần FPT",
        exchange=Exchange.HOSE,
        sector=Sector.TECHNOLOGY,
        industry="Công nghệ thông tin",
        shares_outstanding=1_105.0,  # triệu cổ
        market_cap=80_886.0,         # tỷ VND (= 73,200 × 1,105 / 1,000)
        employees=45000,
    )


@pytest.fixture(scope="session")
def fpt_income_statements() -> list[IncomeStatement]:
    """8 quý thu nhập (Q3-2024 … Q4-2025), mới nhất trước."""
    base_revenue = 7_500.0   # tỷ VND/quý
    base_net = 750.0
    base_eps = 680.0          # VND/cổ phiếu/quý

    stmts = []
    quarters = [
        "2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2",
        "2025-Q1", "2024-Q4", "2024-Q3", "2024-Q2",
    ]
    for i, period in enumerate(quarters):
        growth = (1.02 ** i)          # ~2% tăng mỗi quý khi đi ngược
        stmts.append(IncomeStatement(
            period=period,
            revenue=round(base_revenue / growth, 2),
            gross_profit=round(base_revenue / growth * 0.35, 2),
            operating_income=round(base_revenue / growth * 0.14, 2),
            ebit=round(base_revenue / growth * 0.13, 2),
            net_income=round(base_net / growth, 2),
            eps=round(base_eps / growth, 2),
            interest_expense=round(80.0 / growth, 2),
        ))
    return stmts


@pytest.fixture(scope="session")
def fpt_balance_sheets() -> list[BalanceSheet]:
    stmts = []
    quarters = [
        "2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2",
        "2025-Q1", "2024-Q4", "2024-Q3", "2024-Q2",
    ]
    total_equity_base = 20_000.0  # tỷ VND
    total_debt_base = 8_000.0     # D/E ≈ 0.40
    bvps_base = 18_100.0          # VND/cổ phiếu

    for i, period in enumerate(quarters):
        g = 1.015 ** i
        stmts.append(BalanceSheet(
            period=period,
            total_assets=round((total_equity_base + total_debt_base + 5_000) / g, 2),
            total_equity=round(total_equity_base / g, 2),
            total_debt=round(total_debt_base / g, 2),
            cash_and_equivalents=round(5_000 / g, 2),
            current_assets=round(15_000 / g, 2),
            current_liabilities=round(10_000 / g, 2),
            book_value_per_share=round(bvps_base / g, 2),
        ))
    return stmts


@pytest.fixture(scope="session")
def fpt_cashflows() -> list[CashFlowStatement]:
    stmts = []
    quarters = [
        "2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2",
        "2025-Q1", "2024-Q4", "2024-Q3", "2024-Q2",
    ]
    ocf_base = 900.0    # tỷ VND/quý
    capex_base = -200.0

    for i, period in enumerate(quarters):
        g = 1.015 ** i
        ocf = round(ocf_base / g, 2)
        capex = round(capex_base / g, 2)
        stmts.append(CashFlowStatement(
            period=period,
            operating_cash_flow=ocf,
            capital_expenditure=capex,
            free_cash_flow=round(ocf + capex, 2),
            investing_cash_flow=round(capex - 100, 2),
            financing_cash_flow=round(-50 / g, 2),
            dividends_paid=round(-200 / g, 2),
        ))
    return stmts


@pytest.fixture(scope="session")
def fpt_statements(
    fpt_income_statements,
    fpt_balance_sheets,
    fpt_cashflows,
) -> FinancialStatements:
    return FinancialStatements(
        ticker="FPT",
        income_statements=fpt_income_statements,
        balance_sheets=fpt_balance_sheets,
        cash_flow_statements=fpt_cashflows,
    )


@pytest.fixture(scope="session")
def fpt_price_history() -> PriceHistory:
    return PriceHistory(ticker="FPT", candles=_gen_candles())


@pytest.fixture(scope="session")
def fpt_stock_data(
    fpt_company,
    fpt_statements,
    fpt_price_history,
) -> StockData:
    return StockData(
        ticker="FPT",
        company=fpt_company,
        statements=fpt_statements,
        price_history=fpt_price_history,
        current_price=73_200.0,
    )


# ------------------------------------------------------------------ #
# High-risk company (high leverage, negative FCF) fixtures             #
# ------------------------------------------------------------------ #

@pytest.fixture(scope="session")
def high_risk_company() -> CompanyInfo:
    return CompanyInfo(
        ticker="HRL",
        name="Công ty Rủi Ro Cao",
        exchange=Exchange.HNX,
        sector=Sector.REAL_ESTATE,
        shares_outstanding=500.0,
        market_cap=5_000.0,
    )


@pytest.fixture(scope="session")
def high_risk_statements() -> FinancialStatements:
    quarters = [
        "2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2",
        "2025-Q1", "2024-Q4", "2024-Q3", "2024-Q2",
    ]

    income = [
        IncomeStatement(
            period=p,
            revenue=200.0,
            net_income=10.0,
            eps=20.0,
            interest_expense=350.0,   # interest coverage < 1 → flag
        )
        for p in quarters
    ]

    balance = [
        BalanceSheet(
            period=p,
            total_assets=20_000.0,
            total_equity=2_500.0,
            total_debt=15_000.0,      # D/E = 6.0 → flag
            cash_and_equivalents=200.0,
            book_value_per_share=5_000.0,
        )
        for p in quarters
    ]

    cashflow = [
        CashFlowStatement(
            period=p,
            operating_cash_flow=-500.0,
            capital_expenditure=-200.0,
            free_cash_flow=-700.0,    # FCF âm → flag
        )
        for p in quarters
    ]

    return FinancialStatements(
        ticker="HRL",
        income_statements=income,
        balance_sheets=balance,
        cash_flow_statements=cashflow,
    )


@pytest.fixture(scope="session")
def high_risk_price_history() -> PriceHistory:
    return PriceHistory(ticker="HRL", candles=_gen_high_beta_candles())


@pytest.fixture(scope="session")
def high_risk_stock_data(
    high_risk_company,
    high_risk_statements,
    high_risk_price_history,
) -> StockData:
    return StockData(
        ticker="HRL",
        company=high_risk_company,
        statements=high_risk_statements,
        price_history=high_risk_price_history,
        current_price=10_000.0,
    )
