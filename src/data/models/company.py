from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Exchange(str, Enum):
    HOSE = "HOSE"
    HNX = "HNX"
    UPCOM = "UPCOM"
    NYSE = "NYSE"
    NASDAQ = "NASDAQ"


class Sector(str, Enum):
    BANKING = "banking"
    REAL_ESTATE = "real_estate"
    TECHNOLOGY = "technology"
    CONSUMER_STAPLES = "consumer_staples"
    CONSUMER_DISCRETIONARY = "consumer_discretionary"
    INDUSTRIALS = "industrials"
    MATERIALS = "materials"
    ENERGY = "energy"
    UTILITIES = "utilities"
    HEALTHCARE = "healthcare"
    FINANCIALS = "financials"
    UNKNOWN = "unknown"


class CompanyInfo(BaseModel):
    ticker: str
    name: str
    exchange: Exchange
    sector: Sector = Sector.UNKNOWN
    industry: Optional[str] = None
    shares_outstanding: float = Field(..., description="Số lượng cổ phiếu đang lưu hành (triệu cổ)")
    market_cap: Optional[float] = Field(None, description="Vốn hóa thị trường (tỷ VND)")
    description: Optional[str] = None
    website: Optional[str] = None
    founded_year: Optional[int] = None
    employees: Optional[int] = None


class IncomeStatement(BaseModel):
    """Kết quả kinh doanh — đơn vị tỷ VND (hoặc triệu USD với cổ phiếu ngoại)."""
    period: str                                        # "2024-Q3", "2023"
    revenue: float
    gross_profit: Optional[float] = None
    operating_income: Optional[float] = None
    ebit: Optional[float] = None
    ebitda: Optional[float] = None
    net_income: float
    eps: Optional[float] = Field(None, description="EPS (VND/cổ phiếu)")
    interest_expense: Optional[float] = None


class BalanceSheet(BaseModel):
    """Bảng cân đối kế toán — đơn vị tỷ VND."""
    period: str
    total_assets: float
    total_equity: float
    total_debt: float = Field(..., description="Tổng nợ vay (ngắn hạn + dài hạn)")
    cash_and_equivalents: float
    current_assets: Optional[float] = None
    current_liabilities: Optional[float] = None
    book_value_per_share: Optional[float] = Field(None, description="BVPS (VND/cổ phiếu)")
    retained_earnings: Optional[float] = None


class CashFlowStatement(BaseModel):
    """Báo cáo lưu chuyển tiền tệ — đơn vị tỷ VND."""
    period: str
    operating_cash_flow: float
    capital_expenditure: float = Field(..., description="Capex (số âm = chi tiền)")
    free_cash_flow: float
    investing_cash_flow: Optional[float] = None
    financing_cash_flow: Optional[float] = None
    dividends_paid: Optional[float] = None


class FinancialRatios(BaseModel):
    """Các chỉ số tài chính phái sinh từ 3 BCTC."""
    period: str
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    roe: Optional[float] = Field(None, description="ROE %")
    roa: Optional[float] = Field(None, description="ROA %")
    roic: Optional[float] = Field(None, description="ROIC %")
    gross_margin: Optional[float] = Field(None, description="Biên lợi nhuận gộp %")
    operating_margin: Optional[float] = Field(None, description="Biên lợi nhuận hoạt động %")
    net_margin: Optional[float] = Field(None, description="Biên lợi nhuận ròng %")
    debt_to_equity: Optional[float] = None
    debt_to_assets: Optional[float] = None
    interest_coverage: Optional[float] = Field(None, description="EBIT / Chi phí lãi vay")
    current_ratio: Optional[float] = None
    revenue_growth_yoy: Optional[float] = Field(None, description="Tăng trưởng doanh thu YoY %")
    net_income_growth_yoy: Optional[float] = Field(None, description="Tăng trưởng LNST YoY %")
    eps_growth_yoy: Optional[float] = Field(None, description="Tăng trưởng EPS YoY %")


class FinancialStatements(BaseModel):
    """Container cho toàn bộ dữ liệu tài chính của một mã."""
    ticker: str
    income_statements: list[IncomeStatement] = Field(default_factory=list)
    balance_sheets: list[BalanceSheet] = Field(default_factory=list)
    cash_flow_statements: list[CashFlowStatement] = Field(default_factory=list)
    ratios: list[FinancialRatios] = Field(default_factory=list)

    @property
    def latest_income(self) -> Optional[IncomeStatement]:
        return self.income_statements[0] if self.income_statements else None

    @property
    def latest_balance(self) -> Optional[BalanceSheet]:
        return self.balance_sheets[0] if self.balance_sheets else None

    @property
    def latest_cashflow(self) -> Optional[CashFlowStatement]:
        return self.cash_flow_statements[0] if self.cash_flow_statements else None

    @property
    def eps_ttm(self) -> Optional[float]:
        """EPS trailing 12 months — tổng 4 quý gần nhất."""
        quarters = [s for s in self.income_statements if "Q" in s.period]
        if len(quarters) >= 4:
            eps_values = [q.eps for q in quarters[:4] if q.eps is not None]
            if len(eps_values) == 4:
                return sum(eps_values)
        if self.latest_income and self.latest_income.eps:
            return self.latest_income.eps
        return None

    @property
    def fcf_ttm(self) -> Optional[float]:
        """Free cash flow trailing 12 months."""
        quarters = [s for s in self.cash_flow_statements if "Q" in s.period]
        if len(quarters) >= 4:
            return sum(q.free_cash_flow for q in quarters[:4])
        if self.latest_cashflow:
            return self.latest_cashflow.free_cash_flow
        return None
