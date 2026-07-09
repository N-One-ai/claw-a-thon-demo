from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd

from ._utils import vnstock_call
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

# VCI source returns prices in thousands of VND — multiply to get full VND
_VCI_PRICE_SCALE = 1_000

# Financial statement values are in raw VND — divide to get tỷ VND
_BILLION = 1_000_000_000

# Sector keyword mapping — handles both Vietnamese and English names from vnstock 4.x
_SECTOR_MAP: list[tuple[str, Sector]] = [
    ("bank", Sector.BANKING),
    ("ngân hàng", Sector.BANKING),
    ("real estate", Sector.REAL_ESTATE),
    ("bất động sản", Sector.REAL_ESTATE),
    ("technology", Sector.TECHNOLOGY),
    ("công nghệ", Sector.TECHNOLOGY),
    ("software", Sector.TECHNOLOGY),
    ("phần mềm", Sector.TECHNOLOGY),
    ("consumer staple", Sector.CONSUMER_STAPLES),
    ("hàng tiêu dùng thiết yếu", Sector.CONSUMER_STAPLES),
    ("consumer discretionary", Sector.CONSUMER_DISCRETIONARY),
    ("hàng tiêu dùng không thiết yếu", Sector.CONSUMER_DISCRETIONARY),
    ("retail", Sector.CONSUMER_DISCRETIONARY),
    ("bán lẻ", Sector.CONSUMER_DISCRETIONARY),
    ("industrial", Sector.INDUSTRIALS),
    ("công nghiệp", Sector.INDUSTRIALS),
    ("material", Sector.MATERIALS),
    ("vật liệu", Sector.MATERIALS),
    ("steel", Sector.MATERIALS),
    ("thép", Sector.MATERIALS),
    ("energy", Sector.ENERGY),
    ("năng lượng", Sector.ENERGY),
    ("oil", Sector.ENERGY),
    ("dầu", Sector.ENERGY),
    ("utility", Sector.UTILITIES),
    ("tiện ích", Sector.UTILITIES),
    ("electric", Sector.UTILITIES),
    ("điện", Sector.UTILITIES),
    ("health", Sector.HEALTHCARE),
    ("y tế", Sector.HEALTHCARE),
    ("pharma", Sector.HEALTHCARE),
    ("dược", Sector.HEALTHCARE),
    ("financial", Sector.FINANCIALS),
    ("dịch vụ tài chính", Sector.FINANCIALS),
    ("insurance", Sector.FINANCIALS),
    ("bảo hiểm", Sector.FINANCIALS),
    ("securities", Sector.FINANCIALS),
    ("chứng khoán", Sector.FINANCIALS),
]


def _map_sector(*raw_values: Optional[str]) -> Sector:
    """Thử từng giá trị theo thứ tự ưu tiên, trả về Sector enum."""
    for raw in raw_values:
        if not raw:
            continue
        lower = raw.lower().strip()
        for keyword, sector in _SECTOR_MAP:
            if keyword in lower:
                return sector
    return Sector.UNKNOWN


class VnstockClient:
    """
    Wrapper duy nhất cho thư viện vnstock 4.x.
    Toàn bộ dữ liệu thị trường đi qua đây — không import vnstock ở nơi khác.
    Tự động cache kết quả để giảm số lần gọi API.

    Ghi chú về scale dữ liệu:
    - Giá lịch sử từ VCI source: đơn vị nghìn VND → nhân 1.000 để ra VND
    - Giá hiện tại từ company.overview(): đơn vị VND (đã đúng)
    - Báo cáo tài chính: đơn vị VND raw → chia 10⁹ để ra tỷ VND
    - EPS, BVPS: đơn vị VND/cổ phiếu → giữ nguyên
    """

    def __init__(self, cache: Optional[CacheManager] = None, source: str = "VCI") -> None:
        self._cache = cache or CacheManager()
        self._source = source
        self._vn = None   # lazy — khởi tạo lần đầu khi cần

    def _get_vn(self):
        """Lazy init — chỉ import vnstock khi thực sự cần dữ liệu."""
        if self._vn is None:
            try:
                from vnstock import Vnstock
                self._vn = Vnstock()
            except ImportError as exc:
                raise RuntimeError(
                    "Thư viện vnstock chưa được cài. Chạy: pip install vnstock"
                ) from exc
        return self._vn

    def _stock(self, ticker: str):
        """Shortcut tạo stock object cho ticker."""
        with vnstock_call(f"Vnstock.stock/{ticker}"):
            return self._get_vn().stock(symbol=ticker, source=self._source)

    # ------------------------------------------------------------------ #
    # Company Info                                                         #
    # ------------------------------------------------------------------ #

    def get_company_info(self, ticker: str) -> CompanyInfo:
        ticker = ticker.upper()
        cached = self._cache.get("company_info", ticker)
        if cached:
            return CompanyInfo(**cached)

        stock = self._stock(ticker)
        row: dict = {}

        try:
            with vnstock_call("company.overview"):
                overview = stock.company.overview()
            if hasattr(overview, "iloc") and len(overview):
                row = overview.iloc[0].to_dict()
        except Exception as exc:
            logger.warning("Không lấy được overview cho %s: %s", ticker, exc)

        # Shares outstanding: issue_share in vnstock 4.x (full count → millions)
        shares_raw = row.get("issue_share", 0) or 0
        shares_million = float(shares_raw) / 1_000_000 if shares_raw else 1.0

        # Market cap in tỷ VND (overview gives full VND)
        market_cap_raw = row.get("market_cap", 0) or 0
        market_cap_ty = float(market_cap_raw) / _BILLION if market_cap_raw else None

        # Sector detection from multiple fields
        sector = _map_sector(
            str(row.get("sector", "")),
            str(row.get("com_group_code", "")),
        )

        info = CompanyInfo(
            ticker=ticker,
            name=str(row.get("organ_short_name", row.get("organ_name", ticker))),
            exchange=self._detect_exchange(ticker, row),
            sector=sector,
            industry=str(row.get("icb_code_lv4", "")) or None,
            shares_outstanding=max(shares_million, 1.0),
            market_cap=market_cap_ty,
            description=str(row.get("company_profile", "")) or None,
            website=None,  # not available in vnstock 4.x overview
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
        start = end - timedelta(days=days + 60)   # buffer cho ngày nghỉ

        stock = self._stock(ticker)
        try:
            with vnstock_call("quote.history"):
                df = stock.quote.history(
                    start=start.strftime("%Y-%m-%d"),
                    end=end.strftime("%Y-%m-%d"),
                    interval="1D",
                )
        except Exception as exc:
            logger.error("Lỗi lấy giá %s: %s", ticker, exc)
            return PriceHistory(ticker=ticker, candles=[])

        candles = self._df_to_candles(df)
        self._cache.set("price_history", cache_key, [c.model_dump() for c in candles])
        return PriceHistory(ticker=ticker, candles=candles)

    def get_current_price(self, ticker: str) -> Optional[float]:
        """Lấy giá hiện tại — ưu tiên company.overview() (full VND, real-time hơn)."""
        ticker = ticker.upper()
        cached = self._cache.get("price_current", ticker)
        if cached is not None:
            return float(cached)

        # Thử lấy từ overview trước (đã ở đơn vị VND đầy đủ)
        try:
            stock = self._stock(ticker)
            with vnstock_call("company.overview/price"):
                overview = stock.company.overview()
            if hasattr(overview, "iloc") and len(overview):
                price_raw = overview.iloc[0].get("current_price")
                if price_raw and float(price_raw) > 0:
                    price = float(price_raw)
                    self._cache.set("price_current", ticker, price)
                    return price
        except Exception:
            pass

        # Fallback: lấy từ lịch sử giá gần đây
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

        stock = self._stock(ticker)
        statements = FinancialStatements(ticker=ticker)

        try:
            with vnstock_call("finance.income_statement"):
                df = stock.finance.income_statement(period=period, lang="vi")
            statements.income_statements = self._parse_income(df, n_periods)
        except Exception as exc:
            logger.warning("Không lấy được income statement %s: %s", ticker, exc)

        try:
            with vnstock_call("finance.balance_sheet"):
                df = stock.finance.balance_sheet(period=period, lang="vi")
            statements.balance_sheets = self._parse_balance(df, n_periods, ticker)
        except Exception as exc:
            logger.warning("Không lấy được balance sheet %s: %s", ticker, exc)

        try:
            with vnstock_call("finance.cash_flow"):
                df = stock.finance.cash_flow(period=period, lang="vi")
            statements.cash_flow_statements = self._parse_cashflow(df, n_periods)
        except Exception as exc:
            logger.warning("Không lấy được cash flow %s: %s", ticker, exc)

        try:
            with vnstock_call("finance.ratio"):
                df = stock.finance.ratio(period=period, lang="vi")
            statements.ratios = self._parse_ratios(df, n_periods)
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
            # VCI hỗ trợ VNINDEX; giá trị là điểm số (không nhân 1000)
            index_stock = self._get_vn().stock(symbol=index_symbol, source="VCI")
            with vnstock_call(f"index.history/{index_symbol}"):
                df = index_stock.quote.history(
                    start=start.strftime("%Y-%m-%d"),
                    end=end.strftime("%Y-%m-%d"),
                    interval="1D",
                )
            candles = self._df_to_candles(df, price_scale=1.0)
        except Exception as exc:
            logger.error("Lỗi lấy chỉ số %s: %s", index_symbol, exc)
            return PriceHistory(ticker=index_symbol, candles=[])

        self._cache.set("index", cache_key, [c.model_dump() for c in candles])
        return PriceHistory(ticker=index_symbol, candles=candles)

    # ------------------------------------------------------------------ #
    # Private helpers                                                      #
    # ------------------------------------------------------------------ #

    def _df_to_candles(self, df: pd.DataFrame, price_scale: float = _VCI_PRICE_SCALE) -> list[OHLCV]:
        """Chuyển DataFrame giá (time, open, high, low, close, volume) thành danh sách OHLCV.
        price_scale: nhân với giá để chuyển về VND (VCI dùng nghìn VND).
        """
        if df is None or df.empty:
            return []

        # Sắp xếp giảm dần (mới nhất trước)
        if "time" in df.columns:
            df = df.sort_values("time", ascending=False)

        candles = []
        for _, row in df.iterrows():
            try:
                time_val = row.get("time")
                if time_val is None:
                    continue
                if hasattr(time_val, "date"):
                    candle_date = time_val.date()
                else:
                    candle_date = date.fromisoformat(str(time_val)[:10])

                candles.append(OHLCV(
                    date=candle_date,
                    open=self._sf(row.get("open", 0), price_scale),
                    high=self._sf(row.get("high", 0), price_scale),
                    low=self._sf(row.get("low", 0), price_scale),
                    close=self._sf(row.get("close", 0), price_scale),
                    volume=int(row.get("volume", 0) or 0),
                ))
            except Exception as exc:
                logger.debug("Bỏ qua candle lỗi: %s", exc)

        return candles

    @staticmethod
    def _get_item(df_idx: pd.DataFrame, item_id: str, col: str,
                  scale: float = 1.0) -> Optional[float]:
        """Lấy giá trị từ pivoted DataFrame đã index theo item_id."""
        try:
            val = df_idx.loc[item_id, col]
            if pd.isna(val):
                return None
            return float(val) * scale
        except (KeyError, TypeError):
            return None

    def _parse_income(self, df: pd.DataFrame, n: int) -> list[IncomeStatement]:
        """Parse pivoted income statement: rows=items, cols=periods."""
        period_cols = [c for c in df.columns if c not in ("item", "item_en", "item_id")][:n]
        df_idx = df.set_index("item_id")

        results = []
        for col in period_cols:
            def v(item_id: str, scale: float = 1 / _BILLION) -> Optional[float]:
                return self._get_item(df_idx, item_id, col, scale)

            # Revenue: ưu tiên net_sales, fallback sales
            revenue = v("net_sales") or v("sales") or 0.0

            # Net income: net sau thuế → ưu tiên attributable to parent (hợp nhất)
            net_income = (
                v("attributable_to_parent_company")
                or v("net_profit_loss_after_tax")
                or 0.0
            )

            # Interest expense — thường là số âm trong BCTC
            interest_raw = v("interest_expenses") or v("interest_expense")
            interest_expense = abs(interest_raw) if interest_raw is not None else None

            results.append(IncomeStatement(
                period=col,
                revenue=revenue,
                gross_profit=v("gross_profit"),
                operating_income=v("operating_profit_loss"),
                net_income=net_income,
                eps=v("eps_basic_vnd", scale=1.0),   # VND/cổ phiếu — không scale
                interest_expense=interest_expense,
            ))

        return results

    def _parse_balance(self, df: pd.DataFrame, n: int, ticker: str = "") -> list[BalanceSheet]:
        """Parse pivoted balance sheet: rows=items, cols=periods."""
        period_cols = [c for c in df.columns if c not in ("item", "item_en", "item_id")][:n]
        df_idx = df.set_index("item_id")

        # Lấy số cổ phiếu để tính BVPS (nếu không có sẵn)
        shares_million: Optional[float] = None
        if ticker:
            try:
                info = self.get_company_info(ticker)
                shares_million = info.shares_outstanding   # triệu cổ phiếu
            except Exception:
                pass

        results = []
        for col in period_cols:
            def v(item_id: str, scale: float = 1 / _BILLION) -> Optional[float]:
                return self._get_item(df_idx, item_id, col, scale)

            total_equity = v("owners_equity") or 0.0

            # Nợ vay ngắn + dài hạn
            short_debt = v("short_term_borrowings") or 0.0
            long_debt = v("long_term_borrowings") or 0.0
            total_debt = short_debt + long_debt

            # BVPS: tổng VCSH / số cổ phiếu (triệu → đơn vị)
            bvps: Optional[float] = None
            if shares_million and shares_million > 0:
                equity_vnd = (v("owners_equity", scale=1.0) or 0)
                bvps = equity_vnd / (shares_million * 1_000_000)

            results.append(BalanceSheet(
                period=col,
                total_assets=v("total_assets") or 0.0,
                total_equity=total_equity,
                total_debt=total_debt,
                cash_and_equivalents=v("cash_and_cash_equivalents") or 0.0,
                current_assets=v("current_assets"),
                current_liabilities=v("current_liabilities"),
                book_value_per_share=bvps,
            ))

        return results

    def _parse_cashflow(self, df: pd.DataFrame, n: int) -> list[CashFlowStatement]:
        """Parse pivoted cash flow: rows=items, cols=periods."""
        period_cols = [c for c in df.columns if c not in ("item", "item_en", "item_id")][:n]
        df_idx = df.set_index("item_id")

        results = []
        for col in period_cols:
            def v(item_id: str, scale: float = 1 / _BILLION) -> Optional[float]:
                return self._get_item(df_idx, item_id, col, scale)

            ocf = v("net_cash_inflows_outflows_from_operating_activities") or 0.0
            # Capex là chi tiêu → luôn âm
            capex_raw = v("purchases_of_fixed_assets_and_other_long_term_assets")
            capex = (-abs(capex_raw)) if capex_raw is not None else 0.0

            results.append(CashFlowStatement(
                period=col,
                operating_cash_flow=ocf,
                capital_expenditure=capex,
                free_cash_flow=ocf + capex,
                investing_cash_flow=v("net_cash_inflows_outflows_from_investing_activities"),
                financing_cash_flow=v("net_cash_inflows_outflows_from_financing_activities"),
                dividends_paid=v("dividends_paid"),
            ))

        return results

    def _parse_ratios(self, df: pd.DataFrame, n: int) -> list[FinancialRatios]:
        """Parse pivoted ratio data: rows=items, cols=periods."""
        period_cols = [c for c in df.columns if c not in ("item", "item_en", "item_id")][:n]
        df_idx = df.set_index("item_id")

        results = []
        for col in period_cols:
            def v(item_id: str) -> Optional[float]:
                return self._get_item(df_idx, item_id, col, scale=1.0)

            try:
                results.append(FinancialRatios(
                    period=col,
                    pe_ratio=v("pe_ratio"),
                    pb_ratio=v("pb_ratio"),
                    roe=v("roe"),
                    roa=v("roa"),
                    gross_margin=v("gross_margin"),
                    net_margin=v("net_margin"),
                    debt_to_equity=v("debt_to_equity"),
                    current_ratio=v("current_ratio"),
                ))
            except Exception as exc:
                logger.debug("Bỏ qua ratio period %s: %s", col, exc)

        return results

    def _detect_exchange(self, ticker: str, overview_row: dict) -> Exchange:
        """Xác định sàn từ dữ liệu overview hoặc listing API."""
        # Thử từ com_group_code trong overview
        group = str(overview_row.get("com_group_code", "")).upper()
        if "HNXINDEX" in group or group == "HNX":
            return Exchange.HNX
        if "UPCOM" in group:
            return Exchange.UPCOM
        if "VNINDEX" in group or "VN30" in group or "HOSE" in group or "HSX" in group:
            return Exchange.HOSE

        # Fallback: thử listing API
        try:
            listing = self._get_vn().stock(symbol=ticker, source=self._source).listing
            info = listing.symbols_by_exchange()
            if hasattr(info, "iterrows"):
                for _, row in info.iterrows():
                    if str(row.get("symbol", "")).upper() == ticker:
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
    def _sf(val, scale: float = 1.0) -> float:
        """Safe float conversion with optional scale."""
        try:
            return float(val or 0) * scale
        except (TypeError, ValueError):
            return 0.0
