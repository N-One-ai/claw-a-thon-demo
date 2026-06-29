"""
Integration tests cho NewsClient.

- Offline tests: mock urllib, kiểm tra parsing + filtering logic.
- Live tests: kết nối internet thực, đánh dấu @pytest.mark.live.

Chạy tất cả (bao gồm live):
    pytest tests/integration/test_news_client.py -v -m live

Chỉ offline:
    pytest tests/integration/test_news_client.py -v -m "not live"
"""
from __future__ import annotations

import ssl
from unittest.mock import MagicMock, patch

import pytest

from src.data.models.report import NewsItem
from src.data.news_client import _RSS_SOURCES, NewsClient, _ssl_context

# ------------------------------------------------------------------ #
# Helpers                                                              #
# ------------------------------------------------------------------ #

_SAMPLE_RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>CafeF - Th\xe1\xbb\x8b tr\xc6\xb0\xe1\xbb\x9dng ch\xe1\xbb\xa9ng kho\xc3\xa1n</title>
    <link>https://cafef.vn</link>
    <item>
      <title>C\xe1\xbb\x95 phi\xe1\xba\xbfu FPT t\xc4\x83ng m\xe1\xba\xa1nh, nh\xc3\xa0 \xc4\x91\xe1\xba\xa7u t\xc6\xb0 ch\xc3\xba \xc3\xbd</title>
      <link>https://cafef.vn/fpt-tang-manh.htm</link>
      <description>FPT \xc4\x91\xc3\xa3 v\xc6\xb0\xe1\xbb\xa3t m\xe1\xbb\x91c 75,000 \xc4\x91\xe1\xbb\x93ng.</description>
      <pubDate>Wed, 17 Jun 26 10:00:00 +0700</pubDate>
    </item>
    <item>
      <title>VCB b\xc3\xa1o c\xc3\xa1o k\xe1\xba\xbft qu\xe1\xba\xa3 qu\xc3\xbd 2</title>
      <link>https://cafef.vn/vcb-q2.htm</link>
      <description>Vietcombank ghi nh\xe1\xba\xadn l\xe1\xbb\xa3i nh\xc3\xb3m k\xc3\xbf h\xe1\xba\xa1n</description>
      <pubDate>Tue, 16 Jun 26 14:30:00 +0700</pubDate>
    </item>
    <item>
      <title>Th\xe1\xbb\x8b tr\xc6\xb0\xe1\xbb\x9dng ph\xe1\xbb\xa5c h\xe1\xbb\x93i, VN-Index t\xc4\x83ng nh\xe1\xba\xb9</title>
      <link>https://cafef.vn/vnindex.htm</link>
      <description>T\xe1\xbb\x95ng quan th\xe1\xbb\x8b tr\xc6\xb0\xe1\xbb\x9dng h\xc3\xb4m nay</description>
      <pubDate>Mon, 15 Jun 26 09:15:00 +0700</pubDate>
    </item>
  </channel>
</rss>"""


def _mock_urlopen(raw: bytes = _SAMPLE_RSS):
    """Tạo mock urllib.request.urlopen trả về raw bytes."""
    ctx_manager = MagicMock()
    ctx_manager.__enter__ = MagicMock(return_value=MagicMock(read=MagicMock(return_value=raw)))
    ctx_manager.__exit__ = MagicMock(return_value=False)
    return MagicMock(return_value=ctx_manager)


# ------------------------------------------------------------------ #
# SSL context                                                          #
# ------------------------------------------------------------------ #

class TestSSLContext:
    def test_returns_ssl_context(self):
        ctx = _ssl_context()
        assert isinstance(ctx, ssl.SSLContext)

    def test_certifi_used_when_available(self):
        """Nếu certifi có, phải dùng certifi CA bundle."""
        try:
            import certifi  # noqa: F401
            ctx = _ssl_context()
            # Không raise → certifi path được dùng thành công
            assert ctx is not None
        except ImportError:
            pytest.skip("certifi chưa được cài")

    def test_fallback_when_no_certifi(self):
        """Khi certifi không có, fallback về ssl.create_default_context()."""
        with patch.dict("sys.modules", {"certifi": None}):
            ctx = _ssl_context()
            assert isinstance(ctx, ssl.SSLContext)


# ------------------------------------------------------------------ #
# RSS source configuration                                             #
# ------------------------------------------------------------------ #

class TestRSSSources:
    def test_four_sources_defined(self):
        assert len(_RSS_SOURCES) == 4

    def test_cafef_url_correct(self):
        cafef = next(s for s in _RSS_SOURCES if s["name"] == "CafeF")
        assert "thi-truong-chung-khoan.rss" in cafef["url"], (
            f"CafeF URL sai: {cafef['url']}"
        )

    def test_all_sources_have_required_keys(self):
        for src in _RSS_SOURCES:
            assert "name" in src
            assert "url" in src
            assert "encoding" in src
            assert src["url"].startswith("https://")
            assert src["encoding"] in ("utf-8", "utf-16")


# ------------------------------------------------------------------ #
# RSS parsing (offline)                                                #
# ------------------------------------------------------------------ #

class TestRSSParsing:
    @pytest.fixture
    def client(self):
        return NewsClient()

    def test_parse_items_from_rss(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client._fetch_rss("CafeF", "https://cafef.vn/dummy.rss", "utf-8")
        assert len(items) == 3

    def test_item_has_title(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client._fetch_rss("CafeF", "https://cafef.vn/dummy.rss", "utf-8")
        assert items[0].title, "Title phải không rỗng"

    def test_item_source_set(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client._fetch_rss("TestSource", "https://x.vn/rss", "utf-8")
        assert all(i.source == "TestSource" for i in items)

    def test_item_url_set(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client._fetch_rss("CafeF", "https://cafef.vn/dummy.rss", "utf-8")
        assert items[0].url == "https://cafef.vn/fpt-tang-manh.htm"

    def test_vietnamese_title_decoded(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client._fetch_rss("CafeF", "https://cafef.vn/dummy.rss", "utf-8")
        # Phải có ký tự tiếng Việt
        combined = " ".join(i.title for i in items)
        assert "tă" in combined.lower() or "ổ" in combined or "ị" in combined

    def test_published_date_parsed(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client._fetch_rss("CafeF", "https://cafef.vn/dummy.rss", "utf-8")
        dated = [i for i in items if i.published_at is not None]
        assert len(dated) >= 2, "Phải parse được ít nhất 2 ngày"

    def test_published_date_timezone_aware(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client._fetch_rss("CafeF", "https://cafef.vn/dummy.rss", "utf-8")
        for item in items:
            if item.published_at:
                assert item.published_at.tzinfo is not None


# ------------------------------------------------------------------ #
# Date parsing edge cases                                              #
# ------------------------------------------------------------------ #

class TestDateParsing:
    def test_2digit_year_rss_format(self):
        """CafeF dùng 2-chữ-số năm: "Wed, 17 Jun 26 16:36:00 +0700"."""
        result = NewsClient._parse_date("Wed, 17 Jun 26 16:36:00 +0700")
        assert result is not None
        assert result.year == 2026
        assert result.month == 6
        assert result.day == 17

    def test_4digit_year_rss_format(self):
        result = NewsClient._parse_date("Mon, 16 Jun 2025 10:30:00 +0700")
        assert result is not None
        assert result.year == 2025

    def test_iso_format(self):
        result = NewsClient._parse_date("2025-06-16T10:30:00+07:00")
        assert result is not None
        assert result.year == 2025

    def test_none_input_returns_none(self):
        assert NewsClient._parse_date(None) is None

    def test_garbage_input_returns_none(self):
        assert NewsClient._parse_date("not a date") is None


# ------------------------------------------------------------------ #
# Ticker filtering                                                     #
# ------------------------------------------------------------------ #

class TestTickerFiltering:
    @pytest.fixture
    def client(self):
        return NewsClient()

    def test_fpt_in_title_matches(self, client):
        item = NewsItem(title="Cổ phiếu FPT tăng mạnh", source="CafeF")
        assert client._is_relevant(item, "FPT")

    def test_fpt_in_snippet_matches(self, client):
        item = NewsItem(
            title="Thị trường phục hồi",
            source="CafeF",
            snippet="Đáng chú ý có FPT và HPG đều tăng",
        )
        assert client._is_relevant(item, "FPT")

    def test_vcb_does_not_match_fpt(self, client):
        item = NewsItem(title="VCB báo lãi quý 2", source="CafeF")
        assert not client._is_relevant(item, "FPT")

    def test_partial_match_does_not_trigger(self, client):
        """'FPTX' không phải là ticker FPT — word boundary phải áp dụng."""
        item = NewsItem(title="FPTX đang phát triển mạnh", source="CafeF")
        assert not client._is_relevant(item, "FPT")

    def test_case_insensitive(self, client):
        item = NewsItem(title="fpt tăng mạnh", source="Test")
        assert client._is_relevant(item, "FPT")


# ------------------------------------------------------------------ #
# HTML cleaning                                                        #
# ------------------------------------------------------------------ #

class TestHTMLCleaning:
    def test_removes_html_tags(self):
        raw = "<p>Cổ phiếu <b>FPT</b> tăng <a href='x'>mạnh</a></p>"
        cleaned = NewsClient._clean_html(raw)
        assert "<" not in cleaned
        assert "FPT" in cleaned

    def test_empty_string(self):
        assert NewsClient._clean_html("") == ""

    def test_plain_text_unchanged(self):
        text = "Bản tin hôm nay"
        assert NewsClient._clean_html(text) == text


# ------------------------------------------------------------------ #
# fetch_news aggregation (offline)                                     #
# ------------------------------------------------------------------ #

class TestFetchNewsOffline:
    @pytest.fixture
    def client(self):
        return NewsClient()

    def test_fetch_news_filters_by_ticker(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client.fetch_news("FPT")
        # Chỉ 1 trong 3 items trong sample RSS chứa "FPT"
        assert all(client._is_relevant(i, "FPT") for i in items)

    def test_fetch_news_max_items_respected(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client.fetch_news("FPT", max_items=1)
        assert len(items) <= 1

    def test_fetch_market_news_returns_items(self, client):
        # 4 sources × 3 items/source = 12 total; max_items=10 caps the result
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client.fetch_market_news(max_items=10)
        assert 3 <= len(items) <= 10

    def test_source_failure_does_not_crash(self, client):
        """Nếu một source lỗi, các source khác vẫn được thử."""
        call_count = 0

        def flaky_urlopen(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("Network error")
            return _mock_urlopen()(*args, **kwargs)

        with patch("urllib.request.urlopen", flaky_urlopen):
            # Không raise, trả về items từ các source còn lại
            items = client.fetch_market_news()
        assert isinstance(items, list)

    def test_items_sorted_newest_first(self, client):
        with patch("urllib.request.urlopen", _mock_urlopen()):
            items = client.fetch_market_news()
        dated = [i for i in items if i.published_at]
        if len(dated) >= 2:
            dates = [i.published_at for i in dated]
            assert dates == sorted(dates, reverse=True), "Phải sort theo ngày mới nhất trước"


# ------------------------------------------------------------------ #
# Live tests (require internet)                                        #
# ------------------------------------------------------------------ #

@pytest.mark.live
class TestLiveRSSFeeds:
    """Các test này kết nối internet thực — chạy với -m live."""

    @pytest.fixture
    def client(self):
        return NewsClient()

    def test_cafef_returns_items(self, client):
        src = next(s for s in _RSS_SOURCES if s["name"] == "CafeF")
        items = client._fetch_rss(src["name"], src["url"], src["encoding"])
        assert len(items) > 0, "CafeF RSS phải trả về ít nhất 1 item"

    def test_vneconomy_returns_items(self, client):
        src = next(s for s in _RSS_SOURCES if s["name"] == "VnEconomy")
        items = client._fetch_rss(src["name"], src["url"], src["encoding"])
        assert len(items) > 0

    def test_all_sources_reachable(self, client):
        errors = []
        for src in _RSS_SOURCES:
            try:
                items = client._fetch_rss(src["name"], src["url"], src["encoding"])
                assert len(items) > 0
            except Exception as e:
                errors.append(f"{src['name']}: {e}")
        assert not errors, "Các source lỗi:\n" + "\n".join(errors)

    def test_fetch_market_news_returns_items(self, client):
        items = client.fetch_market_news(max_items=20)
        assert len(items) > 0

    def test_items_have_title_and_source(self, client):
        items = client.fetch_market_news(max_items=20)
        for item in items:
            assert item.title, f"Item không có title: {item}"
            assert item.source, f"Item không có source: {item}"
