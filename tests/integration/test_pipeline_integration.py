"""
Integration tests cho AnalysisPipeline.

Kiểm tra toàn bộ pipeline (6 bước) với dữ liệu fixture thực tế
(không gọi vnstock hay Claude API).

Cách dùng:
    pytest tests/integration/test_pipeline_integration.py -v
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from src.data.models import PriceHistory
from src.data.models.risk import RiskFlagType, RiskLevel
from src.data.schemas import StockData
from src.pipeline import AnalysisPipeline, StockAnalysisResult

# ------------------------------------------------------------------ #
# Helper                                                               #
# ------------------------------------------------------------------ #

def _make_pipeline(
    stock_data: StockData,
    index_history: PriceHistory,
) -> AnalysisPipeline:
    """
    Tạo AnalysisPipeline và patch DataFetcher để trả về fixture data.
    Không kết nối vnstock hay bất kỳ API nào.
    """
    pipeline = AnalysisPipeline.__new__(AnalysisPipeline)
    # Khởi tạo theo đúng __init__ nhưng không truyền cache_dir
    AnalysisPipeline.__init__(
        pipeline,
        cache_dir=".cache_test",
        source="VCI",
    )
    pipeline._fetcher.fetch_all = MagicMock(return_value=stock_data)
    pipeline._fetcher.get_index_history = MagicMock(return_value=index_history)
    return pipeline


# ------------------------------------------------------------------ #
# FPT-like healthy company tests                                       #
# ------------------------------------------------------------------ #

class TestFPTPipeline:
    """Pipeline chạy với dữ liệu FPT-like (tech, healthy, undervalued)."""

    @pytest.fixture(autouse=True)
    def _setup(self, fpt_stock_data, vnindex_history):
        self.data = fpt_stock_data
        self.index = vnindex_history
        self.pipeline = _make_pipeline(fpt_stock_data, vnindex_history)
        self.result: StockAnalysisResult = self.pipeline.analyze("FPT")

    def test_result_ticker_matches(self):
        assert self.result.ticker == "FPT"

    def test_all_sections_present(self):
        assert self.result.valuation is not None, "Valuation phải có"
        assert self.result.technical is not None, "Technical phải có"
        assert self.result.risk is not None, "Risk phải có"

    def test_current_price_preserved(self):
        assert self.result.current_price == 73_200.0

    # ── Valuation ────────────────────────────────────────────── #

    def test_pe_value_uses_correct_formula(self):
        """P/E FV = EPS_TTM × sector_PE_benchmark (tech = 25)."""
        pe = self.result.valuation.pe_result
        assert pe.is_available, f"P/E không khả dụng: {pe.unavailable_reason}"
        eps_ttm = self.data.statements.eps_ttm
        assert eps_ttm is not None
        expected = round(eps_ttm * 25)  # tech benchmark P/E = 25
        assert abs(pe.fair_value - expected) < 500, (
            f"P/E FV={pe.fair_value:,} VND không khớp expected={expected:,} VND"
        )

    def test_pb_value_positive(self):
        """P/B FV phải dương vì BVPS dương."""
        pb = self.result.valuation.pb_result
        assert pb.is_available
        assert pb.fair_value > 0

    def test_graham_positive(self):
        """Graham Number khả dụng khi EPS và BVPS đều dương."""
        g = self.result.valuation.graham_result
        assert g.is_available, f"Graham không khả dụng: {g.unavailable_reason}"
        # Graham = √(22.5 × EPS × BVPS)
        import math
        eps = self.data.statements.eps_ttm
        bvps = self.data.statements.latest_balance.book_value_per_share
        expected = round(math.sqrt(22.5 * eps * bvps))
        assert abs(g.fair_value - expected) < 500

    def test_dcf_positive(self):
        """DCF khả dụng khi FCF TTM dương."""
        dcf = self.result.valuation.dcf_result
        fcf = self.data.statements.fcf_ttm
        assert fcf is not None and fcf > 0
        assert dcf.is_available, f"DCF không khả dụng: {dcf.unavailable_reason}"
        assert dcf.fair_value > 0

    def test_consensus_value_reasonable(self):
        """Consensus fair value phải nằm trong khoảng 30,000–300,000 VND."""
        cv = self.result.valuation.consensus_value
        assert 30_000 <= cv <= 300_000, f"Consensus={cv:,.0f} VND ngoài khoảng hợp lý"

    def test_discount_pct_formula(self):
        """discount_pct = (consensus - price) / price × 100."""
        v = self.result.valuation
        expected_pct = round((v.consensus_value - 73_200) / 73_200 * 100, 1)
        assert abs(v.discount_pct - expected_pct) < 0.5

    def test_scenarios_sum_to_100pct(self):
        """Xác suất kịch bản: Bi quan + Cơ sở + Lạc quan = 1.0."""
        scenarios = self.result.valuation.scenarios
        assert len(scenarios) == 3
        total = sum(s.probability for s in scenarios)
        assert abs(total - 1.0) < 0.001, f"Tổng xác suất = {total}"

    def test_earnings_yield_is_ratio(self):
        """EY = EPS / Price × 100 — phải là tỉ lệ phần trăm hợp lý."""
        ey = self.result.valuation.earnings_yield
        assert 0 < ey.earnings_yield < 50, f"EY={ey.earnings_yield}% bất thường"
        eps = self.data.statements.eps_ttm
        expected_ey = eps / 73_200 * 100
        assert abs(ey.earnings_yield - expected_ey) < 0.5

    # ── Technical ────────────────────────────────────────────── #

    def test_technical_sma_values(self):
        """SMA20, SMA50, SMA200 phải được tính."""
        t = self.result.technical
        assert t.sma_20 is not None
        assert t.sma_50 is not None
        assert t.sma_200 is not None

    def test_sma_ordering_bullish(self):
        """
        Khi giá tăng liên tục từ 55K → 73K, expected: SMA20 > SMA50 > SMA200
        (xu hướng tăng).
        """
        t = self.result.technical
        assert t.sma_20 > t.sma_200, (
            f"SMA20={t.sma_20:,.0f} phải > SMA200={t.sma_200:,.0f} trong xu hướng tăng"
        )

    def test_rsi_in_valid_range(self):
        t = self.result.technical
        assert t.rsi_14 is not None
        assert 0 <= t.rsi_14 <= 100, f"RSI={t.rsi_14} ngoài khoảng 0-100"

    def test_rsi_label_set(self):
        t = self.result.technical
        assert t.rsi_label in ("Quá mua", "Trung lập", "Quá bán")

    def test_macd_label_set(self):
        t = self.result.technical
        assert t.macd_label in ("Mua", "Bán", "Chờ", None)

    def test_52w_range_calculated(self):
        t = self.result.technical
        assert t.high_52w is not None
        assert t.low_52w is not None
        assert t.high_52w >= t.low_52w
        assert 0 <= t.position_52w_pct <= 100

    def test_52w_range_covers_price(self):
        t = self.result.technical
        assert t.low_52w <= t.current_price <= t.high_52w + 1_000  # +1000 tolerance

    # ── Risk ─────────────────────────────────────────────────── #

    def test_de_ratio_correct(self):
        """D/E từ balance sheet = total_debt / total_equity."""
        balance = self.data.statements.latest_balance
        expected_de = balance.total_debt / balance.total_equity
        risk = self.result.risk
        assert risk.debt_to_equity is not None
        assert abs(risk.debt_to_equity - expected_de) < 0.01

    def test_low_de_no_leverage_flag(self):
        """D/E ≈ 0.40 → không có HIGH_LEVERAGE flag."""
        flag_types = [f.flag_type for f in self.result.risk.flags]
        assert RiskFlagType.HIGH_LEVERAGE not in flag_types, (
            "FPT (D/E≈0.40) không nên có HIGH_LEVERAGE flag"
        )

    def test_overall_risk_level(self):
        """FPT với D/E thấp, FCF dương → risk nên là LOW hoặc MEDIUM."""
        risk = self.result.risk
        assert risk.overall_risk in (RiskLevel.LOW, RiskLevel.MEDIUM)

    def test_beta_is_calculated(self):
        """Beta được tính khi cung cấp index_history."""
        assert self.result.risk.beta is not None

    def test_positive_fcf_no_flag(self):
        """FCF TTM dương → không trigger NEGATIVE_FCF flag."""
        flag_types = [f.flag_type for f in self.result.risk.flags]
        assert RiskFlagType.NEGATIVE_FCF not in flag_types

    # ── DataQuality ─────────────────────────────────────────── #

    def test_data_quality_periods(self):
        dq = self.result.data_quality
        assert dq.periods_income == 8
        assert dq.periods_balance == 8
        assert dq.periods_cashflow == 8
        assert dq.has_eps_ttm is True
        assert dq.has_bvps is True
        assert dq.has_fcf_ttm is True

    def test_price_trading_days(self):
        dq = self.result.data_quality
        assert dq.price_trading_days == 320

    # ── StockAnalysisResult properties ──────────────────────── #

    def test_quick_summary_non_empty(self):
        s = self.result.quick_summary
        assert "FPT" in s
        assert "VND" in s

    def test_is_undervalued_property(self):
        """Nếu consensus > price thì is_undervalued = True."""
        v = self.result.valuation
        expected = v.discount_pct > 0
        assert self.result.is_undervalued == expected


# ------------------------------------------------------------------ #
# High-risk company tests                                              #
# ------------------------------------------------------------------ #

class TestHighRiskPipeline:
    """Pipeline với công ty rủi ro cao: D/E=6, FCF âm, interest coverage < 1."""

    @pytest.fixture(autouse=True)
    def _setup(self, high_risk_stock_data, vnindex_history):
        self.data = high_risk_stock_data
        self.pipeline = _make_pipeline(high_risk_stock_data, vnindex_history)
        self.result: StockAnalysisResult = self.pipeline.analyze("HRL")

    def test_high_leverage_flag_raised(self):
        """D/E = 6.0 → phải có HIGH_LEVERAGE flag."""
        flag_types = [f.flag_type for f in self.result.risk.flags]
        assert RiskFlagType.HIGH_LEVERAGE in flag_types, (
            f"D/E=6 phải trigger HIGH_LEVERAGE. Flags hiện có: {flag_types}"
        )

    def test_negative_fcf_flag_raised(self):
        """FCF âm → phải có NEGATIVE_FCF flag."""
        flag_types = [f.flag_type for f in self.result.risk.flags]
        assert RiskFlagType.NEGATIVE_FCF in flag_types, (
            f"FCF âm phải trigger NEGATIVE_FCF. Flags hiện có: {flag_types}"
        )

    def test_overall_risk_high(self):
        """Nhiều flag nghiêm trọng → overall risk phải HIGH hoặc VERY_HIGH."""
        risk = self.result.risk
        assert risk.overall_risk in (RiskLevel.HIGH, RiskLevel.VERY_HIGH), (
            f"Expected HIGH/VERY_HIGH, got {risk.overall_risk}"
        )

    def test_dcf_unavailable_for_negative_fcf(self):
        """FCF âm → DCF không khả dụng (không có ý nghĩa khi FCF âm)."""
        dcf = self.result.valuation.dcf_result
        assert not dcf.is_available, "DCF phải không khả dụng khi FCF âm"
        assert dcf.unavailable_reason is not None

    def test_at_least_2_flags(self):
        """D/E cao + FCF âm → tối thiểu 2 risk flags."""
        assert len(self.result.risk.flags) >= 2


# ------------------------------------------------------------------ #
# Negative EPS — Graham unavailable                                    #
# ------------------------------------------------------------------ #

class TestNegativeEPS:
    """Khi EPS âm: Graham và P/E phải báo không khả dụng."""

    @pytest.fixture(autouse=True)
    def _setup(self, fpt_stock_data, fpt_statements, fpt_company, fpt_price_history, vnindex_history):
        from src.data.models import FinancialStatements, IncomeStatement

        neg_income = [
            IncomeStatement(
                period=f"202{6-i}-Q{4-i % 4}",
                revenue=5_000.0,
                net_income=-200.0,
                eps=-180.0,
                interest_expense=100.0,
            )
            for i in range(8)
        ]
        statements = FinancialStatements(
            ticker="FPT",
            income_statements=neg_income,
            balance_sheets=fpt_statements.balance_sheets,
            cash_flow_statements=fpt_statements.cash_flow_statements,
        )
        stock_data = StockData(
            ticker="FPT",
            company=fpt_company,
            statements=statements,
            price_history=fpt_price_history,
            current_price=73_200.0,
        )
        self.pipeline = _make_pipeline(stock_data, vnindex_history)
        self.result = self.pipeline.analyze("FPT")

    def test_pe_unavailable_for_negative_eps(self):
        pe = self.result.valuation.pe_result
        assert not pe.is_available
        assert pe.unavailable_reason is not None
        assert "âm" in pe.unavailable_reason.lower() or "EPS" in pe.unavailable_reason

    def test_graham_unavailable_for_negative_eps(self):
        g = self.result.valuation.graham_result
        assert not g.is_available
        assert g.unavailable_reason is not None

    def test_pb_still_available(self):
        """P/B chỉ cần BVPS dương — không phụ thuộc EPS."""
        pb = self.result.valuation.pb_result
        assert pb.is_available


# ------------------------------------------------------------------ #
# Missing data graceful degradation                                    #
# ------------------------------------------------------------------ #

class TestMissingCashFlow:
    """Khi không có cashflow data: DCF unavailable, các model khác vẫn chạy."""

    @pytest.fixture(autouse=True)
    def _setup(self, fpt_company, fpt_statements, fpt_price_history, vnindex_history):
        from src.data.models import FinancialStatements

        statements_no_cf = FinancialStatements(
            ticker="FPT",
            income_statements=fpt_statements.income_statements,
            balance_sheets=fpt_statements.balance_sheets,
            # cash_flow_statements: rỗng
        )
        stock_data = StockData(
            ticker="FPT",
            company=fpt_company,
            statements=statements_no_cf,
            price_history=fpt_price_history,
            current_price=73_200.0,
        )
        self.pipeline = _make_pipeline(stock_data, vnindex_history)
        self.result = self.pipeline.analyze("FPT")

    def test_dcf_unavailable_no_fcf(self):
        dcf = self.result.valuation.dcf_result
        assert not dcf.is_available

    def test_pe_pb_graham_still_available(self):
        v = self.result.valuation
        assert v.pe_result.is_available
        assert v.pb_result.is_available
        assert v.graham_result.is_available

    def test_consensus_computed_from_available_models(self):
        """Consensus vẫn được tính từ các model còn lại."""
        assert self.result.valuation.consensus_value > 0

    def test_no_pipeline_crash(self):
        """Pipeline không throw exception dù thiếu cashflow."""
        assert self.result is not None
        assert "valuation" not in self.result.errors


# ------------------------------------------------------------------ #
# Scenario probability sum                                             #
# ------------------------------------------------------------------ #

def test_custom_scenario_probabilities(fpt_stock_data, vnindex_history):
    """Custom scenario probabilities phải sum = 1.0."""
    custom_probs = {"bi_quan": 0.40, "co_so": 0.45, "lac_quan": 0.15}
    pipeline = _make_pipeline(fpt_stock_data, vnindex_history)
    pipeline._scenario_probs = custom_probs

    result = pipeline.analyze("FPT")
    scenarios = result.valuation.scenarios
    total = sum(s.probability for s in scenarios)
    assert abs(total - 1.0) < 0.001


def test_probability_weighted_value(fpt_stock_data, vnindex_history):
    """Probability-weighted value = Σ(scenario_value × probability)."""
    pipeline = _make_pipeline(fpt_stock_data, vnindex_history)
    result = pipeline.analyze("FPT")

    if result.valuation.probability_weighted_value is None:
        pytest.skip("probability_weighted_value không được tính")

    scenarios = result.valuation.scenarios
    expected = sum(s.fair_value * s.probability for s in scenarios)
    actual = result.valuation.probability_weighted_value
    assert abs(actual - expected) < 500, (
        f"PW value={actual:,.0f} ≠ expected={expected:,.0f}"
    )


# ------------------------------------------------------------------ #
# Edge case: empty price history                                        #
# ------------------------------------------------------------------ #

def test_pipeline_raises_with_empty_prices(fpt_company, fpt_statements, vnindex_history):
    """Pipeline phải raise RuntimeError khi không có giá và không có lịch sử."""
    from src.data.models import PriceHistory

    stock_data = StockData(
        ticker="FPT",
        company=fpt_company,
        statements=fpt_statements,
        price_history=PriceHistory(ticker="FPT", candles=[]),
        current_price=None,
    )
    pipeline = _make_pipeline(stock_data, vnindex_history)
    with pytest.raises(RuntimeError, match="giá"):
        pipeline.analyze("FPT")
