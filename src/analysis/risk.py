from __future__ import annotations

import logging
import math
import statistics
from typing import Optional

from ..config_loader import get_risk_thresholds
from ..data.models import (
    FinancialRatios,
    FinancialStatements,
    PriceHistory,
    RiskFlag,
    RiskFlagType,
    RiskLevel,
    RiskProfile,
)

logger = logging.getLogger(__name__)


class RiskAnalyzer:
    """
    Phân tích rủi ro định lượng.
    Đầu vào: dữ liệu tài chính + lịch sử giá.
    Đầu ra: RiskProfile với danh sách cờ cảnh báo và mức rủi ro tổng.
    """

    def __init__(self) -> None:
        self._thresholds = get_risk_thresholds()

    # ------------------------------------------------------------------ #
    # Entry point                                                          #
    # ------------------------------------------------------------------ #

    def build_risk_profile(
        self,
        ticker: str,
        statements: FinancialStatements,
        price_history: PriceHistory,
        index_history: Optional[PriceHistory] = None,
        ratios: Optional[FinancialRatios] = None,
    ) -> RiskProfile:
        flags: list[RiskFlag] = []

        # Tính các chỉ số
        beta = self.compute_beta(price_history, index_history)
        volatility = self.compute_annualized_volatility(price_history)

        balance = statements.latest_balance

        de = ratios.debt_to_equity if ratios else (
            balance.total_debt / balance.total_equity
            if balance and balance.total_equity and balance.total_equity > 0
            else None
        )
        coverage = ratios.interest_coverage if ratios else None
        avg_vol = self._avg_daily_volume(price_history)
        eps_stability = self._earnings_stability(statements)

        # Gắn cờ
        flags += self._flag_leverage(de)
        flags += self._flag_coverage(coverage)
        flags += self._flag_beta(beta)
        flags += self._flag_volatility(volatility)
        flags += self._flag_liquidity(avg_vol)
        flags += self._flag_fcf(statements)
        flags += self._flag_revenue_decline(statements)
        flags += self._flag_earnings_stability(statements)

        overall = self._overall_risk(flags)
        summary = self._risk_summary(overall, flags)

        return RiskProfile(
            ticker=ticker,
            beta=beta,
            annualized_volatility_pct=volatility,
            debt_to_equity=de,
            interest_coverage=coverage,
            earnings_stability=eps_stability,
            avg_daily_volume=avg_vol,
            flags=flags,
            overall_risk=overall,
            risk_summary=summary,
        )

    # ------------------------------------------------------------------ #
    # Quantitative metrics                                                 #
    # ------------------------------------------------------------------ #

    def compute_beta(
        self,
        stock: PriceHistory,
        index: Optional[PriceHistory],
    ) -> Optional[float]:
        """Beta của cổ phiếu so với VN-Index (cần >= 60 phiên chung)."""
        if index is None or len(stock.closes) < 30 or len(index.closes) < 30:
            return None

        # Lấy phần giao nhau theo ngày
        stock_dates = {c.date: c.close for c in stock.candles}
        index_dates = {c.date: c.close for c in index.candles}
        common_dates = sorted(set(stock_dates) & set(index_dates), reverse=True)

        if len(common_dates) < 30:
            return None

        s_prices = [stock_dates[d] for d in common_dates]
        i_prices = [index_dates[d] for d in common_dates]

        s_returns = self._daily_returns(s_prices)
        i_returns = self._daily_returns(i_prices)

        if len(s_returns) < 10:
            return None

        cov = self._covariance(s_returns, i_returns)
        var_index = self._variance(i_returns)

        if var_index == 0:
            return None

        return round(cov / var_index, 2)

    def compute_annualized_volatility(self, history: PriceHistory) -> Optional[float]:
        """Độ biến động hàng năm (%) dựa trên 252 phiên gần nhất."""
        closes = history.closes
        if len(closes) < 20:
            return None
        returns = self._daily_returns(closes[:252])
        if len(returns) < 10:
            return None
        daily_std = statistics.stdev(returns)
        annualized = daily_std * math.sqrt(252) * 100
        return round(annualized, 1)

    # ------------------------------------------------------------------ #
    # Risk flags                                                           #
    # ------------------------------------------------------------------ #

    def _flag_leverage(self, de: Optional[float]) -> list[RiskFlag]:
        if de is None:
            return []
        t = self._thresholds.get("leverage", {}).get("debt_to_equity", {})
        very_high = float(t.get("very_high", 4.0))
        high = float(t.get("high", 2.0))

        if de > very_high:
            return [RiskFlag(
                flag_type=RiskFlagType.HIGH_LEVERAGE,
                severity=RiskLevel.VERY_HIGH,
                description=f"D/E = {de:.2f}× — đòn bẩy rất cao, rủi ro mất khả năng thanh toán",
                metric_value=de,
                threshold=very_high,
            )]
        if de > high:
            return [RiskFlag(
                flag_type=RiskFlagType.HIGH_LEVERAGE,
                severity=RiskLevel.HIGH,
                description=f"D/E = {de:.2f}× — đòn bẩy cao hơn mức an toàn ({high}×)",
                metric_value=de,
                threshold=high,
            )]
        return []

    def _flag_coverage(self, coverage: Optional[float]) -> list[RiskFlag]:
        if coverage is None:
            return []
        t = self._thresholds.get("coverage", {}).get("interest_coverage", {})
        danger = float(t.get("danger", 1.5))
        warning = float(t.get("warning", 3.0))

        if coverage < danger:
            return [RiskFlag(
                flag_type=RiskFlagType.NEGATIVE_COVERAGE,
                severity=RiskLevel.VERY_HIGH,
                description=f"Interest coverage = {coverage:.1f}× — EBIT gần không đủ trả lãi vay",
                metric_value=coverage,
                threshold=danger,
            )]
        if coverage < warning:
            return [RiskFlag(
                flag_type=RiskFlagType.NEGATIVE_COVERAGE,
                severity=RiskLevel.MEDIUM,
                description=f"Interest coverage = {coverage:.1f}× — biên an toàn trả lãi chưa cao",
                metric_value=coverage,
                threshold=warning,
            )]
        return []

    def _flag_beta(self, beta: Optional[float]) -> list[RiskFlag]:
        if beta is None:
            return []
        t = self._thresholds.get("volatility", {}).get("beta", {})
        very_high = float(t.get("very_high", 2.0))
        high = float(t.get("high", 1.5))

        if beta > very_high:
            return [RiskFlag(
                flag_type=RiskFlagType.HIGH_BETA,
                severity=RiskLevel.VERY_HIGH,
                description=f"Beta = {beta:.2f} — cổ phiếu biến động mạnh gấp {beta:.1f}× thị trường",
                metric_value=beta,
                threshold=very_high,
            )]
        if beta > high:
            return [RiskFlag(
                flag_type=RiskFlagType.HIGH_BETA,
                severity=RiskLevel.HIGH,
                description=f"Beta = {beta:.2f} — biến động cao hơn VN-Index đáng kể",
                metric_value=beta,
                threshold=high,
            )]
        return []

    def _flag_volatility(self, vol: Optional[float]) -> list[RiskFlag]:
        if vol is None:
            return []
        t = self._thresholds.get("volatility", {}).get("annualized_vol_pct", {})
        very_high = float(t.get("very_high", 60.0))
        high = float(t.get("high", 40.0))

        severity = None
        if vol > very_high:
            severity = RiskLevel.VERY_HIGH
        elif vol > high:
            severity = RiskLevel.HIGH
        if severity:
            return [RiskFlag(
                flag_type=RiskFlagType.HIGH_BETA,
                severity=severity,
                description=f"Độ biến động hàng năm = {vol:.0f}% — cổ phiếu rất biến động",
                metric_value=vol,
                threshold=high,
            )]
        return []

    def _flag_liquidity(self, avg_vol: Optional[int]) -> list[RiskFlag]:
        if avg_vol is None:
            return []
        min_vol = int(self._thresholds.get("liquidity", {}).get("avg_daily_volume_min", 100_000))
        if avg_vol < min_vol:
            return [RiskFlag(
                flag_type=RiskFlagType.LOW_LIQUIDITY,
                severity=RiskLevel.MEDIUM,
                description=f"Khối lượng TB = {avg_vol:,} cp/ngày — thanh khoản thấp, khó thoát lệnh",
                metric_value=float(avg_vol),
                threshold=float(min_vol),
            )]
        return []

    def _flag_fcf(self, statements: FinancialStatements) -> list[RiskFlag]:
        neg_quarters = self._thresholds.get("cash_flow", {}).get("negative_fcf_quarters", 2)
        quarters = [s for s in statements.cash_flow_statements if "Q" in s.period]
        consecutive_neg = 0
        for q in quarters[:6]:
            if q.free_cash_flow < 0:
                consecutive_neg += 1
            else:
                break
        if consecutive_neg >= neg_quarters:
            return [RiskFlag(
                flag_type=RiskFlagType.NEGATIVE_FCF,
                severity=RiskLevel.HIGH,
                description=f"FCF âm {consecutive_neg} quý liên tiếp — công ty đang tiêu tốn tiền mặt",
                metric_value=float(consecutive_neg),
                threshold=float(neg_quarters),
            )]
        return []

    def _flag_revenue_decline(self, statements: FinancialStatements) -> list[RiskFlag]:
        threshold_pct = float(
            self._thresholds.get("growth", {}).get("revenue_decline_yoy", -0.10)
        ) * 100

        quarters = [s for s in statements.income_statements if "Q" in s.period]
        if len(quarters) < 5:
            return []
        curr = quarters[0].revenue
        prior = quarters[4].revenue
        if prior and prior > 0:
            growth = (curr - prior) / prior * 100
            if growth < threshold_pct:
                return [RiskFlag(
                    flag_type=RiskFlagType.DECLINING_REVENUE,
                    severity=RiskLevel.HIGH,
                    description=f"Doanh thu YoY = {growth:.1f}% — suy giảm doanh thu đáng lo ngại",
                    metric_value=round(growth, 1),
                    threshold=threshold_pct,
                )]
        return []

    def _flag_earnings_stability(self, statements: FinancialStatements) -> list[RiskFlag]:
        quarters = [s for s in statements.income_statements if "Q" in s.period]
        eps_values = [q.eps for q in quarters[:8] if q.eps is not None]
        if len(eps_values) < 4:
            return []
        mean = statistics.mean(eps_values)
        if mean == 0:
            return []
        std = statistics.stdev(eps_values)
        cv = abs(std / mean)  # Coefficient of Variation

        t = self._thresholds.get("earnings", {})
        very_unstable = float(t.get("very_unstable_cv", 1.0))
        unstable = float(t.get("unstable_cv", 0.5))

        if cv > very_unstable:
            return [RiskFlag(
                flag_type=RiskFlagType.EARNINGS_INSTABILITY,
                severity=RiskLevel.HIGH,
                description=f"EPS biến động mạnh (CV={cv:.1f}) — lợi nhuận không ổn định",
                metric_value=round(cv, 2),
                threshold=unstable,
            )]
        if cv > unstable:
            return [RiskFlag(
                flag_type=RiskFlagType.EARNINGS_INSTABILITY,
                severity=RiskLevel.MEDIUM,
                description=f"EPS có độ biến động trung bình (CV={cv:.1f})",
                metric_value=round(cv, 2),
                threshold=unstable,
            )]
        return []

    # ------------------------------------------------------------------ #
    # Overall risk score                                                   #
    # ------------------------------------------------------------------ #

    def _overall_risk(self, flags: list[RiskFlag]) -> RiskLevel:
        weights = self._thresholds.get("risk_scoring", {}).get("flag_weights", {})
        thresholds = self._thresholds.get("risk_scoring", {}).get("thresholds", {})

        score = 0
        for flag in flags:
            key = flag.flag_type.name
            base_weight = int(weights.get(key, 1))
            # Multiplier theo severity
            multiplier = {"Thấp": 0.5, "Trung bình": 1, "Cao": 1.5, "Rất cao": 2}
            score += base_weight * multiplier.get(flag.severity.value, 1)

        low_t = float(thresholds.get("low", 2))
        mid_t = float(thresholds.get("medium", 4))
        high_t = float(thresholds.get("high", 7))

        if score <= low_t:
            return RiskLevel.LOW
        if score <= mid_t:
            return RiskLevel.MEDIUM
        if score <= high_t:
            return RiskLevel.HIGH
        return RiskLevel.VERY_HIGH

    @staticmethod
    def _risk_summary(level: RiskLevel, flags: list[RiskFlag]) -> str:
        summaries = {
            RiskLevel.LOW: "Hồ sơ rủi ro thấp — phù hợp nhà đầu tư bảo thủ",
            RiskLevel.MEDIUM: "Rủi ro trung bình — cần theo dõi các chỉ số tài chính định kỳ",
            RiskLevel.HIGH: "Rủi ro cao — đầu tư có chọn lọc, cần biên an toàn lớn",
            RiskLevel.VERY_HIGH: "Rủi ro rất cao — chỉ phù hợp nhà đầu tư chấp nhận rủi ro lớn",
        }
        base = summaries[level]
        if flags:
            top_flags = [f.flag_type.value for f in flags[:3]]
            base += f". Điểm cần lưu ý: {', '.join(top_flags)}"
        return base

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _earnings_stability(statements: FinancialStatements) -> str:
        quarters = [s for s in statements.income_statements if "Q" in s.period]
        eps_values = [q.eps for q in quarters[:8] if q.eps is not None]
        if len(eps_values) < 4:
            return "Không đủ dữ liệu"
        mean = statistics.mean(eps_values)
        if mean == 0:
            return "Không xác định"
        cv = abs(statistics.stdev(eps_values) / mean)
        if cv < 0.25:
            return "Cao"
        if cv < 0.5:
            return "Trung bình"
        return "Thấp"

    @staticmethod
    def _avg_daily_volume(history: PriceHistory) -> Optional[int]:
        vols = history.volumes[:60]
        if not vols:
            return None
        return int(sum(vols) / len(vols))

    @staticmethod
    def _daily_returns(prices: list[float]) -> list[float]:
        """Tính daily log returns. prices: mới nhất ở index 0."""
        result = []
        for i in range(len(prices) - 1):
            if prices[i + 1] > 0 and prices[i] > 0:
                result.append(math.log(prices[i] / prices[i + 1]))
        return result

    @staticmethod
    def _covariance(x: list[float], y: list[float]) -> float:
        n = min(len(x), len(y))
        if n < 2:
            return 0.0
        mx, my = sum(x[:n]) / n, sum(y[:n]) / n
        return sum((x[i] - mx) * (y[i] - my) for i in range(n)) / (n - 1)

    @staticmethod
    def _variance(x: list[float]) -> float:
        if len(x) < 2:
            return 0.0
        mx = sum(x) / len(x)
        return sum((v - mx) ** 2 for v in x) / (len(x) - 1)
