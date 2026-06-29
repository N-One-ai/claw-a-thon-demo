from __future__ import annotations

import logging
import re
import ssl
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional

from .cache import CacheManager
from .models import NewsItem

logger = logging.getLogger(__name__)

# RSS feeds của các nguồn tin tức tài chính Việt Nam
_RSS_SOURCES: list[dict] = [
    {
        "name": "CafeF",
        "url": "https://cafef.vn/thi-truong-chung-khoan.rss",
        "encoding": "utf-8",
    },
    {
        "name": "CafeF-DN",
        "url": "https://cafef.vn/doanh-nghiep.rss",
        "encoding": "utf-8",
    },
    {
        "name": "VnEconomy",
        "url": "https://vneconomy.vn/chung-khoan.rss",
        "encoding": "utf-8",
    },
    {
        "name": "Vietstock",
        "url": "https://vietstock.vn/736/chung-khoan.rss",
        "encoding": "utf-8",
    },
]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; StockAnalysisBot/1.0; "
        "+https://github.com/N-One-ai/agent)"
    )
}


def _ssl_context() -> ssl.SSLContext:
    """Tạo SSL context với certifi, fallback về default."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


class NewsClient:
    """
    Thu thập tin tức tài chính từ RSS feeds của CafeF, VnEconomy, Vietstock.
    Lọc theo ticker (tìm kiếm mã trong tiêu đề/mô tả).
    Cache kết quả 1 giờ.
    """

    def __init__(self, cache: Optional[CacheManager] = None) -> None:
        self._cache = cache or CacheManager()
        self._ssl_ctx = _ssl_context()

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def fetch_news(self, ticker: str, max_items: int = 20) -> list[NewsItem]:
        """Lấy tin tức liên quan đến ticker."""
        ticker = ticker.upper()
        cache_key = f"{ticker}_{max_items}"
        cached = self._cache.get("news", cache_key)
        if cached:
            return [NewsItem(**item) for item in cached]

        all_items: list[NewsItem] = []
        for source in _RSS_SOURCES:
            try:
                items = self._fetch_rss(source["name"], source["url"], source["encoding"])
                all_items.extend(items)
            except Exception as exc:
                logger.warning("Lỗi lấy RSS từ %s: %s", source["name"], exc)

        relevant = [item for item in all_items if self._is_relevant(item, ticker)]
        relevant.sort(
            key=lambda x: x.published_at or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        relevant = relevant[:max_items]

        self._cache.set("news", cache_key, [item.model_dump() for item in relevant])
        logger.info("Tìm được %d tin tức cho %s", len(relevant), ticker)
        return relevant

    def fetch_market_news(self, max_items: int = 30) -> list[NewsItem]:
        """Tin tức thị trường chung — không lọc theo ticker."""
        cache_key = f"market_{max_items}"
        cached = self._cache.get("news", cache_key)
        if cached:
            return [NewsItem(**item) for item in cached]

        all_items: list[NewsItem] = []
        for source in _RSS_SOURCES:
            try:
                items = self._fetch_rss(source["name"], source["url"], source["encoding"])
                all_items.extend(items)
            except Exception as exc:
                logger.warning("Lỗi lấy RSS từ %s: %s", source["name"], exc)

        all_items.sort(
            key=lambda x: x.published_at or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        result = all_items[:max_items]
        self._cache.set("news", cache_key, [item.model_dump() for item in result])
        return result

    # ------------------------------------------------------------------ #
    # Internal                                                             #
    # ------------------------------------------------------------------ #

    def _fetch_rss(self, source_name: str, url: str, encoding: str) -> list[NewsItem]:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=10, context=self._ssl_ctx) as response:
            raw = response.read()

        content = raw.decode(encoding, errors="replace")
        root = ET.fromstring(content)

        items: list[NewsItem] = []
        for item_el in root.iter("item"):
            title = self._get_text(item_el, "title")
            link = self._get_text(item_el, "link")
            description = self._get_text(item_el, "description")
            pub_date_str = self._get_text(item_el, "pubDate")

            if not title:
                continue

            items.append(NewsItem(
                title=title,
                source=source_name,
                published_at=self._parse_date(pub_date_str),
                url=link,
                snippet=self._clean_html(description or "")[:300] if description else None,
            ))

        return items

    def _is_relevant(self, item: NewsItem, ticker: str) -> bool:
        """Khớp mã chứng khoán trong tiêu đề/snippet."""
        text = f"{item.title} {item.snippet or ''}".upper()
        return bool(re.search(rf"\b{re.escape(ticker)}\b", text))

    @staticmethod
    def _get_text(element, tag: str) -> Optional[str]:
        child = element.find(tag)
        if child is not None and child.text:
            return child.text.strip()
        return None

    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
        if not date_str:
            return None
        formats = [
            "%a, %d %b %y %H:%M:%S %z",    # "Wed, 17 Jun 26 16:36:00 +0700"
            "%a, %d %b %Y %H:%M:%S %z",    # "Mon, 16 Jun 2025 10:30:00 +0700"
            "%a, %d %b %Y %H:%M:%S %Z",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%d %H:%M:%S",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                # Chuẩn hóa về timezone-aware để sort nhất quán
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                continue
        return None

    @staticmethod
    def _clean_html(text: str) -> str:
        return re.sub(r"<[^>]+>", "", text).strip()
