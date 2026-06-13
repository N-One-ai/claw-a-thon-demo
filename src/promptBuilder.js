// Order matches the report's section order, and all of these feed the overall score.
const CATEGORY_KEYS = [
  "logoCompliance",
  "trademarkCompliance",
  "colorCompliance",
  "typographyCompliance",
  "visualHierarchy",
];

const REPORT_SECTION_KEYS = CATEGORY_KEYS;

function categorySchema(extra = {}) {
  return {
    score: "number 1-10",
    conclusion: "string - 1-2 sentences giving a concise verdict for this category only. Do not repeat issues or recommendations listed in mainIssues/improvementSuggestions.",
    ...extra,
  };
}

const RESPONSE_SCHEMA_EXAMPLE = {
  designName: "string",
  summary: "string - 2-4 sentences overall impression",
  categories: {
    logoCompliance: {
      score: "number 0-10, or null if no logo reference/guideline was provided",
      checks: {
        logoPresent: "boolean - is the brand logo visible in the design",
        correctLogo: "boolean - matches the official brand logo (not a different/fake logo)",
        notDistorted: "boolean - aspect ratio/proportions are preserved (not stretched or squished)",
        correctColors: "boolean - logo colors match the approved variant (no unauthorized recoloring)",
        correctPosition: "boolean - placement matches guideline expectations (e.g. clear space, preferred positions)",
        sufficientProminence: "boolean - logo is large/visible enough to be noticed",
      },
      conclusion: "string - 1-2 sentences giving a concise verdict for logo compliance only",
    },
    trademarkCompliance: {
      detected: "boolean - true if a shape matching the brand's decorative Z trademark silhouette is recognizable anywhere in the design, whether as an explicit/prominent element OR as a faint background watermark (see 'type'). False only if no such shape is found anywhere, including after searching for a faded background watermark.",
      type: "string - one of 'explicit' (the Z trademark shape is clearly/prominently visible as a design element), 'watermark' (the Z trademark shape is present only as a faded background watermark — low opacity ~5-40%, a tint close to the background color, partially covered by other content, blurred, glowing, or placed behind/under other elements), or 'none' (no Z trademark shape found anywhere, even after checking for a background watermark)",
      confidence: "number 0-1 - confidence that the detected shape is the brand's Z trademark, based on shape/silhouette and overall visual similarity (NOT exact pixel matching). 0 if type is 'none'.",
      matchedVariant: "string - the file path of the closest-matching reference variant (from the provided list) by shape, or null if type is 'none' or no reference variants were provided",
      checks: {
        variantMatch: "boolean - the detected shape's silhouette/outline closely matches one of the approved reference variants, allowing for rotation up to ±30 degrees, different scale, recoloring, and 3D/gradient/shadow/glow styling",
        colorMatch: "boolean - rendered using one of the brand's allowed trademark colors (recoloring, gradients, glow, low-opacity/watermark tints, and near-background tints derived from an allowed color still count)",
        positionMatch: "boolean - placement (including as a background watermark, partial, cropped, or partially covered element) fits the composition without obstructing key content",
        prominenceMatch: "boolean - large/visible enough to register with the viewer at a glance. For type 'watermark', this is often false (a subtle watermark is expected to have low prominence) — that alone should NOT be treated as a failure to detect the trademark.",
      },
      complianceScore: "number 0-10, or null if no trademark guideline was provided. Scoring tiers: 10 = type 'explicit' AND variantMatch AND colorMatch AND positionMatch AND prominenceMatch all true; 7-9 = type 'explicit', clearly present but altered (recolored, rotated, rescaled, or styled with 3D/gradient/shadow/glow), so one or more of variantMatch/colorMatch/positionMatch is false; 6-9 = type 'watermark' (a Z-shaped watermark was found), scored within this range based on how visible/legible the watermark is — a watermark detection must NEVER be scored 0 even if prominenceMatch is false; 0 = type 'none', no Z trademark shape found anywhere including as a watermark.",
      score: "number - must be identical to complianceScore (kept for consistency with other categories' scoring)",
      conclusion: "string - 1-2 sentences giving a concise verdict for trademark compliance only. If type is 'watermark', describe the watermark (opacity, position, color) and that it counts as compliant placement. If type is 'none', state clearly that the required trademark is missing, including as a watermark.",
    },
    colorCompliance: {
      score: "number 0-10, or null if the brand guideline did not specify colors",
      conclusion: "string - 1-2 sentences giving a concise verdict for color compliance only",
    },
    typographyCompliance: {
      score: "number 0-10, or null if the brand guideline did not specify typography",
      conclusion: "string - 1-2 sentences giving a concise verdict for typography compliance only",
    },
    visualHierarchy: categorySchema(),
  },
  mainIssues: ["string - a key problem found across the entire design, consolidated and de-duplicated across categories (do not repeat the same issue twice)"],
  improvementSuggestions: ["string - concrete, actionable improvement addressing one of the mainIssues (specific color/hex change, size/scale change, position/alignment change, spacing/padding change, or contrast change). No generic advice."],
  aiRedesignPrompt: {
    chatgptPrompt: "string - a complete, ready-to-use image-generation prompt for ChatGPT (GPT Image), at most 12 lines, one concise idea per line, describing the redesigned design while preserving brand identity",
    geminiPrompt: "string - a complete, ready-to-use image-generation prompt for Gemini, at most 12 lines, one concise idea per line, describing the redesigned design while preserving brand identity",
  },
};

const COMPARE_CATEGORY_KEYS = [
  "visualImpact",
  "brandCompliance",
  "logoVisibility",
  "typography",
  "colorUsage",
];

function compareCategorySchema() {
  return {
    myScore: "number 0-10",
    competitorScore: "number 0-10",
    winner: "string - one of 'my', 'competitor', 'tie' - which design performs better in this category",
    conclusion: "string - 1-2 sentences giving a concise verdict for this category only. Do not repeat issues or recommendations listed in mainIssues/recommendations.",
  };
}

const COMPARE_RESPONSE_SCHEMA_EXAMPLE = {
  myDesignName: "string",
  competitorDesignName: "string",
  categories: {
    visualImpact: compareCategorySchema(),
    brandCompliance: compareCategorySchema(),
    logoVisibility: compareCategorySchema(),
    typography: compareCategorySchema(),
    colorUsage: compareCategorySchema(),
  },
  overallWinner: "string - one of 'my', 'competitor', 'tie', based on the overall balance of category scores",
  summary: "string - 2-4 sentences summarizing how the two designs compare overall",
  mainIssues: ["string - a key way 'My Design' underperforms compared to the competitor, consolidated and de-duplicated across categories (do not repeat the same issue twice)"],
  recommendations: ["string - concrete, actionable edits to apply to 'My Design', inspired specifically by what the competitor design does better (e.g. a color/hex change, a size/scale change, a position/alignment change, a spacing change, a contrast change, or a copy/CTA wording change). No generic advice."],
};

export function buildCompareMessages({ myImageContent, competitorImageContent, brandGuideline, myDesignName, competitorDesignName, language }) {
  const systemPrompt = `You are a senior design critic and competitive analyst with 15+ years of experience across UI/UX, branding, advertising creative, and conversion rate optimization.

You will be shown two design images:
1. "My Design" — our own design, which should comply with the brand guideline provided below (if any).
2. "Competitor Design" — a competitor's design, used only as a benchmark for comparison (it is NOT expected to follow our brand guideline).

Compare the two designs head-to-head across the following categories:
- visualImpact: overall visual impact and ability to grab attention at a glance (use of color, contrast, imagery, scale, composition).
- brandCompliance: for "My Design", how well it complies with the brand guideline below (colors, logo, typography, tone). For "Competitor Design", judge general design/brand polish, consistency, and professionalism (it is not measured against our guideline).
- logoVisibility: how visible, prominent, and well-placed each design's logo/brand mark is.
- typography: quality, hierarchy, readability, and consistency of typography in each design.
- colorUsage: effectiveness, harmony, and contrast of color usage in each design (for "My Design", also weigh adherence to the brand's color palette and ratios if specified).

For each category, score both designs from 0 (very poor) to 10 (excellent) using whole or half-point numbers, declare a "winner" ("my", "competitor", or "tie"), and write a "conclusion" — 1-2 sentences giving a concise verdict for that category only, with specific visual details. Do NOT list strengths, weaknesses, or recommendations per category — those belong only in the consolidated lists below.

Then provide:
- "overallWinner": "my", "competitor", or "tie", based on the overall balance of category scores.
- "summary": 2-4 sentences summarizing how the two designs compare overall.
- "mainIssues": a consolidated, de-duplicated list of the key ways "My Design" underperforms compared to the competitor across all categories (do not repeat the same issue twice).
- "recommendations": a consolidated, de-duplicated list of concrete, actionable edits to apply to "My Design", inspired specifically by what the competitor does better — specify a color/hex change, a size/scale change, a position/alignment change, a spacing change, a contrast change, or a copy/CTA wording change where relevant (with approximate values where relevant, e.g. "#0033C9", "increase to 120px", "move 24px left"). Do NOT write generic advice.

${brandGuideline ? `Brand guideline (JSON) for "My Design" to check compliance against:\n${JSON.stringify(brandGuideline, null, 2)}` : "No brand guideline was provided. Judge \"My Design\"'s brandCompliance on general design polish and consistency instead, the same way as the competitor."}

Write all text content (conclusion, summary, mainIssues, recommendations) in the following language: ${language}.
When writing Vietnamese text, use normal sentence case — capitalize only the first letter of each sentence (and proper nouns/acronyms like "Zalopay", "CTA", "AI"). Do NOT use Title Case (do not capitalize every word).

Respond with ONLY a single valid JSON object (no markdown code fences, no extra commentary) matching exactly this shape:
${JSON.stringify(COMPARE_RESPONSE_SCHEMA_EXAMPLE, null, 2)}`;

  const userContent = [
    { type: "text", text: `My Design name: ${myDesignName || "Untitled design"}` },
    { type: "text", text: "My Design image:" },
    { type: "image_url", image_url: { url: myImageContent } },
    { type: "text", text: `Competitor Design name: ${competitorDesignName || "Untitled competitor design"}` },
    { type: "text", text: "Competitor Design image:" },
    { type: "image_url", image_url: { url: competitorImageContent } },
  ];

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

export function buildMessages({ imageContent, logoReferenceContent, trademarkReferenceContents, brandGuideline, designName, language }) {
  const systemPrompt = `You are a senior design critic with 15+ years of experience across UI/UX, branding, advertising creative, and conversion rate optimization.
You will be shown a design image (e.g. an ad banner, landing page, or marketing asset) and must evaluate it across the following categories:

- logoCompliance: a focused audit of the brand logo's usage in the design, evaluated against six checks:
  1. logoPresent — is the logo visible anywhere in the design?
  2. correctLogo — is it the brand's actual logo (matching the reference logo image, if one was provided)?
  3. notDistorted — is it shown with correct proportions (not stretched, squished, or skewed)?
  4. correctColors — are the logo's colors unmodified / an approved variant (no unauthorized recoloring)?
  5. correctPosition — is it placed according to the guideline's positioning/clear-space rules (if specified)?
  6. sufficientProminence — is it large/visible enough to be noticed without straining?
  Set "score" to null only if no logo guideline or reference image was provided at all. If a guideline/reference was provided but the logo is simply missing from the design, set "logoPresent" to false, all other checks to false, and "score" to 0.
- trademarkCompliance: a focused audit of the brand's decorative "Z" trademark shape, based on SHAPE and VISUAL similarity rather than exact pixel/image matching. The trademark may appear in many forms — large or small, cropped, partially visible, recolored to any of the brand's allowed colors, rendered with 3D effects/gradients/shadows/glow, rotated up to ±30 degrees, or scaled to a very different size than the reference variants. ALL of these variations still count as the trademark — recognize it by its overall shape/silhouette (the distinctive "Z" outline), not by comparing pixels or exact image content against the reference variants.
  IMPORTANT — two-pass search: First look for an EXPLICIT/prominent Z trademark. If none is found, do a SECOND pass specifically looking for the Z shape used as a BACKGROUND WATERMARK before concluding it is absent. A watermark counts as detected if the Z shape is present with any of: opacity roughly 5-40%, a tint very close to the background color, partially covered/obscured by other elements, blurred or glowing edges, or placed behind/under other content. Only conclude the trademark is entirely absent (type "none") after both passes find nothing.
  Evaluate:
  1. detected — is a Z-trademark-shaped element present anywhere, as either an explicit element or a background watermark (per the two-pass search above)? False only if type is "none".
  2. type — "explicit" (prominent/clear Z trademark element), "watermark" (Z shape found only as a faded/blurred/partially-covered background watermark per the criteria above), or "none" (no Z shape found even after the watermark pass).
  3. confidence (0-1) — how confident are you that the detected shape is the brand's Z trademark, based on shape/silhouette and overall visual similarity (not exact pixel matching). 0 if type is "none".
  4. matchedVariant — which of the provided reference variant file paths has the most similar shape/silhouette to what was detected (or null if type is "none")?
  5. variantMatch — does the detected shape's silhouette closely match one of the reference variants (allowing rotation up to ±30°, rescaling, recoloring, and 3D/gradient/shadow/glow styling)?
  6. colorMatch — is it rendered in one of the brand's allowed trademark colors (including recolored, gradient, glow, low-opacity watermark, or near-background tints derived from an allowed color)?
  7. prominenceMatch — is it large/visible enough to register with the viewer at a glance? For type "watermark" this is often and expectedly false — that alone is NOT a failure to detect the trademark.
  8. positionMatch — does its placement (including as a background watermark, partially covered, or behind other content) fit the composition without obstructing key content?
  Scoring ("complianceScore", which "score" must equal):
  - 10/10 — type "explicit" AND variantMatch AND colorMatch AND positionMatch AND prominenceMatch are all true (correct shape, correct color, correct placement/prominence).
  - 7-9/10 — type "explicit", clearly recognizable, but modified (recolored differently, rotated, rescaled, or styled with 3D/gradient/shadow/glow) so one or more of variantMatch/colorMatch/positionMatch is false.
  - 6-9/10 — type "watermark": a Z-shaped watermark was found per the two-pass search. Score within this range based on how visible/legible the watermark is (higher = easier to notice). NEVER score a watermark detection as 0, even when prominenceMatch is false.
  - 0/10 — type "none": no Z trademark shape found anywhere, including after the watermark pass.
  Set "complianceScore" (and "score") to null only if no trademark guideline was provided at all. If a trademark guideline was provided but type is "none", set "detected" to false, "confidence" to 0, "matchedVariant" to null, all checks (variantMatch/colorMatch/positionMatch/prominenceMatch) to false, "complianceScore"/"score" to 0, and state clearly in "conclusion" that the required trademark is missing, including as a watermark. If type is "watermark" or "explicit", confirm in "conclusion" which checks pass/fail and why (shape/variant match, color, prominence, position), describe the watermark if applicable (opacity, position, color), and justify the score tier.
- colorCompliance: how well the design's color palette matches the brand guideline's colors (exact/approved hex values, color balance and ratios if specified, allowed accent colors). Set to null if the guideline did not specify colors.
- typographyCompliance: whether the fonts and typographic style used in the design match the guideline's typography rules (font family, style descriptors like "geometric" or "modern sans-serif"). Set to null if the guideline did not specify typography.
- visualHierarchy: how effectively the design guides the viewer's eye through the content in order of importance (size, contrast, position, grouping).

For each category, write a "conclusion": 1-2 sentences giving a concise verdict for that category only, citing specific visual details. Do NOT list strengths, weaknesses, or recommendations per category, and do NOT repeat the same point across multiple categories — all issues and recommendations belong only in the consolidated "mainIssues" and "improvementSuggestions" lists below.

After evaluating all categories, produce two consolidated, de-duplicated top-level lists:
- "mainIssues": the key problems found across the entire design. Each issue should appear only once, even if it relates to multiple categories.
- "improvementSuggestions": concrete, actionable improvements addressing the issues above — specify a color/hex change, a size/scale change, a position/alignment change, a spacing/padding change, or a contrast change (with approximate values where relevant, e.g. "#0033C9", "increase to 120px", "move 24px left", "add 16px padding above"). Do NOT write generic advice (e.g. "improve hierarchy", "make it more balanced", "consider adding more contrast").

Then produce "aiRedesignPrompt" describing an improved redesign of this design that fixes every issue in "improvementSuggestions":
- "chatgptPrompt" and "geminiPrompt": two short, ready-to-use image-generation prompts (one for ChatGPT/GPT Image, one for Gemini) describing the redesigned composition. Do not restate "mainIssues" or "improvementSuggestions" as separate lists — fold them directly into the prompt content (e.g. via the elements/colors/layout described in each line).

IMPORTANT rules for "chatgptPrompt" and "geminiPrompt":
- At most 12 lines each, one concise idea per line (e.g. subject/composition, logo placement, "Z" trademark placement, color palette, typography, CTA, mood). Keep them short and easy to copy — do NOT write long paragraphs.
- Prioritize a pastel blue derived from the brand's primary color #0033C9 and a pastel green derived from the brand's secondary color #00CF6A (light/desaturated tones) for the overall palette, while keeping the logo and trademark in their correct brand colors.
- The overall mood must feel soft/gentle (nhẹ nhàng), modern (hiện đại), friendly (thân thiện), and tech-forward (công nghệ) — describe this mood explicitly in both prompts.
- The CTA must use one of the brand guideline's approved accent colors.
- Both prompts must explicitly reference: the latest Zalopay logo and its placement, the "Z" trademark shape/color, the Aeonik Pro typography, the brand's color palette (with hex codes, prioritizing the pastel blue/green above), and the brand's tone.
- Base both prompts on the brand guideline, the latest Zalopay logo, the "Z" trademark, and the evaluation results above (mainIssues/improvementSuggestions) — do not invent unrelated elements.

All "aiRedesignPrompt" fields must be written in the following language: ${language}.

${logoReferenceContent ? "An additional image is included in this message: the brand's official primary logo. Use it to evaluate \"correctLogo\", \"notDistorted\", and \"correctColors\" in logoCompliance." : ""}
${trademarkReferenceContents && trademarkReferenceContents.length > 0 ? `Additional images are included in this message: ${trademarkReferenceContents.length} approved reference variant(s) of the brand's decorative "Z" trademark shape (file paths: ${trademarkReferenceContents.map((v) => v.file).join(", ")}). Use them only as a guide to the trademark's SHAPE/SILHOUETTE — to evaluate "detected", "type", "confidence", "matchedVariant", and "variantMatch" in trademarkCompliance, judge by overall shape similarity (accounting for recoloring, 3D/gradient/shadow/glow, rotation up to ±30°, rescaling, and faded/blurred background watermarks per the two-pass search), not by exact pixel/image comparison.` : ""}

Scoring rules:
- Score every category from 1 (very poor) to 10 (excellent) — logoCompliance, trademarkCompliance, colorCompliance, and typographyCompliance use 0-10 — using whole or half-point numbers.
- If a brand guideline IS provided (as JSON), compare the design's colors, fonts, logo usage, and spacing against it and explain concrete matches/mismatches, citing the specific guideline values (e.g. exact hex codes, font names, color balance percentages) in the relevant category's "conclusion" or in "mainIssues"/"improvementSuggestions".
- Be specific and reference what you actually see in the image (e.g. exact colors, font styles, alignment, spacing issues).
- Write all text content (summary, conclusion, mainIssues, improvementSuggestions) in the following language: ${language}.
- When writing Vietnamese text, use normal sentence case — capitalize only the first letter of each sentence (and proper nouns/acronyms like "Zalopay", "CTA", "AI"). Do NOT use Title Case (do not capitalize every word).

Respond with ONLY a single valid JSON object (no markdown code fences, no extra commentary) matching exactly this shape:
${JSON.stringify(RESPONSE_SCHEMA_EXAMPLE, null, 2)}`;

  const userTextParts = [];
  userTextParts.push(`Design name: ${designName || "Untitled design"}`);

  if (brandGuideline) {
    userTextParts.push(
      `Brand guideline (JSON) to check compliance against:\n${JSON.stringify(brandGuideline, null, 2)}`
    );
  } else {
    userTextParts.push("No brand guideline was provided. Skip the logo, color, and typography compliance checks (set scores to null).");
  }

  const userContent = [{ type: "text", text: userTextParts.join("\n\n") }];

  userContent.push({ type: "text", text: "Design image to evaluate:" });
  userContent.push({ type: "image_url", image_url: { url: imageContent } });

  if (logoReferenceContent) {
    userContent.push({ type: "text", text: "Brand's official primary logo (reference image):" });
    userContent.push({ type: "image_url", image_url: { url: logoReferenceContent } });
  }

  if (trademarkReferenceContents && trademarkReferenceContents.length > 0) {
    trademarkReferenceContents.forEach((variant, idx) => {
      userContent.push({ type: "text", text: `Brand's approved "Z" trademark variant ${idx + 1} of ${trademarkReferenceContents.length} (file: ${variant.file}):` });
      userContent.push({ type: "image_url", image_url: { url: variant.content } });
    });
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

export { CATEGORY_KEYS, REPORT_SECTION_KEYS, COMPARE_CATEGORY_KEYS };
