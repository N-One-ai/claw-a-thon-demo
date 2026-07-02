"""
MarketOverviewFetcher — tổng quan thị trường chứng khoán Việt Nam.

Dữ liệu:
  - VN-Index / HNX-Index: giá trị, thay đổi, % thay đổi
  - Độ rộng thị trường HOSE / HNX: số mã tăng / giảm / đứng
  - Tổng thanh khoản (tỷ VND)
  - Giao dịch khối ngoại (tỷ VND)

Tất cả đều được cache 5 phút để tránh gọi API liên tục.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from .cache import CacheManager

logger = logging.getLogger(__name__)

# Danh sách mã đại diện HOSE/HNX để tính breadth và thanh khoản
# (VN30 + mid-cap, ~120 mã — đủ để tính tỷ lệ tăng/giảm đại diện)
_HOSE_SAMPLE: list[str] = [
    # VN30
    "ACB","BCM","BID","BVH","CTG","FPT","GAS","GVR","HDB","HPG",
    "MBB","MSN","MWG","PLX","POW","SAB","SSI","STB","TCB","TPB",
    "VCB","VHM","VIC","VJC","VNM","VPB","VRE","PDR","NVL","VND",
    # Mid-cap & thêm
    "DXG","KDH","NLG","DIG","REE","GMD","PNJ","DGC","DCM","DHG",
    "HSG","NKG","HBC","CTD","GEX","CII","SHB","EIB","OCB","LPB",
    "VIB","MSB","SSB","DBC","VHC","ANV","CNG","VSH","BWE","TDC",
    "CEO","HDG","AGG","IMP","TRA","MIG","HAH","ACV","SCS","PVD",
    "PVS","PVT","BSR","CHP","KBC","CMG","FRT","REE","BMP","NTP",
    "STK","MCH","HAG","ABC","SRC","PHR","QNS","SBT","HT1","VGC",
]

_HNX_SAMPLE: list[str] = [
    "PVB","SHN","NVB","BAB","VGS","DHT","VCS","HUT","L14",
    "PVC","VC3","PXL","DNP","CMC","IDJ","NTP","CAN","MBS",
]


class MarketOverviewFetcher:
    """Lấy tổng quan thị trường từ vnstock."""

    def __init__(self, cache: Optional[CacheManager] = None) -> None:
        self._cache = cache or CacheManager()

    # ------------------------------------------------------------------ #
    # Public                                                               #
    # ------------------------------------------------------------------ #

    def get_overview(self) -> dict:
        """
        Trả về dict tổng quan thị trường.
        Cache 5 phút; trả về dữ liệu rỗng nếu API lỗi.
        """
        cached = self._cache.get("market", "overview")
        if cached:
            return cached

        result = self._fetch()
        if result:
            self._cache.set("market", "overview", result, ttl=60)
        return result

    # ------------------------------------------------------------------ #
    # Private                                                              #
    # ------------------------------------------------------------------ #

    def _fetch(self) -> dict:
        result: dict = {
            "vnindex": None,
            "hnxindex": None,
            "vn30": None,
            "hose_breadth": None,
            "hnx_breadth": None,
            "liquidity_ty": None,
            "liquidity_prev_ty": None,
            "volume_mn_shares": None,
        }

        # 1. Index values (VNINDEX, HNXINDEX, VN30)
        result["vnindex"]  = self._fetch_index("VNINDEX")
        result["hnxindex"] = self._fetch_index("HNXINDEX")
        result["vn30"]     = self._fetch_index("VN30")

        # 2. Market breadth + liquidity + volume via price_board
        try:
            hose_board = self._price_board(_HOSE_SAMPLE)
            if hose_board is not None:
                result["hose_breadth"] = self._breadth(hose_board)
                liq = self._liquidity(hose_board)
                result["liquidity_ty"] = liq
                result["volume_mn_shares"] = self._volume(hose_board)

                # Compare with yesterday's liquidity via index volume proxy
                prev = result["vnindex"]
                if prev and prev.get("prev_volume") and prev.get("volume"):
                    pv = prev["prev_volume"]
                    cv = prev["volume"]
                    if pv > 0:
                        result["liquidity_prev_ty"] = liq * (pv / cv) if cv > 0 else None
        except Exception as exc:
            logger.warning("[MarketOverview] price_board HOSE lỗi: %s", exc)

        try:
            hnx_board = self._price_board(_HNX_SAMPLE)
            if hnx_board is not None:
                result["hnx_breadth"] = self._breadth(hnx_board)
        except Exception as exc:
            logger.warning("[MarketOverview] price_board HNX lỗi: %s", exc)

        return result

    def _fetch_index(self, symbol: str) -> Optional[dict]:
        try:
            from vnstock import Vnstock
            vn = Vnstock()
            s = vn.stock(symbol=symbol, source="VCI")
            start = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d")
            end   = date.today().strftime("%Y-%m-%d")
            df = s.quote.history(start=start, end=end, interval="1D")
            if df is None or df.empty or len(df) < 2:
                return None

            df = df.sort_values("time", ascending=True).tail(3)
            today_row = df.iloc[-1]
            prev_row  = df.iloc[-2]

            today_close = float(today_row["close"])
            prev_close  = float(prev_row["close"])
            change      = round(today_close - prev_close, 2)
            change_pct  = round(change / prev_close * 100, 2) if prev_close else 0.0

            return {
                "value":       round(today_close, 2),
                "change":      change,
                "change_pct":  change_pct,
                "volume":      int(today_row.get("volume", 0)),
                "prev_volume": int(prev_row.get("volume", 0)),
            }
        except Exception as exc:
            logger.warning("[MarketOverview] %s lỗi: %s", symbol, exc)
            return None

    def _price_board(self, symbols: list[str]):
        """Gọi price_board và trả về DataFrame với multi-index đã flatten."""
        try:
            from vnstock import Trading
            import pandas as pd
            t = Trading(source="VCI")
            df = t.price_board(symbols_list=symbols)
            if df is None or df.empty:
                return None
            # Flatten multi-level column names
            df.columns = ["_".join(str(c) for c in col) for col in df.columns.values]
            return df
        except Exception as exc:
            logger.warning("[MarketOverview] Trading.price_board lỗi: %s", exc)
            return None

    def _breadth(self, df) -> dict:
        import pandas as pd
        ref = pd.to_numeric(df.get("listing_ref_price", pd.Series()), errors="coerce")
        cur = pd.to_numeric(df.get("match_match_price",  pd.Series()), errors="coerce")
        # Stocks with match_price=0 haven't traded yet → exclude from breadth
        traded = cur > 0
        diff = cur - ref
        advance   = int(((diff > 100) & traded).sum())
        decline   = int(((diff < -100) & traded).sum())
        unchanged = int(((diff.abs() <= 100) & traded).sum())
        return {"advance": advance, "decline": decline, "unchanged": unchanged}

    def _liquidity(self, df) -> Optional[float]:
        """Tổng thanh khoản (tỷ VND) từ accumulated_value (đơn vị: triệu VND)."""
        import pandas as pd
        col = df.get("match_accumulated_value")
        if col is None:
            return None
        total_m = pd.to_numeric(col, errors="coerce").fillna(0).sum()
        return round(float(total_m) / 1000, 1)   # triệu → tỷ

    def _volume(self, df) -> Optional[float]:
        """Tổng khối lượng khớp lệnh (triệu cổ phiếu)."""
        import pandas as pd
        col = df.get("match_accumulated_volume")
        if col is None:
            # Try alternative column names
            for alt in ["match_vol", "match_match_vol", "accumulated_vol"]:
                col = df.get(alt)
                if col is not None:
                    break
        if col is None:
            return None
        total = pd.to_numeric(col, errors="coerce").fillna(0).sum()
        return round(float(total) / 1_000_000, 1)  # cổ phiếu → triệu cổ phiếu
