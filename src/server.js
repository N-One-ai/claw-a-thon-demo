import fs from "fs";
import path from "path";
import express from "express";
import { config } from "./config.js";
import { analyzeDesign, compareDesigns } from "./llmClient.js";
import { renderMarkdownReport, renderCompareReport, computeOverallScore } from "./report.js";

const app = express();
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.resolve("public")));
app.use("/assets", express.static(path.resolve("assets")));

function resolveImageContent(image) {
  if (!image) return null;
  if (image.url) return image.url;
  if (image.base64) {
    if (!image.mimeType) {
      throw new Error("'mimeType' is required when providing an image as base64.");
    }
    return `data:${image.mimeType};base64,${image.base64}`;
  }
  return null;
}

function loadDefaultBrandGuideline() {
  try {
    const raw = fs.readFileSync(path.resolve(config.brandGuidelinePath), "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`No default brand guideline loaded (${config.brandGuidelinePath}): ${err.message}`);
    return null;
  }
}

function loadDefaultLogoContent(brandGuideline) {
  const logoPath = brandGuideline?.logo?.primaryLogo || config.logoPath;
  try {
    const buffer = fs.readFileSync(path.resolve(logoPath));
    const ext = path.extname(logoPath).slice(1) || "png";
    return `data:image/${ext};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.warn(`No default logo loaded (${logoPath}): ${err.message}`);
    return null;
  }
}

function loadDefaultTrademarkContents(brandGuideline) {
  const variants = brandGuideline?.trademark?.variants || [];
  return variants
    .map((variant) => {
      const file = typeof variant === "string" ? variant : variant.file;
      try {
        const buffer = fs.readFileSync(path.resolve(file));
        const ext = path.extname(file).slice(1) || "png";
        return { file, content: `data:image/${ext};base64,${buffer.toString("base64")}` };
      } catch (err) {
        console.warn(`No trademark variant loaded (${file}): ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

const defaultBrandGuideline = loadDefaultBrandGuideline();
const defaultLogoContent = loadDefaultLogoContent(defaultBrandGuideline);
const defaultTrademarkContents = loadDefaultTrademarkContents(defaultBrandGuideline);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/brand-guideline", (req, res) => {
  res.status(200).json({
    brandGuideline: defaultBrandGuideline,
    logoUrl: defaultLogoContent ? "/assets/logo-primary.png" : null,
  });
});

app.post("/analyze", async (req, res) => {
  try {
    const { image, brandGuideline: requestBrandGuideline, designName } = req.body || {};

    let imageContent;
    try {
      imageContent = resolveImageContent(image);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!imageContent) {
      return res.status(400).json({
        error: "Request body must include 'image.url' or 'image.base64' (with 'image.mimeType').",
      });
    }

    const brandGuideline = requestBrandGuideline ?? defaultBrandGuideline ?? undefined;

    let logoReferenceContent;
    try {
      logoReferenceContent = resolveImageContent(requestBrandGuideline?.logo?.referenceImage);
    } catch (err) {
      return res.status(400).json({ error: `brandGuideline.logo.referenceImage: ${err.message}` });
    }
    if (!logoReferenceContent) {
      logoReferenceContent = defaultLogoContent;
    }

    const trademarkReferenceContents = brandGuideline === defaultBrandGuideline
      ? defaultTrademarkContents
      : loadDefaultTrademarkContents(brandGuideline);

    const analysis = await analyzeDesign({ imageContent, logoReferenceContent, trademarkReferenceContents, brandGuideline, designName });

    const categories = analysis.categories || {};
    if (categories.trademarkCompliance && typeof categories.trademarkCompliance.score !== "number") {
      categories.trademarkCompliance.score = categories.trademarkCompliance.complianceScore ?? null;
    }

    const overallScore = computeOverallScore(categories);
    const report = renderMarkdownReport(analysis, overallScore);

    if (req.query.format === "markdown") {
      res.status(200).type("text/markdown").send(report);
      return;
    }

    res.status(200).json({
      designName: analysis.designName,
      overallScore,
      categories: analysis.categories,
      summary: analysis.summary,
      aiRedesignPrompt: analysis.aiRedesignPrompt,
      report,
    });
  } catch (err) {
    console.error("Analysis failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/compare", async (req, res) => {
  try {
    const { myDesign, competitorDesign, brandGuideline: requestBrandGuideline } = req.body || {};

    if (!myDesign || !competitorDesign) {
      return res.status(400).json({
        error: "Request body must include 'myDesign' and 'competitorDesign'.",
      });
    }

    let myImageContent;
    let competitorImageContent;
    try {
      myImageContent = resolveImageContent(myDesign.image);
      competitorImageContent = resolveImageContent(competitorDesign.image);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!myImageContent) {
      return res.status(400).json({
        error: "Request body must include 'myDesign.image.url' or 'myDesign.image.base64' (with 'image.mimeType').",
      });
    }
    if (!competitorImageContent) {
      return res.status(400).json({
        error: "Request body must include 'competitorDesign.image.url' or 'competitorDesign.image.base64' (with 'image.mimeType').",
      });
    }

    const brandGuideline = requestBrandGuideline ?? defaultBrandGuideline ?? undefined;

    const comparison = await compareDesigns({
      myImageContent,
      competitorImageContent,
      brandGuideline,
      myDesignName: myDesign.designName,
      competitorDesignName: competitorDesign.designName,
    });

    const report = renderCompareReport(comparison);

    if (req.query.format === "markdown") {
      res.status(200).type("text/markdown").send(report);
      return;
    }

    res.status(200).json({ ...comparison, report });
  } catch (err) {
    console.error("Comparison failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`AI Design Critic Agent listening on port ${config.port}`);
});
