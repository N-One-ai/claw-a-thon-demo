from __future__ import annotations

import logging
from typing import Optional

from ..data.models import OHLCVPoint, PriceHistory, TechnicalSignal

logger = logging.getLogger(__name__)

_CHART_WINDOW = 200  # số phiên trả về cho frontend chart


class TechnicalAnalyzer:
    """
    Chỉ báo kỹ thuật thuần toán học.
    Đầu vào: PriceHistory (danh sách giá, mới nhất trước).
    Đầu ra: TechnicalSignal với nhãn tiếng Việt.
    Không phụ thuộc Claude, không gọi API.
    """

    def build_signal(self, history: PriceHistory) -> TechnicalSignal:
        """Entry point chính — tạo TechnicalSignal đầy đủ từ PriceHistory."""
        closes = history.closes          # mới nhất ở index 0
        volumes = history.volumes
        price = history.current_price

        if not price or not closes:
            return TechnicalSignal(current_price=0.0)

        # SMA
        sma20 = self._sma(closes, 20)
        sma50 = self._sma(closes, 50)
        sma200 = self._sma(closes, 200)

        # RSI
        rsi = self._rsi(closes, 14)
        rsi_label = self._rsi_label(rsi)

        # MACD
        macd_line, signal_line, histogram = self._macd(closes)
        macd_label = self._macd_label(macd_line, signal_line, histogram)

        # Volume trend
        vol_trend = self._volume_trend(volumes)

        # Price trend
        price_trend = self._price_trend(price, sma20, sma50, sma200)

        # ── Time-series for frontend chart ───────────────────────────────
        candles_oi = list(reversed(history.candles))   # oldest → newest
        prices_oi = [c.close for c in candles_oi]
        n = len(candles_oi)

        sma20_s  = self._sma_series(prices_oi, 20)
        sma50_s  = self._sma_series(prices_oi, 50)
        sma200_s = self._sma_series(prices_oi, 200)
        rsi_s    = self._rsi_series(prices_oi, 14)
        macd_s, msig_s, mhist_s = self._macd_series(prices_oi)

        start = max(0, n - _CHART_WINDOW)
        chart_data: list[OHLCVPoint] = []
        for i in range(start, n):
            c = candles_oi[i]
            chart_data.append(OHLCVPoint(
                date=c.date.isoformat(),
                open=c.open,
                high=c.high,
                low=c.low,
                close=c.close,
                volume=c.volume,
                sma20=sma20_s[i],
                sma50=sma50_s[i],
                sma200=sma200_s[i],
                rsi=rsi_s[i],
                macd=macd_s[i],
                macd_signal=msig_s[i],
                macd_histogram=mhist_s[i],
            ))

        return TechnicalSignal(
            current_price=price,
            sma_20=sma20,
            sma_50=sma50,
            sma_200=sma200,
            rsi_14=rsi,
            rsi_label=rsi_label,
            macd_line=macd_line,
            macd_signal=signal_line,
            macd_histogram=histogram,
            macd_label=macd_label,
            volume_trend=vol_trend,
            price_trend=price_trend,
            high_52w=history.high_52w,
            low_52w=history.low_52w,
            position_52w_pct=history.position_52w,
            chart_data=chart_data,
        )

    # ------------------------------------------------------------------ #
    # SMA                                                                  #
    # ------------------------------------------------------------------ #

    def _sma(self, closes: list[float], period: int) -> Optional[float]:
        if len(closes) < period:
            return None
        return round(sum(closes[:period]) / period, 2)

    # ------------------------------------------------------------------ #
    # RSI (Wilder's smoothing)                                            #
    # ------------------------------------------------------------------ #

    def _rsi(self, closes: list[float], period: int = 14) -> Optional[float]:
        """
        RSI theo phương pháp Wilder.
        closes: mới nhất ở index 0 → đảo ngược để tính theo thời gian.
        """
        if len(closes) < period + 1:
            return None

        prices = list(reversed(closes))          # cũ → mới
        changes = [prices[i] - prices[i - 1] for i in range(1, len(prices))]

        gains = [max(c, 0) for c in changes]
        losses = [abs(min(c, 0)) for c in changes]

        # Khởi tạo: trung bình đơn giản của period đầu
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period

        # Wilder smoothing cho phần còn lại
        for i in range(period, len(changes)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        if avg_loss == 0:
            return 100.0

        rs = avg_gain / avg_loss
        return round(100 - (100 / (1 + rs)), 2)

    @staticmethod
    def _rsi_label(rsi: Optional[float]) -> Optional[str]:
        if rsi is None:
            return None
        if rsi >= 70:
            return "Quá mua"
        if rsi <= 30:
            return "Quá bán"
        return "Trung lập"

    # ------------------------------------------------------------------ #
    # MACD (12, 26, 9)                                                    #
    # ------------------------------------------------------------------ #

    def _macd(
        self, closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9
    ) -> tuple[Optional[float], Optional[float], Optional[float]]:
        if len(closes) < slow + signal:
            return None, None, None

        prices = list(reversed(closes))   # cũ → mới

        ema_fast = self._ema_series(prices, fast)   # len = N - fast + 1
        ema_slow = self._ema_series(prices, slow)   # len = N - slow + 1

        # ema_fast bắt đầu tại prices[fast-1], ema_slow tại prices[slow-1]
        # offset = slow - fast để align hai series
        offset = slow - fast
        n = len(ema_slow)
        macd_series = [ema_fast[i + offset] - ema_slow[i] for i in range(n)]

        if len(macd_series) < signal:
            return None, None, None

        signal_series = self._ema_series(macd_series, signal)

        latest_macd = macd_series[-1]
        latest_signal = signal_series[-1]
        histogram = round(latest_macd - latest_signal, 4)

        return round(latest_macd, 4), round(latest_signal, 4), histogram

    @staticmethod
    def _ema_series(values: list[float], period: int) -> list[float]:
        """EMA bắt đầu từ SMA của `period` điểm đầu."""
        if len(values) < period:
            return []
        k = 2 / (period + 1)
        ema = sum(values[:period]) / period
        result = [ema]
        for v in values[period:]:
            ema = v * k + ema * (1 - k)
            result.append(ema)
        return result

    # ------------------------------------------------------------------ #
    # Time-series helpers (oldest-first input, oldest-first output)       #
    # ------------------------------------------------------------------ #

    def _sma_series(self, prices: list[float], period: int) -> list[Optional[float]]:
        """SMA series với sliding window O(n). prices = oldest first."""
        n = len(prices)
        result: list[Optional[float]] = [None] * n
        if n < period:
            return result
        win = sum(prices[:period])
        result[period - 1] = round(win / period, 2)
        for i in range(period, n):
            win += prices[i] - prices[i - period]
            result[i] = round(win / period, 2)
        return result

    def _rsi_series(self, prices: list[float], period: int = 14) -> list[Optional[float]]:
        """RSI Wilder series. prices = oldest first."""
        n = len(prices)
        result: list[Optional[float]] = [None] * n
        if n < period + 1:
            return result

        changes = [prices[i] - prices[i - 1] for i in range(1, n)]
        gains  = [max(c, 0.0)        for c in changes]
        losses = [abs(min(c, 0.0))   for c in changes]

        avg_g = sum(gains[:period])  / period
        avg_l = sum(losses[:period]) / period

        def _r(ag: float, al: float) -> float:
            return 100.0 if al == 0 else round(100 - 100 / (1 + ag / al), 2)

        result[period] = _r(avg_g, avg_l)
        for i in range(period, n - 1):
            avg_g = (avg_g * (period - 1) + gains[i])  / period
            avg_l = (avg_l * (period - 1) + losses[i]) / period
            result[i + 1] = _r(avg_g, avg_l)
        return result

    def _macd_series(
        self, prices: list[float], fast: int = 12, slow: int = 26, signal: int = 9
    ) -> tuple[list[Optional[float]], list[Optional[float]], list[Optional[float]]]:
        """MACD/Signal/Histogram series. prices = oldest first. Each list same length as prices."""
        n = len(prices)
        macd_out:  list[Optional[float]] = [None] * n
        sig_out:   list[Optional[float]] = [None] * n
        hist_out:  list[Optional[float]] = [None] * n

        ema_f = self._ema_series(prices, fast)
        ema_s = self._ema_series(prices, slow)
        if not ema_s:
            return macd_out, sig_out, hist_out

        offset = slow - fast
        macd_vals = [ema_f[i + offset] - ema_s[i] for i in range(len(ema_s))]
        for i, m in enumerate(macd_vals):
            macd_out[slow - 1 + i] = round(m, 4)

        sig_vals = self._ema_series(macd_vals, signal)
        if not sig_vals:
            return macd_out, sig_out, hist_out

        sig_start = slow - 1 + signal - 1
        for i, s in enumerate(sig_vals):
            m = macd_vals[signal - 1 + i]
            sig_out[sig_start + i]  = round(s, 4)
            hist_out[sig_start + i] = round(m - s, 4)
        return macd_out, sig_out, hist_out

    @staticmethod
    def _macd_label(
        macd: Optional[float],
        signal: Optional[float],
        histogram: Optional[float],
    ) -> Optional[str]:
        if macd is None or signal is None or histogram is None:
            return None
        if macd > signal and histogram > 0:
            return "Mua"
        if macd < signal and histogram < 0:
            return "Bán"
        return "Chờ"

    # ------------------------------------------------------------------ #
    # Volume Trend                                                         #
    # ------------------------------------------------------------------ #

    def _volume_trend(self, volumes: list[int], short: int = 20, long: int = 60) -> Optional[str]:
        if len(volumes) < long:
            return None
        avg_short = sum(volumes[:short]) / short
        avg_long = sum(volumes[:long]) / long
        ratio = avg_short / avg_long if avg_long > 0 else 1.0
        if ratio >= 1.15:
            return "Tăng mạnh"
        if ratio >= 1.03:
            return "Tăng nhẹ"
        if ratio <= 0.85:
            return "Giảm mạnh"
        if ratio <= 0.97:
            return "Giảm nhẹ"
        return "Trung lập"

    # ------------------------------------------------------------------ #
    # Price Trend                                                          #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _price_trend(
        price: float,
        sma20: Optional[float],
        sma50: Optional[float],
        sma200: Optional[float],
    ) -> str:
        """
        Phân loại xu hướng dựa trên vị trí giá so với các đường MA.
        Tăng mạnh: price > SMA20 > SMA50 > SMA200
        Tích lũy: price dao động quanh SMA20/50
        Giảm: price < SMA50 và SMA50 < SMA200
        """
        above_20 = sma20 is not None and price > sma20
        above_50 = sma50 is not None and price > sma50
        above_200 = sma200 is not None and price > sma200
        golden_cross = (
            sma50 is not None and sma200 is not None and sma50 > sma200
        )

        if above_20 and above_50 and above_200 and golden_cross:
            return "Tăng mạnh"
        if not above_50 and not above_200 and not golden_cross:
            return "Giảm"
        if above_200 and not above_50:
            return "Điều chỉnh"
        return "Tích lũy"
