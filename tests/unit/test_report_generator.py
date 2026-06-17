"""
Unit tests cho report_generator.py.

Không gọi Claude API thật — dùng mock cho Anthropic client.
PromptBuilder tests hoàn toàn pure Python.
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.data.models import (
    BalanceSheet,
    CashFlowStatement,
    CompanyInfo,
    DCFScenario,
    EarningsYieldResult,
    Exchange,
    FinancialRatios,
    FinancialStatements,
    IncomeStatement,
    ModelResult,
    OHLCV,
    PriceHistory,
    RiskFlag,
    RiskFlagType,
    RiskLevel,
    RiskProfile,
    Sector,
    TechnicalSignal,
    ValuationLabel,
    ValuationResults,
)
from src.pipeline import AnalysisPipeline, StockAnalysisResult
from src.report_generator import PromptBuilder, ReportConfig, ReportGenerator, _SYSTEM_PROMPT


# ================================================================== #
# Shared Fixtures                                                       #
# ================================================================== #

def _company(ticker="FPT", sector=Sector.TECHNOLOGY) -> CompanyInfo:
    return CompanyInfo(
        ticker=ticker, name="FPT Corporation",
        exchange=Exchange.HOSE, sector=sector,
        shares_outstanding=1150.0,
        description="Tập đoàn công nghệ hàng đầu Việt Nam.",
    )


def _statements(ticker="FPT") -> FinancialStatements:
    stmts = FinancialStatements(ticker=ticker)
    for i in range(8):
        q = 4 - (i % 4)
        yr = 2024 - (i // 4)
        period = f"{yr}-Q{q}"
        stmts.income_statements.append(IncomeStatement(
            period=period, revenue=15000 - i*100,
            net_income=2000 - i*20,
            gross_profit=5500, operating_income=2500,
            ebit=2400, eps=3500 - i*50, interest_expense=150,
        ))
        stmts.balance_sheets.append(BalanceSheet(
            period=period, total_assets=60000, total_equity=25000,
            total_debt=8000, cash_and_equivalents=5000,
            current_assets=20000, current_liabilities=10000,
            book_value_per_share=21700,
        ))
        stmts.cash_flow_statements.append(CashFlowStatement(
            period=period, operating_cash_flow=2500,
            capital_expenditure=-500, free_cash_flow=2000,
        ))
    return stmts


def _price_history(n=300, ticker="FPT") -> PriceHistory:
    base = date(2024, 6, 1)
    candles = [
        OHLCV(date=base - timedelta(days=i), open=80000, high=82000,
              low=79000, close=80000, volume=1_500_000)
        for i in range(n)
    ]
    return PriceHistory(ticker=ticker, candles=candles)


def _valuation(ticker="FPT") -> ValuationResults:
    return ValuationResults(
        ticker=ticker,
        current_price=80000,
        pe_result=ModelResult(
            model_name="P/E Fair Value", fair_value=95000,
            is_available=True, weight=0.25,
            inputs={"eps_ttm": 3800, "pe_benchmark": 25},
        ),
        pb_result=ModelResult(
            model_name="P/B Fair Value", fair_value=87000,
            is_available=True, weight=0.25,
        ),
        graham_result=ModelResult(
            model_name="Graham Number", fair_value=89000,
            is_available=True, weight=0.20,
        ),
        dcf_result=ModelResult(
            model_name="DCF (5 năm)", fair_value=102000,
            is_available=True, weight=0.30,
        ),
        earnings_yield=EarningsYieldResult(
            earnings_yield=4.75, risk_free_rate=4.8, spread=-0.05,
            is_attractive=False,
        ),
        consensus_value=93000,
        discount_pct=16.25,
        label=ValuationLabel.ATTRACTIVE,
        scenarios=[
            DCFScenario(name="Bi quan", growth_rate=5.0, terminal_growth=3.0,
                        wacc=15.0, fair_value=72000, probability=0.30),
            DCFScenario(name="Cơ sở", growth_rate=12.0, terminal_growth=3.0,
                        wacc=13.0, fair_value=102000, probability=0.50),
            DCFScenario(name="Lạc quan", growth_rate=20.0, terminal_growth=3.5,
                        wacc=12.0, fair_value=138000, probability=0.20),
        ],
        probability_weighted_value=96000,
    )


def _technical() -> TechnicalSignal:
    return TechnicalSignal(
        current_price=80000,
        sma_20=78500, sma_50=75000, sma_200=68000,
        rsi_14=58.3, rsi_label="Trung lập",
        macd_line=420.5, macd_signal=380.2, macd_histogram=40.3,
        macd_label="Mua",
        volume_trend="Tăng nhẹ",
        price_trend="Tăng mạnh",
        high_52w=92000, low_52w=62000,
        position_52w_pct=60.0,
    )


def _risk(ticker="FPT") -> RiskProfile:
    return RiskProfile(
        ticker=ticker,
        beta=1.12, annualized_volatility_pct=28.5,
        debt_to_equity=0.32, interest_coverage=16.0,
        earnings_stability="Cao", avg_daily_volume=1_800_000,
        flags=[
            RiskFlag(
                flag_type=RiskFlagType.HIGH_BETA,
                severity=RiskLevel.LOW,
                description="Beta 1.12 — biến động nhẹ hơn thị trường",
            )
        ],
        overall_risk=RiskLevel.LOW,
        risk_summary="Hồ sơ rủi ro thấp — phù hợp nhà đầu tư bảo thủ",
    )


def _ratios() -> FinancialRatios:
    return FinancialRatios(
        period="2024-Q4",
        pe_ratio=21.05, pb_ratio=3.69,
        roe=16.0, roa=5.3,
        gross_margin=36.7, operating_margin=16.7, net_margin=13.3,
        debt_to_equity=0.32, debt_to_assets=0.13, interest_coverage=16.0,
        current_ratio=2.0,
        revenue_growth_yoy=18.5, net_income_growth_yoy=22.3, eps_growth_yoy=19.8,
    )


def _full_result(ticker="FPT") -> StockAnalysisResult:
    """StockAnalysisResult đầy đủ cho test."""
    from src.pipeline import DataQuality
    return StockAnalysisResult(
        ticker=ticker,
        company=_company(ticker),
        statements=_statements(ticker),
        price_history=_price_history(ticker=ticker),
        current_price=80000.0,
        ratios=_ratios(),
        valuation=_valuation(ticker),
        technical=_technical(),
        risk=_risk(ticker),
        business_type="Tăng trưởng",
        accounting_flags=[],
        data_quality=DataQuality(
            periods_income=8, periods_balance=8, periods_cashflow=8,
            price_trading_days=300,
            has_eps_ttm=True, has_bvps=True, has_fcf_ttm=True,
            available_valuation_models=["P/E Fair Value", "P/B Fair Value",
                                        "Graham Number", "DCF (5 năm)"],
        ),
    )


# ================================================================== #
# ReportConfig                                                         #
# ================================================================== #

class TestReportConfig:
    def test_default_model(self):
        cfg = ReportConfig()
        assert "sonnet" in cfg.model or "claude" in cfg.model

    def test_default_max_tokens(self):
        assert ReportConfig().max_tokens >= 4096

    def test_custom_values(self):
        cfg = ReportConfig(model="claude-haiku-4-5-20251001", max_tokens=4096)
        assert cfg.model == "claude-haiku-4-5-20251001"
        assert cfg.max_tokens == 4096

    def test_extra_instructions_default_none(self):
        assert ReportConfig().extra_instructions is None

    def test_extra_instructions_set(self):
        cfg = ReportConfig(extra_instructions="Tập trung vào ngân hàng")
        assert cfg.extra_instructions == "Tập trung vào ngân hàng"


# ================================================================== #
# PromptBuilder — _n (number formatter)                                #
# ================================================================== #

class TestNumberFormatter:
    def test_integer_thousands(self):
        result = PromptBuilder._n(80000)
        assert "80.000" in result

    def test_none_returns_na(self):
        assert PromptBuilder._n(None) == "N/A"

    def test_with_suffix(self):
        result = PromptBuilder._n(80000, suffix=" VND")
        assert result.endswith(" VND")

    def test_decimal_format(self):
        result = PromptBuilder._n(12500.75, decimals=2)
        # 12.500,75 style
        assert "12" in result

    def test_zero_value(self):
        result = PromptBuilder._n(0)
        assert "0" in result

    def test_negative_value(self):
        result = PromptBuilder._n(-1500)
        assert "-" in result

    def test_large_number(self):
        result = PromptBuilder._n(1_000_000)
        assert "1.000.000" in result


class TestPctFormatter:
    def test_basic_pct(self):
        result = PromptBuilder._pct(18.5)
        assert "18" in result and "%" in result

    def test_none_returns_na(self):
        assert PromptBuilder._pct(None) == "N/A"

    def test_sign_positive(self):
        result = PromptBuilder._pct(5.0, sign=True)
        assert "+" in result

    def test_sign_negative(self):
        result = PromptBuilder._pct(-3.0, sign=True)
        assert "-" in result

    def test_sign_no_prefix_when_false(self):
        result = PromptBuilder._pct(5.0, sign=False)
        assert not result.startswith("+")


# ================================================================== #
# PromptBuilder — header section                                       #
# ================================================================== #

class TestHeaderSection:
    def test_contains_ticker(self):
        result = _full_result()
        header = PromptBuilder._header(result, "17/06/2026")
        assert "FPT" in header

    def test_contains_date(self):
        result = _full_result()
        header = PromptBuilder._header(result, "17/06/2026")
        assert "17/06/2026" in header

    def test_contains_price(self):
        result = _full_result()
        header = PromptBuilder._header(result, "17/06/2026")
        assert "80.000" in header

    def test_no_crash_when_no_price(self):
        result = _full_result()
        result = result.model_copy(update={"current_price": None})
        header = PromptBuilder._header(result, "17/06/2026")
        assert isinstance(header, str)


# ================================================================== #
# PromptBuilder — company section                                      #
# ================================================================== #

class TestCompanySection:
    def test_contains_company_name(self):
        section = PromptBuilder._company_section(_full_result())
        assert "FPT Corporation" in section

    def test_contains_ticker(self):
        section = PromptBuilder._company_section(_full_result())
        assert "FPT" in section

    def test_contains_sector(self):
        section = PromptBuilder._company_section(_full_result())
        assert "technology" in section.lower() or "công nghệ" in section.lower()

    def test_contains_shares(self):
        section = PromptBuilder._company_section(_full_result())
        assert "1.150" in section or "1150" in section

    def test_business_type_included(self):
        section = PromptBuilder._company_section(_full_result())
        assert "Tăng trưởng" in section

    def test_description_truncated_long(self):
        result = _full_result()
        result.company.description = "A" * 500
        section = PromptBuilder._company_section(result)
        assert "..." in section

    def test_accounting_flags_shown(self):
        result = _full_result()
        result.accounting_flags = ["Lợi nhuận cao nhưng FCF âm"]
        section = PromptBuilder._company_section(result)
        assert "FCF âm" in section

    def test_no_accounting_flags_no_section(self):
        result = _full_result()
        result.accounting_flags = []
        section = PromptBuilder._company_section(result)
        assert "Cờ đỏ kế toán" not in section


# ================================================================== #
# PromptBuilder — financial section                                    #
# ================================================================== #

class TestFinancialSection:
    def test_contains_roe(self):
        section = PromptBuilder._financial_section(_full_result())
        assert "ROE" in section

    def test_contains_pe_ratio(self):
        section = PromptBuilder._financial_section(_full_result())
        assert "P/E" in section and "21" in section

    def test_contains_revenue_growth(self):
        section = PromptBuilder._financial_section(_full_result())
        assert "18" in section   # revenue_growth_yoy = 18.5

    def test_contains_eps_ttm(self):
        section = PromptBuilder._financial_section(_full_result())
        assert "EPS TTM" in section

    def test_no_ratios_graceful(self):
        result = _full_result()
        result = result.model_copy(update={"ratios": None})
        section = PromptBuilder._financial_section(result)
        assert isinstance(section, str)

    def test_contains_de_ratio(self):
        section = PromptBuilder._financial_section(_full_result())
        assert "D/E" in section

    def test_contains_interest_coverage(self):
        section = PromptBuilder._financial_section(_full_result())
        assert "Interest Coverage" in section or "coverage" in section.lower()


# ================================================================== #
# PromptBuilder — valuation section                                    #
# ================================================================== #

class TestValuationSection:
    def test_contains_all_model_names(self):
        section = PromptBuilder._valuation_section(_full_result())
        assert "P/E Fair Value" in section
        assert "P/B Fair Value" in section
        assert "Graham Number" in section
        assert "DCF" in section

    def test_contains_consensus_value(self):
        section = PromptBuilder._valuation_section(_full_result())
        assert "93.000" in section

    def test_contains_discount_pct(self):
        section = PromptBuilder._valuation_section(_full_result())
        assert "16" in section   # discount_pct = 16.25

    def test_contains_label(self):
        section = PromptBuilder._valuation_section(_full_result())
        assert "Hấp dẫn" in section

    def test_contains_scenarios(self):
        section = PromptBuilder._valuation_section(_full_result())
        assert "Bi quan" in section
        assert "Cơ sở" in section
        assert "Lạc quan" in section

    def test_unavailable_model_shows_reason(self):
        result = _full_result()
        result.valuation.graham_result = ModelResult(
            model_name="Graham Number",
            is_available=False,
            unavailable_reason="EPS âm",
            weight=0.20,
        )
        section = PromptBuilder._valuation_section(result)
        assert "EPS âm" in section

    def test_no_valuation_graceful(self):
        result = _full_result()
        result = result.model_copy(update={"valuation": None})
        section = PromptBuilder._valuation_section(result)
        assert "Không có dữ liệu" in section

    def test_earnings_yield_line(self):
        section = PromptBuilder._valuation_section(_full_result())
        assert "Earnings Yield" in section
        # _pct làm tròn 1 chữ số thập phân: 4.75 → "4.8%"
        assert "4.8" in section or "4.75" in section

    def test_probability_weighted_value(self):
        section = PromptBuilder._valuation_section(_full_result())
        assert "96.000" in section


# ================================================================== #
# PromptBuilder — technical section                                    #
# ================================================================== #

class TestTechnicalSection:
    def test_contains_price_trend(self):
        section = PromptBuilder._technical_section(_full_result())
        assert "Tăng mạnh" in section

    def test_contains_rsi(self):
        section = PromptBuilder._technical_section(_full_result())
        assert "RSI" in section and "58" in section

    def test_contains_rsi_label(self):
        section = PromptBuilder._technical_section(_full_result())
        assert "Trung lập" in section

    def test_contains_macd_label(self):
        section = PromptBuilder._technical_section(_full_result())
        assert "Mua" in section

    def test_contains_sma_values(self):
        section = PromptBuilder._technical_section(_full_result())
        assert "78.500" in section   # sma_20
        assert "75.000" in section   # sma_50

    def test_contains_52w_range(self):
        section = PromptBuilder._technical_section(_full_result())
        assert "62.000" in section   # low_52w
        assert "92.000" in section   # high_52w

    def test_contains_52w_position(self):
        section = PromptBuilder._technical_section(_full_result())
        assert "60" in section   # position_52w_pct

    def test_no_technical_graceful(self):
        result = _full_result()
        result = result.model_copy(update={"technical": None})
        section = PromptBuilder._technical_section(result)
        assert "Không có dữ liệu" in section


# ================================================================== #
# PromptBuilder — risk section                                         #
# ================================================================== #

class TestRiskSection:
    def test_contains_overall_risk(self):
        section = PromptBuilder._risk_section(_full_result())
        assert "Thấp" in section

    def test_contains_beta(self):
        section = PromptBuilder._risk_section(_full_result())
        assert "Beta" in section and "1,12" in section or "1.12" in section

    def test_contains_flags(self):
        section = PromptBuilder._risk_section(_full_result())
        assert "Biến động cao hơn thị trường" in section or "HIGH_BETA" in section or "Beta" in section

    def test_contains_risk_summary(self):
        section = PromptBuilder._risk_section(_full_result())
        assert "Hồ sơ rủi ro thấp" in section

    def test_no_risk_graceful(self):
        result = _full_result()
        result = result.model_copy(update={"risk": None})
        section = PromptBuilder._risk_section(result)
        assert "Không có dữ liệu" in section

    def test_no_flags_no_flag_section(self):
        result = _full_result()
        result.risk.flags = []
        section = PromptBuilder._risk_section(result)
        assert "Danh sách cờ rủi ro" not in section


# ================================================================== #
# PromptBuilder — data quality section                                 #
# ================================================================== #

class TestDataQualitySection:
    def test_contains_periods(self):
        section = PromptBuilder._data_quality_section(_full_result())
        assert "8" in section

    def test_contains_price_days(self):
        section = PromptBuilder._data_quality_section(_full_result())
        assert "300" in section

    def test_contains_available_models(self):
        section = PromptBuilder._data_quality_section(_full_result())
        assert "P/E Fair Value" in section

    def test_errors_shown(self):
        result = _full_result()
        result.errors["technical"] = "test error"
        section = PromptBuilder._data_quality_section(result)
        assert "technical" in section

    def test_no_errors_no_error_line(self):
        section = PromptBuilder._data_quality_section(_full_result())
        assert "Lỗi trong pipeline" not in section


# ================================================================== #
# PromptBuilder — build (full prompt)                                  #
# ================================================================== #

class TestPromptBuilderBuild:
    def test_build_returns_string(self):
        prompt = PromptBuilder.build(_full_result())
        assert isinstance(prompt, str)

    def test_build_not_empty(self):
        prompt = PromptBuilder.build(_full_result())
        assert len(prompt) > 500

    def test_build_contains_all_sections(self):
        prompt = PromptBuilder.build(_full_result())
        for section in ["PHẦN A", "PHẦN B", "PHẦN C", "PHẦN D", "PHẦN E", "PHẦN F"]:
            assert section in prompt, f"Missing {section}"

    def test_build_contains_ticker(self):
        prompt = PromptBuilder.build(_full_result())
        assert "FPT" in prompt

    def test_build_ends_with_instruction(self):
        prompt = PromptBuilder.build(_full_result())
        assert "11 phần" in prompt or "báo cáo" in prompt.lower()

    def test_build_includes_extra_instructions(self):
        extra = "Tập trung phân tích triển vọng AI"
        prompt = PromptBuilder.build(_full_result(), extra_instructions=extra)
        assert extra in prompt

    def test_build_no_extra_when_none(self):
        prompt = PromptBuilder.build(_full_result(), extra_instructions=None)
        assert "Lưu ý bổ sung" not in prompt

    def test_different_tickers_different_prompts(self):
        p1 = PromptBuilder.build(_full_result("FPT"))
        p2 = PromptBuilder.build(_full_result("VCB"))
        assert p1 != p2


# ================================================================== #
# System prompt validation                                              #
# ================================================================== #

class TestSystemPrompt:
    def test_system_prompt_not_empty(self):
        assert len(_SYSTEM_PROMPT) > 500

    def test_system_prompt_is_vietnamese(self):
        assert "tiếng Việt" in _SYSTEM_PROMPT or "Việt Nam" in _SYSTEM_PROMPT

    def test_system_prompt_has_11_sections(self):
        assert "11" in _SYSTEM_PROMPT or "TÓM TẮT NHANH" in _SYSTEM_PROMPT

    def test_system_prompt_forbids_buysell(self):
        assert "mua/bán" in _SYSTEM_PROMPT or "khuyến nghị" in _SYSTEM_PROMPT.lower()

    def test_system_prompt_requires_explanation(self):
        assert "giải thích" in _SYSTEM_PROMPT.lower() or "thuật ngữ" in _SYSTEM_PROMPT

    def test_system_prompt_has_all_section_names(self):
        required = [
            "TÓM TẮT NHANH",
            "TỔNG QUAN DOANH NGHIỆP",
            "SỨC KHỎE TÀI CHÍNH",
            "ĐỊNH GIÁ",
            "RỦI RO",
            "PHÂN TÍCH KỸ THUẬT",
            "LUẬN ĐIỂM ĐẦU TƯ",
            "KẾT LUẬN",
        ]
        for name in required:
            assert name in _SYSTEM_PROMPT, f"Missing section: {name}"


# ================================================================== #
# ReportGenerator — with mocked Anthropic client                      #
# ================================================================== #

def _make_mock_response(text: str):
    """Tạo mock response giống Anthropic Message object."""
    block = MagicMock()
    block.text = text
    block.type = "text"
    response = MagicMock()
    response.content = [block]
    response.stop_reason = "end_turn"
    return response


class TestReportGeneratorGenerate:
    def _mock_generator(self) -> ReportGenerator:
        gen = ReportGenerator.__new__(ReportGenerator)
        gen._config = ReportConfig()
        gen._client = MagicMock()
        return gen

    def test_generate_calls_api(self):
        gen = self._mock_generator()
        gen._client.messages.create.return_value = _make_mock_response("# Test Report\n\nNội dung")
        result = _full_result()
        output = gen.generate(result)
        assert gen._client.messages.create.called

    def test_generate_returns_string(self):
        gen = self._mock_generator()
        gen._client.messages.create.return_value = _make_mock_response("# Báo cáo FPT")
        output = gen.generate(_full_result())
        assert isinstance(output, str)

    def test_generate_returns_api_text(self):
        gen = self._mock_generator()
        expected = "# PHÂN TÍCH ĐẦU TƯ: FPT\n\n## 1. TÓM TẮT NHANH\nTest"
        gen._client.messages.create.return_value = _make_mock_response(expected)
        output = gen.generate(_full_result())
        assert output == expected

    def test_generate_uses_correct_model(self):
        gen = self._mock_generator()
        gen._config = ReportConfig(model="claude-haiku-4-5-20251001")
        gen._client.messages.create.return_value = _make_mock_response("test")
        gen.generate(_full_result())
        call_kwargs = gen._client.messages.create.call_args[1]
        assert call_kwargs["model"] == "claude-haiku-4-5-20251001"

    def test_generate_uses_correct_max_tokens(self):
        gen = self._mock_generator()
        gen._config = ReportConfig(max_tokens=4096)
        gen._client.messages.create.return_value = _make_mock_response("test")
        gen.generate(_full_result())
        call_kwargs = gen._client.messages.create.call_args[1]
        assert call_kwargs["max_tokens"] == 4096

    def test_generate_passes_system_prompt(self):
        gen = self._mock_generator()
        gen._client.messages.create.return_value = _make_mock_response("test")
        gen.generate(_full_result())
        call_kwargs = gen._client.messages.create.call_args[1]
        assert call_kwargs["system"] == _SYSTEM_PROMPT

    def test_generate_passes_user_message(self):
        gen = self._mock_generator()
        gen._client.messages.create.return_value = _make_mock_response("test")
        gen.generate(_full_result())
        call_kwargs = gen._client.messages.create.call_args[1]
        messages = call_kwargs["messages"]
        assert len(messages) == 1
        assert messages[0]["role"] == "user"
        assert "FPT" in messages[0]["content"]

    def test_generate_ticker_in_user_message(self):
        gen = self._mock_generator()
        gen._client.messages.create.return_value = _make_mock_response("test")
        gen.generate(_full_result("VCB"))
        call_kwargs = gen._client.messages.create.call_args[1]
        assert "VCB" in call_kwargs["messages"][0]["content"]

    def test_generate_strips_whitespace(self):
        gen = self._mock_generator()
        gen._client.messages.create.return_value = _make_mock_response("  \n# Report\n  ")
        output = gen.generate(_full_result())
        assert not output.startswith(" ")
        assert not output.endswith(" ")


class TestReportGeneratorStream:
    def _mock_stream_generator(self, chunks: list[str]) -> ReportGenerator:
        gen = ReportGenerator.__new__(ReportGenerator)
        gen._config = ReportConfig()

        mock_stream = MagicMock()
        mock_stream.text_stream = iter(chunks)
        mock_stream.__enter__ = MagicMock(return_value=mock_stream)
        mock_stream.__exit__ = MagicMock(return_value=False)

        gen._client = MagicMock()
        gen._client.messages.stream.return_value = mock_stream
        return gen

    def test_stream_yields_chunks(self):
        chunks = ["# Báo", " cáo\n", "## 1. ", "TÓM TẮT"]
        gen = self._mock_stream_generator(chunks)
        result = list(gen.generate_stream(_full_result()))
        assert result == chunks

    def test_stream_yields_strings(self):
        gen = self._mock_stream_generator(["chunk1", "chunk2"])
        for chunk in gen.generate_stream(_full_result()):
            assert isinstance(chunk, str)

    def test_stream_concatenated_equals_full_report(self):
        expected = "# FPT Report\n\nFull content here"
        chunks = ["# FPT ", "Report\n\n", "Full content ", "here"]
        gen = self._mock_stream_generator(chunks)
        full = "".join(gen.generate_stream(_full_result()))
        assert full == expected

    def test_stream_calls_messages_stream(self):
        gen = self._mock_stream_generator(["test"])
        list(gen.generate_stream(_full_result()))
        assert gen._client.messages.stream.called

    def test_stream_passes_system_prompt(self):
        gen = self._mock_stream_generator(["test"])
        list(gen.generate_stream(_full_result()))
        call_kwargs = gen._client.messages.stream.call_args[1]
        assert call_kwargs["system"] == _SYSTEM_PROMPT

    def test_stream_empty_response(self):
        gen = self._mock_stream_generator([])
        result = list(gen.generate_stream(_full_result()))
        assert result == []


# ================================================================== #
# ReportGenerator — __init__ and config                               #
# ================================================================== #

class TestReportGeneratorInit:
    def test_init_with_custom_config(self):
        with patch("src.report_generator.anthropic.Anthropic"):
            cfg = ReportConfig(model="claude-haiku-4-5-20251001", max_tokens=2048)
            gen = ReportGenerator(api_key="sk-test", config=cfg)
            assert gen._config.model == "claude-haiku-4-5-20251001"
            assert gen._config.max_tokens == 2048

    def test_init_uses_default_config_when_none(self):
        with patch("src.report_generator.anthropic.Anthropic"):
            gen = ReportGenerator(api_key="sk-test")
            assert gen._config is not None
            assert isinstance(gen._config, ReportConfig)

    def test_init_reads_api_key_from_env(self):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "env-key"}):
            with patch("src.report_generator.anthropic.Anthropic") as MockClient:
                gen = ReportGenerator()
                MockClient.assert_called_once_with(api_key="env-key")


# ================================================================== #
# _extract_text                                                         #
# ================================================================== #

class TestExtractText:
    def test_single_text_block(self):
        block = MagicMock()
        block.text = "Hello"
        assert ReportGenerator._extract_text([block]) == "Hello"

    def test_multiple_text_blocks_joined(self):
        b1 = MagicMock(); b1.text = "Part 1"
        b2 = MagicMock(); b2.text = "Part 2"
        result = ReportGenerator._extract_text([b1, b2])
        assert "Part 1" in result and "Part 2" in result

    def test_empty_blocks_returns_empty(self):
        assert ReportGenerator._extract_text([]) == ""

    def test_blocks_without_text_attr_skipped(self):
        block = MagicMock(spec=[])   # no .text attribute
        result = ReportGenerator._extract_text([block])
        assert result == ""

    def test_blocks_with_empty_text_skipped(self):
        block = MagicMock()
        block.text = ""
        result = ReportGenerator._extract_text([block])
        assert result == ""

    def test_whitespace_stripped(self):
        block = MagicMock()
        block.text = "   text   "
        result = ReportGenerator._extract_text([block])
        assert result == "text"
