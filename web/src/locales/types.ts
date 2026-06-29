export type Language = "vi" | "en" | "ja" | "ko" | "zh";

export type SupportedLanguage = "vi" | "en"; // currently rendered

export interface Translations {
  seo: { title: string; description: string };

  footer: string;

  nav: {
    dashboard: string;
    portfolio: string;
    watchlist: string;
    market: string;
    news: string;
    settings: string;
    apiOnline: string;
    language: string;
    logoTagline: string;
    searchPlaceholder: string;
    sectionAnalysis: string;
    sectionMarket: string;
    sectionSettings: string;
  };

  insight: {
    newsTitle: string;
    alertsTitle: string;
    riskTitle: string;
    catalystTitle: string;
    noTicker: string;
    noTickerSub: string;
  };

  hero: {
    badge: string;
    titleWhite: string;
    titleGradient: string;
    subtitle: string;
    subtitleHighlight: string;
    placeholder: string;
    analyzeBtn: string;
    popular: string;
    featureHOSE: string;
    featureHNX: string;
    featureValuation: string;
    featureRisk: string;
    featureTech: string;
  };

  search: {
    titleWhite: string;
    titleGradient: string;
    subtitle: string;
    placeholder: string;
    analyzeBtn: string;
    popular: string;
  };

  states: {
    analyzing: string;
    loadingDetails: string;
    cannotAnalyze: string;
    retry: string;
  };

  kpi: {
    investmentScore: string;
    scoreTooltip: string;
    fairValue: string;
    targetPrice: string;
    marginOfSafety: string;
    vsCurrentPrice: string;
    upsideDownside: string;
    riskLevel: string;
    recommendation: string;
    recStrongBuy: string;
    recBuy: string;
    recHold: string;
    recSell: string;
    recStrongSell: string;
    beta: string;
    technical: string;
    trend: string;
    week52: string;
    position: string;
  };

  tabs: {
    valuation: string;
    health: string;
    risk: string;
    technical: string;
    scenarios: string;
    aiReport: string;
  };

  empty: {
    valuation: string;
    risk: string;
    technical: string;
    scenarios: string;
  };

  valuation: {
    models: string;
    compareModels: string;
    currentPrice: string;
    fairValue: string;
    discountOf: string;
    premiumOf: string;
    notAvailable: string;
    dcfLabel: string;
    consensus: string;
    earningsYield: string;
    spread: string;
    fairValueScore: string;
    modelPE: string;
    modelPB: string;
    modelGraham: string;
  };

  health: {
    debtEquity: string;
    interestCoverage: string;
    betaVsIndex: string;
    earningsStability: string;
    flagsTitle: string;
    riskSummaryTitle: string;
    lowLeverage: string;
    medLeverage: string;
    highLeverage: string;
    goodCoverage: string;
    medCoverage: string;
    highCoverageRisk: string;
    lowVolatility: string;
    medVolatility: string;
    highVolatility: string;
    stableEarnings: string;
    medEarnings: string;
    unstableEarnings: string;
    good: string;
    medium: string;
    weak: string;
    na: string;
    noData: string;
  };

  risk: {
    safetyScore: string;
    riskHighLabel: string;
    riskSafeLabel: string;
    overallRisk: string;
    radarTitle: string;
    radarHint: string;
    warningsTitle: string;
    aiTitle: string;
    verySafe: string;
    safe: string;
    medium: string;
    risky: string;
    highRisk: string;
    safeLabel: string;
    medLabel: string;
    dangerLabel: string;
    metricBeta: string;
    metricDE: string;
    metricCoverage: string;
    metricStability: string;
    metricVolatility: string;
    flagHigh: string;
    flagMed: string;
    // Explanation templates
    explainOpening: (ticker: string, level: string, score: number) => string;
    explainBetaLow: (beta: number) => string;
    explainBetaMed: (beta: number) => string;
    explainBetaHigh: (beta: number) => string;
    explainDELow: (de: number) => string;
    explainDEMed: (de: number) => string;
    explainDEHigh: (de: number) => string;
    explainCovHigh: (cov: number) => string;
    explainCovMed: (cov: number) => string;
    explainCovLow: (cov: number) => string;
    explainStabilityHigh: string;
    explainStabilityMed: string;
    explainStabilityLow: string;
    explainVolLow: (v: number) => string;
    explainVolMed: (v: number) => string;
    explainVolHigh: (v: number) => string;
  };

  technical: {
    rsiTitle: string;
    oversold: string;
    oversoldShort: string;
    neutral: string;
    overbought: string;
    overboughtShort: string;
    signalsTitle: string;
    priceTrend: string;
    macd: string;
    movingAverages: string;
    week52Title: string;
    aboveSMA: string;
    belowSMA: string;
    shortTerm: string;
    medTerm: string;
    longTerm: string;
    volumeTrend: string;
    currentPrice: string;
    weekPosition: string;
    legendUp: string;
    legendDown: string;
    scrollHint: string;
  };

  scenarios: {
    fairValueLabel: string;
    pwvTitle: string;
    growthFCF: string;
    wacc: string;
    terminalG: string;
    vsCurrentPrice: string;
    pessimistic: string;
    base: string;
    optimistic: string;
  };

  report: {
    title: string;
    generating: string;
    generateBtn: string;
    notLoaded: string;
    notLoadedSub: string;
    generateStreaming: string;
    copy: string;
    copied: string;
  };

  news: {
    title: string;
    subtitle: string;
    placeholder: string;
    loadBtn: string;
    sentimentTitle: string;
    overallSentimentLabel: string;
    sentimentPositive: string;
    sentimentNeutral: string;
    sentimentNegative: string;
    impact: string;
    noNews: string;
    errorLabel: string;
  };

  portfolio: {
    title: string;
    subtitle: string;
    addStockTitle: string;
    tickerPh: string;
    sharesPh: string;
    avgCostPh: string;
    addBtn: string;
    empty: string;
    portfolioValue: string;
    pnl: string;
    portfolioScore: string;
    numTickers: string;
    holdingsTitle: (n: number) => string;
    sectorAlloc: string;
    noSector: string;
    loading: string;
    sharesUnit: string;
    sectorOther: string;
  };

  verdict: {
    title: string;
    composite: string;
    targetPrice: string;
    currentPrice: string;
    marginOfSafety: string;
    premium: string;
    priceLabel: string;
    confidence: string;
    modelsUsed: string;
    factorValuation: string;
    factorTechnical: string;
    factorRisk: string;
    factorMomentum: string;
    reasonsTitle: string;
    warningsTitle: string;
    strongBuy: string;
    buy: string;
    hold: string;
    sell: string;
    strongSell: string;
    veryCheap: string;
    cheap: string;
    fair: string;
    expensive: string;
    veryExpensive: string;
    // Reason / warning keys
    discountHigh: (pct: string) => string;
    discountMod: (pct: string) => string;
    premiumHigh: (pct: string) => string;
    premiumMod: (pct: string) => string;
    eyAttractive: string;
    fewModels: string;
    rsiOversold: (rsi: string) => string;
    rsiOverbought: (rsi: string) => string;
    macdBuy: string;
    macdSell: string;
    trendUp: string;
    trendDown: string;
    near52Low: string;
    near52High: string;
    riskLow: string;
    betaHigh: (beta: string) => string;
    deHigh: (de: string) => string;
    riskHigh: string;
  };

  // Translation of backend-returned Vietnamese label values
  labels: {
    veryAttractive: string;
    attractive: string;
    neutral: string;
    expensive: string;
    veryExpensive: string;
    low: string;
    medium: string;
    high: string;
    veryHigh: string;
    pessimistic: string;
    base: string;
    optimistic: string;
    strongUp: string;
    accumulate: string;
    down: string;
    buy: string;
    sell: string;
    wait: string;
    overbought: string;
    oversold: string;
    stabilityHigh: string;
    stabilityMedium: string;
    stabilityLow: string;
  };
}
