from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_CONFIG_DIR = Path(__file__).parent.parent / "config"


def _load(filename: str) -> dict[str, Any]:
    path = _CONFIG_DIR / filename
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@lru_cache(maxsize=None)
def get_settings() -> dict[str, Any]:
    cfg = _load("settings.yaml")
    # Override từ environment variables
    if rf := os.getenv("RISK_FREE_RATE"):
        cfg.setdefault("market", {})["risk_free_rate"] = float(rf)
    return cfg


@lru_cache(maxsize=None)
def get_sector_benchmarks() -> dict[str, Any]:
    return _load("sector_benchmarks.yaml")


@lru_cache(maxsize=None)
def get_wacc_defaults() -> dict[str, Any]:
    return _load("wacc_defaults.yaml")


@lru_cache(maxsize=None)
def get_risk_thresholds() -> dict[str, Any]:
    return _load("risk_thresholds.yaml")


def risk_free_rate() -> float:
    return float(get_settings().get("market", {}).get("risk_free_rate", 0.048))


def sector_config(sector: str) -> dict[str, Any]:
    benchmarks = get_sector_benchmarks()
    return benchmarks.get(sector, benchmarks["unknown"])


def wacc_config(sector: str) -> dict[str, Any]:
    defaults = get_wacc_defaults()
    return defaults.get(sector, defaults["unknown"])
