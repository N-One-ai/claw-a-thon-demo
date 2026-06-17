from __future__ import annotations

import logging
import statistics
from typing import Optional

from ..data.models import (
    BalanceSheet,
    CashFlowStatement,
    FinancialRatios,
    FinancialStatements,
    IncomeStatement,
)

logger = logging.getLogger(__name__)


class FinancialAnalyzer:
    """
    Phân tích báo cáo tài chính: tính chỉ số còn thiếu,
    phát hiện xu hướng tăng trưởng, phát hiện cờ đỏ.
    Không gọi API, không dùng Claude — pure computation.
    """

    # ------------------------------------------------------------------ #
    # Ratios                                                               #
    # ------------------------------------------------------------------ #

    def compute_ratios(
        self,
        statements: FinancialStatements,
        current_price: Optional[float] = None,
    ) -> Optional[FinancialRatios]:
        """Tính FinancialRatios từ kỳ mới nhất + giá hiện tại."""
        income = statements.latest_income
        balance = statements.latest_balance
        cashflow = statements.latest_cashflow

        if income is None or balance is None:
            return None

        period = income.period

        # Margins
        gross_margin = self._pct(income.gross_profit, income.revenue)
        operating_margin = self._pct(income.operating_income, income.revenue)
        net_margin = self._pct(income.net_income, income.revenue)

        # Profitability
        roe = self._pct(income.net_income, balance.total_equity)
        roa = self._pct(income.net_income, balance.total_assets)

        # Leverage
        de = self._safe_div(balance.total_debt, balance.total_equity)
        da = self._safe_div(balance.total_debt, balance.total_assets)

        # Coverage
        interest_coverage: Optional[float] = None
        if income.ebit is not None and income.interest_expense and income.interest_expense != 0:
            interest_coverage = round(income.ebit / abs(income.interest_expense), 2)
        elif income.operating_income and income.interest_expense and income.interest_expense != 0:
            interest_coverage = round(income.operating_income / abs(income.interest_expense), 2)

        # Liquidity
        current_ratio: Optional[float] = None
        if balance.current_assets and balance.current_liabilities and balance.current_liabilities != 0:
            current_ratio = round(balance.current_assets / balance.current_liabilities, 2)

        # Market multiples (cần giá)
        pe: Optional[float] = None
        pb: Optional[float] = None
        eps_ttm = statements.eps_ttm
        if current_price and eps_ttm and eps_ttm > 0:
            pe = round(current_price / eps_ttm, 2)
        if current_price and balance.book_value_per_share and balance.book_value_per_share > 0:
            pb = round(current_price / balance.book_value_per_share, 2)

        # Growth rates YoY
        rev_growth = self._yoy_growth(statements.income_statements, "revenue")
        ni_growth = self._yoy_growth(statements.income_statements, "net_income")
        eps_growth = self._yoy_growth_eps(statements.income_statements)

        return FinancialRatios(
            period=period,
            pe_ratio=pe,
            pb_ratio=pb,
            roe=roe,
            roa=roa,
            gross_margin=gross_margin,
            operating_margin=operating_margin,
            net_margin=net_margin,
            debt_to_equity=de,
            debt_to_assets=da,
            interest_coverage=interest_coverage,
            current_ratio=current_ratio,
            revenue_growth_yoy=rev_growth,
            net_income_growth_yoy=ni_growth,
            eps_growth_yoy=eps_growth,
        )

    # ------------------------------------------------------------------ #
    # Growth Trends                                                        #
    # ------------------------------------------------------------------ #

    def compute_revenue_growth_series(self, statements: FinancialStatements) -> list[float]:
        """Tăng trưởng doanh thu QoQ (%) — 4 quý gần nhất."""
        quarters = [s for s in statements.income_statements if "Q" in s.period]
        return self._growth_series([q.revenue for q in quarters[:8]])

    def compute_eps_trend(self, statements: FinancialStatements) -> list[Optional[float]]:
        quarters = [s for s in statements.income_statements if "Q" in s.period]
        return [q.eps for q in quarters[:8]]

    def compute_fcf_trend(self, statements: FinancialStatements) -> list[float]:
        quarters = [s for s in statements.cash_flow_statements if "Q" in s.period]
        return [q.free_cash_flow for q in quarters[:8]]

    # ------------------------------------------------------------------ #
    # Business Classification                                              #
    # ------------------------------------------------------------------ #

    def classify_business_type(self, ratios: FinancialRatios) -> str:
        """
        Phân loại: 'Tăng trưởng', 'Giá trị', 'Cổ tức', 'Hỗn hợp'.
        Dùng để gợi ý framework phân tích phù hợp.
        """
        is_growth = (
            ratios.revenue_growth_yoy is not None and ratios.revenue_growth_yoy > 15
            and ratios.eps_growth_yoy is not None and ratios.eps_growth_yoy > 15
        )
        is_value = (
            ratios.pe_ratio is not None and ratios.pe_ratio < 12
            and ratios.pb_ratio is not None and ratios.pb_ratio < 1.5
        )
        if is_growth and not is_value:
            return "Tăng trưởng"
        if is_value and not is_growth:
            return "Giá trị"
        return "Hỗn hợp"

    # ------------------------------------------------------------------ #
    # Red Flags                                                            #
    # ------------------------------------------------------------------ #

    def detect_accounting_red_flags(self, statements: FinancialStatements) -> list[str]:
        """
        Phát hiện dấu hiệu bất thường trong BCTC.
        Trả về danh sách chuỗi mô tả để Claude diễn giải.
        """
        flags: list[str] = []
        income = statements.latest_income
        balance = statements.latest_balance
        cashflow = statements.latest_cashflow

        # Lợi nhuận cao nhưng FCF thấp → có thể ghi nhận doanh thu ảo
        if income and cashflow:
            if income.net_income > 0 and cashflow.free_cash_flow < 0:
                ratio = cashflow.free_cash_flow / income.net_income
                if ratio < -0.5:
                    flags.append(
                        f"Lợi nhuận ròng dương ({income.net_income:.0f} tỷ) nhưng FCF âm "
                        f"({cashflow.free_cash_flow:.0f} tỷ) — cần kiểm tra chất lượng lợi nhuận"
                    )

        # Nợ vay tăng mạnh hơn tài sản
        balances = statements.balance_sheets
        if len(balances) >= 4:
            debt_growth = self._growth_pct(balances[3].total_debt, balances[0].total_debt)
            asset_growth = self._growth_pct(balances[3].total_assets, balances[0].total_assets)
            if debt_growth is not None and asset_growth is not None and debt_growth > asset_growth + 20:
                flags.append(
                    f"Nợ vay tăng {debt_growth:.0f}% nhanh hơn tài sản {asset_growth:.0f}% "
                    f"(4 kỳ gần nhất)"
                )

        # Doanh thu giảm liên tục
        revenues = [s.revenue for s in statements.income_statements[:4] if "Q" in s.period]
        if len(revenues) >= 3 and all(revenues[i] > revenues[i + 1] for i in range(2)):
            flags.append("Doanh thu giảm 3 quý liên tiếp")

        # EPS âm
        eps_ttm = statements.eps_ttm
        if eps_ttm is not None and eps_ttm < 0:
            flags.append(f"EPS TTM âm ({eps_ttm:,.0f} VND) — công ty đang lỗ")

        return flags

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    def _yoy_growth(self, items: list, attr: str) -> Optional[float]:
        """Tăng trưởng YoY giữa kỳ mới nhất và kỳ cùng kỳ năm ngoái (index 4)."""
        quarters = [s for s in items if "Q" in getattr(s, "period", "")]
        if len(quarters) < 5:
            return None
        current = getattr(quarters[0], attr, None)
        prior = getattr(quarters[4], attr, None)
        return self._growth_pct(prior, current)

    def _yoy_growth_eps(self, incomes: list[IncomeStatement]) -> Optional[float]:
        quarters = [s for s in incomes if "Q" in s.period]
        if len(quarters) < 5:
            return None
        return self._growth_pct(quarters[4].eps, quarters[0].eps)

    def _growth_series(self, values: list[float]) -> list[float]:
        result = []
        for i in range(len(values) - 1):
            g = self._growth_pct(values[i + 1], values[i])
            if g is not None:
                result.append(g)
        return result

    @staticmethod
    def _growth_pct(base: Optional[float], current: Optional[float]) -> Optional[float]:
        if base is None or current is None or base == 0:
            return None
        return round((current - base) / abs(base) * 100, 1)

    @staticmethod
    def _pct(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
        if numerator is None or denominator is None or denominator == 0:
            return None
        return round(numerator / denominator * 100, 2)

    @staticmethod
    def _safe_div(a: Optional[float], b: Optional[float]) -> Optional[float]:
        if a is None or b is None or b == 0:
            return None
        return round(a / b, 2)
