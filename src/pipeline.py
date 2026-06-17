"""
pipeline.py — Integration Layer

Kết nối Data Layer → Analysis Layer → Output container.
Sử dụng:
    from src.pipeline import analyze_stock

    result = analyze_stock("FPT")
    print(result.valuation.consensus_value)
    print(result.quick_summary)
"""
from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .analysis import (
    FinancialAnalyzer,
    RiskAnalyzer,
    TechnicalAnalyzer,
    ValuationEngine,
)
from .data import DataFetcher
from .data.models import (
    AnalysisReport,
    CompanyInfo,
    FinancialRatios,
    FinancialStatements,
    NewsSentiment,
    PriceHistory,
    RiskProfile,
    TechnicalSignal,
    ValuationResults,
)

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ #
# StockAnalysisResult — output container duy nhất                      #
# ------------------------------------------------------------------ #

class DataQuality(BaseModel):
    """Tóm tắt chất lượng và độ phủ của dữ liệu đầu vào."""
    periods_income: int = 0
    periods_balance: int = 0
    periods_cashflow: int = 0
    price_trading_days: int = 0
    has_eps_ttm: bool = False
    has_bvps: bool = False
    has_fcf_ttm: bool = False
    available_valuation_models: list[str] = Field(default_factory=list)
    missing_valuation_models: list[str] = Field(default_factory=list)


class StockAnalysisResult(BaseModel):
    """
    Kết quả phân tích đầy đủ — output của toàn bộ pipeline.

    Không chứa AI-generated text (đó là trách nhiệm của Claude agent layer).
    Mọi kết quả đều là pure computation, reproducible.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    ticker: str
    generated_at: datetime = Field(default_factory=datetime.now)

    # ── Raw data ──────────────────────────────────────────────────── #
    company: CompanyInfo
    statements: FinancialStatements
    price_history: PriceHistory
    current_price: Optional[float] = None

    # ── Analysis results ──────────────────────────────────────────── #
    ratios: Optional[FinancialRatios] = None
    valuation: Optional[ValuationResults] = None
    technical: Optional[TechnicalSignal] = None
    risk: Optional[RiskProfile] = None

    # ── Enrichments ───────────────────────────────────────────────── #
    business_type: Optional[str] = None            # "Tăng trưởng" / "Giá trị" / "Hỗn hợp"
    accounting_flags: list[str] = Field(default_factory=list)
    data_quality: DataQuality = Field(default_factory=DataQuality)

    # ── Metadata ──────────────────────────────────────────────────── #
    fetch_ms: Optional[int] = None
    analysis_ms: Optional[int] = None
    errors: dict[str, str] = Field(default_factory=dict)

    # ------------------------------------------------------------------ #
    # Convenience properties                                               #
    # ------------------------------------------------------------------ #

    @property
    def is_undervalued(self) -> bool:
        """True nếu giá hiện tại đang chiết khấu so với fair value."""
        return self.valuation is not None and self.valuation.discount_pct > 0

    @property
    def upside_pct(self) -> Optional[float]:
        """% tăng tiềm năng từ giá hiện tại đến fair value."""
        return self.valuation.upside_pct if self.valuation else None

    @property
    def overall_risk_label(self) -> str:
        if self.risk is None:
            return "Chưa xác định"
        return self.risk.overall_risk.value

    @property
    def quick_summary(self) -> str:
        """Một dòng tóm tắt tiếng Việt cho terminal/log."""
        price_str = f"{self.current_price:,.0f}" if self.current_price else "N/A"
        if self.valuation:
            fv_str = f"{self.valuation.consensus_value:,.0f}"
            disc = self.valuation.discount_pct
            label = self.valuation.label.value
            direction = "chiết khấu" if disc > 0 else "premium"
            val_str = f"| FV: {fv_str} VND | {abs(disc):.1f}% {direction} | {label}"
        else:
            val_str = "| Định giá: chưa có"

        risk_str = f"| Rủi ro: {self.overall_risk_label}" if self.risk else ""
        return (
            f"{self.ticker} — {self.company.name} "
            f"| Giá: {price_str} VND {val_str} {risk_str}"
        )

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0

    # ------------------------------------------------------------------ #
    # Convert to AnalysisReport (cho Claude agent layer)                   #
    # ------------------------------------------------------------------ #

    def to_report(
        self,
        news: Optional[NewsSentiment] = None,
        summary: Optional[str] = None,
        investment_thesis: Optional[str] = None,
        key_risks_text: Optional[str] = None,
    ) -> AnalysisReport:
        """
        Chuyển sang AnalysisReport để Claude agent có thể dùng.
        Các trường AI-generated text (summary, thesis) truyền vào sau.
        """
        if self.valuation is None or self.technical is None or self.risk is None:
            raise ValueError(
                f"Không thể tạo AnalysisReport: thiếu kết quả phân tích "
                f"(valuation={self.valuation is not None}, "
                f"technical={self.technical is not None}, "
                f"risk={self.risk is not None})"
            )
        return AnalysisReport(
            ticker=self.ticker,
            generated_at=self.generated_at,
            company_info=self.company,
            financial_statements=self.statements,
            latest_ratios=self.ratios,
            price_history=self.price_history,
            valuation=self.valuation,
            technical=self.technical,
            risk=self.risk,
            news=news,
            summary=summary,
            investment_thesis=investment_thesis,
            key_risks_text=key_risks_text,
        )

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


# ------------------------------------------------------------------ #
# AnalysisPipeline — orchestrator                                       #
# ------------------------------------------------------------------ #

class AnalysisPipeline:
    """
    Orchestrator: Data → Financial → Valuation → Technical → Risk.

    Mỗi bước xử lý độc lập; lỗi ở một bước không làm dừng bước khác.
    Lỗi được ghi vào `result.errors[step_name]`.
    """

    def __init__(
        self,
        cache_dir: str = ".cache",
        source: str = "VCI",
        index_symbol: str = "VNINDEX",
        index_years: int = 1,
        price_years: int = 5,
        n_periods: int = 20,
        custom_wacc: Optional[float] = None,
        custom_growth: Optional[float] = None,
        scenario_probabilities: Optional[dict[str, float]] = None,
    ) -> None:
        self._fetcher = DataFetcher(
            cache_dir=cache_dir,
            source=source,
            n_periods=n_periods,
            price_years=price_years,
        )
        self._fin_analyzer  = FinancialAnalyzer()
        self._val_engine    = ValuationEngine()
        self._tech_analyzer = TechnicalAnalyzer()
        self._risk_analyzer = RiskAnalyzer()

        self._index_symbol  = index_symbol
        self._index_years   = index_years
        self._custom_wacc   = custom_wacc
        self._custom_growth = custom_growth
        self._scenario_probs = scenario_probabilities or {
            "Bi quan": 0.30, "Cơ sở": 0.50, "Lạc quan": 0.20
        }

    # ------------------------------------------------------------------ #
    # Main entry point                                                      #
    # ------------------------------------------------------------------ #

    def analyze(
        self,
        ticker: str,
        custom_wacc: Optional[float] = None,
        custom_growth: Optional[float] = None,
    ) -> StockAnalysisResult:
        """
        Phân tích toàn diện một mã cổ phiếu.

        Args:
            ticker:        Mã cổ phiếu (VD: "FPT", "VCB", "HPG")
            custom_wacc:   Ghi đè WACC cho DCF (VD: 0.12 = 12%)
            custom_growth: Ghi đè tốc độ tăng trưởng FCF (VD: 0.15 = 15%)

        Returns:
            StockAnalysisResult với toàn bộ kết quả định giá, kỹ thuật, rủi ro.

        Raises:
            RuntimeError: Nếu không lấy được dữ liệu cơ bản (giá + công ty).
        """
        ticker = ticker.upper().strip()
        wacc = custom_wacc or self._custom_wacc
        growth = custom_growth or self._custom_growth
        errors: dict[str, str] = {}

        # ── Step 1: Fetch data ──────────────────────────────────────── #
        logger.info("[Pipeline] %s — Bước 1: Lấy dữ liệu", ticker)
        t0 = time.monotonic()
        stock_data = self._fetcher.fetch_all(ticker)
        fetch_ms = int((time.monotonic() - t0) * 1000)
        logger.info("[Pipeline] %s — Dữ liệu xong sau %d ms", ticker, fetch_ms)

        if not stock_data.current_price and not stock_data.price_history.candles:
            raise RuntimeError(
                f"Không lấy được dữ liệu giá cho {ticker}. "
                f"Kiểm tra mã cổ phiếu và kết nối mạng."
            )

        t1 = time.monotonic()

        # ── Step 2: Financial ratios ────────────────────────────────── #
        ratios: Optional[FinancialRatios] = None
        business_type: Optional[str] = None
        accounting_flags: list[str] = []

        try:
            logger.info("[Pipeline] %s — Bước 2: FinancialAnalyzer", ticker)
            ratios = self._fin_analyzer.compute_ratios(
                stock_data.statements, stock_data.current_price
            )
            if ratios:
                business_type = self._fin_analyzer.classify_business_type(ratios)
            accounting_flags = self._fin_analyzer.detect_accounting_red_flags(
                stock_data.statements
            )
        except Exception as exc:
            errors["financial_analysis"] = str(exc)
            logger.warning("[Pipeline] %s FinancialAnalyzer lỗi: %s", ticker, exc)

        # ── Step 3: Valuation ────────────────────────────────────────── #
        valuation: Optional[ValuationResults] = None
        try:
            logger.info("[Pipeline] %s — Bước 3: ValuationEngine", ticker)
            price = stock_data.current_price or 0.0
            valuation = self._val_engine.run_full_valuation(
                company=stock_data.company,
                statements=stock_data.statements,
                current_price=price,
                scenario_probabilities=self._scenario_probs,
                custom_wacc=wacc,
                custom_growth=growth,
            )
        except Exception as exc:
            errors["valuation"] = str(exc)
            logger.warning("[Pipeline] %s ValuationEngine lỗi: %s", ticker, exc)

        # ── Step 4: Technical signals ────────────────────────────────── #
        technical: Optional[TechnicalSignal] = None
        try:
            logger.info("[Pipeline] %s — Bước 4: TechnicalAnalyzer", ticker)
            technical = self._tech_analyzer.build_signal(stock_data.price_history)
        except Exception as exc:
            errors["technical"] = str(exc)
            logger.warning("[Pipeline] %s TechnicalAnalyzer lỗi: %s", ticker, exc)

        # ── Step 5: Index history (cho beta) ─────────────────────────── #
        index_history: Optional[PriceHistory] = None
        try:
            logger.info(
                "[Pipeline] %s — Bước 5: Lấy lịch sử %s", ticker, self._index_symbol
            )
            index_history = self._fetcher.get_index_history(
                self._index_symbol, years=self._index_years
            )
        except Exception as exc:
            errors["index_data"] = str(exc)
            logger.warning(
                "[Pipeline] %s Lấy lịch sử index lỗi: %s — beta sẽ bị bỏ qua",
                ticker, exc,
            )

        # ── Step 6: Risk profile ─────────────────────────────────────── #
        risk: Optional[RiskProfile] = None
        try:
            logger.info("[Pipeline] %s — Bước 6: RiskAnalyzer", ticker)
            risk = self._risk_analyzer.build_risk_profile(
                ticker=ticker,
                statements=stock_data.statements,
                price_history=stock_data.price_history,
                index_history=index_history,
                ratios=ratios,
            )
        except Exception as exc:
            errors["risk"] = str(exc)
            logger.warning("[Pipeline] %s RiskAnalyzer lỗi: %s", ticker, exc)

        analysis_ms = int((time.monotonic() - t1) * 1000)

        # ── Step 7: Data quality summary ─────────────────────────────── #
        dq = self._build_data_quality(stock_data.statements, stock_data.price_history, valuation)

        # ── Bundle ───────────────────────────────────────────────────── #
        result = StockAnalysisResult(
            ticker=ticker,
            company=stock_data.company,
            statements=stock_data.statements,
            price_history=stock_data.price_history,
            current_price=stock_data.current_price,
            ratios=ratios,
            valuation=valuation,
            technical=technical,
            risk=risk,
            business_type=business_type,
            accounting_flags=accounting_flags,
            data_quality=dq,
            fetch_ms=fetch_ms,
            analysis_ms=analysis_ms,
            errors=errors,
        )

        logger.info(
            "[Pipeline] %s XONG | fetch=%d ms | analysis=%d ms | errors=%s",
            ticker, fetch_ms, analysis_ms, list(errors.keys()) or "none",
        )
        return result

    def analyze_many(
        self,
        tickers: list[str],
        stop_on_error: bool = False,
    ) -> dict[str, StockAnalysisResult]:
        """
        Phân tích nhiều mã cổ phiếu tuần tự.
        Lỗi ở một mã không ảnh hưởng các mã còn lại (trừ khi stop_on_error=True).

        Returns:
            dict: ticker → StockAnalysisResult (hoặc vắng mặt nếu lỗi nghiêm trọng)
        """
        results: dict[str, StockAnalysisResult] = {}
        for ticker in tickers:
            try:
                results[ticker] = self.analyze(ticker)
            except Exception as exc:
                logger.error("[Pipeline] %s thất bại hoàn toàn: %s", ticker, exc)
                if stop_on_error:
                    raise
        return results

    # ------------------------------------------------------------------ #
    # Private helpers                                                       #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _build_data_quality(
        statements: FinancialStatements,
        price_history: PriceHistory,
        valuation: Optional[ValuationResults],
    ) -> DataQuality:
        available: list[str] = []
        missing: list[str] = []

        if valuation:
            for model in [
                valuation.pe_result,
                valuation.pb_result,
                valuation.graham_result,
                valuation.dcf_result,
            ]:
                (available if model.is_available else missing).append(model.model_name)

        return DataQuality(
            periods_income=len(statements.income_statements),
            periods_balance=len(statements.balance_sheets),
            periods_cashflow=len(statements.cash_flow_statements),
            price_trading_days=len(price_history.candles),
            has_eps_ttm=statements.eps_ttm is not None,
            has_bvps=(
                statements.latest_balance is not None
                and statements.latest_balance.book_value_per_share is not None
            ),
            has_fcf_ttm=statements.fcf_ttm is not None,
            available_valuation_models=available,
            missing_valuation_models=missing,
        )


# ------------------------------------------------------------------ #
# Convenience function                                                  #
# ------------------------------------------------------------------ #

def analyze_stock(
    ticker: str,
    cache_dir: str = ".cache",
    source: str = "VCI",
    custom_wacc: Optional[float] = None,
    custom_growth: Optional[float] = None,
    scenario_probabilities: Optional[dict[str, float]] = None,
) -> StockAnalysisResult:
    """
    Phân tích một mã cổ phiếu với cấu hình mặc định.

    Args:
        ticker:                 Mã cổ phiếu (VD: "FPT", "VCB", "HPG").
        cache_dir:              Thư mục cache (mặc định: ".cache").
        source:                 Nguồn dữ liệu vnstock: "VCI" hoặc "TCBS".
        custom_wacc:            WACC tùy chỉnh cho DCF (VD: 0.12 = 12%).
        custom_growth:          Tốc độ tăng trưởng FCF tùy chỉnh (VD: 0.15).
        scenario_probabilities: Xác suất 3 kịch bản DCF (mặc định 30/50/20).

    Returns:
        StockAnalysisResult — kết quả đầy đủ.

    Ví dụ:
        result = analyze_stock("FPT")
        print(result.quick_summary)
        print(result.valuation.consensus_value)
        print(result.risk.overall_risk.value)
        print(result.technical.rsi_label)
    """
    pipeline = AnalysisPipeline(
        cache_dir=cache_dir,
        source=source,
        custom_wacc=custom_wacc,
        custom_growth=custom_growth,
        scenario_probabilities=scenario_probabilities,
    )
    return pipeline.analyze(ticker)
