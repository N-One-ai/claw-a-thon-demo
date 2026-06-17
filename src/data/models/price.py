from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class OHLCV(BaseModel):
    """Một phiên giao dịch."""
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int


class PriceHistory(BaseModel):
    """Lịch sử giá của một mã chứng khoán."""
    ticker: str
    candles: list[OHLCV] = Field(default_factory=list)

    @property
    def current_price(self) -> Optional[float]:
        return self.candles[0].close if self.candles else None

    @property
    def closes(self) -> list[float]:
        return [c.close for c in self.candles]

    @property
    def volumes(self) -> list[int]:
        return [c.volume for c in self.candles]

    @property
    def high_52w(self) -> Optional[float]:
        if not self.candles:
            return None
        last_252 = self.candles[:252]
        return max(c.high for c in last_252)

    @property
    def low_52w(self) -> Optional[float]:
        if not self.candles:
            return None
        last_252 = self.candles[:252]
        return min(c.low for c in last_252)

    @property
    def position_52w(self) -> Optional[float]:
        """Vị trí giá hiện tại trong vùng 52 tuần (0% = đáy, 100% = đỉnh)."""
        high = self.high_52w
        low = self.low_52w
        price = self.current_price
        if high is None or low is None or price is None:
            return None
        if high == low:
            return 100.0
        return round((price - low) / (high - low) * 100, 1)

    def sma(self, period: int) -> Optional[float]:
        """Simple moving average của `period` phiên gần nhất."""
        if len(self.candles) < period:
            return None
        return sum(c.close for c in self.candles[:period]) / period


class MarketIndex(BaseModel):
    """Chỉ số thị trường (VN-Index, HNX-Index...)."""
    name: str
    history: PriceHistory
