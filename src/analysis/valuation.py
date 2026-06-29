from __future__ import annotations

import logging
import math
from typing import Optional

from ..config_loader import risk_free_rate, sector_config, wacc_config
from ..data.models import (
    CompanyInfo,
    DCFScenario,
    EarningsYieldResult,
    FinancialStatements,
    ModelResult,
    ValuationLabel,
    ValuationResults,
)

logger = logging.getLogger(__name__)


class ValuationEngine:
    """
    5 mô hình định giá + consensus có trọng số ngành + 3 kịch bản DCF.
    Pure computation — không gọi API, không dùng Claude.

    Đơn vị đầu ra: VND/cổ phiếu
    Đơn vị đầu vào BCTC: tỷ VND, triệu cổ phiếu
    """

    # ------------------------------------------------------------------ #
    # Entry point                                                          #
    # ------------------------------------------------------------------ #

    def run_full_valuation(
        self,
        company: CompanyInfo,
        statements: FinancialStatements,
        current_price: float,
        scenario_probabilities: Optional[dict[str, float]] = None,
        custom_wacc: Optional[float] = None,
        custom_growth: Optional[float] = None,
    ) -> ValuationResults:
        sector = company.sector.value
        shares = company.shares_outstanding  # triệu cổ

        eps = statements.eps_ttm
        bvps = statements.latest_balance.book_value_per_share if statements.latest_balance else None
        fcf_ttm = statements.fcf_ttm

        pe_result = self.compute_pe_value(eps, sector)
        pb_result = self.compute_pb_value(bvps, sector)
        graham_result = self.compute_graham(eps, bvps)
        dcf_result = self.compute_dcf(fcf_ttm, shares, sector, custom_wacc, custom_growth)
        ey_result = self.compute_earnings_yield(eps, current_price)

        consensus = self._compute_consensus(
            current_price, pe_result, pb_result, graham_result, dcf_result, sector
        )
        discount_pct = round((consensus - current_price) / current_price * 100, 1)
        label = self._discount_to_label(discount_pct)

        probs = scenario_probabilities or {"Bi quan": 0.30, "Cơ sở": 0.50, "Lạc quan": 0.20}
        scenarios = self.run_scenarios(fcf_ttm, shares, sector, probs)
        pw_value = sum(s.fair_value * s.probability for s in scenarios) if scenarios else None

        return ValuationResults(
            ticker=company.ticker,
            current_price=current_price,
            pe_result=pe_result,
            pb_result=pb_result,
            graham_result=graham_result,
            dcf_result=dcf_result,
            earnings_yield=ey_result,
            consensus_value=consensus,
            discount_pct=discount_pct,
            label=label,
            scenarios=scenarios,
            probability_weighted_value=pw_value,
        )

    # ------------------------------------------------------------------ #
    # Individual models                                                    #
    # ------------------------------------------------------------------ #

    def compute_pe_value(self, eps_ttm: Optional[float], sector: str) -> ModelResult:
        cfg = sector_config(sector)
        benchmark_pe = float(cfg.get("pe_benchmark", 16))
        weight = float(cfg.get("weights", {}).get("pe", 0.25))

        if eps_ttm is None:
            return ModelResult(
                model_name="P/E Fair Value",
                is_available=False,
                unavailable_reason="Không có dữ liệu EPS TTM",
                weight=weight,
            )
        if eps_ttm <= 0:
            return ModelResult(
                model_name="P/E Fair Value",
                is_available=False,
                unavailable_reason=f"EPS TTM âm ({eps_ttm:,.0f} VND) — P/E không có ý nghĩa",
                weight=weight,
            )

        fair_value = round(eps_ttm * benchmark_pe)
        return ModelResult(
            model_name="P/E Fair Value",
            fair_value=fair_value,
            weight=weight,
            inputs={"eps_ttm": eps_ttm, "pe_benchmark": benchmark_pe, "sector": sector},
        )

    def compute_pb_value(self, bvps: Optional[float], sector: str) -> ModelResult:
        cfg = sector_config(sector)
        benchmark_pb = float(cfg.get("pb_benchmark", 2.0))
        weight = float(cfg.get("weights", {}).get("pb", 0.25))

        if bvps is None:
            return ModelResult(
                model_name="P/B Fair Value",
                is_available=False,
                unavailable_reason="Không có dữ liệu BVPS",
                weight=weight,
            )
        if bvps <= 0:
            return ModelResult(
                model_name="P/B Fair Value",
                is_available=False,
                unavailable_reason=f"BVPS âm ({bvps:,.0f} VND) — vốn chủ sở hữu âm",
                weight=weight,
            )

        fair_value = round(bvps * benchmark_pb)
        return ModelResult(
            model_name="P/B Fair Value",
            fair_value=fair_value,
            weight=weight,
            inputs={"bvps": bvps, "pb_benchmark": benchmark_pb, "sector": sector},
        )

    def compute_graham(self, eps_ttm: Optional[float], bvps: Optional[float]) -> ModelResult:
        weight = 0.20  # trọng số cố định cho Graham (override bởi consensus)

        if eps_ttm is None or bvps is None:
            return ModelResult(
                model_name="Graham Number",
                is_available=False,
                unavailable_reason="Thiếu EPS hoặc BVPS",
                weight=weight,
            )
        if eps_ttm <= 0 or bvps <= 0:
            return ModelResult(
                model_name="Graham Number",
                is_available=False,
                unavailable_reason=(
                    f"EPS ({eps_ttm:,.0f}) hoặc BVPS ({bvps:,.0f}) không dương "
                    f"— Graham Number không hợp lệ"
                ),
                weight=weight,
            )

        fair_value = round(math.sqrt(22.5 * eps_ttm * bvps))
        return ModelResult(
            model_name="Graham Number",
            fair_value=fair_value,
            weight=weight,
            inputs={"eps_ttm": eps_ttm, "bvps": bvps, "formula": "√(22.5 × EPS × BVPS)"},
        )

    def compute_earnings_yield(
        self, eps_ttm: Optional[float], current_price: float
    ) -> EarningsYieldResult:
        rf = risk_free_rate()

        if eps_ttm is None or current_price <= 0:
            return EarningsYieldResult(
                earnings_yield=0.0,
                risk_free_rate=rf,
                spread=0.0 - rf,
                is_attractive=False,
            )

        ey = eps_ttm / current_price
        spread = round(ey - rf, 4)
        return EarningsYieldResult(
            earnings_yield=round(ey * 100, 2),
            risk_free_rate=round(rf * 100, 2),
            spread=round(spread * 100, 2),
            is_attractive=spread > 0.03,
        )

    def compute_dcf(
        self,
        fcf_ttm_ty: Optional[float],          # FCF TTM (tỷ VND)
        shares_million: float,                 # Số cổ phiếu (triệu)
        sector: str,
        custom_wacc: Optional[float] = None,
        custom_growth: Optional[float] = None,
    ) -> ModelResult:
        cfg = sector_config(sector)
        wcfg = wacc_config(sector)
        weight = float(cfg.get("weights", {}).get("dcf", 0.25))

        if fcf_ttm_ty is None:
            return ModelResult(
                model_name="DCF (5 năm)",
                is_available=False,
                unavailable_reason="Không có dữ liệu Free Cash Flow",
                weight=weight,
            )
        if fcf_ttm_ty <= 0:
            return ModelResult(
                model_name="DCF (5 năm)",
                is_available=False,
                unavailable_reason=f"FCF TTM âm ({fcf_ttm_ty:.0f} tỷ) — DCF không có ý nghĩa",
                weight=weight,
            )
        if shares_million <= 0:
            return ModelResult(
                model_name="DCF (5 năm)",
                is_available=False,
                unavailable_reason="Số lượng cổ phiếu không hợp lệ",
                weight=weight,
            )

        wacc = custom_wacc or float(wcfg.get("base_wacc", 0.13))
        growth = custom_growth or float(wcfg.get("fcf_growth_base", 0.10))
        terminal_g = float(wcfg.get("terminal_growth", 0.03))

        fair_value = self._dcf_per_share(fcf_ttm_ty, shares_million, wacc, growth, terminal_g)
        return ModelResult(
            model_name="DCF (5 năm)",
            fair_value=fair_value,
            weight=weight,
            inputs={
                "fcf_ttm_ty_vnd": fcf_ttm_ty,
                "shares_million": shares_million,
                "wacc_pct": round(wacc * 100, 1),
                "growth_pct": round(growth * 100, 1),
                "terminal_growth_pct": round(terminal_g * 100, 1),
            },
        )

    def run_scenarios(
        self,
        fcf_ttm_ty: Optional[float],
        shares_million: float,
        sector: str,
        probabilities: dict[str, float],
    ) -> list[DCFScenario]:
        if not fcf_ttm_ty or fcf_ttm_ty <= 0 or shares_million <= 0:
            return []

        wcfg = wacc_config(sector)
        wacc_base = float(wcfg.get("base_wacc", 0.13))
        terminal_g = float(wcfg.get("terminal_growth", 0.03))

        scenarios_cfg = {
            "Bi quan": {
                "growth": float(wcfg.get("fcf_growth_pessimistic", 0.04)),
                "wacc": wacc_base + 0.02,
            },
            "Cơ sở": {
                "growth": float(wcfg.get("fcf_growth_base", 0.10)),
                "wacc": wacc_base,
            },
            "Lạc quan": {
                "growth": float(wcfg.get("fcf_growth_optimistic", 0.16)),
                "wacc": max(wacc_base - 0.01, 0.08),
            },
        }

        results = []
        for name, cfg in scenarios_cfg.items():
            prob = probabilities.get(name, 1 / 3)
            fv = self._dcf_per_share(fcf_ttm_ty, shares_million, cfg["wacc"], cfg["growth"], terminal_g)
            results.append(DCFScenario(
                name=name,
                growth_rate=round(cfg["growth"] * 100, 1),
                terminal_growth=round(terminal_g * 100, 1),
                wacc=round(cfg["wacc"] * 100, 1),
                fair_value=fv,
                probability=prob,
            ))
        return results

    # ------------------------------------------------------------------ #
    # Consensus                                                            #
    # ------------------------------------------------------------------ #

    def _compute_consensus(
        self,
        current_price: float,
        pe: ModelResult,
        pb: ModelResult,
        graham: ModelResult,
        dcf: ModelResult,
        sector: str,
    ) -> float:
        cfg = sector_config(sector)
        raw_weights = cfg.get("weights", {})

        model_map = {
            "pe": pe,
            "pb": pb,
            "graham": graham,
            "dcf": dcf,
        }

        weighted_sum = 0.0
        total_weight = 0.0
        for key, model in model_map.items():
            if model.is_available and model.fair_value is not None:
                w = float(raw_weights.get(key, 0.25))
                weighted_sum += model.fair_value * w
                total_weight += w

        if total_weight == 0:
            logger.warning("Tất cả mô hình định giá không khả dụng — dùng giá hiện tại")
            return current_price

        return round(weighted_sum / total_weight)

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _dcf_per_share(
        fcf_base_ty: float,
        shares_million: float,
        wacc: float,
        growth: float,
        terminal_growth: float,
    ) -> float:
        """
        DCF 5 năm explicit + terminal value.
        Đầu vào: FCF (tỷ VND), cổ phiếu (triệu)
        Đầu ra: giá trị hợp lý (VND/cổ phiếu)
        """
        pv_fcf = 0.0
        fcf = fcf_base_ty
        for t in range(1, 6):
            fcf *= (1 + growth)
            pv_fcf += fcf / (1 + wacc) ** t

        # Terminal value (Gordon Growth Model)
        tv = fcf * (1 + terminal_growth) / (wacc - terminal_growth)
        pv_tv = tv / (1 + wacc) ** 5

        total_value_ty = pv_fcf + pv_tv          # tỷ VND
        # Quy đổi: tỷ VND × 10^9 / (triệu cổ × 10^6) = × 1000
        per_share_vnd = total_value_ty * 1000 / shares_million
        return round(per_share_vnd)

    @staticmethod
    def _discount_to_label(discount_pct: float) -> ValuationLabel:
        if discount_pct > 30:
            return ValuationLabel.VERY_ATTRACTIVE
        if discount_pct > 15:
            return ValuationLabel.ATTRACTIVE
        if discount_pct >= -15:
            return ValuationLabel.NEUTRAL
        if discount_pct >= -30:
            return ValuationLabel.EXPENSIVE
        return ValuationLabel.VERY_EXPENSIVE
