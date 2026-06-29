from __future__ import annotations

import logging
from typing import Any, Optional

from ..analysis import (
    FinancialAnalyzer,
    RiskAnalyzer,
    TechnicalAnalyzer,
    ValuationEngine,
)
from ..data.cache import CacheManager
from ..data.news_client import NewsClient
from ..data.vnstock_client import VnstockClient

logger = logging.getLogger(__name__)


class ToolServices:
    """
    Lớp trung gian giữa Claude tool calls và analysis engines.
    Mỗi public method = một tool mà Claude có thể gọi.
    Kết quả trả về là dict thuần — Claude đọc được.
    """

    def __init__(
        self,
        cache_dir: str = ".cache",
        vnstock_source: str = "VCI",
    ) -> None:
        self._cache = CacheManager(cache_dir)
        self._vnstock = VnstockClient(self._cache, vnstock_source)
        self._news_client = NewsClient(self._cache)

        self._financial = FinancialAnalyzer()
        self._valuation = ValuationEngine()
        self._technical = TechnicalAnalyzer()
        self._risk = RiskAnalyzer()

    # ------------------------------------------------------------------ #
    # Tool 1: Thông tin doanh nghiệp + tài chính cơ bản                  #
    # ------------------------------------------------------------------ #

    def fetch_company_data(self, ticker: str) -> dict[str, Any]:
        """Thu thập thông tin doanh nghiệp và số liệu tài chính chính."""
        ticker = ticker.upper()
        try:
            info = self._vnstock.get_company_info(ticker)
            statements = self._vnstock.get_financial_statements(ticker, period="quarter", n_periods=8)
            price = self._vnstock.get_current_price(ticker) or 0.0

            ratios = self._financial.compute_ratios(statements, current_price=price)
            red_flags = self._financial.detect_accounting_red_flags(statements)
            business_type = (
                self._financial.classify_business_type(ratios)
                if ratios else "Không xác định"
            )
            revenue_growth = self._financial.compute_revenue_growth_series(statements)

            result: dict[str, Any] = {
                "ticker": ticker,
                "company_name": info.name,
                "exchange": info.exchange.value,
                "sector": info.sector.value,
                "industry": info.industry,
                "shares_outstanding_million": round(info.shares_outstanding, 2),
                "current_price_vnd": price,
                "business_type": business_type,
                # Inputs cần cho định giá
                "valuation_inputs": {
                    "eps_ttm_vnd": statements.eps_ttm,
                    "bvps_vnd": (
                        statements.latest_balance.book_value_per_share
                        if statements.latest_balance else None
                    ),
                    "fcf_ttm_ty_vnd": statements.fcf_ttm,
                },
                # Tài chính tóm tắt
                "financials": {
                    "revenue_growth_yoy_pct": ratios.revenue_growth_yoy if ratios else None,
                    "eps_growth_yoy_pct": ratios.eps_growth_yoy if ratios else None,
                    "net_margin_pct": ratios.net_margin if ratios else None,
                    "roe_pct": ratios.roe if ratios else None,
                    "roa_pct": ratios.roa if ratios else None,
                    "debt_to_equity": ratios.debt_to_equity if ratios else None,
                    "interest_coverage": ratios.interest_coverage if ratios else None,
                    "current_ratio": ratios.current_ratio if ratios else None,
                    "revenue_growth_trend_pct": revenue_growth[:4],  # 4 quý gần nhất
                },
                "accounting_red_flags": red_flags,
                "data_periods_available": len(statements.income_statements),
            }
            return result

        except Exception as exc:
            logger.error("fetch_company_data(%s) failed: %s", ticker, exc)
            return {"error": str(exc), "ticker": ticker}

    # ------------------------------------------------------------------ #
    # Tool 2: Định giá cổ phiếu (5 mô hình)                              #
    # ------------------------------------------------------------------ #

    def compute_valuation(
        self,
        ticker: str,
        custom_wacc: Optional[float] = None,
        custom_growth: Optional[float] = None,
    ) -> dict[str, Any]:
        """Tính định giá bằng 5 mô hình và tổng hợp giá trị đồng thuận."""
        ticker = ticker.upper()
        try:
            info = self._vnstock.get_company_info(ticker)
            statements = self._vnstock.get_financial_statements(ticker, period="quarter", n_periods=8)
            price = self._vnstock.get_current_price(ticker) or 0.0

            if not price:
                return {"error": "Không lấy được giá hiện tại", "ticker": ticker}

            result_obj = self._valuation.run_full_valuation(
                company=info,
                statements=statements,
                current_price=price,
                custom_wacc=custom_wacc,
                custom_growth=custom_growth,
            )

            def model_summary(m) -> dict:
                if not m.is_available:
                    return {"available": False, "reason": m.unavailable_reason}
                return {"available": True, "fair_value_vnd": m.fair_value, "inputs": m.inputs}

            return {
                "ticker": ticker,
                "current_price_vnd": price,
                "models": {
                    "pe_fair_value": model_summary(result_obj.pe_result),
                    "pb_fair_value": model_summary(result_obj.pb_result),
                    "graham_number": model_summary(result_obj.graham_result),
                    "dcf_base_case": model_summary(result_obj.dcf_result),
                    "earnings_yield": {
                        "ey_pct": result_obj.earnings_yield.earnings_yield,
                        "risk_free_rate_pct": result_obj.earnings_yield.risk_free_rate,
                        "spread_pct": result_obj.earnings_yield.spread,
                        "is_attractive": result_obj.earnings_yield.is_attractive,
                    },
                },
                "consensus": {
                    "fair_value_vnd": result_obj.consensus_value,
                    "discount_pct": result_obj.discount_pct,
                    "upside_pct": result_obj.upside_pct,
                    "label": result_obj.label.value,
                },
                "scenarios": [
                    {
                        "name": s.name,
                        "growth_rate_pct": s.growth_rate,
                        "wacc_pct": s.wacc,
                        "fair_value_vnd": s.fair_value,
                        "probability_pct": round(s.probability * 100),
                    }
                    for s in result_obj.scenarios
                ],
                "probability_weighted_value_vnd": result_obj.probability_weighted_value,
            }

        except Exception as exc:
            logger.error("compute_valuation(%s) failed: %s", ticker, exc)
            return {"error": str(exc), "ticker": ticker}

    # ------------------------------------------------------------------ #
    # Tool 3: Phân tích kỹ thuật                                         #
    # ------------------------------------------------------------------ #

    def compute_technical_signals(self, ticker: str) -> dict[str, Any]:
        """Tính chỉ báo kỹ thuật: RSI, MACD, SMA, xu hướng, volume."""
        ticker = ticker.upper()
        try:
            history = self._vnstock.get_price_history(ticker, days=400)
            if not history.candles:
                return {"error": "Không có dữ liệu giá", "ticker": ticker}

            sig = self._technical.build_signal(history)

            return {
                "ticker": ticker,
                "current_price_vnd": sig.current_price,
                "moving_averages": {
                    "sma_20": sig.sma_20,
                    "sma_50": sig.sma_50,
                    "sma_200": sig.sma_200,
                    "price_vs_sma20_pct": (
                        round((sig.current_price - sig.sma_20) / sig.sma_20 * 100, 1)
                        if sig.sma_20 else None
                    ),
                    "price_vs_sma50_pct": (
                        round((sig.current_price - sig.sma_50) / sig.sma_50 * 100, 1)
                        if sig.sma_50 else None
                    ),
                    "price_vs_sma200_pct": (
                        round((sig.current_price - sig.sma_200) / sig.sma_200 * 100, 1)
                        if sig.sma_200 else None
                    ),
                },
                "rsi": {
                    "value": sig.rsi_14,
                    "label": sig.rsi_label,
                    "interpretation": _rsi_interpretation(sig.rsi_14),
                },
                "macd": {
                    "macd_line": sig.macd_line,
                    "signal_line": sig.macd_signal,
                    "histogram": sig.macd_histogram,
                    "signal": sig.macd_label,
                },
                "volume": {
                    "trend": sig.volume_trend,
                },
                "trend": {
                    "label": sig.price_trend,
                    "description": _trend_description(sig.price_trend),
                },
                "52_week": {
                    "high_vnd": sig.high_52w,
                    "low_vnd": sig.low_52w,
                    "current_position_pct": sig.position_52w_pct,
                    "interpretation": _position_interpretation(sig.position_52w_pct),
                },
            }

        except Exception as exc:
            logger.error("compute_technical_signals(%s) failed: %s", ticker, exc)
            return {"error": str(exc), "ticker": ticker}

    # ------------------------------------------------------------------ #
    # Tool 4: Phân tích rủi ro                                           #
    # ------------------------------------------------------------------ #

    def compute_risk_profile(self, ticker: str) -> dict[str, Any]:
        """Đánh giá rủi ro: beta, đòn bẩy, ổn định lợi nhuận, cờ cảnh báo."""
        ticker = ticker.upper()
        try:
            statements = self._vnstock.get_financial_statements(ticker, period="quarter", n_periods=8)
            price_history = self._vnstock.get_price_history(ticker, days=400)
            index_history = self._vnstock.get_index_history("VNINDEX", days=400)
            ratios = self._financial.compute_ratios(statements)

            profile = self._risk.build_risk_profile(
                ticker=ticker,
                statements=statements,
                price_history=price_history,
                index_history=index_history,
                ratios=ratios,
            )

            return {
                "ticker": ticker,
                "metrics": {
                    "beta": profile.beta,
                    "annualized_volatility_pct": profile.annualized_volatility_pct,
                    "debt_to_equity": profile.debt_to_equity,
                    "interest_coverage": profile.interest_coverage,
                    "earnings_stability": profile.earnings_stability,
                    "avg_daily_volume": profile.avg_daily_volume,
                },
                "risk_flags": [
                    {
                        "type": f.flag_type.value,
                        "severity": f.severity.value,
                        "description": f.description,
                    }
                    for f in profile.flags
                ],
                "overall_risk_level": profile.overall_risk.value,
                "risk_summary": profile.risk_summary,
            }

        except Exception as exc:
            logger.error("compute_risk_profile(%s) failed: %s", ticker, exc)
            return {"error": str(exc), "ticker": ticker}

    # ------------------------------------------------------------------ #
    # Tool 5: Tin tức gần đây                                            #
    # ------------------------------------------------------------------ #

    def fetch_recent_news(self, ticker: str, max_items: int = 10) -> dict[str, Any]:
        """Thu thập tin tức và sự kiện gần đây liên quan đến cổ phiếu."""
        ticker = ticker.upper()
        try:
            news_items = self._news_client.fetch_news(ticker, max_items=max_items)
            return {
                "ticker": ticker,
                "total_found": len(news_items),
                "news": [
                    {
                        "title": n.title,
                        "source": n.source,
                        "published_at": n.published_at.isoformat() if n.published_at else None,
                        "snippet": n.snippet,
                        "url": n.url,
                    }
                    for n in news_items
                ],
                "note": (
                    "Không tìm thấy tin tức liên quan trong 7 ngày qua"
                    if not news_items else
                    f"Tìm thấy {len(news_items)} tin tức. Hãy phân tích tâm lý và sự kiện quan trọng."
                ),
            }

        except Exception as exc:
            logger.error("fetch_recent_news(%s) failed: %s", ticker, exc)
            return {"error": str(exc), "ticker": ticker}


# ------------------------------------------------------------------ #
# Interpretation helpers (chuyển số → nhận xét ngắn cho Claude)      #
# ------------------------------------------------------------------ #

def _rsi_interpretation(rsi: Optional[float]) -> str:
    if rsi is None:
        return "Không có dữ liệu"
    if rsi >= 80:
        return "Vùng quá mua nghiêm trọng — rủi ro điều chỉnh ngắn hạn cao"
    if rsi >= 70:
        return "Đang tiệm cận vùng quá mua — cần thận trọng khi mua thêm"
    if rsi <= 20:
        return "Vùng quá bán sâu — có thể đang hình thành đáy ngắn hạn"
    if rsi <= 30:
        return "Vùng quá bán — thường xuất hiện cơ hội mua ngắn hạn"
    if 45 <= rsi <= 55:
        return "Cân bằng lực cung cầu — chờ tín hiệu rõ ràng hơn"
    return "Vùng trung lập"


def _trend_description(trend: Optional[str]) -> str:
    mapping = {
        "Tăng mạnh": "Giá trên cả 3 đường MA, golden cross — xu hướng tăng được xác nhận",
        "Tích lũy": "Giá dao động quanh các đường MA — đang đi ngang, chờ breakout",
        "Điều chỉnh": "Giá dưới SMA50 nhưng trên SMA200 — điều chỉnh trong xu hướng tăng",
        "Giảm": "Giá dưới SMA50 và SMA200, death cross — xu hướng giảm",
    }
    return mapping.get(trend or "", "Không xác định")


def _position_interpretation(pos: Optional[float]) -> str:
    if pos is None:
        return "Không có dữ liệu"
    if pos >= 80:
        return "Gần đỉnh 52 tuần — momentum mạnh nhưng cần thận trọng"
    if pos >= 50:
        return "Nửa trên vùng 52 tuần — xu hướng tích cực"
    if pos >= 20:
        return "Nửa dưới vùng 52 tuần — giá chưa phục hồi nhiều"
    return "Gần đáy 52 tuần — có thể bắt đáy hoặc tiếp tục giảm"
