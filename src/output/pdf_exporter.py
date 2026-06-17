from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


# Font search order — fonts that support Vietnamese Unicode
_UNICODE_FONT_PATHS: list[str] = [
    # macOS
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/SupplementalFonts/Arial Unicode.ttf",
    # Windows
    "C:/Windows/Fonts/ARIALUNI.TTF",
    "C:/Windows/Fonts/arial.ttf",
    # Linux (common packages: fonts-noto, fonts-open-sans)
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]


def _find_unicode_font() -> Optional[str]:
    """Tìm TTF font hỗ trợ Unicode trên hệ thống."""
    for path in _UNICODE_FONT_PATHS:
        if Path(path).exists():
            return path
    return None


class PDFExporter:
    """
    Xuất báo cáo ra PDF dùng reportlab với font hỗ trợ tiếng Việt.

    Tự động phát hiện font Unicode trên hệ thống.
    Nếu không tìm thấy, fallback về Helvetica với cảnh báo.
    """

    _font_registered: bool = False
    _font_name: str = "Helvetica"
    _font_bold: str = "Helvetica-Bold"
    _font_italic: str = "Helvetica-Oblique"

    @classmethod
    def _setup_fonts(cls) -> None:
        """Đăng ký font Unicode với reportlab (chỉ chạy một lần)."""
        if cls._font_registered:
            return

        font_path = _find_unicode_font()
        if font_path:
            try:
                from reportlab.pdfbase import pdfmetrics
                from reportlab.pdfbase.ttfonts import TTFont

                pdfmetrics.registerFont(TTFont("VietFont", font_path))
                pdfmetrics.registerFont(TTFont("VietFont-Bold", font_path))   # dùng cùng file nếu không có bold riêng
                cls._font_name = "VietFont"
                cls._font_bold = "VietFont-Bold"
                cls._font_italic = "VietFont"
            except Exception:
                pass   # giữ nguyên Helvetica

        cls._font_registered = True

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
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
            )
        except ImportError as exc:
            raise RuntimeError(
                "reportlab chưa được cài. Chạy: pip install reportlab"
            ) from exc

        self._setup_fonts()
        fn = self._font_name
        fb = self._font_bold

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

        base = getSampleStyleSheet()
        normal = ParagraphStyle("VNNormal", parent=base["Normal"], fontName=fn, fontSize=10, leading=14)
        h1 = ParagraphStyle("VNH1", parent=base["Heading1"], fontName=fb, fontSize=14, leading=18, spaceAfter=4)
        h2 = ParagraphStyle("VNH2", parent=base["Heading2"], fontName=fb, fontSize=12, leading=16, spaceAfter=3)
        h3 = ParagraphStyle("VNH3", parent=base["Heading3"], fontName=fb, fontSize=11, leading=14, spaceAfter=2)
        title_style = ParagraphStyle("VNTitle", parent=base["Title"], fontName=fb, fontSize=18)

        story = []

        # Cover header
        story.append(Paragraph("PHÂN TÍCH ĐẦU TƯ", title_style))
        story.append(Paragraph(ticker.upper(), ParagraphStyle("VNSub", parent=title_style, fontSize=14)))
        if company:
            name = company.get("name", company.get("company_name", ""))
            if name:
                story.append(Paragraph(name, normal))
        story.append(Paragraph(
            f"Ngày: {datetime.now().strftime('%d/%m/%Y')}  |  N-One Stock Analysis Agent",
            normal,
        ))
        story.append(Spacer(1, 0.5 * cm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.darkblue))
        story.append(Spacer(1, 0.3 * cm))

        # Valuation summary table
        if valuation:
            consensus = valuation.get("consensus") or {}
            fv = consensus.get("fair_value_vnd") or valuation.get("consensus_value")
            price = valuation.get("current_price_vnd")
            discount = consensus.get("discount_pct")
            label = consensus.get("label", "")

            def _fmt(v: Any) -> str:
                try:
                    return f"{float(v):,.0f} VND".replace(",", ".")
                except (TypeError, ValueError):
                    return "N/A"

            summary_data = [
                ["Giá hiện tại", _fmt(price)],
                ["Giá trị hợp lý", _fmt(fv)],
                ["Chiết khấu/Premium", f"{discount:+.1f}%" if discount is not None else "N/A"],
                ["Nhận định", str(label)],
            ]
            tbl = Table(summary_data, colWidths=[5 * cm, 8 * cm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.lightblue),
                ("FONTNAME", (0, 0), (-1, -1), fn),
                ("FONTNAME", (0, 0), (0, -1), fb),
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
        for element in self._parse_markdown(report_text, normal, h1, h2, h3):
            story.append(element)

        # Footer
        story.append(Spacer(1, 1 * cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
        footer_style = ParagraphStyle("VNFooter", parent=normal, fontSize=8, textColor=colors.grey)
        story.append(Paragraph(
            "Báo cáo được tạo tự động bởi N-One Stock Analysis Agent. "
            "Chỉ mang tính thông tin, không phải lời khuyên đầu tư.",
            footer_style,
        ))

        doc.build(story)
        return filepath

    @staticmethod
    def _parse_markdown(
        text: str,
        normal_style,
        h1_style,
        h2_style,
        h3_style,
    ) -> list:
        """Chuyển markdown thành reportlab flowables."""
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import Paragraph, Spacer, HRFlowable

        elements = []
        for line in text.split("\n"):
            stripped = line.strip()
            if not stripped:
                elements.append(Spacer(1, 0.2 * cm))
                continue

            if stripped.startswith("# "):
                elements.append(Spacer(1, 0.3 * cm))
                elements.append(Paragraph(_clean(stripped[2:]), h1_style))
            elif stripped.startswith("## "):
                elements.append(Spacer(1, 0.3 * cm))
                elements.append(Paragraph(_clean(stripped[3:]), h2_style))
                elements.append(HRFlowable(width="100%", thickness=0.3, color=colors.lightgrey))
            elif stripped.startswith("### "):
                elements.append(Paragraph(_clean(stripped[4:]), h3_style))
            elif stripped.startswith(("- ", "* ")):
                elements.append(Paragraph(f"• {_md_inline(_clean(stripped[2:]))}", normal_style))
            elif stripped.startswith("---"):
                elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
            elif stripped.startswith("|"):
                pass   # bỏ qua markdown table (quá phức tạp để render trong PDF)
            else:
                elements.append(Paragraph(_md_inline(_clean(stripped)), normal_style))

        return elements


def _clean(text: str) -> str:
    """Xóa ký tự XML/HTML đặc biệt không hợp lệ trong reportlab."""
    text = text.replace("&", "&amp;")
    # Chỉ giữ lại các tag hợp lệ của reportlab: <b>, <i>, <font ...>
    text = re.sub(r"<(?!/?(?:b|i|font)\b)[^>]*>", "", text)
    return text


def _md_inline(text: str) -> str:
    """Chuyển markdown inline formatting sang reportlab XML tags."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r"\1", text)   # bỏ backtick, giữ nội dung
    return text
