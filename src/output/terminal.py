from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from rich.columns import Columns
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box

console = Console()


class TerminalRenderer:
    """
    Render báo cáo phân tích ra terminal với Rich.
    Hiển thị bảng tóm tắt trực quan trước, sau đó toàn văn báo cáo Claude.
    """

    def __init__(self, width: int = 100) -> None:
        self._console = Console(width=width)

    # ------------------------------------------------------------------ #
    # Entry point                                                          #
    # ------------------------------------------------------------------ #

    def render(
        self,
        report_text: str,
        valuation: Optional[dict[str, Any]] = None,
        technical: Optional[dict[str, Any]] = None,
        risk: Optional[dict[str, Any]] = None,
        company: Optional[dict[str, Any]] = None,
    ) -> None:
        """
        Render toàn bộ: header panel → bảng tóm tắt → báo cáo markdown.
        Nếu không có dữ liệu cấu trúc, chỉ render markdown.
        """
        self._console.print()

        if valuation or technical or risk:
            self._render_header(valuation, technical, risk, company)
            self._console.print()
            self._render_summary_tables(valuation, technical, risk)
            self._console.print()
            self._render_divider("BÁO CÁO PHÂN TÍCH CHI TIẾT")
            self._console.print()

        self._console.print(Markdown(report_text))
        self._console.print()

    # ------------------------------------------------------------------ #
    # Header panel                                                        #
    # ------------------------------------------------------------------ #

    def _render_header(self, valuation, technical, risk, company) -> None:
        ticker = (valuation or {}).get("ticker", "N/A")
        name = (company or {}).get("company_name", "")
        price = (valuation or {}).get("current_price_vnd", 0)
        consensus = ((valuation or {}).get("consensus", {}) or {}).get("fair_value_vnd")
        discount = ((valuation or {}).get("consensus", {}) or {}).get("discount_pct")
        label = ((valuation or {}).get("consensus", {}) or {}).get("label", "")
        trend = ((technical or {}).get("trend", {}) or {}).get("label", "N/A")
        risk_level = (risk or {}).get("overall_risk_level", "N/A")

        # Màu theo label
        label_color = {
            "Rất hấp dẫn": "bold green",
            "Hấp dẫn": "green",
            "Trung lập": "yellow",
            "Đắt": "red",
            "Rất đắt": "bold red",
        }.get(label, "white")

        risk_color = {
            "Thấp": "green",
            "Trung bình": "yellow",
            "Cao": "red",
            "Rất cao": "bold red",
        }.get(risk_level, "white")

        trend_color = {
            "Tăng mạnh": "bold green",
            "Tích lũy": "yellow",
            "Điều chỉnh": "dark_orange",
            "Giảm": "red",
        }.get(trend, "white")

        header = Text()
        header.append(f"  {ticker}", style="bold cyan")
        if name:
            header.append(f"  —  {name}", style="white")
        header.append("\n\n")
        header.append(f"  💰 Giá hiện tại: ", style="dim")
        header.append(f"{price:>12,.0f} VND".replace(",", "."), style="bold white")

        if consensus:
            header.append(f"     Fair Value: ", style="dim")
            header.append(f"{consensus:>12,.0f} VND".replace(",", "."), style="bold cyan")

        if discount is not None:
            sign = "+" if discount > 0 else ""
            header.append(f"     {sign}{discount:.1f}%  ", style=label_color)
            header.append(f"[{label}]", style=label_color)

        header.append(f"\n\n  📈 Xu hướng: ")
        header.append(f"{trend}", style=trend_color)
        header.append(f"     ⚠️  Rủi ro: ")
        header.append(f"{risk_level}", style=risk_color)
        header.append(f"     🗓️  {datetime.now().strftime('%d/%m/%Y')}")

        self._console.print(Panel(
            header,
            title="[bold]N-ONE STOCK ANALYSIS AGENT[/bold]",
            border_style="cyan",
            padding=(0, 1),
        ))

    # ------------------------------------------------------------------ #
    # Summary tables                                                       #
    # ------------------------------------------------------------------ #

    def _render_summary_tables(self, valuation, technical, risk) -> None:
        tables = []
        if valuation:
            tables.append(self._valuation_table(valuation))
        if technical:
            tables.append(self._technical_table(technical))
        if risk:
            tables.append(self._risk_table(risk))
        if tables:
            self._console.print(Columns(tables, equal=False, expand=True))

    def _valuation_table(self, v: dict) -> Table:
        t = Table(
            title="📊 Định giá",
            box=box.ROUNDED,
            border_style="blue",
            title_style="bold blue",
            show_header=True,
            header_style="bold",
        )
        t.add_column("Mô hình", style="dim", min_width=16)
        t.add_column("Giá trị (VND)", justify="right", min_width=14)
        t.add_column("Trạng thái", min_width=10)

        models = v.get("models", {})
        price = v.get("current_price_vnd", 0)

        def row(name, data_key):
            m = models.get(data_key, {})
            if not m.get("available", False):
                reason = (m.get("reason") or "N/A")[:30]
                t.add_row(name, "—", f"[dim]{reason}[/dim]")
                return
            fv = m.get("fair_value_vnd", 0)
            disc = (fv - price) / price * 100 if price else 0
            sign = "+" if disc > 0 else ""
            color = "green" if disc > 0 else "red"
            t.add_row(
                name,
                f"{fv:,.0f}".replace(",", "."),
                f"[{color}]{sign}{disc:.1f}%[/{color}]",
            )

        row("P/E Fair Value", "pe_fair_value")
        row("P/B Fair Value", "pb_fair_value")
        row("Graham Number", "graham_number")
        row("DCF (Cơ sở)", "dcf_base_case")

        ey = models.get("earnings_yield", {})
        if ey:
            ey_pct = ey.get("ey_pct", 0)
            spread = ey.get("spread_pct", 0)
            color = "green" if ey.get("is_attractive") else "yellow"
            t.add_row(
                "Earnings Yield",
                f"{ey_pct:.1f}%",
                f"[{color}]spread {spread:+.1f}%[/{color}]",
            )

        t.add_section()
        c = v.get("consensus", {})
        fv = c.get("fair_value_vnd", 0)
        disc = c.get("discount_pct", 0)
        label = c.get("label", "")
        sign = "+" if disc > 0 else ""
        color = "green" if disc > 0 else "red"
        t.add_row(
            "[bold]Đồng thuận[/bold]",
            f"[bold]{fv:,.0f}[/bold]".replace(",", "."),
            f"[bold {color}]{sign}{disc:.1f}% {label}[/bold {color}]",
        )
        return t

    def _technical_table(self, tc: dict) -> Table:
        t = Table(
            title="📈 Kỹ thuật",
            box=box.ROUNDED,
            border_style="magenta",
            title_style="bold magenta",
            show_header=True,
            header_style="bold",
        )
        t.add_column("Chỉ báo", style="dim", min_width=14)
        t.add_column("Giá trị", justify="right", min_width=10)
        t.add_column("Tín hiệu", min_width=12)

        price = tc.get("current_price_vnd", 0)
        ma = tc.get("moving_averages", {})

        def ma_row(label, key_sma, key_pct):
            sma = ma.get(key_sma)
            pct = ma.get(key_pct)
            if sma is None:
                t.add_row(label, "—", "[dim]Chưa đủ dữ liệu[/dim]")
                return
            color = "green" if (pct or 0) >= 0 else "red"
            sign = "+" if (pct or 0) >= 0 else ""
            t.add_row(label, f"{sma:,.0f}".replace(",", "."), f"[{color}]{sign}{pct:.1f}%[/{color}]")

        ma_row("SMA 20", "sma_20", "price_vs_sma20_pct")
        ma_row("SMA 50", "sma_50", "price_vs_sma50_pct")
        ma_row("SMA 200", "sma_200", "price_vs_sma200_pct")

        t.add_section()
        rsi_data = tc.get("rsi", {})
        rsi_val = rsi_data.get("value")
        rsi_lbl = rsi_data.get("label", "N/A")
        rsi_color = {"Quá mua": "red", "Quá bán": "green", "Trung lập": "yellow"}.get(rsi_lbl, "white")
        t.add_row("RSI(14)", f"{rsi_val:.1f}" if rsi_val else "—", f"[{rsi_color}]{rsi_lbl}[/{rsi_color}]")

        macd_data = tc.get("macd", {})
        macd_sig = macd_data.get("signal", "N/A")
        macd_color = {"Mua": "green", "Bán": "red", "Chờ": "yellow"}.get(macd_sig, "white")
        t.add_row("MACD", "", f"[{macd_color}]{macd_sig}[/{macd_color}]")

        vol = tc.get("volume", {}).get("trend", "N/A")
        vol_color = "green" if "Tăng" in (vol or "") else ("red" if "Giảm" in (vol or "") else "yellow")
        t.add_row("Volume", "", f"[{vol_color}]{vol}[/{vol_color}]")

        t.add_section()
        w52 = tc.get("52_week", {})
        high = w52.get("high_vnd")
        low = w52.get("low_vnd")
        pos = w52.get("current_position_pct")
        if high and low:
            t.add_row("52w High", f"{high:,.0f}".replace(",", "."), "")
            t.add_row("52w Low", f"{low:,.0f}".replace(",", "."), "")
        if pos is not None:
            pos_color = "green" if pos >= 50 else "yellow"
            t.add_row("Vị trí 52w", f"{pos:.0f}%", f"[{pos_color}]từ đáy[/{pos_color}]")

        return t

    def _risk_table(self, r: dict) -> Table:
        t = Table(
            title="⚠️  Rủi ro",
            box=box.ROUNDED,
            border_style="red",
            title_style="bold red",
            show_header=True,
            header_style="bold",
        )
        t.add_column("Chỉ số", style="dim", min_width=16)
        t.add_column("Giá trị", justify="right", min_width=10)
        t.add_column("Đánh giá", min_width=14)

        m = r.get("metrics", {})

        def risk_row(label, key, fmt="{:.2f}", good_under=None, bad_over=None):
            val = m.get(key)
            if val is None:
                t.add_row(label, "—", "[dim]N/A[/dim]")
                return
            formatted = fmt.format(val)
            color = "white"
            if good_under and val < good_under:
                color = "green"
            elif bad_over and val > bad_over:
                color = "red"
            else:
                color = "yellow"
            t.add_row(label, f"[{color}]{formatted}[/{color}]", "")

        risk_row("Beta", "beta", "{:.2f}", good_under=1.0, bad_over=1.5)
        risk_row("Biến động/năm", "annualized_volatility_pct", "{:.1f}%", good_under=25, bad_over=40)
        risk_row("D/E ratio", "debt_to_equity", "{:.2f}×", good_under=1.0, bad_over=2.0)
        risk_row("Interest Coverage", "interest_coverage", "{:.1f}×", good_under=None, bad_over=None)

        stability = m.get("earnings_stability", "N/A")
        stab_color = {"Cao": "green", "Trung bình": "yellow", "Thấp": "red"}.get(stability, "white")
        t.add_row("Ổn định EPS", f"[{stab_color}]{stability}[/{stab_color}]", "")

        avg_vol = m.get("avg_daily_volume")
        if avg_vol:
            vol_color = "green" if avg_vol >= 500_000 else ("yellow" if avg_vol >= 100_000 else "red")
            t.add_row("KL TB/ngày", f"[{vol_color}]{avg_vol:,}[/{vol_color}]", "")

        t.add_section()
        overall = r.get("overall_risk_level", "N/A")
        overall_color = {"Thấp": "green", "Trung bình": "yellow", "Cao": "red", "Rất cao": "bold red"}.get(overall, "white")
        t.add_row("[bold]Tổng mức rủi ro[/bold]", "", f"[{overall_color}]{overall}[/{overall_color}]")

        flags = r.get("risk_flags", [])
        if flags:
            t.add_section()
            for flag in flags[:4]:
                sev = flag.get("severity", "")
                sev_color = {"Rất cao": "bold red", "Cao": "red", "Trung bình": "yellow", "Thấp": "dim"}.get(sev, "white")
                t.add_row(
                    f"[{sev_color}]⚑ {flag.get('type', '')}[/{sev_color}]",
                    "",
                    f"[{sev_color}]{sev}[/{sev_color}]",
                )

        return t

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #

    def _render_divider(self, title: str) -> None:
        self._console.rule(f"[bold cyan]{title}[/bold cyan]", style="cyan")
