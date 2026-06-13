# AI Design Critic Agent

A Node.js agent that critiques design images using a vision-capable LLM. It evaluates **logo
compliance**, **color compliance**, **typography compliance**, **visual hierarchy**, **layout
balance**, **CTA effectiveness**, and an overall **brand compliance** summary — scores each
category from 1–10 (logo/color/typography/brand compliance use 0–10), and produces a Markdown
report.

## Features

- Accepts a design image as a URL or base64-encoded data
- Compares the design against a project-level brand identity defined in `brand-guideline.json`
  and `assets/logo-primary.png` (can be overridden per-request)
- Per-category scoring with strengths, weaknesses, and recommendations
- Overall score (average of the 6 design-quality categories)
- Composite brand compliance score derived from logo, color, typography, and tone compliance
- Markdown report output
- Simple web UI (`/`) for uploading a design image, viewing the current brand identity, and
  running an analysis
- Built for deployment on GreenNode AgentBase (Custom Agent / Docker)

## Web UI

Open `http://localhost:8080/` in a browser. The page shows the current brand logo and a summary
of `brand-guideline.json`, lets you upload (or drag & drop) a design image, optionally name it,
and click **Analyze** to call `/analyze` and render the returned Markdown report.

## Brand Identity Files

- **`brand-guideline.json`** — the brand's colors, typography, tone, design principles, and logo
  rules. Loaded automatically for every `/analyze` request unless the request body supplies its
  own `brandGuideline`.
- **`assets/logo-primary.png`** (path configurable via `brand-guideline.json`'s `logo.primaryLogo`,
  or the `LOGO_PATH` env var) — the official primary logo, sent to the LLM alongside the design
  image so `logoCompliance` can directly compare the logo used in the design against it.

To critique designs for a different brand, edit `brand-guideline.json` and replace the logo file(s)
in `assets/`, or override both per-request (see the API section below).

## Requirements

- Node.js >= 18
- An OpenAI-compatible vision LLM endpoint (default: GreenNode AI Platform)

## Setup

```bash
npm install
cp .env.example .env
# fill in LLM_API_KEY (see /agentbase-llm to get a GreenNode AI Platform key)
npm start
```

The server listens on `http://0.0.0.0:8080` by default (configurable via `PORT`).

## Configuration

| Env var | Description | Default |
|---|---|---|
| `PORT` | HTTP port | `8080` |
| `LLM_API_KEY` | API key for the vision LLM | _(required)_ |
| `LLM_BASE_URL` | OpenAI-compatible base URL | `https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1` |
| `LLM_MODEL` | Vision-capable model name | `gpt-4o` |
| `REPORT_LANGUAGE` | Language for report text (e.g. `vi`, `en`) | `vi` |
| `BRAND_GUIDELINE_PATH` | Path to the default brand guideline JSON | `./brand-guideline.json` |
| `LOGO_PATH` | Path to the default primary logo image | `./assets/logo-primary.png` |

## API

### `GET /health`

Returns `200 { "status": "ok" }`. Used by AgentBase for liveness checks.

### `POST /analyze`

Request body:

```json
{
  "designName": "Landing Page Hero v2",
  "image": {
    "url": "https://example.com/design.png"
  }
}
```

- `image.url` **or** `image.base64` + `image.mimeType` is required (the design to critique).
- `brandGuideline` is optional. If omitted, the project's `brand-guideline.json` and
  `assets/logo-primary.png` are used by default. If provided, it fully replaces the default
  guideline for this request (and `brandGuideline.logo.referenceImage`, as `url` or
  `base64`+`mimeType`, replaces the default logo image).

Response (JSON):

```json
{
  "designName": "Landing Page Hero v2",
  "overallScore": 7.6,
  "categories": {
    "logoCompliance": {
      "score": 7,
      "checks": {
        "logoPresent": true, "correctLogo": true, "notDistorted": true,
        "correctColors": false, "correctPosition": true, "sufficientProminence": true
      },
      "strengths": [...], "weaknesses": [...], "recommendations": [...], "notes": "..."
    },
    "colorCompliance": { "score": 8, "strengths": [...], "weaknesses": [...], "recommendations": [...], "notes": "..." },
    "typographyCompliance": { "score": 6, "strengths": [...], "weaknesses": [...], "recommendations": [...], "notes": "..." },
    "visualHierarchy": { "score": 8, "strengths": [...], "weaknesses": [...], "recommendations": [...] },
    "layoutBalance": { ... },
    "ctaEffectiveness": { ... },
    "brandCompliance": {
      "score": 7,
      "toneScore": 7, "logoScore": 7, "colorScore": 8, "typographyScore": 6,
      "strengths": [...], "weaknesses": [...], "recommendations": [...], "notes": "..."
    }
  },
  "summary": "...",
  "report": "# AI Design Critic Report — ...\n\n**Overall Score:** 7.6/10\n..."
}
```

`brandCompliance.score` is computed by the agent as the average of `logoCompliance.score`,
`colorCompliance.score`, `typographyCompliance.score`, and `brandCompliance.toneScore` (nulls
excluded). `overallScore` is the average of the other 6 category scores (logo/color/typography
compliance, visual hierarchy, layout balance, CTA effectiveness) — brand compliance is a summary
of those, not counted again.

Add `?format=markdown` to get the raw Markdown report (`Content-Type: text/markdown`) instead of JSON:

```bash
curl -s -X POST "http://localhost:8080/analyze?format=markdown" \
  -H "Content-Type: application/json" \
  -d @examples/sample-request.json
```

Sample request bodies are in `examples/`.

## Docker

```bash
docker build -t ai-design-critic-agent .
docker run --rm -p 8080:8080 --env-file .env ai-design-critic-agent
```

## Deploying to AgentBase

This project follows the AgentBase Custom Agent contract: it serves `GET /health` (200 OK) and
listens on `0.0.0.0:8080`. To deploy, use the `/agentbase-deploy` skill, which will build this
Docker image, push it to a container registry, and create/update an agent runtime. Configure
`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and `REPORT_LANGUAGE` as runtime environment variables.
