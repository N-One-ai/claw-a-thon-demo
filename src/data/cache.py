from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# TTL mặc định (giây) theo loại dữ liệu
DEFAULT_TTL: dict[str, int] = {
    "price_current": 2 * 60,          # 2 phút — near real-time
    "price_history": 24 * 60 * 60,   # 1 ngày
    "financial": 90 * 24 * 60 * 60,  # 90 ngày
    "company_info": 7 * 24 * 60 * 60,# 7 ngày
    "news": 60 * 60,                  # 1 giờ
    "index": 15 * 60,                 # 15 phút
    "reports": 24 * 60 * 60,         # 1 ngày (báo cáo AI)
}


class CacheManager:
    """
    File-based JSON cache với TTL per entry.
    Lưu tại <cache_dir>/<namespace>/<key_hash>.json
    Thread-safe cho read; write dùng atomic rename.
    """

    def __init__(self, cache_dir: str = ".cache") -> None:
        self._root = Path(cache_dir)
        self._root.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def get(self, namespace: str, key: str) -> Optional[Any]:
        path = self._path(namespace, key)
        if not path.exists():
            return None
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
            if time.time() > entry["expires_at"]:
                path.unlink(missing_ok=True)
                logger.debug("Cache expired: %s/%s", namespace, key)
                return None
            logger.debug("Cache hit: %s/%s", namespace, key)
            return entry["data"]
        except (json.JSONDecodeError, KeyError, OSError):
            return None

    def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        if ttl is None:
            ttl = DEFAULT_TTL.get(namespace, 60 * 60)

        namespace_dir = self._root / namespace
        namespace_dir.mkdir(parents=True, exist_ok=True)

        path = self._path(namespace, key)
        tmp = path.with_suffix(".tmp")
        entry = {
            "key": key,
            "expires_at": time.time() + ttl,
            "data": value,
        }
        try:
            tmp.write_text(json.dumps(entry, ensure_ascii=False, default=str), encoding="utf-8")
            tmp.replace(path)
            logger.debug("Cache set: %s/%s (TTL=%ds)", namespace, key, ttl)
        except OSError as exc:
            logger.warning("Cache write failed: %s", exc)

    def invalidate(self, namespace: str, key: str) -> None:
        self._path(namespace, key).unlink(missing_ok=True)

    def invalidate_ticker(self, ticker: str) -> None:
        """Xóa toàn bộ cache liên quan đến một mã chứng khoán."""
        for namespace_dir in self._root.iterdir():
            if namespace_dir.is_dir():
                for entry_path in namespace_dir.glob("*.json"):
                    if ticker.upper() in entry_path.stem.upper():
                        entry_path.unlink(missing_ok=True)
        logger.info("Invalidated cache for ticker: %s", ticker)

    def clear_expired(self) -> int:
        """Xóa toàn bộ entries đã hết hạn. Trả về số lượng đã xóa."""
        removed = 0
        for path in self._root.rglob("*.json"):
            try:
                entry = json.loads(path.read_text(encoding="utf-8"))
                if time.time() > entry.get("expires_at", 0):
                    path.unlink(missing_ok=True)
                    removed += 1
            except (json.JSONDecodeError, OSError):
                path.unlink(missing_ok=True)
                removed += 1
        logger.info("Cleared %d expired cache entries", removed)
        return removed

    # ------------------------------------------------------------------ #
    # Internal                                                             #
    # ------------------------------------------------------------------ #

    def _path(self, namespace: str, key: str) -> Path:
        key_hash = hashlib.sha256(key.encode()).hexdigest()[:16]
        safe_key = key.replace("/", "_").replace(":", "_")
        filename = f"{safe_key}_{key_hash}.json"
        return self._root / namespace / filename
