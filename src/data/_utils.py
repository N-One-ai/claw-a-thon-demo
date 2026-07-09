"""
Shared utilities cho Data Fetching Layer.
Không import vnstock tại đây — chỉ chứa helpers thuần Python.
"""
from __future__ import annotations

import functools
import logging
import math
import time
from datetime import date
from typing import Any, Callable, Optional, TypeVar

import pandas as pd

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])

# ------------------------------------------------------------------ #
# vnstock / vnai safety guard                                          #
# ------------------------------------------------------------------ #
#
# vnai.beam.quota.CleanErrorContext.__exit__ calls sys.exit() when the
# per-minute API quota is exceeded.  sys.exit() raises SystemExit which
# is a BaseException, NOT Exception — so every plain "except Exception"
# block misses it and the whole uvicorn process is killed.
#
# Wrap every vnstock API call with this context manager so SystemExit
# is caught and converted to RuntimeError, which our normal handlers
# can handle gracefully without crashing the server.

from contextlib import contextmanager

@contextmanager
def vnstock_call(label: str = "vnstock"):
    """
    Context manager that converts vnai's sys.exit() (rate-limit kill)
    into a RuntimeError so it never crashes the server process.

    Usage:
        with vnstock_call("quote.history"):
            df = stock.quote.history(...)
    """
    try:
        yield
    except SystemExit as exc:
        raise RuntimeError(f"[{label}] vnai rate-limit killed process: {exc}") from None


# ------------------------------------------------------------------ #
# Retry decorator                                                       #
# ------------------------------------------------------------------ #

def with_retry(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: tuple = (Exception,),
) -> Callable[[F], F]:
    """
    Decorator: retry với exponential backoff.
    Attempt 1 → thất bại → đợi 1s → attempt 2 → đợi 2s → attempt 3 → raise.
    """
    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exc: Optional[Exception] = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt == max_attempts:
                        logger.error(
                            "[Retry] %s thất bại sau %d lần: %s",
                            fn.__qualname__, max_attempts, exc,
                        )
                        raise
                    logger.warning(
                        "[Retry] %s lần %d/%d thất bại: %s. Thử lại sau %.1fs...",
                        fn.__qualname__, attempt, max_attempts, exc, delay,
                    )
                    time.sleep(delay)
                    delay *= backoff_factor
            raise last_exc  # type: ignore[misc]
        return wrapper  # type: ignore[return-value]
    return decorator


# ------------------------------------------------------------------ #
# DataFrame column helpers                                             #
# ------------------------------------------------------------------ #

def find_col(df: pd.DataFrame, *candidates: str) -> Optional[pd.Series]:
    """
    Tìm cột đầu tiên khớp với bất kỳ tên nào trong candidates (không phân biệt hoa thường).
    Trả về Series hoặc None nếu không tìm thấy.
    """
    lower_map: dict[str, str] = {c.lower().strip(): c for c in df.columns}
    for name in candidates:
        key = name.lower().strip()
        if key in lower_map:
            return df[lower_map[key]]
    return None


def col_val(df: pd.DataFrame, row_idx, *candidates: str) -> Optional[Any]:
    """Lấy giá trị của cột tại hàng row_idx."""
    series = find_col(df, *candidates)
    if series is None:
        return None
    try:
        return series.iloc[row_idx]
    except IndexError:
        return None


# ------------------------------------------------------------------ #
# Safe type conversion                                                  #
# ------------------------------------------------------------------ #

def safe_float(val: Any, scale: float = 1.0) -> Optional[float]:
    """
    Chuyển val thành float, nhân với scale, trả None nếu không hợp lệ.
    scale=1/1000 dùng để chuyển triệu VND → tỷ VND.
    """
    try:
        if val is None:
            return None
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        result = float(val) * scale
        return round(result, 4) if scale != 1.0 else result
    except (TypeError, ValueError):
        return None


def safe_int(val: Any) -> Optional[int]:
    try:
        if val is None:
            return None
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f)
    except (TypeError, ValueError):
        return None


def safe_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s.lower() not in ("nan", "none", "") else None


# ------------------------------------------------------------------ #
# Period label                                                          #
# ------------------------------------------------------------------ #

def period_label(row: Any) -> str:
    """
    Tạo nhãn kỳ từ một hàng DataFrame vnstock.
    Ví dụ: yearReport=2024, lengthReport=3 → "2024-Q3"
           yearReport=2023, lengthReport=0  → "2023"
    """
    year = safe_int(getattr(row, "yearReport", None) or getattr(row, "year", None))
    quarter = safe_int(getattr(row, "lengthReport", None) or getattr(row, "quarter", None))
    if year is None:
        return "N/A"
    if quarter and quarter != 0:
        return f"{year}-Q{quarter}"
    return str(year)


# ------------------------------------------------------------------ #
# Date helpers                                                          #
# ------------------------------------------------------------------ #

def years_ago(n: int) -> date:
    """Ngày bắt đầu cách n năm so với hôm nay, thêm 30 ngày buffer."""
    from datetime import timedelta
    today = date.today()
    return today.replace(year=today.year - n) - timedelta(days=30)


def to_date(val: Any) -> Optional[date]:
    """Chuyển Timestamp / string / date → date."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    try:
        if hasattr(val, "date"):           # pandas Timestamp
            return val.date()
        return date.fromisoformat(str(val)[:10])
    except (ValueError, TypeError):
        return None
