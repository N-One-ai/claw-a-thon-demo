"""
CompanyDataFetcher — lấy thông tin doanh nghiệp từ vnstock.
"""
from __future__ import annotations

import logging
from typing import Optional

from ._utils import find_col, safe_float, safe_int, safe_str, with_retry
from .cache import CacheManager
from .models import CompanyInfo, Exchange, Sector

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ #
# Sector mapping                                                        #
# ------------------------------------------------------------------ #

_SECTOR_KEYWORDS: list[tuple[str, Sector]] = [
    ("ngân hàng",                  Sector.BANKING),
    ("bank",                       Sector.BANKING),
    ("bất động sản",               Sector.REAL_ESTATE),
    ("real estate",                Sector.REAL_ESTATE),
    ("công nghệ",                  Sector.TECHNOLOGY),
    ("technology",                 Sector.TECHNOLOGY),
    ("phần mềm",                   Sector.TECHNOLOGY),
    ("software",                   Sector.TECHNOLOGY),
    ("hàng tiêu dùng thiết yếu",   Sector.CONSUMER_STAPLES),
    ("consumer staples",           Sector.CONSUMER_STAPLES),
    ("thực phẩm",                  Sector.CONSUMER_STAPLES),
    ("food",                       Sector.CONSUMER_STAPLES),
    ("hàng tiêu dùng",             Sector.CONSUMER_DISCRETIONARY),
    ("consumer discretionary",     Sector.CONSUMER_DISCRETIONARY),
    ("bán lẻ",                     Sector.CONSUMER_DISCRETIONARY),
    ("retail",                     Sector.CONSUMER_DISCRETIONARY),
    ("công nghiệp",                Sector.INDUSTRIALS),
    ("industrial",                 Sector.INDUSTRIALS),
    ("sản xuất",                   Sector.INDUSTRIALS),
    ("manufacturing",              Sector.INDUSTRIALS),
    ("xây dựng",                   Sector.INDUSTRIALS),
    ("construction",               Sector.INDUSTRIALS),
    ("vật liệu",                   Sector.MATERIALS),
    ("material",                   Sector.MATERIALS),
    ("thép",                       Sector.MATERIALS),
    ("steel",                      Sector.MATERIALS),
    ("hóa chất",                   Sector.MATERIALS),
    ("chemical",                   Sector.MATERIALS),
    ("năng lượng",                 Sector.ENERGY),
    ("energy",                     Sector.ENERGY),
    ("dầu khí",                    Sector.ENERGY),
    ("oil",                        Sector.ENERGY),
    ("gas",                        Sector.ENERGY),
    ("tiện ích",                   Sector.UTILITIES),
    ("utilities",                  Sector.UTILITIES),
    ("điện",                       Sector.UTILITIES),
    ("electric",                   Sector.UTILITIES),
    ("nước",                       Sector.UTILITIES),
    ("water",                      Sector.UTILITIES),
    ("y tế",                       Sector.HEALTHCARE),
    ("healthcare",                 Sector.HEALTHCARE),
    ("dược",                       Sector.HEALTHCARE),
    ("pharma",                     Sector.HEALTHCARE),
    ("dịch vụ tài chính",          Sector.FINANCIALS),
    ("financial service",          Sector.FINANCIALS),
    ("chứng khoán",                Sector.FINANCIALS),
    ("securities",                 Sector.FINANCIALS),
    ("bảo hiểm",                   Sector.FINANCIALS),
    ("insurance",                  Sector.FINANCIALS),
]


def _map_sector(*raw_values: Optional[str]) -> Sector:
    """Thử nhiều trường sector theo thứ tự ưu tiên."""
    for raw in raw_values:
        if not raw:
            continue
        lower = raw.lower().strip()
        for keyword, sector in _SECTOR_KEYWORDS:
            if keyword in lower:
                return sector
    return Sector.UNKNOWN


def _map_exchange(raw: Optional[str]) -> Exchange:
    if not raw:
        return Exchange.HOSE
    upper = raw.upper().strip()
    if upper in ("HSX", "HOSE"):
        return Exchange.HOSE
    if upper == "HNX":
        return Exchange.HNX
    if upper in ("UPC", "UPCOM"):
        return Exchange.UPCOM
    return Exchange.HOSE


# ------------------------------------------------------------------ #
# CompanyDataFetcher                                                    #
# ------------------------------------------------------------------ #

class CompanyDataFetcher:
    """Lấy thông tin định tính của doanh nghiệp từ vnstock."""

    def __init__(
        self,
        cache: Optional[CacheManager] = None,
        source: str = "VCI",
    ) -> None:
        self._cache = cache or CacheManager()
        self._source = source
        self._vn = None  # lazy init

    # ------------------------------------------------------------------ #
    # Public API                                                            #
    # ------------------------------------------------------------------ #

    def get_company_info(self, ticker: str) -> CompanyInfo:
        """Trả về CompanyInfo, cache 7 ngày."""
        ticker = ticker.upper()
        cached = self._cache.get("company_info", ticker)
        if cached:
            return CompanyInfo(**cached)

        info = self._fetch_company_info(ticker)
        self._cache.set("company_info", ticker, info.model_dump())
        return info

    def get_shareholders(self, ticker: str) -> list[dict]:
        """Danh sách cổ đông lớn."""
        ticker = ticker.upper()
        cached = self._cache.get("company_info", f"{ticker}_shareholders")
        if cached:
            return cached
        try:
            data = self._fetch_shareholders(ticker)
            self._cache.set("company_info", f"{ticker}_shareholders", data)
            return data
        except Exception as exc:
            logger.warning("[Company] Shareholders %s: %s", ticker, exc)
            return []

    def get_officers(self, ticker: str) -> list[dict]:
        """Ban lãnh đạo."""
        ticker = ticker.upper()
        cached = self._cache.get("company_info", f"{ticker}_officers")
        if cached:
            return cached
        try:
            data = self._fetch_officers(ticker)
            self._cache.set("company_info", f"{ticker}_officers", data)
            return data
        except Exception as exc:
            logger.warning("[Company] Officers %s: %s", ticker, exc)
            return []

    def get_events(self, ticker: str) -> list[dict]:
        """Sự kiện sắp tới (cổ tức, họp ĐHCĐ...)."""
        ticker = ticker.upper()
        try:
            return self._fetch_events(ticker)
        except Exception as exc:
            logger.warning("[Company] Events %s: %s", ticker, exc)
            return []

    def get_dividends(self, ticker: str) -> list[dict]:
        """Lịch sử trả cổ tức."""
        ticker = ticker.upper()
        cached = self._cache.get("company_info", f"{ticker}_dividends")
        if cached:
            return cached
        try:
            data = self._fetch_dividends(ticker)
            self._cache.set("company_info", f"{ticker}_dividends", data)
            return data
        except Exception as exc:
            logger.warning("[Company] Dividends %s: %s", ticker, exc)
            return []

    # ------------------------------------------------------------------ #
    # Private fetch methods                                                 #
    # ------------------------------------------------------------------ #

    @with_retry(max_attempts=3, initial_delay=1.0, exceptions=(Exception,))
    def _fetch_company_info(self, ticker: str) -> CompanyInfo:
        stock = self._get_vn().stock(symbol=ticker, source=self._source)

        # 1) overview
        overview_row: dict = {}
        try:
            ov = stock.company.overview()
            if ov is not None and not ov.empty:
                overview_row = ov.iloc[0].to_dict()
        except Exception as exc:
            logger.debug("[Company] overview %s: %s", ticker, exc)

        # 2) profile (mô tả dài)
        description: Optional[str] = None
        try:
            prof = stock.company.profile()
            if prof is not None and not prof.empty:
                desc_col = find_col(prof, "companyProfile", "company_profile",
                                    "businessActivities", "aboutCompany",
                                    "Giới thiệu công ty", "description")
                if desc_col is not None:
                    description = safe_str(desc_col.iloc[0])
        except Exception:
            pass

        # --- parse overview fields -----------------------------------------
        def _ov(*keys: str) -> Optional[str]:
            for k in keys:
                v = overview_row.get(k)
                if v is not None:
                    s = safe_str(str(v))
                    if s:
                        return s
            return None

        name = _ov("shortName", "companyName", "company_name", "fullName") or ticker

        exchange_raw = _ov("exchange", "exchangeName", "listingPlace", "listingplace")
        exchange = _map_exchange(exchange_raw)

        sector = _map_sector(
            _ov("icbName3", "icbName2", "icbName1"),
            _ov("industryName", "industry", "sector"),
        )
        industry = _ov("icbName4", "icbName3", "subIndustry", "industryName") or None

        shares_raw = (
            overview_row.get("shareOutstanding")
            or overview_row.get("outstandingShare")
            or overview_row.get("klcpniemyet")
            or overview_row.get("issueShare")
            or 0
        )
        shares_million = (safe_float(shares_raw) or 0.0) / 1_000_000
        if shares_million <= 0:
            shares_million = 1.0  # fallback tránh chia 0

        return CompanyInfo(
            ticker=ticker,
            name=name,
            exchange=exchange,
            sector=sector,
            industry=industry,
            shares_outstanding=shares_million,
            description=description or _ov("companyProfile", "company_profile") or None,
            website=_ov("website", "Website") or None,
        )

    @with_retry(max_attempts=2, initial_delay=1.0, exceptions=(Exception,))
    def _fetch_shareholders(self, ticker: str) -> list[dict]:
        stock = self._get_vn().stock(symbol=ticker, source=self._source)
        df = stock.company.shareholders()
        if df is None or df.empty:
            return []
        results = []
        for _, row in df.iterrows():
            results.append({
                "name": safe_str(row.get("no_shareholders", row.get("name", row.get("shareholder_name", "")))),
                "share_quantity": safe_float(row.get("share_quantity", row.get("shareQuantity", row.get("shares")))),
                "share_pct": safe_float(row.get("share_own_percent", row.get("percentage", row.get("pct")))),
            })
        return results

    @with_retry(max_attempts=2, initial_delay=1.0, exceptions=(Exception,))
    def _fetch_officers(self, ticker: str) -> list[dict]:
        stock = self._get_vn().stock(symbol=ticker, source=self._source)
        df = stock.company.officers()
        if df is None or df.empty:
            return []
        results = []
        for _, row in df.iterrows():
            results.append({
                "name": safe_str(row.get("officer_name", row.get("name", row.get("fullName", "")))),
                "title": safe_str(row.get("officer_position", row.get("position", row.get("title", "")))),
                "share_pct": safe_float(row.get("share_own_percent", row.get("percentage"))),
            })
        return results

    @with_retry(max_attempts=2, initial_delay=1.0, exceptions=(Exception,))
    def _fetch_events(self, ticker: str) -> list[dict]:
        stock = self._get_vn().stock(symbol=ticker, source=self._source)
        df = stock.company.events()
        if df is None or df.empty:
            return []
        results = []
        for _, row in df.iterrows():
            results.append({
                "date": safe_str(row.get("exRightDate", row.get("date", row.get("eventDate", "")))),
                "type": safe_str(row.get("eventCode", row.get("type", row.get("event_type", "")))),
                "title": safe_str(row.get("eventTitle", row.get("title", row.get("event_name", "")))),
                "value": safe_str(row.get("eventDesc", row.get("description", row.get("value", "")))),
            })
        return results

    @with_retry(max_attempts=2, initial_delay=1.0, exceptions=(Exception,))
    def _fetch_dividends(self, ticker: str) -> list[dict]:
        stock = self._get_vn().stock(symbol=ticker, source=self._source)
        df = stock.company.dividends()
        if df is None or df.empty:
            return []
        results = []
        for _, row in df.iterrows():
            results.append({
                "exercise_date": safe_str(row.get("exerciseDate", row.get("date", ""))),
                "cash_year": safe_int(row.get("cashYear", row.get("year"))),
                "cash_dividend_pct": safe_float(row.get("cashDividend", row.get("dividend_pct", row.get("rate")))),
                "issue_method": safe_str(row.get("issueMethod", row.get("type", ""))),
            })
        return results

    # ------------------------------------------------------------------ #
    # Lazy init                                                             #
    # ------------------------------------------------------------------ #

    def _get_vn(self):
        if self._vn is None:
            try:
                from vnstock import Vnstock
                self._vn = Vnstock()
            except ImportError as exc:
                raise RuntimeError("pip install vnstock") from exc
        return self._vn
