from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from .cache import CacheManager
from .models import (
    OHLCV,
    BalanceSheet,
    CashFlowStatement,
    CompanyInfo,
    Exchange,
    FinancialRatios,
    FinancialStatements,
    IncomeStatement,
    PriceHistory,
    Sector,
)

logger = logging.getLogger(__name__)

# Mapping tên ngành từ vnstock → Sector enum của dự án
_SECTOR_MAP: dict[str, Sector] = {
    "ngân hàng": Sector.BANKING,
    "bank": Sector.BANKING,
    "bất động sản": Sector.REAL_ESTATE,
    "real estate": Sector.REAL_ESTATE,
    "công nghệ": Sector.TECHNOLOGY,
    "technology": Sector.TECHNOLOGY,
    "hàng tiêu dùng thiết yếu": Sector.CONSUMER_STAPLES,
    "hàng tiêu dùng không thiết yếu": Sector.CONSUMER_DISCRETIONARY,
    "công nghiệp": Sector.INDUSTRIALS,
    "vật liệu": Sector.MATERIALS,
    "năng lượng": Sector.ENERGY,
    "tiện ích": Sector.UTILITIES,
    "y tế": Sector.HEALTHCARE,
    "dịch vụ tài chính": Sector.FINANCIALS,
}


def _map_sector(raw: Optional[str]) -> Sector:
    if not raw:
        return Sector.UNKNOWN
    lower = raw.lower().strip()
    for key, sector in _SECTOR_MAP.items():
        if key in lower:
            return sector
    return Sector.UNKNOWN


class VnstockClient:
    """
    Wrapper duy nhất cho thư viện vnstock.
    Toàn bộ dữ liệu thị trường đi qua đây — không import vnstock ở nơi khác.
    Tự động cache kết quả để giảm số lần gọi API.
    """

    def __init__(self, cache: Optional[CacheManager] = None, source: str = "VCI") -> None:
        self._cache = cache or CacheManager()
        self._source = source
        self._vnstock = None   # lazy — khởi tạo lần đầu khi cần

    def _get_vnstock(self):
        """Lazy init — chỉ import vnstock khi thực sự cần dữ liệu."""
        if self._vnstock is None:
            try:
                from vnstock import Vnstock
                self._vnstock = Vnstock()
            except ImportError as exc:
                raise RuntimeError(
                    "Thư viện vnstock chưa được cài. Chạy: pip install vnstock"
                ) from exc
        return self._vnstock

    # ------------------------------------------------------------------ #
    # Company Info                                                         #
    # ------------------------------------------------------------------ #

    def get_company_info(self, ticker: str) -> CompanyInfo:
        ticker = ticker.upper()
        cached = self._cache.get("company_info", ticker)
        if cached:
            return CompanyInfo(**cached)

        stock = self._get_vnstock().stock(symbol=ticker, source=self._source)

        try:
            overview = stock.company.overview()
            row = overview.iloc[0] if hasattr(overview, "iloc") else {}
        except Exception as exc:
            logger.warning("Không lấy được overview cho %s: %s", ticker, exc)
            row = {}

        shares_outstanding = float(row.get("shareOutstanding", row.get("klcpniemyet", 0)) or 0)
        if shares_outstanding == 0:
            shares_outstanding = 1.0  # fallback tránh chia 0

        info = CompanyInfo(
            ticker=ticker,
            name=str(row.get("shortName", row.get("companyName", ticker))),
            exchange=self._detect_exchange(ticker),
            sector=_map_sector(str(row.get("icbName3", row.get("industry", "")))),
            industry=str(row.get("icbName4", "")) or None,
            shares_outstanding=shares_outstanding / 1_000_000,  # quy về triệu cổ
            description=str(row.get("companyProfile", "")) or None,
            website=str(row.get("website", "")) or None,
        )

        self._cache.set("company_info", ticker, info.model_dump())
        return info

    # ------------------------------------------------------------------ #
    # Price History                                                        #
    # ------------------------------------------------------------------ #

    def get_price_history(self, ticker: str, days: int = 365) -> PriceHistory:
        ticker = ticker.upper()
        cache_key = f"{ticker}_{days}d"
        cached = self._cache.get("price_history", cache_key)
        if cached:
            candles = [OHLCV(**c) for c in cached]
            return PriceHistory(ticker=ticker, candles=candles)

        end = date.today()
        start = end - timedelta(days=days + 60)  # buffer cho ngày nghỉ

        stock = self._get_vnstock().stock(symbol=ticker, source=self._source)
        try:
            df = stock.quote.history(
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                interval="1D",
            )
        except Exception as exc:
            logger.error("Lỗi lấy giá %s: %s", ticker, exc)
            return PriceHistory(ticker=ticker, candles=[])

        candles = []
        for _, row in df.sort_values("time", ascending=False).iterrows():
            try:
                candles.append(OHLCV(
                    date=row["time"].date() if hasattr(row["time"], "date") else date.fromisoformat(str(row["time"])[:10]),
                    open=float(row.get("open", 0)),
                    high=float(row.get("high", 0)),
                    low=float(row.get("low", 0)),
                    close=float(row.get("close", 0)),
                    volume=int(row.get("volume", 0)),
                ))
            except Exception:
                continue

        self._cache.set("price_history", cache_key, [c.model_dump() for c in candles])
        return PriceHistory(ticker=ticker, candles=candles)

    def get_current_price(self, ticker: str) -> Optional[float]:
        ticker = ticker.upper()
        cached = self._cache.get("price_current", ticker)
        if cached is not None:
            return float(cached)

        history = self.get_price_history(ticker, days=5)
        price = history.current_price
        if price:
            self._cache.set("price_current", ticker, price)
        return price

    # ------------------------------------------------------------------ #
    # Financial Statements                                                 #
    # ------------------------------------------------------------------ #

    def get_financial_statements(
        self,
        ticker: str,
        period: str = "quarter",
        n_periods: int = 8,
    ) -> FinancialStatements:
        ticker = ticker.upper()
        cache_key = f"{ticker}_{period}_{n_periods}"
        cached = self._cache.get("financial", cache_key)
        if cached:
            return FinancialStatements(**cached)

        stock = self._get_vnstock().stock(symbol=ticker, source=self._source)
        statements = FinancialStatements(ticker=ticker)

        # Income Statement
        try:
            income_df = stock.finance.income_statement(period=period, lang="vi")
            statements.income_statements = self._parse_income(income_df, n_periods)
        except Exception as exc:
            logger.warning("Không lấy được income statement %s: %s", ticker, exc)

        # Balance Sheet
        try:
            balance_df = stock.finance.balance_sheet(period=period, lang="vi")
            statements.balance_sheets = self._parse_balance(balance_df, n_periods)
        except Exception as exc:
            logger.warning("Không lấy được balance sheet %s: %s", ticker, exc)

        # Cash Flow
        try:
            cf_df = stock.finance.cash_flow(period=period, lang="vi")
            statements.cash_flow_statements = self._parse_cashflow(cf_df, n_periods)
        except Exception as exc:
            logger.warning("Không lấy được cash flow %s: %s", ticker, exc)

        # Financial Ratios
        try:
            ratio_df = stock.finance.ratio(period=period, lang="vi")
            statements.ratios = self._parse_ratios(ratio_df, n_periods)
        except Exception as exc:
            logger.warning("Không lấy được ratios %s: %s", ticker, exc)

        self._cache.set("financial", cache_key, statements.model_dump())
        return statements

    # ------------------------------------------------------------------ #
    # Market Index                                                         #
    # ------------------------------------------------------------------ #

    def get_index_history(self, index_symbol: str = "VNINDEX", days: int = 365) -> PriceHistory:
        cache_key = f"{index_symbol}_{days}d"
        cached = self._cache.get("index", cache_key)
        if cached:
            return PriceHistory(ticker=index_symbol, candles=[OHLCV(**c) for c in cached])

        end = date.today()
        start = end - timedelta(days=days + 60)

        try:
            index_stock = self._get_vnstock().stock(symbol=index_symbol, source="TCBS")
            df = index_stock.quote.history(
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                interval="1D",
            )
        except Exception as exc:
            logger.error("Lỗi lấy chỉ số %s: %s", index_symbol, exc)
            return PriceHistory(ticker=index_symbol, candles=[])

        candles = []
        for _, row in df.sort_values("time", ascending=False).iterrows():
            try:
                candles.append(OHLCV(
                    date=row["time"].date() if hasattr(row["time"], "date") else date.fromisoformat(str(row["time"])[:10]),
                    open=float(row.get("open", 0)),
                    high=float(row.get("high", 0)),
                    low=float(row.get("low", 0)),
                    close=float(row.get("close", 0)),
                    volume=int(row.get("volume", 0)),
                ))
            except Exception:
                continue

        self._cache.set("index", cache_key, [c.model_dump() for c in candles])
        return PriceHistory(ticker=index_symbol, candles=candles)

    # ------------------------------------------------------------------ #
    # Private parsers                                                      #
    # ------------------------------------------------------------------ #

    def _parse_income(self, df, n: int) -> list[IncomeStatement]:
        results = []
        for _, row in df.head(n).iterrows():
            try:
                period_label = self._period_label(row)
                eps_raw = row.get("EPS", row.get("eps", row.get("lãi cơ bản trên cổ phiếu", None)))
                results.append(IncomeStatement(
                    period=period_label,
                    revenue=float(row.get("revenue", row.get("doanh thu thuần", row.get("net revenue", 0))) or 0),
                    gross_profit=self._safe_float(row.get("gross profit", row.get("lợi nhuận gộp"))),
                    operating_income=self._safe_float(row.get("operating profit", row.get("lợi nhuận từ hoạt động kinh doanh"))),
                    net_income=float(row.get("net income", row.get("lợi nhuận sau thuế", row.get("profit after tax", 0))) or 0),
                    eps=self._safe_float(eps_raw),
                    interest_expense=self._safe_float(row.get("interest expense", row.get("chi phí lãi vay"))),
                ))
            except Exception as exc:
                logger.debug("Bỏ qua dòng income statement lỗi: %s", exc)
        return results

    def _parse_balance(self, df, n: int) -> list[BalanceSheet]:
        results = []
        for _, row in df.head(n).iterrows():
            try:
                total_debt = (
                    float(row.get("short term debt", row.get("vay ngắn hạn", 0)) or 0)
                    + float(row.get("long term debt", row.get("vay dài hạn", 0)) or 0)
                )
                results.append(BalanceSheet(
                    period=self._period_label(row),
                    total_assets=float(row.get("total assets", row.get("tổng tài sản", 0)) or 0),
                    total_equity=float(row.get("owner equity", row.get("vốn chủ sở hữu", 0)) or 0),
                    total_debt=total_debt,
                    cash_and_equivalents=float(row.get("cash", row.get("tiền và tương đương tiền", 0)) or 0),
                    current_assets=self._safe_float(row.get("current assets", row.get("tài sản ngắn hạn"))),
                    current_liabilities=self._safe_float(row.get("current liabilities", row.get("nợ ngắn hạn"))),
                    book_value_per_share=self._safe_float(row.get("book value per share", row.get("BVPS"))),
                ))
            except Exception as exc:
                logger.debug("Bỏ qua dòng balance sheet lỗi: %s", exc)
        return results

    def _parse_cashflow(self, df, n: int) -> list[CashFlowStatement]:
        results = []
        for _, row in df.head(n).iterrows():
            try:
                ocf = float(row.get("operating cash flow", row.get("lưu chuyển tiền từ hoạt động kinh doanh", 0)) or 0)
                capex = float(row.get("capital expenditure", row.get("mua tài sản cố định", 0)) or 0)
                if capex > 0:
                    capex = -capex  # chuẩn hóa: capex luôn âm
                results.append(CashFlowStatement(
                    period=self._period_label(row),
                    operating_cash_flow=ocf,
                    capital_expenditure=capex,
                    free_cash_flow=ocf + capex,
                    investing_cash_flow=self._safe_float(row.get("investing cash flow", row.get("lưu chuyển tiền từ hoạt động đầu tư"))),
                    financing_cash_flow=self._safe_float(row.get("financing cash flow", row.get("lưu chuyển tiền từ hoạt động tài chính"))),
                    dividends_paid=self._safe_float(row.get("dividends paid", row.get("trả cổ tức"))),
                ))
            except Exception as exc:
                logger.debug("Bỏ qua dòng cash flow lỗi: %s", exc)
        return results

    def _parse_ratios(self, df, n: int) -> list[FinancialRatios]:
        results = []
        for _, row in df.head(n).iterrows():
            try:
                results.append(FinancialRatios(
                    period=self._period_label(row),
                    pe_ratio=self._safe_float(row.get("P/E", row.get("pe"))),
                    pb_ratio=self._safe_float(row.get("P/B", row.get("pb"))),
                    roe=self._safe_float(row.get("ROE", row.get("roe"))),
                    roa=self._safe_float(row.get("ROA", row.get("roa"))),
                    gross_margin=self._safe_float(row.get("gross margin", row.get("biên lợi nhuận gộp"))),
                    net_margin=self._safe_float(row.get("net margin", row.get("biên lợi nhuận ròng"))),
                    debt_to_equity=self._safe_float(row.get("D/E", row.get("debt to equity"))),
                    current_ratio=self._safe_float(row.get("current ratio", row.get("tỷ lệ thanh khoản hiện thời"))),
                ))
            except Exception as exc:
                logger.debug("Bỏ qua dòng ratio lỗi: %s", exc)
        return results

    def _period_label(self, row) -> str:
        year = row.get("yearReport", row.get("year", ""))
        quarter = row.get("lengthReport", row.get("quarter", ""))
        if year and quarter and str(quarter) != "0":
            return f"{year}-Q{quarter}"
        if year:
            return str(year)
        return "N/A"

    def _detect_exchange(self, ticker: str) -> Exchange:
        try:
            listing = self._get_vnstock().stock(symbol=ticker, source=self._source).listing
            info = listing.symbols_by_exchange()
            for _, row in info.iterrows():
                if row.get("symbol", "").upper() == ticker:
                    ex = str(row.get("exchange", "")).upper()
                    if ex in ("HOSE", "HSX"):
                        return Exchange.HOSE
                    if ex == "HNX":
                        return Exchange.HNX
                    if ex == "UPCOM":
                        return Exchange.UPCOM
        except Exception:
            pass
        return Exchange.HOSE  # mặc định

    @staticmethod
    def _safe_float(val) -> Optional[float]:
        try:
            if val is None or (isinstance(val, float) and val != val):
                return None
            return float(val)
        except (TypeError, ValueError):
            return None
