from __future__ import annotations

import json
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
# JSON Schema cho từng tool — đây là giao tiếp giữa code và Claude   #
# ------------------------------------------------------------------ #

TOOL_SCHEMAS: list[dict] = [
    {
        "name": "fetch_company_data",
        "description": (
            "Thu thập thông tin cơ bản về doanh nghiệp và báo cáo tài chính gần nhất. "
            "Trả về: tên công ty, ngành, số cổ phiếu, giá hiện tại, EPS TTM, BVPS, FCF TTM, "
            "ROE, biên lợi nhuận, tăng trưởng doanh thu, cờ đỏ kế toán. "
            "Luôn gọi công cụ này TRƯỚC TIÊN."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "Mã chứng khoán VD: VCB, FPT, HPG, VNM",
                }
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "compute_valuation",
        "description": (
            "Tính định giá cổ phiếu bằng 5 mô hình: P/E Fair Value, P/B Fair Value, "
            "Graham Number, DCF (5 năm), Earnings Yield. "
            "Trả về: giá trị từng mô hình, giá trị đồng thuận có trọng số, "
            "% chiết khấu/premium, nhãn hấp dẫn, và 3 kịch bản bi quan/cơ sở/lạc quan."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "Mã chứng khoán",
                },
                "custom_wacc": {
                    "type": "number",
                    "description": "WACC tùy chỉnh (0.0–1.0). Bỏ trống để dùng mặc định theo ngành.",
                },
                "custom_growth": {
                    "type": "number",
                    "description": "Tốc độ tăng trưởng FCF tùy chỉnh (0.0–1.0). Bỏ trống để dùng mặc định.",
                },
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "compute_technical_signals",
        "description": (
            "Tính các chỉ báo kỹ thuật từ lịch sử giá. "
            "Trả về: SMA 20/50/200, RSI(14) với nhãn (Quá mua/Trung lập/Quá bán), "
            "MACD với tín hiệu (Mua/Bán/Chờ), xu hướng volume, "
            "phân loại xu hướng giá (Tăng mạnh/Tích lũy/Điều chỉnh/Giảm), "
            "vị trí trong vùng 52 tuần."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "Mã chứng khoán",
                }
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "compute_risk_profile",
        "description": (
            "Phân tích rủi ro định lượng. "
            "Trả về: beta so với VN-Index, độ biến động hàng năm, "
            "D/E ratio, interest coverage, ổn định lợi nhuận, "
            "danh sách cờ rủi ro với mức độ nghiêm trọng, "
            "mức rủi ro tổng (Thấp/Trung bình/Cao/Rất cao)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "Mã chứng khoán",
                }
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "fetch_recent_news",
        "description": (
            "Thu thập tin tức và sự kiện gần đây từ CafeF, VnEconomy, Vietstock. "
            "Trả về danh sách tin có tiêu đề, nguồn, ngày đăng, và đoạn tóm tắt. "
            "Hãy phân tích tâm lý (tích cực/trung lập/tiêu cực) và trích xuất sự kiện quan trọng."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "Mã chứng khoán",
                },
                "max_items": {
                    "type": "integer",
                    "description": "Số lượng tin tối đa cần lấy (mặc định: 10)",
                    "default": 10,
                },
            },
            "required": ["ticker"],
        },
    },
]


class ToolRegistry:
    """
    Đăng ký tool functions và JSON schemas cho Claude.
    dispatch() nhận tên tool + params từ Claude và thực thi hàm tương ứng.
    """

    def __init__(self) -> None:
        self._handlers: dict[str, Callable] = {}

    def register_services(self, services) -> None:
        """Đăng ký tất cả tool handlers từ ToolServices instance."""
        self._handlers = {
            "fetch_company_data": services.fetch_company_data,
            "compute_valuation": services.compute_valuation,
            "compute_technical_signals": services.compute_technical_signals,
            "compute_risk_profile": services.compute_risk_profile,
            "fetch_recent_news": services.fetch_recent_news,
        }
        logger.info("Registered %d tools: %s", len(self._handlers), list(self._handlers))

    def get_schemas(self) -> list[dict]:
        return TOOL_SCHEMAS

    def dispatch(self, tool_name: str, tool_input: dict[str, Any]) -> str:
        """Thực thi tool và trả về kết quả dạng JSON string."""
        handler = self._handlers.get(tool_name)
        if not handler:
            error = {"error": f"Tool '{tool_name}' không tồn tại", "available": list(self._handlers)}
            return json.dumps(error, ensure_ascii=False)

        try:
            logger.info("→ Calling tool: %s(%s)", tool_name, tool_input)
            result = handler(**tool_input)
            output = json.dumps(result, ensure_ascii=False, default=str, indent=2)
            logger.info("← Tool %s returned %d chars", tool_name, len(output))
            return output
        except Exception as exc:
            logger.error("Tool %s raised: %s", tool_name, exc)
            error = {"error": f"Lỗi khi thực thi {tool_name}: {exc}"}
            return json.dumps(error, ensure_ascii=False)
