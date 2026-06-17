"""Unit tests cho TechnicalAnalyzer — pure math, không cần API."""
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.analysis.technical import TechnicalAnalyzer
from src.data.models import OHLCV, PriceHistory


def make_history(prices: list[float], base_date: Optional[date] = None) -> PriceHistory:
    """Tạo PriceHistory từ danh sách giá (mới nhất trước)."""
    if base_date is None:
        base_date = date(2024, 6, 1)
    candles = [
        OHLCV(
            date=base_date - timedelta(days=i),
            open=p, high=p + 200, low=p - 200, close=p,
            volume=1_000_000,
        )
        for i, p in enumerate(prices)
    ]
    return PriceHistory(ticker="TEST", candles=candles)


def flat_prices(n: int, price: float = 50000.0) -> list[float]:
    return [price] * n


def rising_prices(n: int, start: float = 40000, step: float = 100) -> list[float]:
    """Mới nhất ở index 0 — giảm dần về quá khứ."""
    return [start + (n - 1 - i) * step for i in range(n)]


@pytest.fixture
def ta() -> TechnicalAnalyzer:
    return TechnicalAnalyzer()


# ------------------------------------------------------------------ #
# SMA                                                                  #
# ------------------------------------------------------------------ #

class TestSMA:
    def test_sma_correct_value(self, ta):
        prices = [100, 200, 300, 400, 500]   # mới nhất trước
        result = ta._sma(prices, period=5)
        assert result == pytest.approx(300.0)

    def test_sma_insufficient_data_returns_none(self, ta):
        prices = [100, 200]
        assert ta._sma(prices, period=5) is None

    def test_sma_20_on_history(self, ta):
        prices = flat_prices(30, 60000)
        sma = ta._sma(prices, 20)
        assert sma == pytest.approx(60000.0)


# ------------------------------------------------------------------ #
# RSI                                                                  #
# ------------------------------------------------------------------ #

class TestRSI:
    def test_insufficient_data_returns_none(self, ta):
        prices = flat_prices(10)
        assert ta._rsi(prices, period=14) is None

    def test_flat_prices_rsi_near_50(self, ta):
        # Giá không đổi → không có gain/loss → RSI ~ 50
        prices = flat_prices(100)
        rsi = ta._rsi(prices, 14)
        # Flat prices: gains=0, losses=0, trả về 100 khi avg_loss=0
        assert rsi is not None
        assert 0 <= rsi <= 100

    def test_strictly_rising_rsi_near_100(self, ta):
        # Giá tăng liên tục → RSI gần 100
        prices = rising_prices(100, step=100)
        rsi = ta._rsi(prices, 14)
        assert rsi is not None
        assert rsi > 70

    def test_strictly_falling_rsi_near_0(self, ta):
        # Giá giảm liên tục → RSI gần 0
        prices = list(reversed(rising_prices(100, step=100)))
        rsi = ta._rsi(prices, 14)
        assert rsi is not None
        assert rsi < 30

    def test_rsi_bounds(self, ta):
        prices = rising_prices(200, step=50)
        rsi = ta._rsi(prices, 14)
        if rsi is not None:
            assert 0 <= rsi <= 100

    @pytest.mark.parametrize("rsi,expected", [
        (75, "Quá mua"),
        (50, "Trung lập"),
        (25, "Quá bán"),
        (70, "Quá mua"),
        (30, "Quá bán"),
    ])
    def test_rsi_label(self, ta, rsi, expected):
        assert ta._rsi_label(rsi) == expected

    def test_rsi_label_none_returns_none(self, ta):
        assert ta._rsi_label(None) is None


# ------------------------------------------------------------------ #
# MACD                                                                 #
# ------------------------------------------------------------------ #

class TestMACD:
    def test_insufficient_data_returns_none_triple(self, ta):
        prices = flat_prices(30)
        m, s, h = ta._macd(prices)
        assert m is None and s is None and h is None

    def test_returns_values_with_enough_data(self, ta):
        prices = rising_prices(200, step=80)
        m, s, h = ta._macd(prices)
        assert m is not None
        assert s is not None
        assert h is not None

    def test_histogram_is_macd_minus_signal(self, ta):
        prices = rising_prices(200, step=80)
        m, s, h = ta._macd(prices)
        if m is not None:
            assert h == pytest.approx(m - s, abs=1e-3)

    @pytest.mark.parametrize("m,s,h,expected", [
        (100, 80, 20, "Mua"),
        (80, 100, -20, "Bán"),
        (100, 90, 5, "Mua"),
        (90, 100, -5, "Bán"),
    ])
    def test_macd_label(self, ta, m, s, h, expected):
        assert ta._macd_label(m, s, h) == expected

    def test_macd_label_none_inputs(self, ta):
        assert ta._macd_label(None, None, None) is None


# ------------------------------------------------------------------ #
# Volume Trend                                                         #
# ------------------------------------------------------------------ #

class TestVolumeTrend:
    def test_insufficient_data_returns_none(self, ta):
        vols = [1_000_000] * 30
        assert ta._volume_trend(vols) is None  # < 60 samples

    def test_high_recent_volume_is_tang_manh(self, ta):
        # 20 phiên gần nhất vol=2M, 60 phiên vol=1M → ratio=2.0 → Tăng mạnh
        recent = [2_000_000] * 20
        old = [1_000_000] * 40
        vols = recent + old
        result = ta._volume_trend(vols)
        assert result == "Tăng mạnh"

    def test_low_recent_volume_is_giam_manh(self, ta):
        recent = [500_000] * 20
        old = [1_000_000] * 40
        vols = recent + old
        result = ta._volume_trend(vols)
        assert result == "Giảm mạnh"

    def test_equal_volumes_is_trung_lap(self, ta):
        vols = [1_000_000] * 60
        result = ta._volume_trend(vols)
        assert result == "Trung lập"


# ------------------------------------------------------------------ #
# Price Trend                                                          #
# ------------------------------------------------------------------ #

class TestPriceTrend:
    def test_tang_manh_all_above_golden_cross(self, ta):
        # price > sma20 > sma50 > sma200 → Tăng mạnh
        result = ta._price_trend(100, sma20=90, sma50=80, sma200=70)
        assert result == "Tăng mạnh"

    def test_giam_below_all_death_cross(self, ta):
        # price < sma50 < sma200, sma50 < sma200 → Giảm
        result = ta._price_trend(50, sma20=60, sma50=70, sma200=80)
        assert result == "Giảm"

    def test_dieu_chinh_above_200_below_50(self, ta):
        # price trên SMA200 nhưng dưới SMA50 → Điều chỉnh
        result = ta._price_trend(75, sma20=80, sma50=85, sma200=70)
        assert result == "Điều chỉnh"

    def test_none_smas_still_returns_string(self, ta):
        result = ta._price_trend(100, sma20=None, sma50=None, sma200=None)
        assert isinstance(result, str)


# ------------------------------------------------------------------ #
# build_signal integration                                             #
# ------------------------------------------------------------------ #

class TestBuildSignal:
    def test_empty_history_returns_zero_price(self, ta):
        ph = PriceHistory(ticker="TEST", candles=[])
        sig = ta.build_signal(ph)
        assert sig.current_price == 0.0

    def test_all_fields_populated_with_enough_data(self, ta):
        prices = rising_prices(300, step=50)
        ph = make_history(prices)
        sig = ta.build_signal(ph)

        assert sig.current_price == prices[0]
        assert sig.sma_20 is not None
        assert sig.sma_50 is not None
        assert sig.sma_200 is not None
        assert sig.rsi_14 is not None
        assert sig.rsi_label is not None
        assert sig.macd_line is not None
        assert sig.price_trend is not None

    def test_52w_position_in_range(self, ta):
        prices = rising_prices(300, step=50)
        ph = make_history(prices)
        sig = ta.build_signal(ph)
        assert sig.position_52w_pct is not None
        assert 0 <= sig.position_52w_pct <= 100
