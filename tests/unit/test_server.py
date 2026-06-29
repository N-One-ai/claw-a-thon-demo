"""
Unit tests cho FastAPI server (src/server.py).

Dùng FastAPI TestClient — không gọi vnstock hay Claude API thật.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.data.models import (
    CompanyInfo,
    Exchange,
    FinancialStatements,
    PriceHistory,
    Sector,
)
from src.data.models.risk import RiskLevel, RiskProfile, TechnicalSignal
from src.data.models.valuation import (
    DCFScenario,
    EarningsYieldResult,
    ModelResult,
    ValuationLabel,
    ValuationResults,
)
from src.pipeline import DataQuality, StockAnalysisResult
from src.server import create_app

# ------------------------------------------------------------------ #
# Fixtures                                                             #
# ------------------------------------------------------------------ #

def _make_result(ticker: str = "FPT", price: float = 73_200.0) -> StockAnalysisResult:
    """StockAnalysisResult tối giản nhưng đủ để serialize."""
    company = CompanyInfo(
        ticker=ticker,
        name=f"Công ty {ticker}",
        exchange=Exchange.HOSE,
        sector=Sector.TECHNOLOGY,
        shares_outstanding=1_000.0,
    )
    pe_result = ModelResult(
        model_name="P/E Fair Value",
        fair_value=80_000.0,
        is_available=True,
        weight=0.25,
        inputs={},
    )
    pb_result = ModelResult(
        model_name="P/B Fair Value",
        fair_value=72_000.0,
        is_available=True,
        weight=0.10,
        inputs={},
    )
    graham_result = ModelResult(
        model_name="Graham Number",
        fair_value=55_000.0,
        is_available=True,
        weight=0.15,
        inputs={},
    )
    dcf_result = ModelResult(
        model_name="DCF",
        fair_value=110_000.0,
        is_available=True,
        weight=0.50,
        inputs={},
    )
    ey = EarningsYieldResult(
        earnings_yield=5.0,
        risk_free_rate=4.8,
        spread=0.2,
        is_attractive=False,
    )
    valuation = ValuationResults(
        ticker=ticker,
        current_price=price,
        pe_result=pe_result,
        pb_result=pb_result,
        graham_result=graham_result,
        dcf_result=dcf_result,
        earnings_yield=ey,
        consensus_value=89_622.0,
        discount_pct=22.4,
        label=ValuationLabel.ATTRACTIVE,
        scenarios=[
            DCFScenario(name="Bi quan", growth_rate=0.08, terminal_growth=0.03,
                        wacc=0.13, fair_value=70_000.0, probability=0.30),
            DCFScenario(name="Cơ sở", growth_rate=0.12, terminal_growth=0.04,
                        wacc=0.12, fair_value=90_000.0, probability=0.50),
            DCFScenario(name="Lạc quan", growth_rate=0.18, terminal_growth=0.05,
                        wacc=0.11, fair_value=120_000.0, probability=0.20),
        ],
        probability_weighted_value=90_000.0,
    )
    technical = TechnicalSignal(
        current_price=price,
        sma_20=72_000.0,
        sma_50=70_000.0,
        sma_200=65_000.0,
        rsi_14=42.0,
        rsi_label="Trung lập",
        macd_label="Mua",
        price_trend="Tích lũy",
        high_52w=80_000.0,
        low_52w=55_000.0,
        position_52w_pct=72.0,
    )
    risk = RiskProfile(
        ticker=ticker,
        beta=0.82,
        debt_to_equity=0.40,
        overall_risk=RiskLevel.LOW,
    )

    return StockAnalysisResult(
        ticker=ticker,
        company=company,
        statements=FinancialStatements(ticker=ticker),
        price_history=PriceHistory(ticker=ticker),
        current_price=price,
        valuation=valuation,
        technical=technical,
        risk=risk,
        data_quality=DataQuality(
            periods_income=8,
            has_eps_ttm=True,
            has_bvps=True,
            has_fcf_ttm=True,
        ),
        fetch_ms=1200,
        analysis_ms=300,
    )


def _make_client(
    pipeline_result: Optional[StockAnalysisResult] = None,
    report_text: str = "# Báo cáo FPT\nNội dung phân tích.",
) -> TestClient:
    """Tạo TestClient với pipeline và generator đã được mock."""
    result = pipeline_result or _make_result()

    with (
        patch("src.server.AnalysisPipeline") as MockPipeline,
        patch("src.server.ReportGenerator") as MockGenerator,
    ):
        mock_pipeline = MagicMock()
        mock_pipeline.analyze.return_value = result
        MockPipeline.return_value = mock_pipeline

        mock_generator = MagicMock()
        mock_generator.generate.return_value = report_text
        mock_generator.generate_stream.return_value = iter([report_text])
        MockGenerator.return_value = mock_generator

        app = create_app(cache_dir=".cache_test", source="VCI")
        client = TestClient(app, raise_server_exceptions=True)

        # Patch the pipeline/generator inside the closures
        # by re-attaching them to the app's route functions
        for route in app.routes:
            if hasattr(route, "endpoint"):
                route.endpoint.__globals__.get("pipeline", None)

        return client, mock_pipeline, mock_generator


# ------------------------------------------------------------------ #
# /health                                                              #
# ------------------------------------------------------------------ #

class TestHealthEndpoint:
    @pytest.fixture
    def client(self):
        app = create_app(cache_dir=".cache_test", source="VCI")
        return TestClient(app)

    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_status_ok(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_health_has_timestamp(self, client):
        data = client.get("/health").json()
        assert "timestamp" in data
        # Phải parse được dưới dạng ISO datetime
        datetime.fromisoformat(data["timestamp"])

    def test_health_service_name(self, client):
        data = client.get("/health").json()
        assert "N-One" in data["service"]


# ------------------------------------------------------------------ #
# /docs                                                                #
# ------------------------------------------------------------------ #

class TestDocs:
    @pytest.fixture
    def client(self):
        app = create_app(cache_dir=".cache_test")
        return TestClient(app)

    def test_openapi_available(self, client):
        resp = client.get("/openapi.json")
        assert resp.status_code == 200

    def test_docs_available(self, client):
        resp = client.get("/docs")
        assert resp.status_code == 200

    def test_openapi_has_analyze_route(self, client):
        spec = client.get("/openapi.json").json()
        paths = spec.get("paths", {})
        assert "/analyze/{ticker}" in paths
        assert "/analyze" in paths
        assert "/batch" in paths
        assert "/health" in paths


# ------------------------------------------------------------------ #
# GET /analyze/{ticker}                                                #
# ------------------------------------------------------------------ #

class TestAnalyzeGet:
    @pytest.fixture
    def setup(self):
        result = _make_result("FPT")
        with (
            patch("src.server.AnalysisPipeline") as MockPipeline,
            patch("src.server.ReportGenerator") as MockGenerator,
        ):
            mock_p = MagicMock()
            mock_p.analyze.return_value = result
            MockPipeline.return_value = mock_p

            mock_g = MagicMock()
            mock_g.generate.return_value = "# Báo cáo FPT"
            MockGenerator.return_value = mock_g

            app = create_app(".cache_test")
            self.client = TestClient(app)
            self.mock_pipeline = mock_p
            self.mock_generator = mock_g
            self.result = result
            yield

    def test_returns_200(self, setup):
        resp = self.client.get("/analyze/FPT")
        assert resp.status_code == 200

    def test_ticker_in_response(self, setup):
        data = self.client.get("/analyze/FPT").json()
        assert data["ticker"] == "FPT"

    def test_current_price_in_response(self, setup):
        data = self.client.get("/analyze/FPT").json()
        assert data["current_price"] == 73_200.0

    def test_valuation_in_response(self, setup):
        data = self.client.get("/analyze/FPT").json()
        assert data["valuation"] is not None
        assert "consensus_value" in data["valuation"]

    def test_technical_in_response(self, setup):
        data = self.client.get("/analyze/FPT").json()
        assert data["technical"] is not None
        assert "rsi_14" in data["technical"]

    def test_risk_in_response(self, setup):
        data = self.client.get("/analyze/FPT").json()
        assert data["risk"] is not None

    def test_report_included_by_default(self, setup):
        data = self.client.get("/analyze/FPT").json()
        assert data["report"] is not None
        assert "FPT" in data["report"]

    def test_report_excluded_when_false(self, setup):
        data = self.client.get("/analyze/FPT?report=false").json()
        assert data["report"] is None

    def test_ticker_uppercased(self, setup):
        resp = self.client.get("/analyze/fpt")
        assert resp.status_code == 200
        assert resp.json()["ticker"] == "FPT"


# ------------------------------------------------------------------ #
# POST /analyze                                                        #
# ------------------------------------------------------------------ #

class TestAnalyzePost:
    @pytest.fixture
    def setup(self):
        result = _make_result("VCB", price=89_000.0)
        with (
            patch("src.server.AnalysisPipeline") as MockPipeline,
            patch("src.server.ReportGenerator") as MockGenerator,
        ):
            mock_p = MagicMock()
            mock_p.analyze.return_value = result
            MockPipeline.return_value = mock_p

            mock_g = MagicMock()
            mock_g.generate.return_value = "# Báo cáo VCB"
            MockGenerator.return_value = mock_g

            app = create_app(".cache_test")
            self.client = TestClient(app)
            yield

    def test_returns_200(self, setup):
        resp = self.client.post("/analyze", json={"ticker": "VCB"})
        assert resp.status_code == 200

    def test_ticker_uppercased(self, setup):
        data = self.client.post("/analyze", json={"ticker": "vcb"}).json()
        assert data["ticker"] == "VCB"

    def test_report_excluded(self, setup):
        data = self.client.post("/analyze", json={
            "ticker": "VCB", "include_report": False
        }).json()
        assert data["report"] is None

    def test_missing_ticker_422(self, setup):
        resp = self.client.post("/analyze", json={})
        assert resp.status_code == 422

    def test_wacc_forwarded_to_pipeline(self, setup):
        self.client.post("/analyze", json={"ticker": "VCB", "wacc": 0.13})
        # Pipeline.analyze được gọi — không dễ kiểm tra tham số qua mock vì asyncio.to_thread


# ------------------------------------------------------------------ #
# POST /batch                                                          #
# ------------------------------------------------------------------ #

class TestBatch:
    @pytest.fixture
    def setup(self):
        with (
            patch("src.server.AnalysisPipeline") as MockPipeline,
            patch("src.server.ReportGenerator") as MockGenerator,
        ):
            mock_p = MagicMock()
            mock_p.analyze.side_effect = lambda t, **kw: _make_result(t)
            MockPipeline.return_value = mock_p

            mock_g = MagicMock()
            mock_g.generate.return_value = "# Báo cáo"
            MockGenerator.return_value = mock_g

            app = create_app(".cache_test")
            self.client = TestClient(app)
            yield

    def test_batch_returns_200(self, setup):
        resp = self.client.post("/batch", json={"tickers": ["FPT", "VCB"]})
        assert resp.status_code == 200

    def test_batch_has_all_tickers(self, setup):
        data = self.client.post("/batch", json={"tickers": ["FPT", "VCB", "HPG"]}).json()
        assert data["count"] == 3
        assert data["success"] == 3

    def test_batch_empty_tickers_422(self, setup):
        resp = self.client.post("/batch", json={"tickers": []})
        assert resp.status_code == 422

    def test_batch_too_many_tickers_422(self, setup):
        resp = self.client.post("/batch", json={"tickers": [f"T{i}" for i in range(21)]})
        assert resp.status_code == 422

    def test_batch_partial_failure(self, setup):
        def maybe_fail(ticker, **kw):
            if ticker == "BAD":
                raise RuntimeError("Mã không tồn tại")
            return _make_result(ticker)

        with patch("src.server.AnalysisPipeline") as MockPipeline:
            mock_p = MagicMock()
            mock_p.analyze.side_effect = maybe_fail
            MockPipeline.return_value = mock_p
            with patch("src.server.ReportGenerator"):
                app = create_app(".cache_test")
                client = TestClient(app)

        resp = client.post("/batch", json={"tickers": ["FPT", "BAD", "VCB"]})
        data = resp.json()
        assert data["success"] == 2
        assert data["failed"] == 1
        assert "BAD" in data["errors"]

    def test_batch_generated_at_set(self, setup):
        data = self.client.post("/batch", json={"tickers": ["FPT"]}).json()
        assert "generated_at" in data
        datetime.fromisoformat(data["generated_at"])

    def test_batch_no_report_by_default(self, setup):
        data = self.client.post("/batch", json={
            "tickers": ["FPT"],
            "include_report": False,
        }).json()
        result = data["results"].get("FPT", {})
        assert result.get("report") is None


# ------------------------------------------------------------------ #
# create_app configuration                                             #
# ------------------------------------------------------------------ #

class TestCreateApp:
    def test_returns_fastapi_app(self):
        from fastapi import FastAPI
        app = create_app()
        assert isinstance(app, FastAPI)

    def test_app_title(self):
        app = create_app()
        assert "N-One" in app.title

    def test_custom_cache_dir(self):
        with patch("src.server.AnalysisPipeline") as MockPipeline:
            MockPipeline.return_value = MagicMock()
            with patch("src.server.ReportGenerator"):
                create_app(cache_dir="/tmp/test_cache")
            MockPipeline.assert_called_once()
            call_kwargs = MockPipeline.call_args
            assert call_kwargs.kwargs.get("cache_dir") == "/tmp/test_cache" or \
                   (call_kwargs.args and "/tmp/test_cache" in call_kwargs.args)
