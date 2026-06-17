"""
schemas.py — Container StockData và DataFetcher facade.

DataFetcher là điểm truy cập duy nhất cho toàn bộ data layer.
Tất cả calls vnstock đều đi qua VnstockClient (một wrapper duy nhất).

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
from .models import CompanyInfo, Exchange, FinancialStatements, PriceHistory, Sector
from .vnstock_client import VnstockClient

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

    model_config = ConfigDict(arbitrary_types_allowed=True)

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


# ------------------------------------------------------------------ #
# DataFetcher — facade duy nhất cho toàn bộ data layer                 #
# ------------------------------------------------------------------ #

class DataFetcher:
    """
    Facade kết hợp tất cả dữ liệu thông qua VnstockClient.
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
        self._client = VnstockClient(cache=cache, source=source)
        self._n_periods = n_periods
        self._price_years = price_years

    # ------------------------------------------------------------------ #
    # Primary interface                                                     #
    # ------------------------------------------------------------------ #

    def fetch_all(self, ticker: str) -> StockData:
        """
        Lấy toàn bộ dữ liệu cho một mã cổ phiếu.

        Thứ tự: company info → price history → current price → financial statements.
        Mỗi bước lỗi riêng lẻ được log nhưng không làm dừng toàn bộ.
        """
        ticker = ticker.upper()
        logger.info("[DataFetcher] Bắt đầu fetch %s", ticker)

        _fallback_company = CompanyInfo(
            ticker=ticker,
            name=ticker,
            exchange=Exchange.HOSE,
            sector=Sector.UNKNOWN,
            shares_outstanding=1.0,
        )

        company = self._safe_fetch(
            f"company_info({ticker})",
            lambda: self._client.get_company_info(ticker),
            fallback=_fallback_company,
        )

        price_history = self._safe_fetch(
            f"price_history({ticker})",
            lambda: self._client.get_price_history(ticker, days=self._price_years * 365),
            fallback=PriceHistory(ticker=ticker, candles=[]),
        )

        current_price = self._safe_fetch(
            f"current_price({ticker})",
            lambda: self._client.get_current_price(ticker),
            fallback=price_history.current_price,
        )

        statements = self._safe_fetch(
            f"financials({ticker})",
            lambda: self._client.get_financial_statements(
                ticker, n_periods=self._n_periods
            ),
            fallback=FinancialStatements(ticker=ticker),
        )

        # Cập nhật market_cap nếu chưa có
        if current_price and company.market_cap is None:
            try:
                object.__setattr__(
                    company, "market_cap",
                    round(current_price * company.shares_outstanding / 1_000, 2),
                )
            except Exception:
                pass

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
        return self._client.get_company_info(ticker.upper())

    def get_price_history(self, ticker: str, years: int = 5) -> PriceHistory:
        return self._client.get_price_history(ticker.upper(), days=years * 365)

    def get_current_price(self, ticker: str) -> Optional[float]:
        return self._client.get_current_price(ticker.upper())

    def get_statements(self, ticker: str) -> FinancialStatements:
        return self._client.get_financial_statements(ticker.upper(), n_periods=self._n_periods)

    def get_index_history(
        self, index_symbol: str = "VNINDEX", years: int = 1
    ) -> PriceHistory:
        return self._client.get_index_history(index_symbol, days=years * 365)

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
