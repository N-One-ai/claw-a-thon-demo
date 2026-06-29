from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .company import CompanyInfo, FinancialRatios, FinancialStatements
from .price import PriceHistory
from .risk import RiskProfile, TechnicalSignal
from .valuation import ValuationResults


class NewsItem(BaseModel):
    title: str
    source: str
    published_at: Optional[datetime] = None
    url: Optional[str] = None
    snippet: Optional[str] = None
    sentiment_score: Optional[float] = Field(None, description="-1 (rất tiêu cực) đến +1 (rất tích cực)")


class NewsSentiment(BaseModel):
    ticker: str
    news_items: list[NewsItem] = Field(default_factory=list)
    overall_score: float = Field(0.0, description="Tổng điểm sentiment")
    overall_label: str = "Trung lập"       # "Tích cực", "Trung lập", "Tiêu cực"
    key_events: list[str] = Field(default_factory=list)


class AnalysisRequest(BaseModel):
    """Đầu vào cho agent từ user."""
    ticker: str
    include_news: bool = True
    scenario_probabilities: dict[str, float] = Field(
        default_factory=lambda: {"Bi quan": 0.30, "Cơ sở": 0.50, "Lạc quan": 0.20}
    )
    custom_growth_rate: Optional[float] = None
    custom_wacc: Optional[float] = None
    language: str = "vi"


class AnalysisReport(BaseModel):
    """Báo cáo phân tích đầy đủ — output của toàn bộ pipeline."""
    ticker: str
    generated_at: datetime = Field(default_factory=datetime.now)

    company_info: CompanyInfo
    financial_statements: FinancialStatements
    latest_ratios: Optional[FinancialRatios] = None
    price_history: PriceHistory

    valuation: ValuationResults
    technical: TechnicalSignal
    risk: RiskProfile
    news: Optional[NewsSentiment] = None

    summary: Optional[str] = Field(None, description="Tóm tắt tiếng Việt do Claude tạo")
    investment_thesis: Optional[str] = None
    key_risks_text: Optional[str] = None

    @property
    def one_liner(self) -> str:
        """Một dòng tóm tắt ngắn gọn cho terminal header."""
        label = self.valuation.label.value
        discount = self.valuation.discount_pct
        direction = "chiết khấu" if discount > 0 else "premium"
        return (
            f"{self.ticker} | {self.company_info.name} | "
            f"Giá: {self.valuation.current_price:,.0f} VND | "
            f"Fair Value: {self.valuation.consensus_value:,.0f} VND | "
            f"{abs(discount):.1f}% {direction} | {label}"
        )
