import { config } from "./config.js";
import { buildMessages, buildCompareMessages } from "./promptBuilder.js";

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

async function callLlm(messages) {
  if (!config.llm.apiKey) {
    throw new Error("LLM_API_KEY is not configured");
  }

  const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response did not contain any content");
  }

  try {
    return extractJson(content);
  } catch (err) {
    throw new Error(`Failed to parse LLM response as JSON: ${err.message}\nRaw response: ${content}`);
  }
}

export async function analyzeDesign({ imageContent, logoReferenceContent, trademarkReferenceContents, brandGuideline, designName }) {
  const messages = buildMessages({
    imageContent,
    logoReferenceContent,
    trademarkReferenceContents,
    brandGuideline,
    designName,
    language: config.reportLanguage,
  });

  return callLlm(messages);
}

export async function compareDesigns({ myImageContent, competitorImageContent, brandGuideline, myDesignName, competitorDesignName }) {
  const messages = buildCompareMessages({
    myImageContent,
    competitorImageContent,
    brandGuideline,
    myDesignName,
    competitorDesignName,
    language: config.reportLanguage,
  });

  return callLlm(messages);
}
