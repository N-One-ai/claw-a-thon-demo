"""
schemas.py — Container StockData và DataFetcher facade.

DataFetcher kết hợp MarketDataFetcher + FinancialDataFetcher + CompanyDataFetcher
thành một điểm truy cập duy nhất.

Sử dụng:
    fetcher = DataFetcher(cache_dir=".cache", source="VCI")
    data = fetcher.fetch_all("FPT")
    print(data.company.name, data.current_price)
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .cache import CacheManager
from .company import CompanyDataFetcher
from .financials import FinancialDataFetcher
from .market import MarketDataFetcher
from .models import CompanyInfo, FinancialStatements, PriceHistory

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ #
# StockData — bundle đầy đủ dữ liệu một mã                            #
# ------------------------------------------------------------------ #

class StockData(BaseModel):
    """Toàn bộ dữ liệu thô cho một mã cổ phiếu — đầu vào cho analysis layer."""

    ticker: str
    company: CompanyInfo
    statements: FinancialStatements
    price_history: PriceHistory
    current_price: Optional[float] = None
    fetched_at: datetime = Field(default_factory=datetime.now)

    @property
    def shares_million(self) -> float:
        """Số lượng cổ phiếu lưu hành (triệu cổ)."""
        return self.company.shares_outstanding

    @property
    def market_cap_ty(self) -> Optional[float]:
        """Vốn hóa thị trường (tỷ VND)."""
        if self.current_price and self.shares_million:
            return round(self.current_price * self.shares_million / 1_000, 2)
        return None

    model_config = ConfigDict(arbitrary_types_allowed=True)


# ------------------------------------------------------------------ #
# DataFetcher — facade duy nhất cho toàn bộ data layer                 #
# ------------------------------------------------------------------ #

class DataFetcher:
    """
    Facade kết hợp tất cả các fetcher chuyên biệt.
    Một lần gọi fetch_all(ticker) → StockData đầy đủ, cache sẵn cho analysis.
    """

    def __init__(
        self,
        cache_dir: str = ".cache",
        source: str = "VCI",
        n_periods: int = 20,
        price_years: int = 5,
    ) -> None:
        cache = CacheManager(cache_dir=cache_dir)
        self._market    = MarketDataFetcher(cache=cache, source=source)
        self._financials = FinancialDataFetcher(
            cache=cache, source=source, n_periods=n_periods
        )
        self._company   = CompanyDataFetcher(cache=cache, source=source)
        self._price_years = price_years

    # ------------------------------------------------------------------ #
    # Primary interface                                                     #
    # ------------------------------------------------------------------ #

    def fetch_all(self, ticker: str) -> StockData:
        """
        Lấy toàn bộ dữ liệu cho một mã cổ phiếu.

        Thứ tự: company info → price history → financial statements.
        Mỗi bước lỗi riêng lẻ sẽ được log nhưng không làm dừng toàn bộ.
        """
        ticker = ticker.upper()
        logger.info("[DataFetcher] Bắt đầu fetch %s", ticker)

        company = self._safe_fetch(
            f"company_info({ticker})",
            lambda: self._company.get_company_info(ticker),
            fallback=CompanyInfo(
                ticker=ticker,
                name=ticker,
                exchange=__import__(
                    "src.data.models", fromlist=["Exchange"]
                ).Exchange.HOSE,
                shares_outstanding=1.0,
            ),
        )

        price_history = self._safe_fetch(
            f"price_history({ticker})",
            lambda: self._market.get_price_history(ticker, years=self._price_years),
            fallback=PriceHistory(ticker=ticker, candles=[]),
        )

        current_price = self._safe_fetch(
            f"current_price({ticker})",
            lambda: price_history.current_price or self._market.get_current_price(ticker),
            fallback=None,
        )

        statements = self._safe_fetch(
            f"financials({ticker})",
            lambda: self._financials.get_all(ticker),
            fallback=FinancialStatements(ticker=ticker),
        )

        # Cập nhật market_cap nếu có giá
        if current_price and company.market_cap is None:
            object.__setattr__(company, "market_cap",
                               round(current_price * company.shares_outstanding / 1_000, 2))

        data = StockData(
            ticker=ticker,
            company=company,
            statements=statements,
            price_history=price_history,
            current_price=current_price,
        )
        logger.info(
            "[DataFetcher] Hoàn thành %s | giá=%.0f | kỳ tài chính=%d",
            ticker,
            current_price or 0,
            len(statements.income_statements),
        )
        return data

    # ------------------------------------------------------------------ #
    # Individual fetchers (có thể dùng riêng lẻ)                           #
    # ------------------------------------------------------------------ #

    def get_company(self, ticker: str) -> CompanyInfo:
        return self._company.get_company_info(ticker.upper())

    def get_price_history(self, ticker: str, years: int = 5) -> PriceHistory:
        return self._market.get_price_history(ticker.upper(), years=years)

    def get_current_price(self, ticker: str) -> Optional[float]:
        return self._market.get_current_price(ticker.upper())

    def get_statements(self, ticker: str) -> FinancialStatements:
        return self._financials.get_all(ticker.upper())

    def get_shareholders(self, ticker: str) -> list[dict]:
        return self._company.get_shareholders(ticker.upper())

    def get_officers(self, ticker: str) -> list[dict]:
        return self._company.get_officers(ticker.upper())

    def get_events(self, ticker: str) -> list[dict]:
        return self._company.get_events(ticker.upper())

    def get_dividends(self, ticker: str) -> list[dict]:
        return self._company.get_dividends(ticker.upper())

    def get_index_history(
        self, index_symbol: str = "VNINDEX", years: int = 1
    ) -> PriceHistory:
        return self._market.get_index_history(index_symbol, years=years)

    # ------------------------------------------------------------------ #
    # Helper                                                                #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _safe_fetch(label: str, fn, fallback):
        try:
            return fn()
        except Exception as exc:
            logger.error("[DataFetcher] %s thất bại: %s", label, exc)
            return fallback
