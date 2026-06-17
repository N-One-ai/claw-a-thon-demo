from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


class JSONExporter:
    """Xuất báo cáo ra JSON — dùng để tích hợp API hoặc lưu log."""

    def export(
        self,
        report_text: str,
        ticker: str,
        valuation: Optional[dict[str, Any]] = None,
        technical: Optional[dict[str, Any]] = None,
        risk: Optional[dict[str, Any]] = None,
        company: Optional[dict[str, Any]] = None,
    ) -> str:
        """Trả về JSON string chứa toàn bộ kết quả phân tích."""
        payload = {
            "ticker": ticker.upper(),
            "generated_at": datetime.now().isoformat(),
            "report_markdown": report_text,
        }
        if company:
            payload["company"] = company
        if valuation:
            payload["valuation"] = valuation
        if technical:
            payload["technical"] = technical
        if risk:
            payload["risk"] = risk

        return json.dumps(payload, ensure_ascii=False, indent=2, default=str)

    def save(
        self,
        report_text: str,
        ticker: str,
        output_dir: str = "reports",
        valuation: Optional[dict[str, Any]] = None,
        technical: Optional[dict[str, Any]] = None,
        risk: Optional[dict[str, Any]] = None,
        company: Optional[dict[str, Any]] = None,
    ) -> Path:
        """Lưu JSON ra file. Trả về path đã lưu."""
        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = out_dir / f"{ticker.upper()}_{timestamp}.json"
        content = self.export(report_text, ticker, valuation, technical, risk, company)
        filepath.write_text(content, encoding="utf-8")
        return filepath
