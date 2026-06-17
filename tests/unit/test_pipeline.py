"""
Unit tests cho Integration Layer (pipeline.py).
Không gọi vnstock — dùng mock data hoàn toàn.
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.data.models import (
    BalanceSheet,
    CashFlowStatement,
    CompanyInfo,
    Exchange,
    FinancialRatios,
    FinancialStatements,
    IncomeStatement,
    OHLCV,
    PriceHistory,
    RiskLevel,
    Sector,
    ValuationLabel,
)
from src.data.schemas import StockData
from src.pipeline import (
    AnalysisPipeline,
    DataQuality,
    StockAnalysisResult,
    analyze_stock,
)


# ================================================================== #
# Fixtures                                                             #
# ================================================================== #

def _make_company(ticker: str = "FPT", sector: Sector = Sector.TECHNOLOGY) -> CompanyInfo:
    return CompanyInfo(
        ticker=ticker,
        name=f"Công ty {ticker}",
        exchange=Exchange.HOSE,
        sector=sector,
        shares_outstanding=1_150.0,   # triệu cổ
    )


def _make_income(period: str, revenue: float = 10000, net_income: float = 1500,
                 eps: float = 3000) -> IncomeStatement:
    return IncomeStatement(
        period=period, revenue=revenue, net_income=net_income,
        gross_profit=revenue * 0.35, operating_income=net_income * 1.1,
        ebit=net_income * 1.15, eps=eps, interest_expense=100,
    )


def _make_balance(period: str, assets: float = 50000, equity: float = 20000) -> BalanceSheet:
    return BalanceSheet(
        period=period, total_assets=assets, total_equity=equity,
        total_debt=5000, cash_and_equivalents=3000,
        current_assets=15000, current_liabilities=8000,
        book_value_per_share=17000,
    )


def _make_cashflow(period: str, ocf: float = 2000, fcf: float = 1500) -> CashFlowStatement:
    return CashFlowStatement(
        period=period, operating_cash_flow=ocf,
        capital_expenditure=-500, free_cash_flow=fcf,
    )


def _make_statements(n_quarters: int = 8, ticker: str = "FPT") -> FinancialStatements:
    stmts = FinancialStatements(ticker=ticker)
    for i in range(n_quarters):
        q = 4 - (i % 4)
        year = 2024 - (i // 4)
        period = f"{year}-Q{q}"
        stmts.income_statements.append(_make_income(period, revenue=10000 - i * 100))
        stmts.balance_sheets.append(_make_balance(period))
        stmts.cash_flow_statements.append(_make_cashflow(period))
    return stmts


def _make_price_history(n: int = 300, ticker: str = "FPT") -> PriceHistory:
    base = date(2024, 6, 1)
    candles = [
        OHLCV(
            date=base - timedelta(days=i),
            open=80000 + i * 10, high=82000 + i * 10,
            low=79000 + i * 10, close=80000 + i * 10,
            volume=1_000_000,
        )
        for i in range(n)
    ]
    return PriceHistory(ticker=ticker, candles=candles)


def _make_stock_data(ticker: str = "FPT") -> StockData:
    return StockData(
        ticker=ticker,
        company=_make_company(ticker),
        statements=_make_statements(ticker=ticker),
        price_history=_make_price_history(ticker=ticker),
        current_price=80000.0,
    )


# ================================================================== #
# DataQuality                                                          #
# ================================================================== #

class TestDataQuality:
    def test_default_all_false(self):
        dq = DataQuality()
        assert dq.periods_income == 0
        assert not dq.has_eps_ttm
        assert dq.available_valuation_models == []

    def test_fields_set_correctly(self):
        dq = DataQuality(
            periods_income=8,
            periods_balance=8,
            price_trading_days=300,
            has_eps_ttm=True,
            has_bvps=True,
            available_valuation_models=["P/E Fair Value", "P/B Fair Value"],
            missing_valuation_models=["DCF (5 năm)"],
        )
        assert dq.periods_income == 8
        assert dq.has_eps_ttm
        assert len(dq.available_valuation_models) == 2


# ================================================================== #
# StockAnalysisResult                                                  #
# ================================================================== #

class TestStockAnalysisResult:
    def _minimal_result(self, ticker: str = "FPT") -> StockAnalysisResult:
        return StockAnalysisResult(
            ticker=ticker,
            company=_make_company(ticker),
            statements=_make_statements(ticker=ticker),
            price_history=_make_price_history(ticker=ticker),
            current_price=80000.0,
        )

    def test_has_errors_false_when_no_errors(self):
        r = self._minimal_result()
        assert not r.has_errors

    def test_has_errors_true_when_errors_present(self):
        r = self._minimal_result()
        r.errors["valuation"] = "test error"
        assert r.has_errors

    def test_is_undervalued_false_when_no_valuation(self):
        r = self._minimal_result()
        assert r.is_undervalued is False

    def test_upside_pct_none_when_no_valuation(self):
        r = self._minimal_result()
        assert r.upside_pct is None

    def test_overall_risk_label_when_no_risk(self):
        r = self._minimal_result()
        assert r.overall_risk_label == "Chưa xác định"

    def test_quick_summary_contains_ticker(self):
        r = self._minimal_result("VCB")
        summary = r.quick_summary
        assert "VCB" in summary
        assert "80,000" in summary

    def test_quick_summary_no_valuation(self):
        r = self._minimal_result()
        assert "Định giá: chưa có" in r.quick_summary

    def test_to_dict_serializable(self):
        r = self._minimal_result()
        d = r.to_dict()
        assert isinstance(d, dict)
        assert d["ticker"] == "FPT"
        assert "company" in d
        assert "statements" in d

    def test_to_report_raises_when_missing_analysis(self):
        r = self._minimal_result()
        # valuation/technical/risk đều None
        with pytest.raises(ValueError, match="thiếu kết quả phân tích"):
            r.to_report()

    def test_business_type_stored(self):
        r = self._minimal_result()
        r.business_type = "Tăng trưởng"
        assert r.business_type == "Tăng trưởng"

    def test_accounting_flags_default_empty(self):
        r = self._minimal_result()
        assert r.accounting_flags == []


# ================================================================== #
# AnalysisPipeline với mock DataFetcher                               #
# ================================================================== #

class TestAnalysisPipelineUnit:
    """Test pipeline logic mà không gọi API thật."""

    def _make_pipeline(self) -> AnalysisPipeline:
        return AnalysisPipeline(cache_dir="/tmp/test_cache", source="VCI")

    def _patch_fetcher(self, pipeline: AnalysisPipeline, ticker: str = "FPT") -> StockData:
        """Thay thế DataFetcher bằng mock trả về data giả."""
        stock_data = _make_stock_data(ticker)
        pipeline._fetcher = MagicMock()
        pipeline._fetcher.fetch_all.return_value = stock_data
        pipeline._fetcher.get_index_history.return_value = _make_price_history(ticker="VNINDEX")
        return stock_data

    def test_analyze_returns_stock_analysis_result(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert isinstance(result, StockAnalysisResult)

    def test_ticker_normalized_to_uppercase(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("fpt")
        assert result.ticker == "FPT"

    def test_current_price_set(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.current_price == 80000.0

    def test_company_info_set(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.company.ticker == "FPT"
        assert result.company.shares_outstanding == 1150.0

    def test_valuation_results_populated(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.valuation is not None
        assert result.valuation.current_price == 80000.0
        assert result.valuation.consensus_value > 0

    def test_technical_signal_populated(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.technical is not None
        assert result.technical.current_price == 80000.0

    def test_risk_profile_populated(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.risk is not None
        assert result.risk.ticker == "FPT"
        assert isinstance(result.risk.overall_risk, RiskLevel)

    def test_financial_ratios_populated(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.ratios is not None

    def test_business_type_populated(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.business_type in ("Tăng trưởng", "Giá trị", "Hỗn hợp")

    def test_data_quality_periods_match(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.data_quality.periods_income == 8
        assert result.data_quality.periods_balance == 8
        assert result.data_quality.price_trading_days == 300

    def test_data_quality_has_eps(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.data_quality.has_eps_ttm is True

    def test_fetch_ms_recorded(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.fetch_ms is not None
        assert result.fetch_ms >= 0

    def test_analysis_ms_recorded(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.analysis_ms is not None
        assert result.analysis_ms >= 0

    def test_no_errors_in_happy_path(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert not result.has_errors

    def test_errors_dict_empty_on_success(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        result = pipeline.analyze("FPT")
        assert result.errors == {}

    def test_valuation_engine_crash_recorded_in_errors(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        pipeline._val_engine = MagicMock()
        pipeline._val_engine.run_full_valuation.side_effect = RuntimeError("engine crash")
        result = pipeline.analyze("FPT")
        assert "valuation" in result.errors
        assert result.valuation is None

    def test_technical_engine_crash_recorded(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        pipeline._tech_analyzer = MagicMock()
        pipeline._tech_analyzer.build_signal.side_effect = ValueError("tech crash")
        result = pipeline.analyze("FPT")
        assert "technical" in result.errors
        assert result.technical is None

    def test_risk_engine_crash_recorded(self):
        pipeline = self._make_pipeline()
        self._patch_fetcher(pipeline)
        pipeline._risk_analyzer = MagicMock()
        pipeline._risk_analyzer.build_risk_profile.side_effect = Exception("risk crash")
        result = pipeline.analyze("FPT")
        assert "risk" in result.errors
        assert result.risk is None

    def test_index_fetch_fail_does_not_stop_pipeline(self):
        pipeline = self._make_pipeline()
        stock_data = self._patch_fetcher(pipeline)
        pipeline._fetcher.get_index_history.side_effect = ConnectionError("no index")
        result = pipeline.analyze("FPT")
        # Pipeline vẫn hoàn thành, chỉ lỗi index_data
        assert isinstance(result, StockAnalysisResult)
        assert "index_data" in result.errors
        # Các kết quả khác vẫn có
        assert result.valuation is not None
        assert result.technical is not None

    def test_raises_when_no_price_data(self):
        pipeline = self._make_pipeline()
        empty_data = StockData(
            ticker="XYZ",
            company=_make_company("XYZ"),
            statements=FinancialStatements(ticker="XYZ"),
            price_history=PriceHistory(ticker="XYZ", candles=[]),
            current_price=None,
        )
        pipeline._fetcher = MagicMock()
        pipeline._fetcher.fetch_all.return_value = empty_data
        pipeline._fetcher.get_index_history.return_value = PriceHistory(ticker="VNINDEX", candles=[])
        with pytest.raises(RuntimeError, match="Không lấy được dữ liệu giá"):
            pipeline.analyze("XYZ")


# ================================================================== #
# analyze_many                                                         #
# ================================================================== #

class TestAnalyzeMany:
    def test_returns_dict_keyed_by_ticker(self):
        pipeline = AnalysisPipeline(cache_dir="/tmp/test_cache")

        def _mock_analyze(ticker, **kwargs):
            stock_data = _make_stock_data(ticker)
            return StockAnalysisResult(
                ticker=ticker,
                company=stock_data.company,
                statements=stock_data.statements,
                price_history=stock_data.price_history,
                current_price=stock_data.current_price,
            )

        pipeline.analyze = _mock_analyze  # type: ignore
        results = pipeline.analyze_many(["FPT", "VCB", "HPG"])
        assert set(results.keys()) == {"FPT", "VCB", "HPG"}

    def test_error_in_one_does_not_stop_others(self):
        pipeline = AnalysisPipeline(cache_dir="/tmp/test_cache")
        call_count = 0

        def _mock_analyze(ticker, **kwargs):
            nonlocal call_count
            call_count += 1
            if ticker == "VCB":
                raise RuntimeError("VCB data unavailable")
            stock_data = _make_stock_data(ticker)
            return StockAnalysisResult(
                ticker=ticker,
                company=stock_data.company,
                statements=stock_data.statements,
                price_history=stock_data.price_history,
                current_price=stock_data.current_price,
            )

        pipeline.analyze = _mock_analyze  # type: ignore
        results = pipeline.analyze_many(["FPT", "VCB", "HPG"])
        assert call_count == 3
        assert "FPT" in results
        assert "VCB" not in results   # VCB lỗi → không có trong dict
        assert "HPG" in results

    def test_stop_on_error_raises(self):
        pipeline = AnalysisPipeline(cache_dir="/tmp/test_cache")

        def _mock_analyze(ticker, **kwargs):
            raise RuntimeError("always fail")

        pipeline.analyze = _mock_analyze  # type: ignore
        with pytest.raises(RuntimeError):
            pipeline.analyze_many(["FPT", "VCB"], stop_on_error=True)


# ================================================================== #
# Data quality builder                                                  #
# ================================================================== #

class TestBuildDataQuality:
    def test_empty_statements_zero_periods(self):
        stmts = FinancialStatements(ticker="TEST")
        ph = PriceHistory(ticker="TEST", candles=[])
        dq = AnalysisPipeline._build_data_quality(stmts, ph, valuation=None)
        assert dq.periods_income == 0
        assert dq.price_trading_days == 0
        assert not dq.has_eps_ttm

    def test_with_data_counts_correctly(self):
        stmts = _make_statements(n_quarters=8)
        ph = _make_price_history(n=250)
        dq = AnalysisPipeline._build_data_quality(stmts, ph, valuation=None)
        assert dq.periods_income == 8
        assert dq.periods_balance == 8
        assert dq.price_trading_days == 250
        assert dq.has_eps_ttm is True
        assert dq.has_bvps is True
        assert dq.has_fcf_ttm is True

    def test_available_models_from_valuation(self):
        from src.analysis.valuation import ValuationEngine
        stmts = _make_statements(n_quarters=8)
        company = _make_company()
        engine = ValuationEngine()
        valuation = engine.run_full_valuation(
            company=company,
            statements=stmts,
            current_price=80000.0,
        )
        ph = _make_price_history()
        dq = AnalysisPipeline._build_data_quality(stmts, ph, valuation=valuation)
        assert len(dq.available_valuation_models) > 0

    def test_bvps_missing_detected(self):
        stmts = FinancialStatements(ticker="TEST")
        stmts.balance_sheets.append(BalanceSheet(
            period="2024-Q4",
            total_assets=50000, total_equity=20000,
            total_debt=5000, cash_and_equivalents=3000,
            book_value_per_share=None,  # thiếu BVPS
        ))
        ph = _make_price_history(n=10)
        dq = AnalysisPipeline._build_data_quality(stmts, ph, valuation=None)
        assert dq.has_bvps is False


# ================================================================== #
# to_report conversion                                                 #
# ================================================================== #

class TestToReport:
    def _full_result(self) -> StockAnalysisResult:
        pipeline = AnalysisPipeline(cache_dir="/tmp/test_cache")
        stock_data = _make_stock_data("FPT")
        pipeline._fetcher = MagicMock()
        pipeline._fetcher.fetch_all.return_value = stock_data
        pipeline._fetcher.get_index_history.return_value = _make_price_history(ticker="VNINDEX")
        return pipeline.analyze("FPT")

    def test_to_report_success(self):
        from src.data.models import AnalysisReport
        result = self._full_result()
        report = result.to_report(summary="Tóm tắt test")
        assert isinstance(report, AnalysisReport)
        assert report.ticker == "FPT"
        assert report.summary == "Tóm tắt test"

    def test_to_report_one_liner(self):
        result = self._full_result()
        report = result.to_report()
        liner = report.one_liner
        assert "FPT" in liner
        assert "VND" in liner

    def test_to_report_includes_ratios(self):
        result = self._full_result()
        report = result.to_report()
        assert report.latest_ratios is not None


# ================================================================== #
# analyze_stock convenience function                                   #
# ================================================================== #

class TestAnalyzeStockFunction:
    def test_returns_stock_analysis_result(self):
        """Test thông qua mock — không gọi API thật."""
        with patch("src.pipeline.DataFetcher") as MockFetcher:
            mock_instance = MagicMock()
            mock_instance.fetch_all.return_value = _make_stock_data("HPG")
            mock_instance.get_index_history.return_value = _make_price_history(ticker="VNINDEX")
            MockFetcher.return_value = mock_instance

            result = analyze_stock("HPG")

        assert isinstance(result, StockAnalysisResult)
        assert result.ticker == "HPG"

    def test_ticker_uppercased(self):
        with patch("src.pipeline.DataFetcher") as MockFetcher:
            mock_instance = MagicMock()
            mock_instance.fetch_all.return_value = _make_stock_data("VCB")
            mock_instance.get_index_history.return_value = _make_price_history(ticker="VNINDEX")
            MockFetcher.return_value = mock_instance

            result = analyze_stock("vcb")

        assert result.ticker == "VCB"

    def test_custom_wacc_forwarded(self):
        """Pipeline nhận custom_wacc và truyền xuống ValuationEngine."""
        with patch("src.pipeline.DataFetcher") as MockFetcher:
            mock_instance = MagicMock()
            mock_instance.fetch_all.return_value = _make_stock_data("VCB")
            mock_instance.get_index_history.return_value = _make_price_history(ticker="VNINDEX")
            MockFetcher.return_value = mock_instance

            r_low_wacc  = analyze_stock("VCB", custom_wacc=0.08)
            r_high_wacc = analyze_stock("VCB", custom_wacc=0.20)

        # WACC cao → DCF value thấp hơn
        if (r_low_wacc.valuation and r_high_wacc.valuation
                and r_low_wacc.valuation.dcf_result.is_available
                and r_high_wacc.valuation.dcf_result.is_available):
            assert (r_low_wacc.valuation.dcf_result.fair_value
                    > r_high_wacc.valuation.dcf_result.fair_value)
