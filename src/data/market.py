"""
MarketDataFetcher — lấy giá cổ phiếu và chỉ số thị trường qua vnstock.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from .cache import CacheManager
from ._utils import find_col, safe_float, safe_int, to_date, with_retry, years_ago
from .models import OHLCV, PriceHistory

logger = logging.getLogger(__name__)


class MarketDataFetcher:
    """
    Lấy dữ liệu giá (OHLCV) từ vnstock.
    Mọi dữ liệu giá đi qua đây — không import vnstock ở module khác.
    """

    def __init__(
        self,
        cache: Optional[CacheManager] = None,
        source: str = "VCI",
    ) -> None:
        self._cache = cache or CacheManager()
        self._source = source
        self._vn: Optional[object] = None   # lazy init

    # ------------------------------------------------------------------ #
    # Public API                                                            #
    # ------------------------------------------------------------------ #

    def get_current_price(self, ticker: str) -> Optional[float]:
        """Giá hiện tại (VND). Dùng cache ngắn hạn (15 phút)."""
        ticker = ticker.upper()
        cached = self._cache.get("price_current", ticker)
        if cached is not None:
            return float(cached)

        history = self.get_price_history(ticker, years=0, days=7)
        price = history.current_price
        if price:
            self._cache.set("price_current", ticker, price)
        return price

    def get_price_history(
        self,
        ticker: str,
        years: int = 5,
        days: int = 0,
    ) -> PriceHistory:
        """
        Lịch sử OHLCV. Candles được sắp xếp mới nhất trước (index 0 = hôm nay).

        Args:
            ticker: Mã cổ phiếu (VD: FPT).
            years: Số năm lịch sử (ưu tiên nếu >0).
            days:  Số ngày lịch sử (dùng khi years=0).
        """
        ticker = ticker.upper()
        span = f"{years}y" if years > 0 else f"{days}d"
        cache_key = f"{ticker}_{span}"

        cached = self._cache.get("price_history", cache_key)
        if cached:
            candles = [OHLCV(**c) for c in cached]
            return PriceHistory(ticker=ticker, candles=candles)

        if years > 0:
            start = years_ago(years)
        else:
            from datetime import timedelta
            start = date.today() - timedelta(days=days + 10)
        end = date.today()

        candles = self._fetch_ohlcv(ticker, start, end)
        if candles:
            self._cache.set("price_history", cache_key, [c.model_dump() for c in candles])
        return PriceHistory(ticker=ticker, candles=candles)

    def get_index_history(
        self,
        index_symbol: str = "VNINDEX",
        years: int = 1,
    ) -> PriceHistory:
        """Lịch sử chỉ số (VNINDEX, HNXINDEX...). Dùng TCBS source."""
        cache_key = f"{index_symbol}_{years}y"
        cached = self._cache.get("index", cache_key)
        if cached:
            return PriceHistory(ticker=index_symbol, candles=[OHLCV(**c) for c in cached])

        start = years_ago(years)
        end = date.today()
        candles = self._fetch_ohlcv(index_symbol, start, end, source_override="TCBS")
        if candles:
            self._cache.set("index", cache_key, [c.model_dump() for c in candles])
        return PriceHistory(ticker=index_symbol, candles=candles)

    # ------------------------------------------------------------------ #
    # Private                                                               #
    # ------------------------------------------------------------------ #

    def _get_vn(self):
        if self._vn is None:
            try:
                from vnstock import Vnstock
                self._vn = Vnstock()
            except ImportError as exc:
                raise RuntimeError(
                    "vnstock chưa được cài. Chạy: pip install vnstock"
                ) from exc
        return self._vn

    @with_retry(max_attempts=3, initial_delay=1.0, exceptions=(Exception,))
    def _fetch_ohlcv(
        self,
        symbol: str,
        start: date,
        end: date,
        source_override: Optional[str] = None,
    ) -> list[OHLCV]:
        source = source_override or self._source
        stock = self._get_vn().stock(symbol=symbol, source=source)
        df = stock.quote.history(
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            interval="1D",
        )
        if df is None or df.empty:
            return []

        # Cột thời gian có thể là "time", "date", "Date", "tradingDate"
        time_col = find_col(df, "time", "date", "Date", "tradingDate", "trading_date")
        open_col  = find_col(df, "open", "Open", "openPrice")
        high_col  = find_col(df, "high", "High", "highPrice")
        low_col   = find_col(df, "low",  "Low",  "lowPrice")
        close_col = find_col(df, "close", "Close", "closePrice", "matchPrice")
        vol_col   = find_col(df, "volume", "Volume", "matchVolume", "dealVolume")

        if time_col is None or close_col is None:
            logger.warning("[Market] Không tìm thấy cột time/close trong %s", symbol)
            return []

        candles: list[OHLCV] = []
        df_sorted = df.copy()
        df_sorted["_time"] = time_col.values
        df_sorted = df_sorted.sort_values("_time", ascending=False)

        for idx in range(len(df_sorted)):
            try:
                d = to_date(df_sorted["_time"].iloc[idx])
                if d is None:
                    continue
                o = safe_float(open_col.iloc[idx] if open_col is not None else None) or 0.0
                h = safe_float(high_col.iloc[idx] if high_col is not None else None) or 0.0
                lo = safe_float(low_col.iloc[idx]  if low_col  is not None else None) or 0.0
                c = safe_float(close_col.iloc[idx])
                v = safe_int(vol_col.iloc[idx] if vol_col is not None else None) or 0
                if c is None or c <= 0:
                    continue
                candles.append(OHLCV(date=d, open=o, high=h, low=lo, close=c, volume=v))
            except Exception as exc:
                logger.debug("[Market] Bỏ qua phiên lỗi (%s): %s", symbol, exc)
                continue

        return candles
