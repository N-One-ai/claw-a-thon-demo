"""
MarketOverviewFetcher — tổng quan thị trường chứng khoán Việt Nam.

Nguồn: vnstock (VCI). API key đọc từ biến môi trường VNSTOCK_API_KEY.
Tự động khởi tạo key qua vnai.setup_api_key() khi module được import lần đầu.

Response JSON shape:
    {
        "vnindex": {"value": float, "change": float, "change_pct": float},
        "hose":    {"advance": int, "decline": int, "unchanged": int},
        "hnx":     {"value": float, "change": float, "change_pct": float,
                    "advance": int, "decline": int, "unchanged": int},
        "liquidity": float,   # tỷ VND — HOSE sample
        "volume":    float,   # triệu cổ phiếu — HOSE sample
        "errors":    list[str]
    }
"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Optional

from .cache import CacheManager

logger = logging.getLogger(__name__)

# ── API key bootstrap ─────────────────────────────────────────────────────────
# vnai reads VNSTOCK_API_KEY from env automatically for rate-limit tier.
# We also call setup_api_key() once so the key is persisted to disk and the
# device is registered — gives the "community" tier (60 req/min) instead of
# the unauthenticated "guest" tier (20 req/min).

_API_KEY_BOOTSTRAPPED = False


def _bootstrap_api_key() -> None:
    global _API_KEY_BOOTSTRAPPED
    if _API_KEY_BOOTSTRAPPED:
        return

    api_key = os.getenv("VNSTOCK_API_KEY", "").strip()
    if not api_key:
        logger.error(
            "[MarketOverview] VNSTOCK_API_KEY chưa được set. "
            "Dữ liệu sẽ bị giới hạn ở chế độ guest (20 req/phút). "
            "Set: export VNSTOCK_API_KEY=<your_key>"
        )
        _API_KEY_BOOTSTRAPPED = True
        return

    try:
        import vnai
        vnai.setup_api_key(api_key)
        logger.info("[MarketOverview] VNSTOCK_API_KEY đã được khởi tạo.")
    except Exception as exc:
        # Non-fatal — the env var is still picked up by vnai internally
        logger.warning("[MarketOverview] setup_api_key() thất bại: %s", exc)

    _API_KEY_BOOTSTRAPPED = True


# ── Representative HOSE / HNX sample for breadth & liquidity ─────────────────
# VN30 + mid-cap (~120 mã). Đủ để tính tỷ lệ tăng/giảm đại diện.

_HOSE_SAMPLE: list[str] = [
    # VN30
    "ACB", "BCM", "BID", "BVH", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG",
    "MBB", "MSN", "MWG", "PLX", "POW", "SAB", "SSI", "STB", "TCB", "TPB",
    "VCB", "VHM", "VIC", "VJC", "VNM", "VPB", "VRE", "PDR", "NVL", "VND",
    # Mid-cap
    "DXG", "KDH", "NLG", "DIG", "REE", "GMD", "PNJ", "DGC", "DCM", "DHG",
    "HSG", "NKG", "HBC", "CTD", "GEX", "CII", "SHB", "EIB", "OCB", "LPB",
    "VIB", "MSB", "SSB", "DBC", "VHC", "ANV", "CNG", "VSH", "BWE", "TDC",
    "CEO", "HDG", "AGG", "IMP", "TRA", "MIG", "HAH", "ACV", "SCS", "PVD",
    "PVS", "PVT", "BSR", "CHP", "KBC", "CMG", "FRT", "BMP", "NTP", "STK",
    "MCH", "HAG", "SRC", "PHR", "QNS", "SBT", "HT1", "VGC",
]

_HNX_SAMPLE: list[str] = [
    "PVB", "SHN", "NVB", "BAB", "VGS", "DHT", "VCS", "HUT", "L14",
    "PVC", "VC3", "DNP", "CMC", "NTP", "CAN", "MBS",
]


# ── MarketOverviewFetcher ─────────────────────────────────────────────────────

class MarketOverviewFetcher:
    """Lấy tổng quan thị trường; cache 60 giây."""

    def __init__(self, cache: Optional[CacheManager] = None) -> None:
        self._cache = cache or CacheManager()
        _bootstrap_api_key()

    # ── Public ────────────────────────────────────────────────────────────────

    def get_overview(self) -> dict:
        """Trả về dict tổng quan thị trường, cache 60 giây."""
        cached = self._cache.get("market", "overview")
        if cached:
            return cached

        result = self._fetch()
        # Only cache if we got at least some data (avoid caching total failure)
        if any(v is not None for k, v in result.items() if k != "errors"):
            self._cache.set("market", "overview", result, ttl=60)
        return result

    # ── Private ───────────────────────────────────────────────────────────────

    def _fetch(self) -> dict:
        errors: list[str] = []

        result: dict = {
            "vnindex":   None,
            "hose":      None,
            "hnx":       None,
            "liquidity": None,
            "volume":    None,
            "errors":    errors,
        }

        # 1. VN-Index
        try:
            result["vnindex"] = self._fetch_index("VNINDEX")
        except Exception as exc:
            msg = f"VN-Index: {exc}"
            logger.warning("[MarketOverview] %s", msg)
            errors.append(msg)

        # 2. HNX-Index
        try:
            hnx_idx = self._fetch_index("HNXINDEX")
        except Exception as exc:
            msg = f"HNX-Index: {exc}"
            logger.warning("[MarketOverview] %s", msg)
            errors.append(msg)
            hnx_idx = None

        # 3. HOSE price_board → breadth + liquidity + volume
        try:
            hose_df = self._price_board(_HOSE_SAMPLE)
            if hose_df is not None:
                result["hose"]      = self._breadth(hose_df)
                result["liquidity"] = self._liquidity_ty(hose_df)
                result["volume"]    = self._volume_mn(hose_df)
        except Exception as exc:
            msg = f"HOSE price_board: {exc}"
            logger.warning("[MarketOverview] %s", msg)
            errors.append(msg)

        # 4. HNX price_board → breadth (merge with index value)
        try:
            hnx_df = self._price_board(_HNX_SAMPLE)
            hnx_breadth = self._breadth(hnx_df) if hnx_df is not None else {}
        except Exception as exc:
            msg = f"HNX price_board: {exc}"
            logger.warning("[MarketOverview] %s", msg)
            errors.append(msg)
            hnx_breadth = {}

        # Merge HNX index value with HNX breadth into single "hnx" object
        result["hnx"] = {**(hnx_idx or {}), **hnx_breadth} or None

        return result

    def _fetch_index(self, symbol: str) -> Optional[dict]:
        """Lấy giá trị chỉ số và thay đổi so với phiên trước."""
        from vnstock import Vnstock
        vn = Vnstock()
        s = vn.stock(symbol=symbol, source="VCI")
        start = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d")
        end   = date.today().strftime("%Y-%m-%d")
        df = s.quote.history(start=start, end=end, interval="1D")
        if df is None or df.empty or len(df) < 2:
            return None

        df = df.sort_values("time", ascending=True).tail(3)
        today = df.iloc[-1]
        prev  = df.iloc[-2]

        close_now  = float(today["close"])
        close_prev = float(prev["close"])
        change     = round(close_now - close_prev, 2)
        change_pct = round(change / close_prev * 100, 2) if close_prev else 0.0

        return {
            "value":      round(close_now, 2),
            "change":     change,
            "change_pct": change_pct,
        }

    def _price_board(self, symbols: list[str]):
        """Gọi price_board và flatten multi-level columns."""
        from vnstock import Trading
        import pandas as pd

        t = Trading(source="VCI")
        df = t.price_board(symbols_list=symbols)
        if df is None or df.empty:
            return None
        df.columns = ["_".join(str(c) for c in col) for col in df.columns.values]
        return df

    def _breadth(self, df) -> dict:
        """Tính số mã tăng / đứng / giảm từ price_board DataFrame."""
        import pandas as pd

        ref = pd.to_numeric(df.get("listing_ref_price",  pd.Series(dtype=float)), errors="coerce")
        cur = pd.to_numeric(df.get("match_match_price",  pd.Series(dtype=float)), errors="coerce")

        # Exclude stocks that haven't started trading (cur == 0 or NaN)
        traded = cur > 0
        diff   = cur - ref

        return {
            "advance":   int(((diff >  100) & traded).sum()),
            "decline":   int(((diff < -100) & traded).sum()),
            "unchanged": int(((diff.abs() <= 100) & traded).sum()),
        }

    def _liquidity_ty(self, df) -> Optional[float]:
        """Tổng giá trị giao dịch (tỷ VND). match_accumulated_value đơn vị: triệu VND."""
        import pandas as pd

        col = df.get("match_accumulated_value")
        if col is None:
            return None
        total_m = pd.to_numeric(col, errors="coerce").fillna(0).sum()
        return round(float(total_m) / 1_000, 1)  # triệu → tỷ

    def _volume_mn(self, df) -> Optional[float]:
        """Tổng khối lượng giao dịch (triệu cổ phiếu). match_accumulated_volume đơn vị: cổ phiếu."""
        import pandas as pd

        col = df.get("match_accumulated_volume")
        if col is None:
            return None
        total = pd.to_numeric(col, errors="coerce").fillna(0).sum()
        return round(float(total) / 1_000_000, 1)  # CP → triệu CP
