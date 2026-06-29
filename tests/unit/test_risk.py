"""Unit tests cho RiskAnalyzer — flag logic + scoring."""
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.analysis.risk import RiskAnalyzer
from src.data.models import (
    OHLCV,
    CashFlowStatement,
    FinancialStatements,
    IncomeStatement,
    PriceHistory,
    RiskFlagType,
    RiskLevel,
)


@pytest.fixture
def ra() -> RiskAnalyzer:
    return RiskAnalyzer()


def make_price_history(prices: list[float]) -> PriceHistory:
    base = date(2024, 1, 1)
    candles = [
        OHLCV(date=base - timedelta(days=i), open=p, high=p + 100, low=p - 100,
              close=p, volume=500_000)
        for i, p in enumerate(prices)
    ]
    return PriceHistory(ticker="TEST", candles=candles)


# ------------------------------------------------------------------ #
# Leverage flags                                                        #
# ------------------------------------------------------------------ #

class TestLeverageFlags:
    def test_de_above_very_high_threshold(self, ra):
        flags = ra._flag_leverage(de=5.0)
        assert len(flags) == 1
        assert flags[0].flag_type == RiskFlagType.HIGH_LEVERAGE
        assert flags[0].severity == RiskLevel.VERY_HIGH

    def test_de_above_high_threshold(self, ra):
        flags = ra._flag_leverage(de=3.0)
        assert len(flags) == 1
        assert flags[0].severity == RiskLevel.HIGH

    def test_de_below_threshold_no_flag(self, ra):
        flags = ra._flag_leverage(de=1.0)
        assert len(flags) == 0

    def test_none_de_no_flag(self, ra):
        flags = ra._flag_leverage(None)
        assert len(flags) == 0


# ------------------------------------------------------------------ #
# Interest coverage flags                                               #
# ------------------------------------------------------------------ #

class TestCoverageFlags:
    def test_coverage_below_danger_is_very_high(self, ra):
        flags = ra._flag_coverage(coverage=1.0)
        assert len(flags) == 1
        assert flags[0].severity == RiskLevel.VERY_HIGH

    def test_coverage_below_warning_is_medium(self, ra):
        flags = ra._flag_coverage(coverage=2.0)
        assert len(flags) == 1
        assert flags[0].severity == RiskLevel.MEDIUM

    def test_coverage_above_warning_no_flag(self, ra):
        flags = ra._flag_coverage(coverage=5.0)
        assert len(flags) == 0

    def test_none_coverage_no_flag(self, ra):
        flags = ra._flag_coverage(None)
        assert len(flags) == 0


# ------------------------------------------------------------------ #
# Beta flags                                                            #
# ------------------------------------------------------------------ #

class TestBetaFlags:
    def test_beta_above_very_high(self, ra):
        flags = ra._flag_beta(beta=2.5)
        assert flags[0].severity == RiskLevel.VERY_HIGH

    def test_beta_above_high(self, ra):
        flags = ra._flag_beta(beta=1.6)
        assert flags[0].severity == RiskLevel.HIGH

    def test_beta_below_threshold_no_flag(self, ra):
        flags = ra._flag_beta(beta=0.9)
        assert len(flags) == 0

    def test_none_beta_no_flag(self, ra):
        assert ra._flag_beta(None) == []


# ------------------------------------------------------------------ #
# FCF flags                                                             #
# ------------------------------------------------------------------ #

class TestFCFFlags:
    def _make_statements_with_fcf(self, fcf_values: list[float]) -> FinancialStatements:
        stmts = FinancialStatements(ticker="TEST")
        for i, fcf in enumerate(fcf_values):
            stmts.cash_flow_statements.append(CashFlowStatement(
                period=f"2024-Q{4-i}",
                operating_cash_flow=fcf + 100,
                capital_expenditure=-100,
                free_cash_flow=fcf,
            ))
        return stmts

    def test_two_consecutive_negative_fcf_raises_flag(self, ra):
        stmts = self._make_statements_with_fcf([-500, -300, 200, 400])
        flags = ra._flag_fcf(stmts)
        assert len(flags) == 1
        assert flags[0].flag_type == RiskFlagType.NEGATIVE_FCF

    def test_one_negative_no_flag(self, ra):
        stmts = self._make_statements_with_fcf([-500, 300, 200, 400])
        flags = ra._flag_fcf(stmts)
        assert len(flags) == 0

    def test_all_positive_no_flag(self, ra):
        stmts = self._make_statements_with_fcf([500, 400, 300, 200])
        flags = ra._flag_fcf(stmts)
        assert len(flags) == 0


# ------------------------------------------------------------------ #
# Revenue decline flag                                                  #
# ------------------------------------------------------------------ #

class TestRevenueFlagDecline:
    def _make_income(self, revenues: list[float]) -> FinancialStatements:
        stmts = FinancialStatements(ticker="TEST")
        for i, rev in enumerate(revenues):
            stmts.income_statements.append(IncomeStatement(
                period=f"2024-Q{4-i}",
                revenue=rev,
                net_income=rev * 0.1,
            ))
        return stmts

    def test_revenue_decline_over_10pct_flags(self, ra):
        # Q4 hiện tại: 100, Q4 năm ngoái: 200 → -50%
        stmts = self._make_income([100, 120, 150, 160, 200])
        flags = ra._flag_revenue_decline(stmts)
        assert len(flags) == 1
        assert flags[0].flag_type == RiskFlagType.DECLINING_REVENUE

    def test_small_decline_no_flag(self, ra):
        # Q4: 95, cùng kỳ: 100 → -5% (under threshold)
        stmts = self._make_income([95, 98, 99, 100, 100])
        flags = ra._flag_revenue_decline(stmts)
        assert len(flags) == 0

    def test_revenue_growth_no_flag(self, ra):
        stmts = self._make_income([120, 110, 105, 102, 100])
        flags = ra._flag_revenue_decline(stmts)
        assert len(flags) == 0


# ------------------------------------------------------------------ #
# Earnings stability                                                    #
# ------------------------------------------------------------------ #

class TestEarningsStability:
    def _make_stmts(self, eps_list: list[float]) -> FinancialStatements:
        stmts = FinancialStatements(ticker="TEST")
        for i, eps in enumerate(eps_list):
            stmts.income_statements.append(IncomeStatement(
                period=f"2024-Q{4-i}", revenue=10000, net_income=1000, eps=eps
            ))
        return stmts

    def test_stable_eps_returns_cao(self, ra):
        stmts = self._make_stmts([3000, 3100, 2950, 3050, 3000, 3100])
        result = ra._earnings_stability(stmts)
        assert result == "Cao"

    def test_unstable_eps_returns_thap(self, ra):
        stmts = self._make_stmts([100, -500, 2000, 300, 1500, -200])
        result = ra._earnings_stability(stmts)
        assert result == "Thấp"

    def test_insufficient_data(self, ra):
        stmts = self._make_stmts([3000, 3100])
        result = ra._earnings_stability(stmts)
        assert "Không" in result


# ------------------------------------------------------------------ #
# Beta calculation                                                      #
# ------------------------------------------------------------------ #

class TestBetaCalculation:
    def test_perfect_correlation_returns_one(self, ra):
        """Cổ phiếu biến động y hệt index → beta = 1."""
        common_prices = [50000 - i * 100 for i in range(200)]
        stock = make_price_history(common_prices)
        index = make_price_history(common_prices)   # giống hệt
        beta = ra.compute_beta(stock, index)
        assert beta is not None
        assert beta == pytest.approx(1.0, abs=0.05)

    def test_none_index_returns_none(self, ra):
        stock = make_price_history([50000] * 100)
        assert ra.compute_beta(stock, None) is None

    def test_insufficient_data_returns_none(self, ra):
        stock = make_price_history([50000] * 10)
        index = make_price_history([1000] * 10)
        assert ra.compute_beta(stock, index) is None


# ------------------------------------------------------------------ #
# Overall risk scoring                                                  #
# ------------------------------------------------------------------ #

class TestOverallRisk:
    def test_no_flags_is_low(self, ra):
        result = ra._overall_risk([])
        assert result == RiskLevel.LOW

    def test_many_severe_flags_is_very_high(self, ra):
        from src.data.models import RiskFlag
        flags = [
            RiskFlag(flag_type=RiskFlagType.HIGH_LEVERAGE,
                     severity=RiskLevel.VERY_HIGH, description="test"),
            RiskFlag(flag_type=RiskFlagType.NEGATIVE_COVERAGE,
                     severity=RiskLevel.VERY_HIGH, description="test"),
            RiskFlag(flag_type=RiskFlagType.NEGATIVE_FCF,
                     severity=RiskLevel.HIGH, description="test"),
        ]
        result = ra._overall_risk(flags)
        assert result in (RiskLevel.HIGH, RiskLevel.VERY_HIGH)

    def test_single_medium_flag_is_medium_or_low(self, ra):
        from src.data.models import RiskFlag
        flags = [
            RiskFlag(flag_type=RiskFlagType.LOW_LIQUIDITY,
                     severity=RiskLevel.MEDIUM, description="test"),
        ]
        result = ra._overall_risk(flags)
        assert result in (RiskLevel.LOW, RiskLevel.MEDIUM)
