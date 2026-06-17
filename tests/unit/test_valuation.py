"""Unit tests cho ValuationEngine — pure computation, không cần API."""
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.analysis.valuation import ValuationEngine
from src.data.models import ValuationLabel


@pytest.fixture
def engine() -> ValuationEngine:
    return ValuationEngine()


# ------------------------------------------------------------------ #
# P/E Fair Value                                                       #
# ------------------------------------------------------------------ #

class TestPEValue:
    def test_positive_eps_returns_correct_value(self, engine):
        # banking: pe_benchmark = 12
        result = engine.compute_pe_value(eps_ttm=5000, sector="banking")
        assert result.is_available
        assert result.fair_value == 5000 * 12

    def test_negative_eps_is_unavailable(self, engine):
        result = engine.compute_pe_value(eps_ttm=-1000, sector="banking")
        assert not result.is_available
        assert result.fair_value is None
        assert "âm" in (result.unavailable_reason or "").lower()

    def test_none_eps_is_unavailable(self, engine):
        result = engine.compute_pe_value(eps_ttm=None, sector="banking")
        assert not result.is_available

    def test_weight_from_sector_config(self, engine):
        result = engine.compute_pe_value(eps_ttm=5000, sector="technology")
        assert result.weight > 0

    def test_unknown_sector_uses_default(self, engine):
        result = engine.compute_pe_value(eps_ttm=3000, sector="unknown")
        assert result.is_available
        assert result.fair_value == 3000 * 16  # pe_benchmark = 16 for unknown


# ------------------------------------------------------------------ #
# P/B Fair Value                                                       #
# ------------------------------------------------------------------ #

class TestPBValue:
    def test_positive_bvps_returns_correct_value(self, engine):
        # banking: pb_benchmark = 1.8
        result = engine.compute_pb_value(bvps=40000, sector="banking")
        assert result.is_available
        assert result.fair_value == round(40000 * 1.8)

    def test_negative_bvps_is_unavailable(self, engine):
        result = engine.compute_pb_value(bvps=-5000, sector="banking")
        assert not result.is_available

    def test_none_bvps_is_unavailable(self, engine):
        result = engine.compute_pb_value(bvps=None, sector="banking")
        assert not result.is_available


# ------------------------------------------------------------------ #
# Graham Number                                                         #
# ------------------------------------------------------------------ #

class TestGrahamNumber:
    def test_correct_formula(self, engine):
        eps, bvps = 4000, 30000
        result = engine.compute_graham(eps_ttm=eps, bvps=bvps)
        expected = round(math.sqrt(22.5 * eps * bvps))
        assert result.is_available
        assert result.fair_value == expected

    def test_negative_eps_is_unavailable(self, engine):
        result = engine.compute_graham(eps_ttm=-500, bvps=20000)
        assert not result.is_available

    def test_negative_bvps_is_unavailable(self, engine):
        result = engine.compute_graham(eps_ttm=3000, bvps=-100)
        assert not result.is_available

    def test_zero_eps_is_unavailable(self, engine):
        result = engine.compute_graham(eps_ttm=0, bvps=20000)
        assert not result.is_available

    def test_both_none_is_unavailable(self, engine):
        result = engine.compute_graham(eps_ttm=None, bvps=None)
        assert not result.is_available


# ------------------------------------------------------------------ #
# Earnings Yield                                                        #
# ------------------------------------------------------------------ #

class TestEarningsYield:
    def test_above_risk_free_is_attractive(self, engine):
        # EY = 10000/100000 = 10%, RF = 4.8%, spread = +5.2% > 3% → attractive
        result = engine.compute_earnings_yield(eps_ttm=10000, current_price=100000)
        assert result.earnings_yield == pytest.approx(10.0, abs=0.1)
        assert result.spread > 3.0
        assert result.is_attractive

    def test_below_risk_free_not_attractive(self, engine):
        # EY = 1000/100000 = 1%, RF = 4.8%, spread = -3.8% → not attractive
        result = engine.compute_earnings_yield(eps_ttm=1000, current_price=100000)
        assert not result.is_attractive

    def test_none_eps_returns_zero_ey(self, engine):
        result = engine.compute_earnings_yield(eps_ttm=None, current_price=80000)
        assert result.earnings_yield == 0.0
        assert not result.is_attractive


# ------------------------------------------------------------------ #
# DCF                                                                   #
# ------------------------------------------------------------------ #

class TestDCF:
    def test_positive_fcf_returns_valid_value(self, engine):
        result = engine.compute_dcf(
            fcf_ttm_ty=500, shares_million=500, sector="banking"
        )
        assert result.is_available
        assert result.fair_value > 0

    def test_negative_fcf_is_unavailable(self, engine):
        result = engine.compute_dcf(
            fcf_ttm_ty=-100, shares_million=500, sector="banking"
        )
        assert not result.is_available

    def test_none_fcf_is_unavailable(self, engine):
        result = engine.compute_dcf(
            fcf_ttm_ty=None, shares_million=500, sector="banking"
        )
        assert not result.is_available

    def test_custom_wacc_affects_result(self, engine):
        r1 = engine.compute_dcf(500, 500, "banking", custom_wacc=0.10)
        r2 = engine.compute_dcf(500, 500, "banking", custom_wacc=0.20)
        # WACC cao hơn → giá trị thấp hơn
        assert r1.fair_value > r2.fair_value

    def test_higher_growth_gives_higher_value(self, engine):
        r1 = engine.compute_dcf(500, 500, "banking", custom_growth=0.05)
        r2 = engine.compute_dcf(500, 500, "banking", custom_growth=0.20)
        assert r2.fair_value > r1.fair_value

    def test_dcf_per_share_formula(self, engine):
        # Kiểm tra công thức thủ công: FCF=100 tỷ, shares=100M, wacc=10%, g=10%, terminal=3%
        result = engine._dcf_per_share(
            fcf_base_ty=100, shares_million=100, wacc=0.10, growth=0.10, terminal_growth=0.03
        )
        assert result > 0
        # 100 tỷ / 100 triệu shares × 1000 = 1000 VND đơn vị cơ bản
        # Với discount và growth, giá trị phải > 1000 VND/share
        assert result > 1000


# ------------------------------------------------------------------ #
# Consensus + Label                                                     #
# ------------------------------------------------------------------ #

class TestConsensusAndLabel:
    @pytest.mark.parametrize("discount,expected_label", [
        (35,  ValuationLabel.VERY_ATTRACTIVE),
        (20,  ValuationLabel.ATTRACTIVE),
        (10,  ValuationLabel.NEUTRAL),
        (0,   ValuationLabel.NEUTRAL),
        (-10, ValuationLabel.NEUTRAL),
        (-20, ValuationLabel.EXPENSIVE),
        (-35, ValuationLabel.VERY_EXPENSIVE),
    ])
    def test_discount_to_label(self, engine, discount, expected_label):
        assert engine._discount_to_label(discount) == expected_label

    def test_consensus_skips_unavailable_models(self, engine):
        from src.data.models import ModelResult
        available = ModelResult(model_name="P/E", fair_value=80000, is_available=True, weight=0.5)
        unavailable = ModelResult(model_name="P/B", is_available=False, weight=0.5)
        # Chỉ available model → consensus = fair_value của nó
        consensus = engine._compute_consensus(
            current_price=80000,
            pe=available, pb=unavailable,
            graham=unavailable, dcf=unavailable,
            sector="unknown",
        )
        # Kết quả phải phụ thuộc vào available model, không crash
        assert consensus > 0

    def test_all_unavailable_returns_current_price(self, engine):
        from src.data.models import ModelResult
        unavail = ModelResult(model_name="X", is_available=False, weight=0.25)
        consensus = engine._compute_consensus(
            current_price=50000,
            pe=unavail, pb=unavail, graham=unavail, dcf=unavail,
            sector="unknown",
        )
        assert consensus == 50000


# ------------------------------------------------------------------ #
# Scenarios                                                            #
# ------------------------------------------------------------------ #

class TestScenarios:
    def test_returns_three_scenarios(self, engine):
        probs = {"Bi quan": 0.3, "Cơ sở": 0.5, "Lạc quan": 0.2}
        scenarios = engine.run_scenarios(500, 500, "banking", probs)
        assert len(scenarios) == 3

    def test_probabilities_sum_to_one(self, engine):
        probs = {"Bi quan": 0.3, "Cơ sở": 0.5, "Lạc quan": 0.2}
        scenarios = engine.run_scenarios(500, 500, "banking", probs)
        total = sum(s.probability for s in scenarios)
        assert total == pytest.approx(1.0, abs=0.01)

    def test_pessimistic_lt_base_lt_optimistic(self, engine):
        probs = {"Bi quan": 0.3, "Cơ sở": 0.5, "Lạc quan": 0.2}
        scenarios = engine.run_scenarios(500, 500, "banking", probs)
        by_name = {s.name: s.fair_value for s in scenarios}
        assert by_name["Bi quan"] < by_name["Cơ sở"] < by_name["Lạc quan"]

    def test_negative_fcf_returns_empty_list(self, engine):
        scenarios = engine.run_scenarios(-100, 500, "banking", {})
        assert scenarios == []
