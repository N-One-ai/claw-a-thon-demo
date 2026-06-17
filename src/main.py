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

from dotenv import load_dotenv  # type: ignore[import-untyped]

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
    from src.output import TerminalRenderer, JSONExporter, PDFExporter

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
    from src.pipeline import AnalysisPipeline
    from src.report_generator import ReportConfig, ReportGenerator
    from src.output import TerminalRenderer, JSONExporter, PDFExporter

    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

    ticker = args.ticker.upper()
    console = Console()

    pipeline = AnalysisPipeline(
        cache_dir=args.cache_dir,
        source=args.source,
        custom_wacc=args.wacc,
        custom_growth=args.growth,
    )
    generator = ReportGenerator(config=ReportConfig())

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


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="stock-agent",
        description="N-One Stock Analysis Agent — Phân tích cổ phiếu Việt Nam",
    )
    parser.add_argument("--ticker", "-t", required=True,
                        help="Mã chứng khoán (VD: VCB, FPT, HPG)")
    parser.add_argument("--mode", "-m",
                        choices=["agent", "pipeline"],
                        default="pipeline",
                        help="Chế độ: 'pipeline' (mặc định, dùng ReportGenerator) "
                             "hoặc 'agent' (tool-use loop cũ)")
    parser.add_argument("--stream", "-s", action="store_true",
                        help="Streaming output — in từng đoạn khi Claude viết")
    parser.add_argument("--no-news", action="store_true",
                        help="Bỏ qua phần thu thập tin tức (chỉ áp dụng mode=agent)")
    parser.add_argument("--wacc", type=float, default=None,
                        help="WACC tùy chỉnh cho DCF (VD: 0.12 = 12%%)")
    parser.add_argument("--growth", type=float, default=None,
                        help="Tốc độ tăng trưởng FCF tùy chỉnh (VD: 0.15 = 15%%)")
    parser.add_argument("--output", "-o",
                        choices=["terminal", "json", "pdf", "md"],
                        default="terminal",
                        help="Định dạng output (mặc định: terminal)")
    parser.add_argument("--output-dir", default="reports",
                        help="Thư mục lưu báo cáo (mặc định: reports/)")
    parser.add_argument("--source", choices=["VCI", "TCBS"], default="VCI",
                        help="Nguồn dữ liệu vnstock (mặc định: VCI)")
    parser.add_argument("--cache-dir", default=".cache",
                        help="Thư mục cache (mặc định: .cache/)")
    parser.add_argument("--log-level",
                        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                        default=os.environ.get("LOG_LEVEL", "WARNING"),
                        help="Mức độ log")
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    _setup_logging(args.log_level)
    _check_api_key()
    if args.mode == "pipeline":
        run_pipeline(args)
    else:
        run_analysis(args)


if __name__ == "__main__":
    main()
