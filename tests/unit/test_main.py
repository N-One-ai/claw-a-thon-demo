"""
Unit tests cho main.py — CLI parser và run_pipeline() logic.
Không gọi vnstock, Claude API, hay filesystem thật.
"""
from __future__ import annotations

import sys
from argparse import Namespace
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.main import _build_parser, _check_api_key, _load_watchlist

# run_pipeline() imports lazily — patch at source module, not src.main
_PIPELINE_CLS = "src.pipeline.AnalysisPipeline"
_GEN_CLS = "src.report_generator.ReportGenerator"
_CFG_CLS = "src.report_generator.ReportConfig"


# ================================================================== #
# Parser                                                               #
# ================================================================== #

class TestParser:
    def _parse(self, args: list[str]) -> Namespace:
        return _build_parser().parse_args(args)

    def test_no_target_does_not_crash_parser(self):
        # Parser không raise — main() sẽ print help + exit khi không có target
        args = _build_parser().parse_args([])
        assert args.ticker is None
        assert args.tickers is None
        assert args.serve is False

    def test_tickers_argument(self):
        args = self._parse(["--tickers", "VCB,FPT,HPG"])
        assert args.tickers == "VCB,FPT,HPG"
        assert args.ticker is None

    def test_serve_argument(self):
        args = self._parse(["--serve"])
        assert args.serve is True
        assert args.ticker is None

    def test_ticker_and_tickers_mutually_exclusive(self):
        with pytest.raises(SystemExit):
            self._parse(["--ticker", "FPT", "--tickers", "VCB,FPT"])

    def test_port_default(self):
        args = self._parse(["--serve"])
        assert args.port == 8080

    def test_port_custom(self):
        args = self._parse(["--serve", "--port", "9000"])
        assert args.port == 9000

    def test_ticker_stored_as_given(self):
        args = self._parse(["--ticker", "fpt"])
        assert args.ticker == "fpt"   # parser doesn't uppercase — main() does

    def test_default_mode_is_pipeline(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.mode == "pipeline"

    def test_mode_agent(self):
        args = self._parse(["--ticker", "FPT", "--mode", "agent"])
        assert args.mode == "agent"

    def test_mode_pipeline_explicit(self):
        args = self._parse(["--ticker", "FPT", "--mode", "pipeline"])
        assert args.mode == "pipeline"

    def test_mode_invalid_rejected(self):
        with pytest.raises(SystemExit):
            self._parse(["--ticker", "FPT", "--mode", "invalid"])

    def test_stream_default_false(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.stream is False

    def test_stream_flag(self):
        args = self._parse(["--ticker", "FPT", "--stream"])
        assert args.stream is True

    def test_stream_shortflag(self):
        args = self._parse(["--ticker", "FPT", "-s"])
        assert args.stream is True

    def test_output_default_terminal(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.output == "terminal"

    def test_output_choices(self):
        for choice in ("terminal", "json", "pdf", "md"):
            args = self._parse(["--ticker", "FPT", "--output", choice])
            assert args.output == choice

    def test_output_invalid_rejected(self):
        with pytest.raises(SystemExit):
            self._parse(["--ticker", "FPT", "--output", "xlsx"])

    def test_wacc_parsed_as_float(self):
        args = self._parse(["--ticker", "FPT", "--wacc", "0.12"])
        assert args.wacc == pytest.approx(0.12)

    def test_growth_parsed_as_float(self):
        args = self._parse(["--ticker", "FPT", "--growth", "0.15"])
        assert args.growth == pytest.approx(0.15)

    def test_wacc_default_none(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.wacc is None

    def test_growth_default_none(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.growth is None

    def test_source_default_vci(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.source == "VCI"

    def test_source_tcbs(self):
        args = self._parse(["--ticker", "FPT", "--source", "TCBS"])
        assert args.source == "TCBS"

    def test_source_invalid_rejected(self):
        with pytest.raises(SystemExit):
            self._parse(["--ticker", "FPT", "--source", "SSI"])

    def test_cache_dir_default(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.cache_dir == ".cache"

    def test_cache_dir_custom(self):
        args = self._parse(["--ticker", "FPT", "--cache-dir", "/tmp/test"])
        assert args.cache_dir == "/tmp/test"

    def test_output_dir_default(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.output_dir == "reports"

    def test_log_level_default_warning(self):
        with patch.dict("os.environ", {}, clear=True):
            args = self._parse(["--ticker", "FPT"])
            assert args.log_level == "WARNING"

    def test_log_level_choices(self):
        for level in ("DEBUG", "INFO", "WARNING", "ERROR"):
            args = self._parse(["--ticker", "FPT", "--log-level", level])
            assert args.log_level == level

    def test_no_news_default_false(self):
        args = self._parse(["--ticker", "FPT"])
        assert args.no_news is False

    def test_no_news_flag(self):
        args = self._parse(["--ticker", "FPT", "--no-news"])
        assert args.no_news is True

    def test_short_ticker_flag(self):
        args = self._parse(["-t", "VCB"])
        assert args.ticker == "VCB"

    def test_short_mode_flag(self):
        args = self._parse(["-t", "FPT", "-m", "agent"])
        assert args.mode == "agent"


# ================================================================== #
# _check_api_key                                                       #
# ================================================================== #

class TestCheckApiKey:
    def test_exits_when_no_key(self):
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(SystemExit) as exc_info:
                _check_api_key()
            assert exc_info.value.code == 1

    def test_passes_when_key_set(self):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test-key"}):
            _check_api_key()   # should not raise


# ================================================================== #
# main() routing                                                       #
# ================================================================== #

class TestMainRouting:
    def test_pipeline_mode_calls_run_pipeline(self):
        with patch("src.main.run_pipeline") as mock_pipeline, \
             patch("src.main.run_analysis") as mock_agent, \
             patch("src.main._check_api_key"), \
             patch("src.main._setup_logging"), \
             patch("sys.argv", ["prog", "--ticker", "FPT", "--mode", "pipeline"]):
            from src.main import main
            main()
            mock_pipeline.assert_called_once()
            mock_agent.assert_not_called()

    def test_agent_mode_calls_run_analysis(self):
        with patch("src.main.run_pipeline") as mock_pipeline, \
             patch("src.main.run_analysis") as mock_agent, \
             patch("src.main._check_api_key"), \
             patch("src.main._setup_logging"), \
             patch("sys.argv", ["prog", "--ticker", "FPT", "--mode", "agent"]):
            from src.main import main
            main()
            mock_agent.assert_called_once()
            mock_pipeline.assert_not_called()

    def test_default_mode_calls_run_pipeline(self):
        with patch("src.main.run_pipeline") as mock_pipeline, \
             patch("src.main.run_analysis"), \
             patch("src.main._check_api_key"), \
             patch("src.main._setup_logging"), \
             patch("sys.argv", ["prog", "--ticker", "FPT"]):
            from src.main import main
            main()
            mock_pipeline.assert_called_once()


# ================================================================== #
# run_pipeline() logic                                                 #
# ================================================================== #

def _make_mock_result(ticker="FPT"):
    """StockAnalysisResult mock với đủ fields để run_pipeline() không crash."""
    from src.data.models import (
        OHLCV,
        CompanyInfo,
        Exchange,
        FinancialStatements,
        PriceHistory,
        Sector,
    )
    from src.pipeline import DataQuality, StockAnalysisResult

    company = CompanyInfo(
        ticker=ticker, name=f"Test {ticker}",
        exchange=Exchange.HOSE, sector=Sector.TECHNOLOGY,
        shares_outstanding=1000.0,
    )
    stmts = FinancialStatements(ticker=ticker)
    ph = PriceHistory(ticker=ticker, candles=[
        OHLCV(date=date(2024, 6, 1), open=80000, high=82000,
              low=79000, close=80000, volume=1_000_000),
    ])
    return StockAnalysisResult(
        ticker=ticker,
        company=company,
        statements=stmts,
        price_history=ph,
        current_price=80000.0,
        valuation=None, technical=None, risk=None,
        data_quality=DataQuality(periods_income=8, price_trading_days=300),
        fetch_ms=120, analysis_ms=450,
    )


class TestRunPipelineMd:
    """run_pipeline() → output md — easiest to test (no TerminalRenderer)."""

    def _args(self, ticker="FPT", output="md", stream=False,
               wacc=None, growth=None) -> Namespace:
        return Namespace(
            ticker=ticker, mode="pipeline", stream=stream,
            output=output, output_dir="/tmp/test_reports",
            source="VCI", cache_dir="/tmp/test_cache",
            wacc=wacc, growth=growth, no_news=False, log_level="WARNING",
        )

    def test_run_pipeline_md_creates_file(self, tmp_path):
        """Chạy run_pipeline() với output=md, mock toàn bộ external calls."""
        from src.main import run_pipeline

        mock_result = _make_mock_result()
        args = self._args(output="md", ticker="FPT")
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst

            mock_gen_inst = MagicMock()
            mock_gen_inst.generate.return_value = "# Test Report\nContent here"
            MockGen.return_value = mock_gen_inst

            run_pipeline(args)

        md_files = list(tmp_path.glob("FPT_*.md"))
        assert len(md_files) == 1
        content = md_files[0].read_text(encoding="utf-8")
        assert "# Test Report" in content

    def test_run_pipeline_calls_pipeline_analyze(self, tmp_path):
        from src.main import run_pipeline

        mock_result = _make_mock_result("VCB")
        args = self._args(ticker="VCB", output="md")
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst
            MockGen.return_value.generate.return_value = "# VCB"

            run_pipeline(args)

        mock_pipeline_inst.analyze.assert_called_once_with("VCB")

    def test_run_pipeline_calls_report_generator(self, tmp_path):
        from src.main import run_pipeline

        mock_result = _make_mock_result()
        args = self._args(output="md")
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst

            mock_gen_inst = MagicMock()
            mock_gen_inst.generate.return_value = "# Report"
            MockGen.return_value = mock_gen_inst

            run_pipeline(args)

        mock_gen_inst.generate.assert_called_once_with(mock_result)

    def test_run_pipeline_runtime_error_returns_gracefully(self, tmp_path):
        from src.main import run_pipeline

        args = self._args(output="md")
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS), \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.side_effect = RuntimeError("No data for ticker")
            MockPipeline.return_value = mock_pipeline_inst

            run_pipeline(args)   # should NOT raise

        assert list(tmp_path.glob("*.md")) == []

    def test_run_pipeline_wacc_forwarded(self, tmp_path):
        from src.main import run_pipeline

        mock_result = _make_mock_result()
        args = self._args(output="md", wacc=0.12)
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst
            MockGen.return_value.generate.return_value = "# Report"

            run_pipeline(args)

        call_kwargs = MockPipeline.call_args[1]
        assert call_kwargs["custom_wacc"] == pytest.approx(0.12)

    def test_run_pipeline_growth_forwarded(self, tmp_path):
        from src.main import run_pipeline

        mock_result = _make_mock_result()
        args = self._args(output="md", growth=0.20)
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst
            MockGen.return_value.generate.return_value = "# Report"

            run_pipeline(args)

        call_kwargs = MockPipeline.call_args[1]
        assert call_kwargs["custom_growth"] == pytest.approx(0.20)

    def test_run_pipeline_md_filename_contains_ticker(self, tmp_path):
        from src.main import run_pipeline

        mock_result = _make_mock_result("HPG")
        args = self._args(ticker="HPG", output="md")
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst
            MockGen.return_value.generate.return_value = "# HPG"

            run_pipeline(args)

        assert len(list(tmp_path.glob("HPG_*.md"))) == 1

    def test_run_pipeline_ticker_uppercased(self, tmp_path):
        from src.main import run_pipeline

        mock_result = _make_mock_result("FPT")
        args = self._args(ticker="fpt", output="md")
        args.output_dir = str(tmp_path)

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst
            MockGen.return_value.generate.return_value = "# FPT"

            run_pipeline(args)

        mock_pipeline_inst.analyze.assert_called_once_with("FPT")


class TestRunPipelineStream:
    def test_stream_calls_generate_stream(self, capsys):
        from src.main import run_pipeline

        mock_result = _make_mock_result("FPT")
        args = Namespace(
            ticker="FPT", mode="pipeline", stream=True,
            output="terminal", output_dir="/tmp/test",
            source="VCI", cache_dir="/tmp/cache",
            wacc=None, growth=None, no_news=False, log_level="WARNING",
        )

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst

            mock_gen_inst = MagicMock()
            mock_gen_inst.generate_stream.return_value = iter(["# ", "FPT\n", "Content"])
            MockGen.return_value = mock_gen_inst

            run_pipeline(args)

        mock_gen_inst.generate_stream.assert_called_once_with(mock_result)
        captured = capsys.readouterr()
        assert "# " in captured.out or "FPT" in captured.out

    def test_stream_does_not_call_generate(self):
        from src.main import run_pipeline

        mock_result = _make_mock_result()
        args = Namespace(
            ticker="FPT", mode="pipeline", stream=True,
            output="terminal", output_dir="/tmp/test",
            source="VCI", cache_dir="/tmp/cache",
            wacc=None, growth=None, no_news=False, log_level="WARNING",
        )

        with patch(_PIPELINE_CLS) as MockPipeline, \
             patch(_GEN_CLS) as MockGen, \
             patch(_CFG_CLS):

            mock_pipeline_inst = MagicMock()
            mock_pipeline_inst.analyze.return_value = mock_result
            MockPipeline.return_value = mock_pipeline_inst

            mock_gen_inst = MagicMock()
            mock_gen_inst.generate_stream.return_value = iter(["chunk"])
            MockGen.return_value = mock_gen_inst

            run_pipeline(args)

        mock_gen_inst.generate.assert_not_called()


# ================================================================== #
# Watchlist / Alert — parser + _load_watchlist()                       #
# ================================================================== #

class TestWatchlistParser:
    def _parse(self, args: list[str]) -> Namespace:
        return _build_parser().parse_args(args)

    def test_watchlist_argument_stored(self):
        args = self._parse(["--watchlist", "VCB,FPT,HPG"])
        assert args.watchlist == "VCB,FPT,HPG"

    def test_watchlist_and_ticker_mutually_exclusive(self):
        with pytest.raises(SystemExit):
            self._parse(["--ticker", "FPT", "--watchlist", "VCB,FPT"])

    def test_watchlist_and_tickers_mutually_exclusive(self):
        with pytest.raises(SystemExit):
            self._parse(["--tickers", "FPT,VCB", "--watchlist", "HPG"])

    def test_alert_threshold_default(self):
        args = self._parse(["--watchlist", "VCB"])
        assert args.alert_threshold == pytest.approx(10.0)

    def test_alert_threshold_custom(self):
        args = self._parse(["--watchlist", "VCB", "--alert-threshold", "15"])
        assert args.alert_threshold == pytest.approx(15.0)

    def test_max_risk_default(self):
        args = self._parse(["--watchlist", "VCB"])
        assert args.max_risk == "MEDIUM"

    def test_max_risk_low(self):
        args = self._parse(["--watchlist", "VCB", "--max-risk", "LOW"])
        assert args.max_risk == "LOW"

    def test_max_risk_very_high(self):
        args = self._parse(["--watchlist", "VCB", "--max-risk", "VERY_HIGH"])
        assert args.max_risk == "VERY_HIGH"

    def test_max_risk_invalid_rejected(self):
        with pytest.raises(SystemExit):
            self._parse(["--watchlist", "VCB", "--max-risk", "EXTREME"])


class TestLoadWatchlist:
    def test_comma_separated(self):
        tickers = _load_watchlist("VCB,FPT,HPG")
        assert tickers == ["VCB", "FPT", "HPG"]

    def test_uppercases(self):
        tickers = _load_watchlist("vcb,fpt")
        assert tickers == ["VCB", "FPT"]

    def test_skips_blank(self):
        tickers = _load_watchlist("VCB,,FPT, ,HPG")
        assert tickers == ["VCB", "FPT", "HPG"]

    def test_single_ticker(self):
        tickers = _load_watchlist("VCB")
        assert tickers == ["VCB"]

    def test_from_file(self, tmp_path):
        f = tmp_path / "tickers.txt"
        f.write_text("VCB\nFPT\nHPG\n", encoding="utf-8")
        tickers = _load_watchlist(str(f))
        assert tickers == ["VCB", "FPT", "HPG"]

    def test_file_with_commas(self, tmp_path):
        f = tmp_path / "tickers.txt"
        f.write_text("VCB,FPT\nHPG\n", encoding="utf-8")
        tickers = _load_watchlist(str(f))
        assert tickers == ["VCB", "FPT", "HPG"]

    def test_file_skips_blank_lines(self, tmp_path):
        f = tmp_path / "tickers.txt"
        f.write_text("VCB\n\nFPT\n  \nHPG\n", encoding="utf-8")
        tickers = _load_watchlist(str(f))
        assert tickers == ["VCB", "FPT", "HPG"]


class TestMainWatchlistRouting:
    def test_watchlist_calls_run_watchlist(self):
        with patch("src.main.run_watchlist") as mock_wl, \
             patch("src.main._check_api_key"), \
             patch("src.main._setup_logging"), \
             patch("sys.argv", ["prog", "--watchlist", "VCB,FPT"]):
            from src.main import main
            main()
            mock_wl.assert_called_once()

    def test_watchlist_does_not_call_run_batch(self):
        with patch("src.main.run_watchlist"), \
             patch("src.main.run_batch") as mock_batch, \
             patch("src.main._check_api_key"), \
             patch("src.main._setup_logging"), \
             patch("sys.argv", ["prog", "--watchlist", "VCB,FPT"]):
            from src.main import main
            main()
            mock_batch.assert_not_called()
