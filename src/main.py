#!/usr/bin/env python3
"""
N-One Stock Analysis Agent — CLI Entry Point

Sử dụng:
  python -m src.main --ticker VCB
  python -m src.main --ticker FPT --stream
  python -m src.main --ticker HPG --output pdf
  python -m src.main --ticker VNM --output json
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

_PROJECT_ROOT = Path(__file__).parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from dotenv import load_dotenv  # type: ignore[import-untyped]  # noqa: E402

load_dotenv()


def _setup_logging(level: str = "WARNING") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.WARNING),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    for noisy in ("httpx", "httpcore", "anthropic", "urllib3", "vnstock"):
        logging.getLogger(noisy).setLevel(logging.ERROR)


def _check_api_key() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Lỗi: Chưa thiết lập ANTHROPIC_API_KEY.")
        print("Chạy: export ANTHROPIC_API_KEY=sk-ant-...")
        print("Hoặc tạo file .env từ .env.example")
        sys.exit(1)


def _fetch_structured_data(ticker: str, cache_dir: str, source: str) -> dict:
    """
    Lấy dữ liệu cấu trúc từ ToolServices (hit cache sau khi agent đã chạy).
    Dùng để hiển thị bảng tóm tắt trong TerminalRenderer.
    """
    from src.tools.services import ToolServices
    svc = ToolServices(cache_dir=cache_dir, vnstock_source=source)
    result = {}
    for fn_name in ("fetch_company_data", "compute_valuation",
                    "compute_technical_signals", "compute_risk_profile"):
        try:
            fn = getattr(svc, fn_name)
            data = fn(ticker)
            if "error" not in data:
                key = {
                    "fetch_company_data": "company",
                    "compute_valuation": "valuation",
                    "compute_technical_signals": "technical",
                    "compute_risk_profile": "risk",
                }[fn_name]
                result[key] = data
        except Exception:
            pass
    return result


def run_analysis(args: argparse.Namespace) -> None:
    from src.agent.orchestrator import StockAgent
    from src.data.models import AnalysisRequest
    from src.output import JSONExporter, PDFExporter, TerminalRenderer

    ticker = args.ticker.upper()

    request = AnalysisRequest(
        ticker=ticker,
        include_news=not args.no_news,
        custom_wacc=args.wacc,
        custom_growth=args.growth,
    )

    agent = StockAgent(cache_dir=args.cache_dir, vnstock_source=args.source)

    # ---- Stream mode -------------------------------------------------- #
    if args.stream:
        renderer = TerminalRenderer()
        renderer._console.print(
            f"\n[bold cyan]Đang phân tích {ticker} (streaming)...[/bold cyan]\n"
        )
        full_text = []
        for chunk in agent.analyze_stream(request):
            print(chunk, end="", flush=True)
            full_text.append(chunk)
        print()
        return

    # ---- Blocking analysis -------------------------------------------- #
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn
    console = Console()

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  console=console, transient=True) as progress:
        task = progress.add_task(f"Đang phân tích {ticker}...", total=None)
        report_text = agent.analyze(request)
        progress.update(task, completed=True)

    # Lấy dữ liệu cấu trúc từ cache (không gọi lại API)
    structured = _fetch_structured_data(ticker, args.cache_dir, args.source)

    # ---- Output -------------------------------------------------------- #
    if args.output == "terminal":
        renderer = TerminalRenderer()
        renderer.render(
            report_text,
            valuation=structured.get("valuation"),
            technical=structured.get("technical"),
            risk=structured.get("risk"),
            company=structured.get("company"),
        )

    elif args.output == "json":
        exporter = JSONExporter()
        saved = exporter.save(
            report_text, ticker,
            output_dir=args.output_dir,
            valuation=structured.get("valuation"),
            technical=structured.get("technical"),
            risk=structured.get("risk"),
            company=structured.get("company"),
        )
        console.print(f"[green]✓ JSON đã lưu:[/green] {saved}")

    elif args.output == "pdf":
        exporter = PDFExporter()
        saved = exporter.save(
            report_text, ticker,
            output_dir=args.output_dir,
            valuation=structured.get("valuation"),
            company=structured.get("company"),
        )
        console.print(f"[green]✓ PDF đã lưu:[/green] {saved}")

    elif args.output == "md":
        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = out_dir / f"{ticker}_{ts}.md"
        filepath.write_text(report_text, encoding="utf-8")
        console.print(f"[green]✓ Markdown đã lưu:[/green] {filepath}")


def run_pipeline(args: argparse.Namespace) -> None:
    """
    Pipeline mode: DataFetcher → ValuationEngine → TechnicalAnalyzer
                   → RiskAnalyzer → ReportGenerator → output.
    Không dùng tool-call loop. Toàn bộ dữ liệu được tính trước,
    Claude chỉ tập trung viết báo cáo.
    """
    from rich.console import Console
    from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn

    from src.data.cache import CacheManager
    from src.output import JSONExporter, PDFExporter, TerminalRenderer
    from src.pipeline import AnalysisPipeline
    from src.report_generator import ReportConfig, ReportGenerator

    ticker = args.ticker.upper()
    console = Console()

    pipeline = AnalysisPipeline(
        cache_dir=args.cache_dir,
        source=args.source,
        custom_wacc=args.wacc,
        custom_growth=args.growth,
    )
    cache = CacheManager(cache_dir=args.cache_dir)
    generator = ReportGenerator(config=ReportConfig(), cache=cache)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(bar_width=20),
        console=console, transient=True,
    ) as progress:
        # Bước 1: Lấy và phân tích dữ liệu
        t1 = progress.add_task(f"[cyan]Bước 1/2: Phân tích dữ liệu {ticker}...", total=None)
        try:
            result = pipeline.analyze(ticker)
        except RuntimeError as exc:
            console.print(f"[red]Lỗi lấy dữ liệu:[/red] {exc}")
            return
        progress.update(t1, description=f"[green]✓ Phân tích {ticker} xong", completed=True)

        if result.has_errors:
            for step, err in result.errors.items():
                console.print(f"[yellow]  ⚠ {step}: {err}[/yellow]")

        # Bước 2: Sinh báo cáo AI
        t2 = progress.add_task("[cyan]Bước 2/2: Sinh báo cáo AI...", total=None)

        if args.stream:
            progress.stop()
            console.print(f"\n[bold cyan]{'─'*60}[/bold cyan]")
            full_chunks = []
            for chunk in generator.generate_stream(result):
                print(chunk, end="", flush=True)
                full_chunks.append(chunk)
            print()
            return

        report_text = generator.generate(result)
        progress.update(t2, description="[green]✓ Báo cáo AI xong", completed=True)

    # ---- Output -------------------------------------------------------- #
    if args.output == "terminal":
        renderer = TerminalRenderer()
        renderer.render(
            report_text,
            valuation=result.valuation.model_dump() if result.valuation else None,
            technical=result.technical.model_dump() if result.technical else None,
            risk=result.risk.model_dump() if result.risk else None,
            company=result.company.model_dump(),
        )

    elif args.output == "json":
        exporter = JSONExporter()
        saved = exporter.save(
            report_text, ticker,
            output_dir=args.output_dir,
            valuation=result.valuation.model_dump() if result.valuation else None,
            technical=result.technical.model_dump() if result.technical else None,
            risk=result.risk.model_dump() if result.risk else None,
            company=result.company.model_dump(),
        )
        console.print(f"[green]✓ JSON đã lưu:[/green] {saved}")

    elif args.output == "pdf":
        exporter = PDFExporter()
        saved = exporter.save(
            report_text, ticker,
            output_dir=args.output_dir,
            valuation=result.valuation.model_dump() if result.valuation else None,
            company=result.company.model_dump(),
        )
        console.print(f"[green]✓ PDF đã lưu:[/green] {saved}")

    elif args.output == "md":
        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = out_dir / f"{ticker}_{ts}.md"
        filepath.write_text(report_text, encoding="utf-8")
        console.print(f"[green]✓ Markdown đã lưu:[/green] {filepath}")

    # Hiển thị metadata
    console.print(
        f"\n[dim]⏱ Fetch: {result.fetch_ms}ms | "
        f"Analysis: {result.analysis_ms}ms | "
        f"Dữ liệu: {result.data_quality.periods_income} kỳ KQKD, "
        f"{result.data_quality.price_trading_days} phiên giá[/dim]"
    )


# ------------------------------------------------------------------ #
# Batch analysis                                                      #
# ------------------------------------------------------------------ #

def _render_batch_table(
    console,
    results: dict,
    errors: dict,
) -> None:
    """Bảng so sánh ranking — sort theo discount_pct (hấp dẫn nhất trước)."""
    from rich import box
    from rich.table import Table
    from rich.text import Text

    if not results and not errors:
        console.print("[red]Không có kết quả nào.[/red]")
        return

    has_valuation = [(t, r) for t, r in results.items() if r.valuation]
    no_valuation = [(t, r) for t, r in results.items() if not r.valuation]

    # Sort by discount_pct descending — most undervalued at top
    has_valuation.sort(key=lambda x: x[1].valuation.discount_pct, reverse=True)

    table = Table(
        title=f"So sánh batch — {datetime.now().strftime('%d/%m/%Y')}",
        box=box.ROUNDED,
        show_header=True,
        header_style="bold cyan",
        border_style="cyan",
        expand=False,
    )
    table.add_column("#", justify="center", width=3, no_wrap=True)
    table.add_column("Mã", justify="center", style="bold", width=6, no_wrap=True)
    table.add_column("Tên công ty", width=24, no_wrap=True)
    table.add_column("Giá (VND)", justify="right", width=11, no_wrap=True)
    table.add_column("Giá hợp lý", justify="right", width=11, no_wrap=True)
    table.add_column("Discount", justify="right", width=9, no_wrap=True)
    table.add_column("Tiềm năng", width=12, no_wrap=True)
    table.add_column("Rủi ro", width=10, no_wrap=True)
    table.add_column("RSI", justify="center", width=6, no_wrap=True)
    table.add_column("Xu hướng", width=12, no_wrap=True)

    _RISK_STYLE = {
        "Thấp": "green",
        "Trung bình": "yellow",
        "Cao": "red",
        "Rất cao": "bold red",
    }

    for rank, (ticker, r) in enumerate(has_valuation, 1):
        v = r.valuation
        tc = r.technical

        disc = v.discount_pct
        if disc >= 20:
            disc_text = Text(f"+{disc:.1f}%", style="bold bright_green")
        elif disc >= 5:
            disc_text = Text(f"+{disc:.1f}%", style="green")
        elif disc >= 0:
            disc_text = Text(f"+{disc:.1f}%", style="yellow")
        else:
            disc_text = Text(f"{disc:.1f}%", style="red")

        risk_label = r.risk.overall_risk.value if r.risk else "N/A"
        risk_text = Text(risk_label, style=_RISK_STYLE.get(risk_label, "white"))

        rsi = tc.rsi_14 if tc else None
        if rsi is None:
            rsi_text = Text("N/A", style="dim")
        elif rsi >= 70:
            rsi_text = Text(f"{rsi:.0f}", style="red")
        elif rsi <= 30:
            rsi_text = Text(f"{rsi:.0f}", style="bright_green")
        else:
            rsi_text = Text(f"{rsi:.0f}", style="white")

        table.add_row(
            str(rank),
            ticker,
            (r.company.name or ticker)[:24],
            f"{r.current_price:,.0f}" if r.current_price else "N/A",
            f"{v.consensus_value:,.0f}",
            disc_text,
            v.label.value,
            risk_text,
            rsi_text,
            (tc.price_trend or "N/A") if tc else "N/A",
        )

    for ticker, r in no_valuation:
        table.add_row(
            "—", ticker, (r.company.name or ticker)[:24],
            f"{r.current_price:,.0f}" if r.current_price else "N/A",
            "N/A", "N/A", "[dim]Thiếu dữ liệu[/dim]", "N/A", "N/A", "N/A",
        )

    for ticker, err in errors.items():
        table.add_row(
            "✗", ticker, f"[red]{err[:24]}[/red]", "", "", "", "", "", "", "",
        )

    console.print()
    console.print(table)


def run_batch(args: argparse.Namespace) -> None:
    """
    Phân tích nhiều mã tuần tự và hiển thị bảng so sánh xếp hạng.

    Sử dụng:
        python -m src.main --tickers VCB,FPT,HPG
        python -m src.main --tickers VCB,FPT,HPG --output json
        python -m src.main --tickers VCB,FPT,HPG --report --output md
    """
    from rich.console import Console
    from rich.progress import (
        BarColumn,
        Progress,
        SpinnerColumn,
        TaskProgressColumn,
        TextColumn,
    )

    from src.data.cache import CacheManager
    from src.output import PDFExporter
    from src.pipeline import AnalysisPipeline
    from src.report_generator import ReportConfig, ReportGenerator

    tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    if not tickers:
        print("Lỗi: --tickers cần ít nhất 1 mã. Ví dụ: --tickers VCB,FPT,HPG")
        sys.exit(1)

    console = Console()
    console.print(
        f"\n[bold cyan]Phân tích batch:[/bold cyan] "
        f"[white]{', '.join(tickers)}[/white] "
        f"[dim]({len(tickers)} mã)[/dim]"
    )

    pipeline = AnalysisPipeline(
        cache_dir=args.cache_dir,
        source=args.source,
        custom_wacc=args.wacc,
        custom_growth=args.growth,
    )

    # Sinh báo cáo AI chỉ khi --report flag hoặc output=md/pdf
    need_reports = getattr(args, "report", False) or args.output in ("md", "pdf")
    cache = CacheManager(cache_dir=args.cache_dir)
    generator = ReportGenerator(config=ReportConfig(), cache=cache) if need_reports else None

    results: dict = {}
    reports: dict = {}
    errors: dict = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("[cyan]{task.description}"),
        BarColumn(bar_width=25),
        TaskProgressColumn(),
        console=console,
        transient=True,
    ) as prog:
        task = prog.add_task("Đang phân tích...", total=len(tickers))

        for ticker in tickers:
            prog.update(task, description=f"Đang phân tích [bold]{ticker}[/bold]...")
            try:
                result = pipeline.analyze(ticker)
                results[ticker] = result

                if generator:
                    try:
                        reports[ticker] = generator.generate(result)
                    except Exception as exc:
                        reports[ticker] = f"Lỗi sinh báo cáo: {exc}"

            except Exception as exc:
                errors[ticker] = str(exc)
                console.print(f"  [red]✗ {ticker}: {exc}[/red]")

            prog.advance(task)

    # Bảng so sánh
    _render_batch_table(console, results, errors)

    # ---- Output -------------------------------------------------------- #
    if args.output == "json":
        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = out_dir / f"batch_{ts}.json"
        import json

        payload = {
            "batch": "_".join(tickers),
            "generated_at": datetime.now().isoformat(),
            "count": len(tickers),
            "success": len(results),
            "errors": {t: e for t, e in errors.items()},
            "results": {
                t: {
                    "ticker": r.ticker,
                    "company": r.company.model_dump(),
                    "current_price": r.current_price,
                    "valuation": r.valuation.model_dump() if r.valuation else None,
                    "technical": r.technical.model_dump() if r.technical else None,
                    "risk": r.risk.model_dump() if r.risk else None,
                    "data_quality": r.data_quality.model_dump(),
                    "fetch_ms": r.fetch_ms,
                    "analysis_ms": r.analysis_ms,
                    "report": reports.get(t),
                }
                for t, r in results.items()
            },
        }
        filepath.write_text(
            json.dumps(payload, ensure_ascii=False, default=str, indent=2),
            encoding="utf-8",
        )
        console.print(f"[green]✓ JSON đã lưu:[/green] {filepath}")

    elif args.output == "md" and reports:
        out_dir = Path(args.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        for ticker, text in reports.items():
            fp = out_dir / f"{ticker}_{ts}.md"
            fp.write_text(text, encoding="utf-8")
        console.print(f"[green]✓ Markdown đã lưu vào:[/green] {out_dir}/")

    elif args.output == "pdf" and reports:
        from src.output import PDFExporter
        exporter = PDFExporter()
        for ticker, text in reports.items():
            r = results[ticker]
            fp = exporter.save(
                text, ticker,
                output_dir=args.output_dir,
                valuation=r.valuation.model_dump() if r.valuation else None,
                company=r.company.model_dump(),
            )
            console.print(f"[green]✓ PDF:[/green] {fp}")

    # Tổng kết
    console.print(
        f"\n[dim]Tổng: {len(tickers)} mã | "
        f"Thành công: {len(results)} | "
        f"Lỗi: {len(errors)}[/dim]"
    )


# ------------------------------------------------------------------ #
# Watchlist / Alert scan                                               #
# ------------------------------------------------------------------ #

def _load_watchlist(source: str) -> list[str]:
    """Load tickers từ file văn bản (1 dòng / mã) hoặc chuỗi comma-separated."""
    path = Path(source)
    if path.exists():
        text = path.read_text(encoding="utf-8")
    else:
        text = source
    return [t.strip().upper() for t in text.replace(",", "\n").splitlines() if t.strip()]


def run_watchlist(args: argparse.Namespace) -> None:
    """
    Chạy pipeline cho danh sách watchlist, lọc ra các mã thỏa điều kiện.

    Tiêu chí mặc định:
      - Discount so với fair value ≥ --alert-threshold (default 10%)
      - Mức rủi ro ≤ --max-risk (default MEDIUM)

    Sử dụng:
        python -m src.main --watchlist VCB,FPT,HPG
        python -m src.main --watchlist tickers.txt --alert-threshold 15
        python -m src.main --watchlist VCB,FPT,HPG --max-risk LOW --report
    """
    from rich.console import Console
    from rich.progress import BarColumn, Progress, SpinnerColumn, TaskProgressColumn, TextColumn

    from src.data.cache import CacheManager
    from src.data.models.risk import RiskLevel
    from src.pipeline import AnalysisPipeline
    from src.report_generator import ReportConfig, ReportGenerator

    tickers = _load_watchlist(args.watchlist)
    if not tickers:
        print("Lỗi: watchlist rỗng.")
        sys.exit(1)

    threshold: float = getattr(args, "alert_threshold", 10.0)
    max_risk_str: str = getattr(args, "max_risk", "MEDIUM")
    risk_order = {
        RiskLevel.LOW: 1,
        RiskLevel.MEDIUM: 2,
        RiskLevel.HIGH: 3,
        RiskLevel.VERY_HIGH: 4,
    }
    risk_map = {
        "LOW": RiskLevel.LOW,
        "MEDIUM": RiskLevel.MEDIUM,
        "HIGH": RiskLevel.HIGH,
        "VERY_HIGH": RiskLevel.VERY_HIGH,
    }
    max_risk_level = risk_order[risk_map.get(max_risk_str.upper(), RiskLevel.MEDIUM)]

    console = Console()
    console.print(
        f"\n[bold cyan]Watchlist scan:[/bold cyan] "
        f"[white]{len(tickers)} mã[/white]  "
        f"[dim]threshold={threshold:.0f}%  max_risk={max_risk_str}[/dim]"
    )

    pipeline = AnalysisPipeline(
        cache_dir=args.cache_dir,
        source=args.source,
        custom_wacc=getattr(args, "wacc", None),
        custom_growth=getattr(args, "growth", None),
    )

    results: dict = {}
    errors: dict = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("[cyan]{task.description}"),
        BarColumn(bar_width=25),
        TaskProgressColumn(),
        console=console, transient=True,
    ) as prog:
        task = prog.add_task("Đang quét watchlist...", total=len(tickers))
        for ticker in tickers:
            prog.update(task, description=f"Đang quét [bold]{ticker}[/bold]...")
            try:
                results[ticker] = pipeline.analyze(ticker)
            except Exception as exc:
                errors[ticker] = str(exc)
            prog.advance(task)

    # Lọc theo tiêu chí
    alerts = [
        (t, r) for t, r in results.items()
        if r.valuation
        and r.valuation.discount_pct >= threshold
        and r.risk
        and risk_order.get(r.risk.overall_risk, 99) <= max_risk_level
    ]
    alerts.sort(key=lambda x: x[1].valuation.discount_pct, reverse=True)

    if not alerts:
        console.print(
            f"\n[yellow]Không có mã nào thỏa điều kiện "
            f"(discount ≥ {threshold:.0f}%, rủi ro ≤ {max_risk_str})[/yellow]"
        )
    else:
        console.print(
            f"\n[bold green]Tìm thấy {len(alerts)} mã đáp ứng điều kiện:[/bold green]"
        )
        _render_batch_table(console, dict(alerts), {})

        if errors:
            console.print(f"[dim]({len(errors)} mã lỗi: {', '.join(errors.keys())})[/dim]")

    # Sinh báo cáo AI cho các mã alert nếu có --report
    if alerts and getattr(args, "report", False):
        cache = CacheManager(cache_dir=args.cache_dir)
        generator = ReportGenerator(config=ReportConfig(), cache=cache)
        out_dir = Path(getattr(args, "output_dir", "reports"))
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        console.print(f"\n[cyan]Sinh báo cáo cho {len(alerts)} mã alert...[/cyan]")
        for ticker, result in alerts:
            try:
                report_text = generator.generate(result)
                fp = out_dir / f"{ticker}_{ts}_alert.md"
                fp.write_text(report_text, encoding="utf-8")
                console.print(f"  [green]✓ {ticker}:[/green] {fp}")
            except Exception as exc:
                console.print(f"  [red]✗ {ticker}: {exc}[/red]")

    console.print(
        f"\n[dim]Watchlist: {len(tickers)} mã scanned | "
        f"Alert: {len(alerts)} | Lỗi: {len(errors)}[/dim]"
    )


# ------------------------------------------------------------------ #
# API server                                                           #
# ------------------------------------------------------------------ #

def run_server(args: argparse.Namespace) -> None:
    """
    Khởi động FastAPI server trên cổng chỉ định.

    Sử dụng:
        python -m src.main --serve
        python -m src.main --serve --port 9000
        python -m src.main --serve --port 8080 --source VCI
    """
    try:
        import uvicorn
    except ImportError:
        print("Lỗi: uvicorn chưa được cài. Chạy: pip install 'uvicorn[standard]'")
        sys.exit(1)

    try:
        from src.server import create_app
    except ImportError as exc:
        print(f"Lỗi import server: {exc}")
        sys.exit(1)

    host = getattr(args, "host", "0.0.0.0")
    port = getattr(args, "port", 8080)
    workers = getattr(args, "workers", 1)

    app = create_app(
        cache_dir=args.cache_dir,
        source=args.source,
    )

    from rich.console import Console
    console = Console()
    console.print(
        f"\n[bold cyan]N-One Stock Analysis API[/bold cyan]\n"
        f"[white]http://{host}:{port}[/white]\n"
        f"[dim]Docs: http://{host}:{port}/docs[/dim]\n"
    )

    uvicorn.run(
        app,
        host=host,
        port=port,
        workers=workers,
        log_level="warning",
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="stock-agent",
        description="N-One Stock Analysis Agent — Phân tích cổ phiếu Việt Nam",
    )

    # ---- Target -------------------------------------------------------- #
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--ticker", "-t",
                        help="Mã chứng khoán đơn lẻ (VD: VCB, FPT, HPG)")
    target.add_argument("--tickers",
                        help="Danh sách mã cách dấu phẩy để phân tích batch "
                             "(VD: VCB,FPT,HPG,VNM)")
    target.add_argument("--watchlist",
                        help="Danh sách mã (comma-separated) hoặc đường dẫn file "
                             "để quét và cảnh báo mã hấp dẫn (VD: VCB,FPT hoặc tickers.txt)")
    target.add_argument("--serve", action="store_true",
                        help="Khởi động API server (FastAPI/uvicorn)")

    # ---- Watchlist / Alert params --------------------------------------- #
    parser.add_argument("--alert-threshold", type=float, default=10.0, dest="alert_threshold",
                        help="Ngưỡng discount để cảnh báo (mặc định: 10%%, VD: --alert-threshold 15)")
    parser.add_argument("--max-risk",
                        choices=["LOW", "MEDIUM", "HIGH", "VERY_HIGH"],
                        default="MEDIUM", dest="max_risk",
                        help="Mức rủi ro tối đa được chấp nhận (mặc định: MEDIUM)")

    # ---- Mode (chỉ áp dụng cho single-ticker) -------------------------- #
    parser.add_argument("--mode", "-m",
                        choices=["agent", "pipeline"],
                        default="pipeline",
                        help="Chế độ: 'pipeline' (mặc định) hoặc 'agent' (tool-use loop)")
    parser.add_argument("--stream", "-s", action="store_true",
                        help="Streaming output — in từng đoạn khi Claude viết")
    parser.add_argument("--report", action="store_true",
                        help="(Batch) Sinh báo cáo AI cho từng mã — tốn thêm thời gian")
    parser.add_argument("--no-news", action="store_true",
                        help="Bỏ qua phần tin tức (chỉ áp dụng mode=agent)")

    # ---- Valuation params ---------------------------------------------- #
    parser.add_argument("--wacc", type=float, default=None,
                        help="WACC tùy chỉnh cho DCF (VD: 0.12 = 12%%)")
    parser.add_argument("--growth", type=float, default=None,
                        help="Tốc độ tăng trưởng FCF tùy chỉnh (VD: 0.15 = 15%%)")

    # ---- Output -------------------------------------------------------- #
    parser.add_argument("--output", "-o",
                        choices=["terminal", "json", "pdf", "md"],
                        default="terminal",
                        help="Định dạng output (mặc định: terminal)")
    parser.add_argument("--output-dir", default="reports",
                        help="Thư mục lưu báo cáo (mặc định: reports/)")

    # ---- Data / infra -------------------------------------------------- #
    parser.add_argument("--source", choices=["VCI", "TCBS"], default="VCI",
                        help="Nguồn dữ liệu vnstock (mặc định: VCI)")
    parser.add_argument("--cache-dir", default=".cache",
                        help="Thư mục cache (mặc định: .cache/)")

    # ---- Server -------------------------------------------------------- #
    parser.add_argument("--host", default="0.0.0.0",
                        help="Host cho API server (mặc định: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8080,
                        help="Cổng cho API server (mặc định: 8080)")
    parser.add_argument("--workers", type=int, default=1,
                        help="Số uvicorn workers (mặc định: 1)")

    # ---- Logging ------------------------------------------------------- #
    parser.add_argument("--log-level",
                        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                        default=os.environ.get("LOG_LEVEL", "WARNING"),
                        help="Mức độ log")
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    _setup_logging(args.log_level)

    if args.serve:
        run_server(args)
        return

    if not args.ticker and not args.tickers and not args.watchlist:
        parser.print_help()
        sys.exit(1)

    _check_api_key()

    if args.watchlist:
        run_watchlist(args)
    elif args.tickers:
        run_batch(args)
    elif args.mode == "pipeline":
        run_pipeline(args)
    else:
        run_analysis(args)


if __name__ == "__main__":
    main()
