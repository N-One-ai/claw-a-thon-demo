from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


class PDFExporter:
    """
    Xuất báo cáo ra PDF dùng reportlab.
    Chuyển markdown thành PDF có định dạng chuyên nghiệp.
    """

    # Font mặc định — reportlab built-in (hỗ trợ Latin, không cần embed)
    _FONT_NORMAL = "Helvetica"
    _FONT_BOLD = "Helvetica-Bold"
    _FONT_ITALIC = "Helvetica-Oblique"

    def save(
        self,
        report_text: str,
        ticker: str,
        output_dir: str = "reports",
        valuation: Optional[dict[str, Any]] = None,
        company: Optional[dict[str, Any]] = None,
    ) -> Path:
        """Tạo và lưu PDF. Trả về path đã lưu."""
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
            )
        except ImportError as exc:
            raise RuntimeError(
                "reportlab chưa được cài. Chạy: pip install reportlab"
            ) from exc

        out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = out_dir / f"{ticker.upper()}_{timestamp}.pdf"

        doc = SimpleDocTemplate(
            str(filepath),
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
            title=f"Phân tích cổ phiếu {ticker.upper()}",
            author="N-One Stock Analysis Agent",
        )

        styles = getSampleStyleSheet()
        story = []

        # Cover header
        story.append(Paragraph(
            f"<font size='18'><b>PHÂN TÍCH ĐẦU TƯ</b></font>",
            styles["Title"],
        ))
        story.append(Paragraph(
            f"<font size='14'>{ticker.upper()}</font>",
            styles["Title"],
        ))
        if company:
            story.append(Paragraph(
                company.get("company_name", ""),
                styles["Normal"],
            ))
        story.append(Paragraph(
            f"Ngày: {datetime.now().strftime('%d/%m/%Y')}  |  N-One Stock Analysis Agent",
            styles["Normal"],
        ))
        story.append(Spacer(1, 0.5 * cm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.darkblue))
        story.append(Spacer(1, 0.3 * cm))

        # Valuation summary table
        if valuation:
            consensus = valuation.get("consensus", {})
            fv = consensus.get("fair_value_vnd")
            price = valuation.get("current_price_vnd")
            discount = consensus.get("discount_pct")
            label = consensus.get("label", "")

            summary_data = [
                ["Giá hiện tại", f"{price:,.0f} VND".replace(",", ".") if price else "N/A"],
                ["Giá trị hợp lý", f"{fv:,.0f} VND".replace(",", ".") if fv else "N/A"],
                ["Chiết khấu/Premium", f"{discount:+.1f}%" if discount is not None else "N/A"],
                ["Nhận định", label],
            ]
            tbl = Table(summary_data, colWidths=[5 * cm, 8 * cm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.lightblue),
                ("FONTNAME", (0, 0), (-1, -1), self._FONT_NORMAL),
                ("FONTNAME", (0, 0), (0, -1), self._FONT_BOLD),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.lightgrey]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(tbl)
            story.append(Spacer(1, 0.5 * cm))
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
            story.append(Spacer(1, 0.3 * cm))

        # Render markdown report as paragraphs
        for element in self._parse_markdown(report_text, styles):
            story.append(element)

        # Footer
        story.append(Spacer(1, 1 * cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
        story.append(Paragraph(
            "<i>Báo cáo được tạo tự động bởi N-One Stock Analysis Agent. "
            "Chỉ mang tính thông tin, không phải lời khuyên đầu tư.</i>",
            styles["Normal"],
        ))

        doc.build(story)
        return filepath

    def _parse_markdown(self, text: str, styles) -> list:
        """Chuyển markdown thành reportlab flowables."""
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import Paragraph, Spacer, HRFlowable

        h1_style = styles["Heading1"]
        h2_style = styles["Heading2"]
        h3_style = styles["Heading3"]
        normal_style = styles["Normal"]

        elements = []
        lines = text.split("\n")

        for line in lines:
            stripped = line.strip()
            if not stripped:
                elements.append(Spacer(1, 0.2 * cm))
                continue

            if stripped.startswith("# "):
                elements.append(Spacer(1, 0.3 * cm))
                elements.append(Paragraph(stripped[2:], h1_style))
            elif stripped.startswith("## "):
                elements.append(Spacer(1, 0.3 * cm))
                elements.append(Paragraph(stripped[3:], h2_style))
                elements.append(HRFlowable(width="100%", thickness=0.3, color=colors.lightgrey))
            elif stripped.startswith("### "):
                elements.append(Paragraph(stripped[4:], h3_style))
            elif stripped.startswith("- ") or stripped.startswith("* "):
                # Bullet points — convert to indented paragraph
                content = self._md_inline(stripped[2:])
                elements.append(Paragraph(f"• {content}", normal_style))
            elif stripped.startswith("---"):
                elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
            elif stripped.startswith("|"):
                # Skip markdown tables (complex to render in PDF)
                continue
            else:
                content = self._md_inline(stripped)
                elements.append(Paragraph(content, normal_style))

        return elements

    @staticmethod
    def _md_inline(text: str) -> str:
        """Chuyển markdown inline formatting sang reportlab XML tags."""
        text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
        text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
        text = re.sub(r"`(.+?)`", r"<font name='Courier'>\1</font>", text)
        # Escape unmatched angle brackets
        text = re.sub(r"<(?!/?[bi]>|/?font)", "&lt;", text)
        return text
