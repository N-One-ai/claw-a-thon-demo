from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional

import anthropic

from ..config_loader import get_settings
from ..data.models import AnalysisRequest
from ..tools.services import ToolServices
from .tool_registry import ToolRegistry

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT_PATH = Path(__file__).parent / "prompts" / "system_vi.txt"


class StockAgent:
    """
    Agent phân tích cổ phiếu — bộ não của hệ thống.

    Nhận AnalysisRequest → gọi Claude với tool use → thu thập dữ liệu
    từ 5 tools → Claude tổng hợp → trả về báo cáo tiếng Việt đầy đủ.

    Vòng lặp tool-use:
    1. Gửi request + tools tới Claude
    2. Claude trả về tool_use blocks
    3. Thực thi từng tool qua ToolRegistry
    4. Gửi kết quả tool về Claude
    5. Lặp cho đến khi Claude trả về end_turn
    """

    MAX_TOOL_ROUNDS = 10       # Giới hạn vòng lặp để tránh infinite loop

    def __init__(
        self,
        api_key: Optional[str] = None,
        cache_dir: str = ".cache",
        vnstock_source: str = "VCI",
    ) -> None:
        cfg = get_settings()
        self._model = cfg.get("llm", {}).get("model", "claude-sonnet-4-6")
        self._max_tokens = int(cfg.get("llm", {}).get("max_tokens", 8192))

        self._client = anthropic.Anthropic(
            api_key=api_key or os.environ.get("ANTHROPIC_API_KEY")
        )
        self._system_prompt = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")

        services = ToolServices(cache_dir=cache_dir, vnstock_source=vnstock_source)
        self._registry = ToolRegistry()
        self._registry.register_services(services)

        logger.info("StockAgent ready — model=%s", self._model)

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def analyze(self, request: AnalysisRequest) -> str:
        """
        Phân tích một cổ phiếu và trả về báo cáo tiếng Việt đầy đủ.
        Trả về chuỗi markdown.
        """
        user_message = self._build_user_message(request)
        messages = [{"role": "user", "content": user_message}]

        logger.info("Starting analysis for %s", request.ticker)
        rounds = 0

        while rounds < self.MAX_TOOL_ROUNDS:
            rounds += 1
            logger.info("Tool-use round %d/%d", rounds, self.MAX_TOOL_ROUNDS)

            response = self._client.messages.create(
                model=self._model,
                max_tokens=self._max_tokens,
                system=self._system_prompt,
                tools=self._registry.get_schemas(),
                messages=messages,
            )

            # Thêm response của Claude vào lịch sử hội thoại
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                # Claude đã hoàn thành — extract text
                logger.info("Analysis complete after %d tool rounds", rounds - 1)
                return self._extract_text(response.content)

            if response.stop_reason == "tool_use":
                # Thực thi tất cả tool calls trong response này
                tool_results = self._execute_tools(response.content)
                messages.append({"role": "user", "content": tool_results})
                continue

            # stop_reason khác (max_tokens, stop_sequence...)
            logger.warning("Unexpected stop_reason: %s", response.stop_reason)
            return self._extract_text(response.content)

        logger.error("Exceeded MAX_TOOL_ROUNDS=%d", self.MAX_TOOL_ROUNDS)
        return "Lỗi: Quá số vòng lặp tối đa. Vui lòng thử lại."

    def analyze_stream(self, request: AnalysisRequest) -> Iterator[str]:
        """
        Streaming version — yield từng chunk text khi Claude viết báo cáo.
        Tool calls vẫn thực thi đồng bộ; chỉ phần text cuối được stream.
        """
        # Chạy tool-use rounds đồng bộ trước
        user_message = self._build_user_message(request)
        messages = [{"role": "user", "content": user_message}]
        rounds = 0

        while rounds < self.MAX_TOOL_ROUNDS:
            rounds += 1

            # Kiểm tra xem có cần thêm tool round không
            probe = self._client.messages.create(
                model=self._model,
                max_tokens=256,
                system=self._system_prompt,
                tools=self._registry.get_schemas(),
                messages=messages,
            )
            messages.append({"role": "assistant", "content": probe.content})

            if probe.stop_reason == "end_turn":
                yield self._extract_text(probe.content)
                return

            if probe.stop_reason == "tool_use":
                tool_results = self._execute_tools(probe.content)
                messages.append({"role": "user", "content": tool_results})
                continue

            break

        # Stream phần báo cáo cuối cùng
        with self._client.messages.stream(
            model=self._model,
            max_tokens=self._max_tokens,
            system=self._system_prompt,
            tools=self._registry.get_schemas(),
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    # ------------------------------------------------------------------ #
    # Internal                                                             #
    # ------------------------------------------------------------------ #

    def _build_user_message(self, request: AnalysisRequest) -> str:
        lines = [
            f"Hãy phân tích toàn diện cổ phiếu **{request.ticker.upper()}**.",
            f"Ngày phân tích: {datetime.now().strftime('%d/%m/%Y')}",
        ]
        if not request.include_news:
            lines.append("(Bỏ qua phần tin tức theo yêu cầu)")
        if request.custom_growth:
            lines.append(f"Tốc độ tăng trưởng FCF tùy chỉnh: {request.custom_growth*100:.1f}%")
        if request.custom_wacc:
            lines.append(f"WACC tùy chỉnh: {request.custom_wacc*100:.1f}%")
        return "\n".join(lines)

    def _execute_tools(self, content_blocks: list) -> list[dict]:
        """Thực thi tất cả tool_use blocks và trả về tool_result list."""
        results = []
        for block in content_blocks:
            if block.type != "tool_use":
                continue
            logger.info("Executing tool: %s", block.name)
            output = self._registry.dispatch(block.name, block.input)
            results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": output,
            })
        return results

    @staticmethod
    def _extract_text(content_blocks: list) -> str:
        parts = []
        for block in content_blocks:
            if hasattr(block, "text") and block.text:
                parts.append(block.text)
        return "\n".join(parts).strip()
