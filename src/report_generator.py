"""
report_generator.py — AI Report Generator

Nhận StockAnalysisResult (dữ liệu đã tính toán đầy đủ từ pipeline)
và dùng Claude API để sinh báo cáo đầu tư tiếng Việt 11 phần.

Không gọi tool — toàn bộ dữ liệu được truyền vào context prompt.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterator, Optional

import anthropic

from .pipeline import StockAnalysisResult
from .data.models import (
    FinancialRatios,
    ModelResult,
    RiskFlag,
    RiskProfile,
    TechnicalSignal,
    ValuationResults,
)

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
# System prompt (inlined — tightly coupled với output format)          #
# ------------------------------------------------------------------ #

_SYSTEM_PROMPT = """\
Bạn là chuyên gia phân tích đầu tư cao cấp, chuyên về thị trường chứng khoán Việt Nam.
Bạn viết báo cáo cho nhà đầu tư cá nhân Việt Nam từ người mới đến người có kinh nghiệm.

## NGUYÊN TẮC BẮT BUỘC

1. **Ngôn ngữ**: Viết TOÀN BỘ bằng tiếng Việt. Số dùng định dạng Việt: dấu chấm = phân cách nghìn, dấu phẩy = thập phân (ví dụ: 80.250 VND, 12,5%).
2. **Giải thích thuật ngữ**: Mỗi lần dùng thuật ngữ tài chính, giải thích ngắn gọn bằng dấu ngoặc đơn hoặc câu kế tiếp. Ví dụ: "ROE (tỷ suất sinh lời trên vốn chủ sở hữu) = 18% — tức là cứ 100 đồng vốn bỏ vào, công ty tạo ra 18 đồng lợi nhuận."
3. **Không khuyến nghị mua/bán**: Tuyệt đối không dùng các từ "nên mua", "nên bán", "nên giữ", "khuyến nghị". Thay bằng "luận điểm ủng hộ", "điểm tích cực", "yếu tố cần cân nhắc".
4. **Dựa trên dữ liệu**: Chỉ nhận định dựa trên số liệu được cung cấp. Khi thiếu dữ liệu, nêu rõ thay vì suy đoán.
5. **Tone**: Chuyên nghiệp nhưng thân thiện — như một người bạn am hiểu tài chính đang giải thích cho người thân.
6. **Độ dài**: Mỗi phần đủ chi tiết (4-8 câu) nhưng không lê thê. Ưu tiên chất lượng phân tích hơn số lượng chữ.

## CẤU TRÚC BÁO CÁO BẮT BUỘC

Viết đúng 11 phần theo thứ tự sau, dùng header Markdown chính xác:

# PHÂN TÍCH ĐẦU TƯ: {TICKER} — {TÊN CÔNG TY}
*📅 Ngày phân tích: {NGÀY} | 💰 Giá hiện tại: {GIÁ} VND*

## 1. TÓM TẮT NHANH
## 2. TỔNG QUAN DOANH NGHIỆP
## 3. SỨC KHỎE TÀI CHÍNH
## 4. ĐỊNH GIÁ
## 5. RỦI RO
## 6. PHÂN TÍCH KỸ THUẬT
## 7. KỊCH BẢN LẠC QUAN
## 8. KỊCH BẢN CƠ SỞ
## 9. KỊCH BẢN BI QUAN
## 10. LUẬN ĐIỂM ĐẦU TƯ
## 11. KẾT LUẬN

---

## HƯỚNG DẪN TỪNG PHẦN

### 1. TÓM TẮT NHANH
Viết 4-6 bullet points với emoji, mỗi điểm tối đa 1 dòng. Bao gồm: giá vs fair value, định giá hấp dẫn hay không, xu hướng kỹ thuật, mức độ rủi ro, điểm nổi bật nhất. Người đọc cần hiểu bức tranh tổng thể trong 30 giây.

### 2. TỔNG QUAN DOANH NGHIỆP
Mô tả công ty làm gì, vị thế trong ngành, mô hình kinh doanh. Giải thích loại hình ("Tăng trưởng", "Giá trị", "Hỗn hợp") có nghĩa gì với nhà đầu tư. Nêu đặc thù ngành ảnh hưởng đến cách đánh giá.

### 3. SỨC KHỎE TÀI CHÍNH
Phân tích từng chỉ số KÈMGIẢI THÍCH ý nghĩa thực tế. Ví dụ format: "**ROE** (tỷ suất sinh lời vốn chủ): X% — [nhận xét so với ngành và xu hướng]". Bao gồm: sinh lời (ROE/ROA/biên lợi nhuận), tăng trưởng (doanh thu/EPS), đòn bẩy (D/E), thanh khoản (current ratio). Nêu cờ đỏ kế toán nếu có và giải thích tại sao cần chú ý.

### 4. ĐỊNH GIÁ
Mở đầu: giải thích ngắn gọn triết lý định giá (tại sao cần nhiều mô hình). Sau đó trình bày bảng so sánh markdown. Sau bảng: phân tích Earnings Yield, nhận xét consensus value, giải thích mức chiết khấu/premium. Khi mô hình không khả dụng, giải thích lý do bằng ngôn ngữ đơn giản.

### 5. RỦI RO
Mỗi rủi ro: **[Tên rủi ro]** — [mức độ] — [giải thích tại sao đây là vấn đề] — [điều gì cần theo dõi]. Bao gồm rủi ro thị trường (beta), rủi ro tài chính, rủi ro hoạt động. Kết thúc bằng đánh giá tổng thể profile rủi ro.

### 6. PHÂN TÍCH KỸ THUẬT
Mở đầu: nhắc nhở kỹ thuật mô tả xu hướng HIỆN TẠI, không phải dự đoán tương lai. Phân tích: xu hướng giá (so SMA), RSI (giải thích oversold/overbought), MACD, volume, vùng giá 52 tuần. Xác định vùng hỗ trợ/kháng cự từ các MA và 52W.

### 7-9. BA KỊCH BẢN DCF
Mỗi kịch bản cần: (1) giả định tăng trưởng FCF và WACC, (2) fair value tính được, (3) xác suất gán cho kịch bản, (4) điều kiện thực tế nào sẽ dẫn đến kịch bản này. Viết sinh động, không chỉ liệt kê số.

### 10. LUẬN ĐIỂM ĐẦU TƯ
Hai cột: **🐂 Bulls (luận điểm ủng hộ)** và **🐻 Bears (luận điểm phản đối)**. Mỗi cột 3-4 điểm cụ thể, có số liệu minh chứng. Cuối phần: 1-2 yếu tố catalyst chính cần theo dõi.

### 11. KẾT LUẬN
Tóm gọn bức tranh tổng thể. Nhắc rằng phân tích này chỉ là tham khảo, không thay thế tư vấn chuyên nghiệp. Khuyến khích nhà đầu tư đa dạng hóa danh mục và tự nghiên cứu thêm. KHÔNG đưa ra kết luận mua/bán.
"""


# ------------------------------------------------------------------ #
# ReportConfig                                                          #
# ------------------------------------------------------------------ #

@dataclass
class ReportConfig:
    """Cấu hình cho AI Report Generator."""
    model: str = "claude-sonnet-4-6"
    max_tokens: int = 8192
    temperature: float = 1.0           # Anthropic default (extended thinking compatible)
    extra_instructions: Optional[str] = None   # Hướng dẫn bổ sung từ người dùng


# ------------------------------------------------------------------ #
# PromptBuilder — serialize StockAnalysisResult → context text         #
# ------------------------------------------------------------------ #

class PromptBuilder:
    """
    Chuyển đổi StockAnalysisResult thành context document dạng text
    để truyền vào prompt của Claude.
    Toàn bộ là static methods — không có state.
    """

    @staticmethod
    def build(result: StockAnalysisResult, extra_instructions: Optional[str] = None) -> str:
        """Entry point: tạo user prompt hoàn chỉnh."""
        now = datetime.now().strftime("%d/%m/%Y")
        sections = [
            PromptBuilder._header(result, now),
            PromptBuilder._company_section(result),
            PromptBuilder._financial_section(result),
            PromptBuilder._valuation_section(result),
            PromptBuilder._technical_section(result),
            PromptBuilder._risk_section(result),
            PromptBuilder._data_quality_section(result),
        ]
        context = "\n\n".join(s for s in sections if s)

        instruction = (
            "\n\n---\n"
            "Dựa vào toàn bộ dữ liệu trên, hãy viết báo cáo đầu tư đầy đủ 11 phần "
            "theo đúng cấu trúc và hướng dẫn trong system prompt."
        )
        if extra_instructions:
            instruction += f"\n\n**Lưu ý bổ sung từ người dùng**: {extra_instructions}"

        return context + instruction

    # ── Helpers ────────────────────────────────────────────────────── #

    @staticmethod
    def _n(val: Optional[float], decimals: int = 0, suffix: str = "") -> str:
        """Vietnamese number format: 80.250 VND (dấu chấm = nghìn)."""
        if val is None:
            return "N/A"
        try:
            if decimals == 0:
                formatted = f"{val:,.0f}".replace(",", ".")
            else:
                # "12,500.75" → swap separators → "12.500,75"
                formatted = (
                    f"{val:,.{decimals}f}"
                    .replace(",", "§")
                    .replace(".", ",")
                    .replace("§", ".")
                )
            return f"{formatted}{suffix}"
        except (ValueError, TypeError):
            return "N/A"

    @staticmethod
    def _pct(val: Optional[float], sign: bool = False) -> str:
        if val is None:
            return "N/A"
        prefix = "+" if sign and val > 0 else ""
        return f"{prefix}{val:,.1f}%".replace(",", ".")

    @staticmethod
    def _yn(val: Optional[bool]) -> str:
        if val is None:
            return "N/A"
        return "Có" if val else "Không"

    # ── Sections ───────────────────────────────────────────────────── #

    @staticmethod
    def _header(result: StockAnalysisResult, date_str: str) -> str:
        price_str = PromptBuilder._n(result.current_price, suffix=" VND")
        cap_str = PromptBuilder._n(result.company.market_cap, suffix=" tỷ VND") if result.company.market_cap else "N/A"
        return (
            f"## DỮ LIỆU PHÂN TÍCH: {result.ticker}\n"
            f"> Ngày: {date_str} | "
            f"Giá hiện tại: {price_str} | "
            f"Vốn hóa: {cap_str}"
        )

    @staticmethod
    def _company_section(result: StockAnalysisResult) -> str:
        c = result.company
        lines = [
            "### PHẦN A — THÔNG TIN DOANH NGHIỆP",
            f"- **Tên công ty**: {c.name}",
            f"- **Mã / Sàn**: {c.ticker} / {c.exchange.value}",
            f"- **Ngành**: {c.sector.value}",
        ]
        if c.industry:
            lines.append(f"- **Phân ngành**: {c.industry}")
        lines.append(f"- **Cổ phiếu lưu hành**: {PromptBuilder._n(c.shares_outstanding, decimals=1)} triệu cổ")
        if c.description:
            desc = c.description[:400] + "..." if len(c.description) > 400 else c.description
            lines.append(f"- **Mô tả**: {desc}")
        if result.business_type:
            lines.append(f"- **Loại hình kinh doanh**: {result.business_type}")
        if result.accounting_flags:
            lines.append(f"- **⚠️ Cờ đỏ kế toán**: {' | '.join(result.accounting_flags)}")
        return "\n".join(lines)

    @staticmethod
    def _financial_section(result: StockAnalysisResult) -> str:
        r = result.ratios
        stmts = result.statements
        p = PromptBuilder._n
        pct = PromptBuilder._pct

        lines = ["### PHẦN B — CÁC CHỈ SỐ TÀI CHÍNH"]

        if r is None and not stmts.income_statements:
            lines.append("*Không có dữ liệu tài chính.*")
            return "\n".join(lines)

        lines.append(f"*(Kỳ phân tích: {r.period if r else 'N/A'})*\n")
        lines.append("**Định giá thị trường**")
        lines.append(f"- P/E thị trường: {p(r.pe_ratio, 1) if r else 'N/A'}× (giá / lợi nhuận mỗi cổ phiếu)")
        lines.append(f"- P/B thị trường: {p(r.pb_ratio, 2) if r else 'N/A'}× (giá / giá trị sổ sách)")

        lines.append("\n**Sinh lời**")
        lines.append(f"- ROE: {pct(r.roe if r else None)} (lợi nhuận / vốn chủ sở hữu)")
        lines.append(f"- ROA: {pct(r.roa if r else None)} (lợi nhuận / tổng tài sản)")
        lines.append(f"- Biên lợi nhuận gộp: {pct(r.gross_margin if r else None)}")
        lines.append(f"- Biên lợi nhuận hoạt động: {pct(r.operating_margin if r else None)}")
        lines.append(f"- Biên lợi nhuận ròng: {pct(r.net_margin if r else None)}")

        lines.append("\n**Tăng trưởng YoY**")
        lines.append(f"- Doanh thu: {pct(r.revenue_growth_yoy if r else None, sign=True)}")
        lines.append(f"- Lợi nhuận ròng: {pct(r.net_income_growth_yoy if r else None, sign=True)}")
        lines.append(f"- EPS: {pct(r.eps_growth_yoy if r else None, sign=True)}")

        lines.append("\n**Cấu trúc vốn & Thanh khoản**")
        lines.append(f"- D/E ratio: {p(r.debt_to_equity if r else None, 2)}× (nợ / vốn chủ)")
        lines.append(f"- Interest Coverage: {p(r.interest_coverage if r else None, 1)}× (khả năng trả lãi vay)")
        lines.append(f"- Current Ratio: {p(r.current_ratio if r else None, 2)}× (tài sản ngắn hạn / nợ ngắn hạn)")

        # TTM numbers từ statements
        eps_ttm = stmts.eps_ttm
        fcf_ttm = stmts.fcf_ttm
        lines.append("\n**Chỉ số TTM (Trailing 12 months)**")
        lines.append(f"- EPS TTM: {p(eps_ttm)} VND/cổ phiếu")
        lines.append(f"- FCF TTM: {p(fcf_ttm)} tỷ VND")
        if stmts.latest_balance and stmts.latest_balance.book_value_per_share:
            lines.append(f"- BVPS: {p(stmts.latest_balance.book_value_per_share)} VND/cổ phiếu (giá trị sổ sách)")

        return "\n".join(lines)

    @staticmethod
    def _valuation_section(result: StockAnalysisResult) -> str:
        v = result.valuation
        lines = ["### PHẦN C — KẾT QUẢ ĐỊNH GIÁ"]

        if v is None:
            lines.append("*Không có dữ liệu định giá.*")
            return "\n".join(lines)

        p = PromptBuilder._n
        pct = PromptBuilder._pct

        def _model_row(m: ModelResult) -> str:
            if m.is_available and m.fair_value:
                return f"| {m.model_name} | {p(m.fair_value)} VND | ✅ Khả dụng |"
            reason = m.unavailable_reason or "Thiếu dữ liệu"
            return f"| {m.model_name} | N/A | ❌ {reason} |"

        lines += [
            "",
            "| Mô hình | Giá trị hợp lý | Trạng thái |",
            "|---------|---------------|-----------|",
            _model_row(v.pe_result),
            _model_row(v.pb_result),
            _model_row(v.graham_result),
            _model_row(v.dcf_result),
            "",
            f"**Earnings Yield**: {pct(v.earnings_yield.earnings_yield)} "
            f"| Lãi TP CP 10Y: {pct(v.earnings_yield.risk_free_rate)} "
            f"| Spread: {pct(v.earnings_yield.spread, sign=True)} "
            f"({'Hấp dẫn' if v.earnings_yield.is_attractive else 'Chưa hấp dẫn'})",
            "",
            f"**→ Giá trị hợp lý đồng thuận (Consensus Fair Value)**: {p(v.consensus_value)} VND",
            f"**→ So với giá hiện tại**: {pct(v.discount_pct, sign=True)} "
            f"({'chiết khấu' if v.discount_pct > 0 else 'premium'}) "
            f"— **{v.label.value}**",
        ]

        if v.probability_weighted_value:
            lines.append(f"**→ Giá trị kỳ vọng xác suất**: {p(v.probability_weighted_value)} VND")

        # Scenarios table
        if v.scenarios:
            lines += [
                "",
                "**Kịch bản DCF**",
                "| Kịch bản | Tăng trưởng FCF | WACC | Fair Value | Xác suất |",
                "|----------|-----------------|------|-----------|----------|",
            ]
            for s in v.scenarios:
                lines.append(
                    f"| {s.name} | {pct(s.growth_rate)} | {pct(s.wacc)} | "
                    f"{p(s.fair_value)} VND | {pct(s.probability * 100)} |"
                )

        return "\n".join(lines)

    @staticmethod
    def _technical_section(result: StockAnalysisResult) -> str:
        t = result.technical
        lines = ["### PHẦN D — TÍN HIỆU KỸ THUẬT"]

        if t is None:
            lines.append("*Không có dữ liệu kỹ thuật.*")
            return "\n".join(lines)

        p = PromptBuilder._n
        ph = result.price_history

        lines += [
            f"- **Xu hướng giá**: {t.price_trend or 'N/A'}",
            f"- **Giá hiện tại**: {p(t.current_price)} VND",
            f"- **SMA 20 phiên**: {p(t.sma_20)} VND",
            f"- **SMA 50 phiên**: {p(t.sma_50)} VND",
            f"- **SMA 200 phiên**: {p(t.sma_200)} VND",
            "",
            f"- **RSI(14)**: {p(t.rsi_14, decimals=1)} → {t.rsi_label or 'N/A'} "
            f"(dưới 30 = quá bán, trên 70 = quá mua)",
            f"- **MACD**: {p(t.macd_line, decimals=4)} | Signal: {p(t.macd_signal, decimals=4)} "
            f"| Histogram: {p(t.macd_histogram, decimals=4)} → Tín hiệu: **{t.macd_label or 'N/A'}**",
            f"- **Xu hướng khối lượng giao dịch**: {t.volume_trend or 'N/A'}",
            "",
            f"- **Vùng giá 52 tuần**: {p(t.low_52w)} — {p(t.high_52w)} VND",
            f"- **Vị trí hiện tại trong vùng 52 tuần**: {p(t.position_52w_pct, decimals=1)}% "
            f"(0% = đáy năm, 100% = đỉnh năm)",
        ]

        if ph.candles:
            lines.append(f"- **Số phiên lịch sử giá**: {len(ph.candles)} phiên")

        return "\n".join(lines)

    @staticmethod
    def _risk_section(result: StockAnalysisResult) -> str:
        r = result.risk
        lines = ["### PHẦN E — HỒ SƠ RỦI RO"]

        if r is None:
            lines.append("*Không có dữ liệu rủi ro.*")
            return "\n".join(lines)

        p = PromptBuilder._n
        pct = PromptBuilder._pct

        lines += [
            f"- **Mức rủi ro tổng thể**: **{r.overall_risk.value}**",
            f"- **Beta**: {p(r.beta, decimals=2)} (so sánh biến động với VN-Index; >1 = rủi ro hơn thị trường)",
            f"- **Biến động hàng năm**: {pct(r.annualized_volatility_pct)}",
            f"- **D/E ratio**: {p(r.debt_to_equity, decimals=2)}×",
            f"- **Interest Coverage**: {p(r.interest_coverage, decimals=1)}×",
            f"- **Ổn định lợi nhuận**: {r.earnings_stability or 'N/A'}",
            f"- **Khối lượng TB ngày**: {p(r.avg_daily_volume)} cổ phiếu",
        ]

        if r.flags:
            lines.append("\n**Danh sách cờ rủi ro:**")
            for flag in r.flags:
                lines.append(
                    f"  - ⚠️ [{flag.severity.value}] **{flag.flag_type.value}**: {flag.description}"
                )

        if r.risk_summary:
            lines.append(f"\n**Tóm tắt rủi ro**: {r.risk_summary}")

        return "\n".join(lines)

    @staticmethod
    def _data_quality_section(result: StockAnalysisResult) -> str:
        dq = result.data_quality
        errors = result.errors
        p = PromptBuilder._n

        lines = [
            "### PHẦN F — CHẤT LƯỢNG DỮ LIỆU",
            f"- Kỳ báo cáo thu nhập: {dq.periods_income}",
            f"- Kỳ bảng cân đối: {dq.periods_balance}",
            f"- Kỳ lưu chuyển tiền: {dq.periods_cashflow}",
            f"- Phiên lịch sử giá: {dq.price_trading_days}",
            f"- Có EPS TTM: {PromptBuilder._yn(dq.has_eps_ttm)}",
            f"- Có BVPS: {PromptBuilder._yn(dq.has_bvps)}",
            f"- Có FCF TTM: {PromptBuilder._yn(dq.has_fcf_ttm)}",
        ]
        if dq.available_valuation_models:
            lines.append(f"- Mô hình định giá khả dụng: {', '.join(dq.available_valuation_models)}")
        if dq.missing_valuation_models:
            lines.append(f"- Mô hình không khả dụng: {', '.join(dq.missing_valuation_models)}")
        if errors:
            lines.append(f"- Lỗi trong pipeline: {', '.join(f'{k}: {v}' for k, v in errors.items())}")
        return "\n".join(lines)


# ------------------------------------------------------------------ #
# ReportGenerator — main class                                          #
# ------------------------------------------------------------------ #

class ReportGenerator:
    """
    Sinh báo cáo đầu tư tiếng Việt 11 phần từ StockAnalysisResult.

    Dùng Claude API với single message call — không dùng tool use.
    Toàn bộ dữ liệu được serialize vào context prompt bởi PromptBuilder.

    Sử dụng:
        gen = ReportGenerator()
        report_md = gen.generate(analysis_result)

    Streaming:
        for chunk in gen.generate_stream(analysis_result):
            print(chunk, end="", flush=True)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        config: Optional[ReportConfig] = None,
    ) -> None:
        self._config = config or ReportConfig()
        self._client = anthropic.Anthropic(
            api_key=api_key or os.environ.get("ANTHROPIC_API_KEY")
        )
        logger.info(
            "ReportGenerator ready — model=%s, max_tokens=%d",
            self._config.model, self._config.max_tokens,
        )

    # ------------------------------------------------------------------ #
    # Public API                                                            #
    # ------------------------------------------------------------------ #

    def generate(self, result: StockAnalysisResult) -> str:
        """
        Sinh báo cáo Markdown đầy đủ (blocking).

        Args:
            result: StockAnalysisResult từ pipeline.analyze().

        Returns:
            Chuỗi Markdown báo cáo tiếng Việt 11 phần.

        Raises:
            anthropic.APIError: Nếu Claude API trả về lỗi.
        """
        user_prompt = PromptBuilder.build(result, self._config.extra_instructions)
        logger.info("[ReportGenerator] Generating report for %s...", result.ticker)

        response = self._client.messages.create(
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = self._extract_text(response.content)
        logger.info(
            "[ReportGenerator] Done — %d chars, stop_reason=%s",
            len(text), response.stop_reason,
        )
        return text

    def generate_stream(self, result: StockAnalysisResult) -> Iterator[str]:
        """
        Sinh báo cáo dạng streaming — yield từng chunk text.

        Dùng khi muốn hiển thị báo cáo ngay khi Claude đang viết.

        Args:
            result: StockAnalysisResult từ pipeline.analyze().

        Yields:
            Từng đoạn text (chunk) khi Claude sinh ra.
        """
        user_prompt = PromptBuilder.build(result, self._config.extra_instructions)
        logger.info("[ReportGenerator] Streaming report for %s...", result.ticker)

        with self._client.messages.stream(
            model=self._config.model,
            max_tokens=self._config.max_tokens,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            for text in stream.text_stream:
                yield text

    # ------------------------------------------------------------------ #
    # Private                                                               #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _extract_text(content_blocks: list) -> str:
        return "\n".join(
            block.text for block in content_blocks
            if hasattr(block, "text") and block.text
        ).strip()
