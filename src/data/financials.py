"""
FinancialDataFetcher — lấy báo cáo tài chính từ vnstock.

Đơn vị đầu ra: tỷ VND cho mọi giá trị tài chính; VND/cổ phiếu cho EPS/BVPS.
vnstock VCI source trả về tỷ VND nên scale mặc định là 1.0.
Nếu nguồn dữ liệu trả về triệu VND, dùng financial_scale=1/1000.
"""
from __future__ import annotations

import logging
from typing import Optional

from ._utils import (
    find_col,
    period_label,
    safe_float,
    with_retry,
)
from .cache import CacheManager
from .models import (
    BalanceSheet,
    CashFlowStatement,
    FinancialRatios,
    FinancialStatements,
    IncomeStatement,
)

logger = logging.getLogger(__name__)

# Hệ số chuyển đổi: 1.0 nếu vnstock trả về tỷ VND (VCI source)
# Đặt thành 1/1000 nếu nguồn dữ liệu trả về triệu VND
_DEFAULT_SCALE: float = 1.0


class FinancialDataFetcher:
    """Lấy và chuẩn hóa 4 loại báo cáo tài chính từ vnstock."""

    def __init__(
        self,
        cache: Optional[CacheManager] = None,
        source: str = "VCI",
        financial_scale: float = _DEFAULT_SCALE,
        n_periods: int = 20,
    ) -> None:
        self._cache = cache or CacheManager()
        self._source = source
        self._scale = financial_scale
        self._n = n_periods
        self._vn = None  # lazy init

    # ------------------------------------------------------------------ #
    # Public API                                                            #
    # ------------------------------------------------------------------ #

    def get_all(self, ticker: str) -> FinancialStatements:
        """Lấy toàn bộ 4 báo cáo tài chính, cache kết quả."""
        ticker = ticker.upper()
        cache_key = f"{ticker}_all_{self._n}"
        cached = self._cache.get("financial", cache_key)
        if cached:
            return FinancialStatements(**cached)

        stmts = FinancialStatements(ticker=ticker)
        stmts.income_statements   = self.get_income_statement(ticker)
        stmts.balance_sheets      = self.get_balance_sheet(ticker)
        stmts.cash_flow_statements = self.get_cash_flow(ticker)
        stmts.ratios              = self.get_ratios(ticker)

        self._cache.set("financial", cache_key, stmts.model_dump())
        return stmts

    def get_income_statement(self, ticker: str) -> list[IncomeStatement]:
        return self._fetch_statement(
            ticker, "income", self._parse_income
        )

    def get_balance_sheet(self, ticker: str) -> list[BalanceSheet]:
        return self._fetch_statement(
            ticker, "balance", self._parse_balance
        )

    def get_cash_flow(self, ticker: str) -> list[CashFlowStatement]:
        return self._fetch_statement(
            ticker, "cashflow", self._parse_cashflow
        )

    def get_ratios(self, ticker: str) -> list[FinancialRatios]:
        return self._fetch_statement(
            ticker, "ratio", self._parse_ratios
        )

    # ------------------------------------------------------------------ #
    # Internal fetch dispatcher                                             #
    # ------------------------------------------------------------------ #

    def _fetch_statement(self, ticker: str, stmt_type: str, parser):
        ticker = ticker.upper()
        cache_key = f"{ticker}_{stmt_type}_{self._n}"
        cached = self._cache.get("financial", cache_key)
        if cached:
            return cached  # already parsed list; caller reconstructs if needed

        try:
            df = self._call_api(ticker, stmt_type)
            result = parser(df)
            self._cache.set("financial", cache_key, [r.model_dump() for r in result])
            return result
        except Exception as exc:
            logger.warning("[Financials] Không lấy được %s cho %s: %s", stmt_type, ticker, exc)
            return []

    @with_retry(max_attempts=3, initial_delay=1.5, exceptions=(Exception,))
    def _call_api(self, ticker: str, stmt_type: str):
        vn = self._get_vn()
        stock = vn.stock(symbol=ticker, source=self._source)
        fin = stock.finance
        if stmt_type == "income":
            return fin.income_statement(period="quarter", lang="vi")
        if stmt_type == "balance":
            return fin.balance_sheet(period="quarter", lang="vi")
        if stmt_type == "cashflow":
            return fin.cash_flow(period="quarter", lang="vi")
        if stmt_type == "ratio":
            return fin.ratio(period="quarter", lang="vi")
        raise ValueError(f"Unknown statement type: {stmt_type}")

    # ------------------------------------------------------------------ #
    # Parsers                                                               #
    # ------------------------------------------------------------------ #

    def _parse_income(self, df) -> list[IncomeStatement]:
        results: list[IncomeStatement] = []
        df = df.head(self._n)
        s = self._scale

        for row in df.itertuples(index=False):
            try:
                rev = find_col(df, "Doanh thu thuần", "Doanh thu", "Revenue",
                               "Net Revenue", "NetRevenue", "revenue", "net_revenue",
                               "total revenue")
                gp  = find_col(df, "Lợi nhuận gộp", "Gross Profit", "GrossProfit",
                               "gross_profit", "grossProfit")
                oi  = find_col(df, "Lợi nhuận từ HĐKD", "Lợi nhuận hoạt động",
                               "Operating Profit", "OperatingProfit", "operating_profit",
                               "operating income", "operatingIncome")
                ebit = find_col(df, "EBIT", "ebit")
                ebita= find_col(df, "EBITDA", "ebitda")
                ni   = find_col(df, "Lợi nhuận sau thuế", "Lợi nhuận sau thuế CĐTS",
                                "Net Income", "Profit After Tax", "NetProfit",
                                "net_income", "netIncome", "profit after tax")
                eps  = find_col(df, "EPS", "Lãi cơ bản trên cổ phiếu",
                                "eps", "earningPerShare", "BasicEPS")
                int_exp = find_col(df, "Chi phí lãi vay", "Interest Expense",
                                   "InterestExpense", "interest_expense", "interestExpense")

                # Dùng positional index qua enumerate thay vì .loc
                i = len(results)

                def _get(series):
                    if series is None:
                        return None
                    try:
                        return series.iloc[i]
                    except Exception:
                        return None

                revenue_raw = safe_float(_get(rev), s)
                if revenue_raw is None:
                    continue

                results.append(IncomeStatement(
                    period=period_label(row),
                    revenue=revenue_raw,
                    gross_profit=safe_float(_get(gp), s),
                    operating_income=safe_float(_get(oi), s),
                    ebit=safe_float(_get(ebit), s),
                    ebitda=safe_float(_get(ebita), s),
                    net_income=safe_float(_get(ni), s) or 0.0,
                    eps=safe_float(_get(eps)),          # VND/share — không scale
                    interest_expense=safe_float(_get(int_exp), s),
                ))
            except Exception as exc:
                logger.debug("[Financials] Income row lỗi: %s", exc)
        return results

    def _parse_balance(self, df) -> list[BalanceSheet]:
        results: list[BalanceSheet] = []
        df = df.head(self._n)
        s = self._scale

        for i, row in enumerate(df.itertuples(index=False)):
            try:
                def _get(series):
                    if series is None:
                        return None
                    try:
                        return series.iloc[i]
                    except Exception:
                        return None

                ta    = find_col(df, "Tổng tài sản", "Total Assets", "TotalAssets",
                                 "total_assets", "totalAssets", "TOTAL ASSETS")
                eq    = find_col(df, "Vốn chủ sở hữu", "Owner Equity", "OwnerEquity",
                                 "TotalEquity", "total_equity", "stockholders equity",
                                 "Vốn chủ sở hữu của cổ đông công ty mẹ")
                std   = find_col(df, "Vay ngắn hạn", "Short Term Debt", "ShortTermDebt",
                                 "short_term_debt", "shortTermBorrowings",
                                 "Nợ vay ngắn hạn", "Vay và nợ thuê tài chính ngắn hạn")
                ltd   = find_col(df, "Vay dài hạn", "Long Term Debt", "LongTermDebt",
                                 "long_term_debt", "longTermBorrowings",
                                 "Nợ vay dài hạn", "Vay và nợ thuê tài chính dài hạn")
                cash  = find_col(df, "Tiền và tương đương tiền", "Cash",
                                 "CashAndCashEquivalents", "cash", "cashAndEquivalents",
                                 "Tiền", "Cash And Cash Equivalents")
                ca    = find_col(df, "Tài sản ngắn hạn", "Current Assets",
                                 "CurrentAssets", "current_assets", "currentAssets")
                cl    = find_col(df, "Nợ ngắn hạn", "Current Liabilities",
                                 "CurrentLiabilities", "current_liabilities", "currentLiabilities",
                                 "Tổng nợ ngắn hạn")
                bvps  = find_col(df, "BVPS", "Book Value Per Share",
                                 "book_value_per_share", "bookValuePerShare", "BPS")
                re    = find_col(df, "Lợi nhuận chưa phân phối", "Retained Earnings",
                                 "RetainedEarnings", "retained_earnings", "retainedEarnings",
                                 "Lợi nhuận sau thuế chưa phân phối")

                total_assets = safe_float(_get(ta), s)
                total_equity = safe_float(_get(eq), s)
                if total_assets is None or total_equity is None:
                    continue

                short_debt = safe_float(_get(std), s) or 0.0
                long_debt  = safe_float(_get(ltd), s) or 0.0
                total_debt = short_debt + long_debt

                results.append(BalanceSheet(
                    period=period_label(row),
                    total_assets=total_assets,
                    total_equity=total_equity,
                    total_debt=total_debt,
                    cash_and_equivalents=safe_float(_get(cash), s) or 0.0,
                    current_assets=safe_float(_get(ca), s),
                    current_liabilities=safe_float(_get(cl), s),
                    book_value_per_share=safe_float(_get(bvps)),   # VND/share
                    retained_earnings=safe_float(_get(re), s),
                ))
            except Exception as exc:
                logger.debug("[Financials] Balance row lỗi: %s", exc)
        return results

    def _parse_cashflow(self, df) -> list[CashFlowStatement]:
        results: list[CashFlowStatement] = []
        df = df.head(self._n)
        s = self._scale

        for i, row in enumerate(df.itertuples(index=False)):
            try:
                def _get(series):
                    if series is None:
                        return None
                    try:
                        return series.iloc[i]
                    except Exception:
                        return None

                ocf = find_col(df, "Lưu chuyển tiền từ HĐKD",
                               "Lưu chuyển tiền thuần từ HĐKD",
                               "Operating Cash Flow", "CFO", "operating_cash_flow",
                               "operatingCashFlow", "Net CFO", "NetCFO",
                               "Lưu chuyển tiền thuần từ hoạt động kinh doanh")
                cap = find_col(df, "Mua sắm TSCĐ", "Mua TSCĐ",
                               "Capital Expenditure", "Capex", "CAPEX", "capex",
                               "capitalExpenditure", "Tiền mua TSCĐ",
                               "Mua tài sản cố định và các tài sản dài hạn khác")
                fcf = find_col(df, "Dòng tiền tự do", "FCF", "Free Cash Flow",
                               "free_cash_flow", "freeCashFlow")
                inv = find_col(df, "Lưu chuyển tiền từ HĐĐT",
                               "Investing Cash Flow", "CFI", "investing_cash_flow",
                               "investingCashFlow",
                               "Lưu chuyển tiền thuần từ hoạt động đầu tư")
                fin = find_col(df, "Lưu chuyển tiền từ HĐTC",
                               "Financing Cash Flow", "CFF", "financing_cash_flow",
                               "financingCashFlow",
                               "Lưu chuyển tiền thuần từ hoạt động tài chính")
                div = find_col(df, "Trả cổ tức", "Dividends Paid",
                               "dividends_paid", "dividendsPaid", "Cổ tức đã trả")

                ocf_val = safe_float(_get(ocf), s) or 0.0
                cap_val = safe_float(_get(cap), s)
                if cap_val is None:
                    cap_val = 0.0
                elif cap_val > 0:
                    cap_val = -cap_val   # capex chuẩn hóa âm

                fcf_val = safe_float(_get(fcf), s)
                if fcf_val is None:
                    fcf_val = ocf_val + cap_val

                results.append(CashFlowStatement(
                    period=period_label(row),
                    operating_cash_flow=ocf_val,
                    capital_expenditure=cap_val,
                    free_cash_flow=fcf_val,
                    investing_cash_flow=safe_float(_get(inv), s),
                    financing_cash_flow=safe_float(_get(fin), s),
                    dividends_paid=safe_float(_get(div), s),
                ))
            except Exception as exc:
                logger.debug("[Financials] Cashflow row lỗi: %s", exc)
        return results

    def _parse_ratios(self, df) -> list[FinancialRatios]:
        results: list[FinancialRatios] = []
        df = df.head(self._n)

        for i, row in enumerate(df.itertuples(index=False)):
            try:
                def _get(series):
                    if series is None:
                        return None
                    try:
                        return series.iloc[i]
                    except Exception:
                        return None

                pe   = find_col(df, "P/E", "PE", "pe", "pe_ratio", "priceEarningRatio")
                pb   = find_col(df, "P/B", "PB", "pb", "pb_ratio", "priceToBook")
                roe  = find_col(df, "ROE", "roe", "returnOnEquity")
                roa  = find_col(df, "ROA", "roa", "returnOnAssets")
                roic = find_col(df, "ROIC", "roic", "returnOnInvestedCapital")
                gm   = find_col(df, "Gross Margin", "Biên lợi nhuận gộp",
                                "gross_margin", "grossMargin", "grossProfitMargin")
                om   = find_col(df, "Operating Margin", "Biên LNHĐ",
                                "operating_margin", "operatingMargin")
                nm   = find_col(df, "Net Margin", "Biên lợi nhuận ròng",
                                "net_margin", "netMargin", "netProfitMargin")
                de   = find_col(df, "D/E", "Debt To Equity", "debt_to_equity",
                                "debtToEquity", "leverageRatio")
                ic   = find_col(df, "Interest Coverage", "interest_coverage",
                                "interestCoverageRatio", "EBIT/Interest")
                cr   = find_col(df, "Current Ratio", "Tỷ lệ thanh khoản hiện thời",
                                "current_ratio", "currentRatio", "Tỷ số thanh toán hiện hành")

                results.append(FinancialRatios(
                    period=period_label(row),
                    pe_ratio=safe_float(_get(pe)),
                    pb_ratio=safe_float(_get(pb)),
                    roe=safe_float(_get(roe)),
                    roa=safe_float(_get(roa)),
                    roic=safe_float(_get(roic)),
                    gross_margin=safe_float(_get(gm)),
                    operating_margin=safe_float(_get(om)),
                    net_margin=safe_float(_get(nm)),
                    debt_to_equity=safe_float(_get(de)),
                    interest_coverage=safe_float(_get(ic)),
                    current_ratio=safe_float(_get(cr)),
                ))
            except Exception as exc:
                logger.debug("[Financials] Ratio row lỗi: %s", exc)
        return results

    # ------------------------------------------------------------------ #
    # Lazy init                                                             #
    # ------------------------------------------------------------------ #

    def _get_vn(self):
        if self._vn is None:
            try:
                from vnstock import Vnstock
                self._vn = Vnstock()
            except ImportError as exc:
                raise RuntimeError("pip install vnstock") from exc
        return self._vn
