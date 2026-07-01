"""
src/server.py — FastAPI server cho N-One Stock Analysis Agent.

Khởi động:
    python -m src.main --serve --port 8080

Hoặc trực tiếp:
    uvicorn src.server:app --reload --port 8080

Endpoints:
    GET  /health                    — Health check
    GET  /analyze/{ticker}          — Phân tích 1 mã (tham số mặc định)
    POST /analyze                   — Phân tích 1 mã (tham số đầy đủ)
    POST /batch                     — Phân tích nhiều mã
    GET  /analyze/{ticker}/stream   — Streaming báo cáo (SSE)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncIterator, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .data.cache import CacheManager
from .pipeline import AnalysisPipeline, StockAnalysisResult
from .report_generator import ReportConfig, ReportGenerator

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ #
# Request / Response schemas                                           #
# ------------------------------------------------------------------ #

class AnalyzeRequest(BaseModel):
    ticker: str = Field(..., description="Mã chứng khoán (VD: FPT, VCB, HPG)")
    wacc: Optional[float] = Field(None, description="WACC tùy chỉnh (VD: 0.12 = 12%)")
    growth: Optional[float] = Field(None, description="Tốc độ tăng trưởng FCF (VD: 0.15 = 15%)")
    include_report: bool = Field(True, description="Sinh báo cáo AI (tốn thêm ~5s)")


class BatchRequest(BaseModel):
    tickers: list[str] = Field(..., description="Danh sách mã (VD: ['VCB', 'FPT', 'HPG'])")
    wacc: Optional[float] = None
    growth: Optional[float] = None
    include_report: bool = Field(False, description="Sinh báo cáo AI cho từng mã (chậm hơn)")


class AnalysisResponse(BaseModel):
    ticker: str
    generated_at: str
    current_price: Optional[float]
    company: dict
    valuation: Optional[dict]
    technical: Optional[dict]
    risk: Optional[dict]
    data_quality: dict
    fetch_ms: Optional[int]
    analysis_ms: Optional[int]
    errors: dict
    report: Optional[str] = None


class BatchResponse(BaseModel):
    batch_id: str
    generated_at: str
    count: int
    success: int
    failed: int
    results: dict[str, dict]
    errors: dict[str, str]


# ------------------------------------------------------------------ #
# App factory                                                          #
# ------------------------------------------------------------------ #

def create_app(
    cache_dir: str = ".cache",
    source: str = "VCI",
) -> FastAPI:
    """
    Tạo FastAPI app với pipeline và generator đã sẵn sàng.

    Args:
        cache_dir: Thư mục cache dữ liệu vnstock
        source:    Nguồn dữ liệu ("VCI" hoặc "TCBS")
    """
    pipeline = AnalysisPipeline(cache_dir=cache_dir, source=source)
    report_cache = CacheManager(cache_dir=cache_dir)
    generator = ReportGenerator(config=ReportConfig(), cache=report_cache)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logger.info("N-One Stock Analysis API starting up...")
        yield
        logger.info("N-One Stock Analysis API shutting down.")

    app = FastAPI(
        title="N-One Stock Analysis API",
        description=(
            "API phân tích định giá cổ phiếu Việt Nam — P/E, P/B, Graham, DCF, "
            "Earnings Yield, Technical Analysis, Risk Profile."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # Global exception handler — always return JSON, never plain text 500
    @app.exception_handler(Exception)
    async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Lỗi máy chủ: {type(exc).__name__}: {exc}"},
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------ #
    # Routes                                                               #
    # ------------------------------------------------------------------ #

    @app.get("/", tags=["System"])
    async def root() -> dict:
        """Trang chủ API."""
        return {
            "service": "StockMind AI — Stock Analysis API",
            "version": "1.0.0",
            "status": "online",
            "docs": "/docs",
            "health": "/health",
            "analyze": "/analyze/{ticker}",
            "timestamp": datetime.now().isoformat(),
        }

    @app.get("/health", tags=["System"])
    async def health() -> dict:
        """Kiểm tra trạng thái server."""
        return {
            "status": "ok",
            "service": "StockMind AI",
            "version": "1.0.0",
            "timestamp": datetime.now().isoformat(),
        }

    @app.get(
        "/analyze/{ticker}",
        tags=["Analysis"],
        summary="Phân tích một mã cổ phiếu (GET)",
    )
    async def analyze_get(
        ticker: str,
        wacc: Optional[float] = Query(None, description="WACC tùy chỉnh (0.0–1.0)"),
        growth: Optional[float] = Query(None, description="Tốc độ tăng trưởng FCF (0.0–1.0)"),
        report: bool = Query(True, description="Sinh báo cáo AI"),
    ) -> AnalysisResponse:
        """
        Phân tích cổ phiếu và trả về dữ liệu định giá + báo cáo.

        **Ví dụ:** `/analyze/FPT?report=true`
        """
        return await _run_analysis(
            ticker.upper(), pipeline, generator,
            wacc=wacc, growth=growth, include_report=report,
        )

    @app.post(
        "/analyze",
        tags=["Analysis"],
        summary="Phân tích một mã cổ phiếu (POST)",
    )
    async def analyze_post(body: AnalyzeRequest) -> AnalysisResponse:
        """
        Phân tích cổ phiếu với tùy chỉnh WACC và growth rate.

        Body JSON:
        ```json
        {
          "ticker": "FPT",
          "wacc": 0.12,
          "growth": 0.15,
          "include_report": true
        }
        ```
        """
        return await _run_analysis(
            body.ticker.upper(), pipeline, generator,
            wacc=body.wacc, growth=body.growth, include_report=body.include_report,
        )

    @app.post(
        "/batch",
        response_model=BatchResponse,
        tags=["Analysis"],
        summary="Phân tích nhiều mã cổ phiếu",
    )
    async def batch_analyze(body: BatchRequest) -> BatchResponse:
        """
        Phân tích nhiều mã tuần tự. Trả về kết quả của tất cả (kể cả lỗi từng mã).

        Body JSON:
        ```json
        {
          "tickers": ["VCB", "FPT", "HPG"],
          "include_report": false
        }
        ```
        """
        tickers = [t.strip().upper() for t in body.tickers if t.strip()]
        if not tickers:
            raise HTTPException(status_code=422, detail="tickers không được rỗng")
        if len(tickers) > 20:
            raise HTTPException(status_code=422, detail="Tối đa 20 mã mỗi request")

        results: dict[str, dict] = {}
        errors: dict[str, str] = {}

        for ticker in tickers:
            try:
                resp = await _run_analysis(
                    ticker, pipeline, generator,
                    wacc=body.wacc, growth=body.growth,
                    include_report=body.include_report,
                )
                results[ticker] = resp.model_dump()
            except HTTPException as exc:
                errors[ticker] = exc.detail
            except Exception as exc:
                errors[ticker] = str(exc)

        return BatchResponse(
            batch_id=f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            generated_at=datetime.now().isoformat(),
            count=len(tickers),
            success=len(results),
            failed=len(errors),
            results=results,
            errors=errors,
        )

    @app.get(
        "/analyze/{ticker}/stream",
        tags=["Analysis"],
        summary="Streaming báo cáo (SSE)",
    )
    async def analyze_stream(
        ticker: str,
        wacc: Optional[float] = Query(None),
        growth: Optional[float] = Query(None),
    ) -> StreamingResponse:
        """
        Streaming báo cáo dạng Server-Sent Events.
        Phần dữ liệu (valuation/technical/risk) được gửi trước,
        sau đó từng chunk text báo cáo Claude được stream liên tục.

        **Sử dụng với curl:**
        ```bash
        curl -N http://localhost:8080/analyze/FPT/stream
        ```
        """
        ticker = ticker.upper()

        async def event_stream() -> AsyncIterator[str]:
            # Bước 1: chạy pipeline (đồng bộ trong thread)
            try:
                result: StockAnalysisResult = await asyncio.to_thread(
                    pipeline.analyze, ticker,
                    custom_wacc=wacc, custom_growth=growth,
                )
            except RuntimeError as exc:
                yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
                return

            # Gửi dữ liệu cấu trúc trước
            meta = {
                "ticker": result.ticker,
                "current_price": result.current_price,
                "valuation": result.valuation.model_dump() if result.valuation else None,
                "technical": result.technical.model_dump() if result.technical else None,
                "risk": result.risk.model_dump() if result.risk else None,
                "data_quality": result.data_quality.model_dump(),
            }
            yield f"event: metadata\ndata: {json.dumps(meta, default=str)}\n\n"

            # Bước 2: stream báo cáo
            yield "event: report_start\ndata: {}\n\n"
            async for chunk in _stream_report(generator, result):
                escaped = json.dumps(chunk)
                yield f"event: chunk\ndata: {escaped}\n\n"
            yield "event: report_end\ndata: {}\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return app


# ------------------------------------------------------------------ #
# Internal helpers                                                     #
# ------------------------------------------------------------------ #

async def _run_analysis(
    ticker: str,
    pipeline: AnalysisPipeline,
    generator: ReportGenerator,
    wacc: Optional[float] = None,
    growth: Optional[float] = None,
    include_report: bool = True,
) -> AnalysisResponse:
    """Chạy pipeline + report trong thread pool để không block event loop."""
    try:
        result: StockAnalysisResult = await asyncio.to_thread(
            pipeline.analyze, ticker,
            custom_wacc=wacc, custom_growth=growth,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Pipeline lỗi cho %s: %s", ticker, exc)
        raise HTTPException(status_code=500, detail=f"Lỗi phân tích: {exc}") from exc

    report_text: Optional[str] = None
    if include_report:
        try:
            report_text = await asyncio.to_thread(generator.generate, result)
        except Exception as exc:
            logger.warning("ReportGenerator lỗi cho %s: %s", ticker, exc)
            report_text = f"Lỗi sinh báo cáo: {exc}"

    return AnalysisResponse(
        ticker=result.ticker,
        generated_at=result.generated_at.isoformat(),
        current_price=result.current_price,
        company=result.company.model_dump(),
        valuation=result.valuation.model_dump() if result.valuation else None,
        technical=result.technical.model_dump() if result.technical else None,
        risk=result.risk.model_dump() if result.risk else None,
        data_quality=result.data_quality.model_dump(),
        fetch_ms=result.fetch_ms,
        analysis_ms=result.analysis_ms,
        errors=result.errors,
        report=report_text,
    )


async def _stream_report(
    generator: ReportGenerator,
    result: StockAnalysisResult,
) -> AsyncIterator[str]:
    """Yield từng chunk text từ generator.generate_stream() qua asyncio."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

    def _produce() -> None:
        try:
            for chunk in generator.generate_stream(result):
                loop.call_soon_threadsafe(queue.put_nowait, chunk)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, _produce)

    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        yield chunk


# ------------------------------------------------------------------ #
# Standalone entry point                                               #
# ------------------------------------------------------------------ #

def _main() -> None:
    """Chạy server trực tiếp: python -m src.server"""
    try:
        import uvicorn
    except ImportError:
        print("Lỗi: uvicorn chưa được cài. Chạy: pip install 'uvicorn[standard]'")
        raise SystemExit(1)

    app = create_app(
        cache_dir=os.environ.get("CACHE_DIR", ".cache"),
        source=os.environ.get("VNSTOCK_SOURCE", "VCI"),
    )
    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8080")),
        log_level="warning",
    )


if __name__ == "__main__":
    _main()
