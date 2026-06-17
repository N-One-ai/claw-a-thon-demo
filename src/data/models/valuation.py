from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ValuationLabel(str, Enum):
    VERY_ATTRACTIVE = "Rất hấp dẫn"    # discount > 30%
    ATTRACTIVE = "Hấp dẫn"              # discount 15–30%
    NEUTRAL = "Trung lập"               # ±15%
    EXPENSIVE = "Đắt"                   # premium 15–30%
    VERY_EXPENSIVE = "Rất đắt"          # premium > 30%


class ModelResult(BaseModel):
    """Kết quả từ một mô hình định giá đơn lẻ."""
    model_name: str
    fair_value: Optional[float] = None
    is_available: bool = True
    unavailable_reason: Optional[str] = None
    weight: float = Field(0.0, description="Trọng số trong consensus (0–1)")
    inputs: dict = Field(default_factory=dict, description="Các đầu vào đã dùng")


class DCFScenario(BaseModel):
    """Một kịch bản DCF."""
    name: str                     # "Bi quan", "Cơ sở", "Lạc quan"
    growth_rate: float            # Tốc độ tăng trưởng FCF (%)
    terminal_growth: float        # Tăng trưởng cuối kỳ (%)
    wacc: float                   # Chi phí vốn bình quân (%)
    fair_value: float
    probability: float            # Xác suất xảy ra (0–1, tổng 3 kịch bản = 1)


class EarningsYieldResult(BaseModel):
    earnings_yield: float         # EPS / Price × 100 (%)
    risk_free_rate: float         # Lợi suất TP Chính phủ 10Y (%)
    spread: float                 # EY - risk_free_rate (%)
    is_attractive: bool           # spread > 3% = hấp dẫn


class ValuationResults(BaseModel):
    """Kết quả đầy đủ từ tất cả 5 mô hình + consensus."""
    ticker: str
    current_price: float

    pe_result: ModelResult
    pb_result: ModelResult
    graham_result: ModelResult
    dcf_result: ModelResult
    earnings_yield: EarningsYieldResult

    consensus_value: float
    discount_pct: float = Field(..., description="% chiết khấu vs giá hiện tại. Âm = đang đắt")
    label: ValuationLabel

    scenarios: list[DCFScenario] = Field(default_factory=list)
    probability_weighted_value: Optional[float] = None

    @property
    def is_discounted(self) -> bool:
        return self.discount_pct > 0

    @property
    def upside_pct(self) -> float:
        """% tăng tiềm năng từ giá hiện tại đến fair value."""
        return round((self.consensus_value - self.current_price) / self.current_price * 100, 1)
