export const config = {
  port: process.env.PORT || 8080,
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || "https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1",
    model: process.env.LLM_MODEL || "gpt-4o",
  },
  reportLanguage: process.env.REPORT_LANGUAGE || "vi",
  brandGuidelinePath: process.env.BRAND_GUIDELINE_PATH || "./brand-guideline.json",
  logoPath: process.env.LOGO_PATH || "./assets/logo-primary.png",
};
