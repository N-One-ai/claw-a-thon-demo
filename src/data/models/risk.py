from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    LOW = "Thấp"
    MEDIUM = "Trung bình"
    HIGH = "Cao"
    VERY_HIGH = "Rất cao"


class RiskFlagType(str, Enum):
    HIGH_LEVERAGE = "Đòn bẩy cao"
    NEGATIVE_COVERAGE = "Không đủ khả năng trả lãi"
    HIGH_BETA = "Biến động cao hơn thị trường"
    EARNINGS_INSTABILITY = "Lợi nhuận không ổn định"
    NEGATIVE_FCF = "Dòng tiền tự do âm"
    DECLINING_REVENUE = "Doanh thu suy giảm"
    LOW_LIQUIDITY = "Thanh khoản cổ phiếu thấp"
    CONCENTRATION_RISK = "Rủi ro tập trung"


class RiskFlag(BaseModel):
    flag_type: RiskFlagType
    severity: RiskLevel
    description: str
    metric_value: Optional[float] = None
    threshold: Optional[float] = None


class TechnicalSignal(BaseModel):
    """Kết quả phân tích kỹ thuật."""
    current_price: float

    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None

    rsi_14: Optional[float] = None
    rsi_label: Optional[str] = None        # "Quá mua", "Trung lập", "Quá bán"

    macd_line: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    macd_label: Optional[str] = None       # "Mua", "Bán", "Chờ"

    volume_trend: Optional[str] = None     # "Tăng", "Giảm", "Trung lập"
    price_trend: Optional[str] = None      # "Tăng mạnh", "Tích lũy", "Giảm"

    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    position_52w_pct: Optional[float] = None


class RiskProfile(BaseModel):
    """Hồ sơ rủi ro tổng hợp của cổ phiếu."""
    ticker: str
    beta: Optional[float] = None
    annualized_volatility_pct: Optional[float] = None
    debt_to_equity: Optional[float] = None
    interest_coverage: Optional[float] = None
    earnings_stability: Optional[str] = None   # "Cao", "Trung bình", "Thấp"
    avg_daily_volume: Optional[int] = None

    flags: list[RiskFlag] = Field(default_factory=list)
    overall_risk: RiskLevel = RiskLevel.MEDIUM
    risk_summary: Optional[str] = None
