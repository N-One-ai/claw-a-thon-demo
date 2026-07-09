"""
MarketOverviewFetcher — tổng quan thị trường chứng khoán Việt Nam.

Nguồn: vnstock (VCI). API key đọc từ biến môi trường VNSTOCK_API_KEY.
Sử dụng vnstock.api.Quote (API mới, không deprecated).

Response JSON shape:
    {
        "vnindex":   {"value": float, "change": float, "change_pct": float},
        "hose":      {"advance": int, "decline": int, "unchanged": int},
        "hnx":       {"value": float, "change": float, "change_pct": float,
                      "advance": int, "decline": int, "unchanged": int},
        "liquidity": float,    # tỷ VND — tổng giá trị HOSE sample
        "volume":    float,    # triệu CP  — tổng khối lượng HOSE sample
        "errors":    list[str]
    }
"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Optional

from ._utils import vnstock_call
from .cache import CacheManager

logger = logging.getLogger(__name__)

# ── API key bootstrap ─────────────────────────────────────────────────────────
# vnai đọc VNSTOCK_API_KEY từ env tự động để xác định tier rate-limit.
# Gọi setup_api_key() một lần để đăng ký device và unlock community tier
# (60 req/phút) thay vì guest tier (20 req/phút).

_BOOTSTRAPPED = False


def _bootstrap_api_key() -> None:
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        return
    _BOOTSTRAPPED = True

    api_key = os.getenv("VNSTOCK_API_KEY", "").strip()
    if not api_key:
        logger.error(
            "[MarketOverview] VNSTOCK_API_KEY chưa được set. "
            "Chạy ở chế độ guest (20 req/phút). "
            "Hướng dẫn: export VNSTOCK_API_KEY=<key>"
        )
        return

    try:
        import vnai
        vnai.setup_api_key(api_key)
        logger.info("[MarketOverview] VNSTOCK_API_KEY đã khởi tạo.")
    except Exception as exc:
        # Non-fatal: env var vẫn được vnai đọc ngầm
        logger.warning("[MarketOverview] setup_api_key() lỗi: %s", exc)


# ── Danh sách mã đại diện HOSE/HNX để tính breadth ──────────────────────────
# VN30 + mid-cap (~120 mã): đủ để tính tỷ lệ tăng/giảm đại diện.

_HOSE_SAMPLE: list[str] = [
    "ACB","BCM","BID","BVH","CTG","FPT","GAS","GVR","HDB","HPG",
    "MBB","MSN","MWG","PLX","POW","SAB","SSI","STB","TCB","TPB",
    "VCB","VHM","VIC","VJC","VNM","VPB","VRE","PDR","NVL","VND",
    "DXG","KDH","NLG","DIG","REE","GMD","PNJ","DGC","DCM","DHG",
    "HSG","NKG","HBC","CTD","GEX","CII","SHB","EIB","OCB","LPB",
    "VIB","MSB","SSB","DBC","VHC","ANV","CNG","VSH","BWE","TDC",
    "CEO","HDG","AGG","IMP","TRA","MIG","HAH","ACV","SCS","PVD",
    "PVS","PVT","BSR","CHP","KBC","CMG","FRT","BMP","NTP","STK",
    "MCH","HAG","SRC","PHR","QNS","SBT","HT1","VGC",
]

_HNX_SAMPLE: list[str] = [
    "PVB","SHN","NVB","BAB","VGS","DHT","VCS","HUT","L14",
    "PVC","VC3","DNP","CMC","NTP","CAN","MBS",
]


# ── MarketOverviewFetcher ─────────────────────────────────────────────────────

class MarketOverviewFetcher:
    """Lấy tổng quan thị trường; cache 60 giây."""

    def __init__(self, cache: Optional[CacheManager] = None) -> None:
        self._cache = cache or CacheManager()
        _bootstrap_api_key()

    # ── Public ────────────────────────────────────────────────────────────────

    def get_overview(self) -> dict:
        cached = self._cache.get("market", "overview")
        if cached:
            return cached

        result = self._fetch()
        # Chỉ cache khi có ít nhất một trường dữ liệu
        if any(result.get(k) is not None for k in ("vnindex", "hose", "hnx", "liquidity", "volume")):
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
            msg = f"VNINDEX: {exc}"
            logger.warning("[MarketOverview] %s", msg)
            errors.append(msg)

        # 2. HNX-Index
        hnx_idx: Optional[dict] = None
        try:
            hnx_idx = self._fetch_index("HNXINDEX")
        except Exception as exc:
            msg = f"HNXINDEX: {exc}"
            logger.warning("[MarketOverview] %s", msg)
            errors.append(msg)

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

        # 4. HNX price_board → breadth; merge với HNX index value
        hnx_breadth: dict = {}
        try:
            hnx_df = self._price_board(_HNX_SAMPLE)
            if hnx_df is not None:
                hnx_breadth = self._breadth(hnx_df)
        except Exception as exc:
            msg = f"HNX price_board: {exc}"
            logger.warning("[MarketOverview] %s", msg)
            errors.append(msg)

        # Gộp HNX index value + breadth vào một object "hnx"
        hnx_merged = {**(hnx_idx or {}), **hnx_breadth}
        result["hnx"] = hnx_merged if hnx_merged else None

        return result

    def _fetch_index(self, symbol: str) -> Optional[dict]:
        """Lấy giá trị chỉ số và thay đổi so với phiên trước (dùng Quote API mới)."""
        from vnstock.api.quote import Quote

        q     = Quote(symbol=symbol, source="VCI")
        start = (date.today() - timedelta(days=10)).strftime("%Y-%m-%d")
        end   = date.today().strftime("%Y-%m-%d")
        with vnstock_call(f"Quote.history/{symbol}"):
            df = q.history(start=start, end=end, interval="1D")

        if df is None or df.empty or len(df) < 2:
            return None

        df = df.sort_values("time", ascending=True)
        today_close = float(df.iloc[-1]["close"])
        prev_close  = float(df.iloc[-2]["close"])
        change      = round(today_close - prev_close, 2)
        change_pct  = round(change / prev_close * 100, 2) if prev_close else 0.0

        return {
            "value":      round(today_close, 2),
            "change":     change,
            "change_pct": change_pct,
        }

    def _price_board(self, symbols: list[str]):
        """Gọi Trading.price_board() và flatten multi-level columns."""
        from vnstock.api.trading import Trading

        t = Trading(source="VCI")
        with vnstock_call("Trading.price_board"):
            df = t.price_board(symbols_list=symbols)
        if df is None or df.empty:
            return None
        df.columns = ["_".join(str(c) for c in col) for col in df.columns.values]
        return df

    def _breadth(self, df) -> dict:
        import pandas as pd

        ref    = pd.to_numeric(df.get("listing_ref_price", pd.Series(dtype=float)), errors="coerce")
        cur    = pd.to_numeric(df.get("match_match_price", pd.Series(dtype=float)), errors="coerce")
        traded = cur > 0            # loại mã chưa khớp lệnh
        diff   = cur - ref

        return {
            "advance":   int(((diff >  100) & traded).sum()),
            "decline":   int(((diff < -100) & traded).sum()),
            "unchanged": int(((diff.abs() <= 100) & traded).sum()),
        }

    def _liquidity_ty(self, df) -> Optional[float]:
        """Tổng giá trị (tỷ VND). match_accumulated_value đơn vị: triệu VND."""
        import pandas as pd

        col = df.get("match_accumulated_value")
        if col is None:
            return None
        return round(float(pd.to_numeric(col, errors="coerce").fillna(0).sum()) / 1_000, 1)

    def _volume_mn(self, df) -> Optional[float]:
        """Tổng khối lượng (triệu CP). match_accumulated_volume đơn vị: cổ phiếu."""
        import pandas as pd

        col = df.get("match_accumulated_volume")
        if col is None:
            return None
        return round(float(pd.to_numeric(col, errors="coerce").fillna(0).sum()) / 1_000_000, 1)
