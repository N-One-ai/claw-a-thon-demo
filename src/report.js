import { CATEGORY_KEYS, REPORT_SECTION_KEYS, COMPARE_CATEGORY_KEYS } from "./promptBuilder.js";
import { ICONS } from "./icons.js";

const CATEGORY_LABELS = {
  logoCompliance: "Quy chuẩn sử dụng logo",
  trademarkCompliance: "Quy chuẩn trademark Z",
  colorCompliance: "Màu sắc thương hiệu",
  typographyCompliance: "Font chữ thương hiệu",
  visualHierarchy: "Thứ bậc thị giác",
};

const LOGO_CHECK_LABELS = {
  logoPresent: "Có hiển thị logo",
  correctLogo: "Đúng logo thương hiệu",
  notDistorted: "Không bị biến dạng",
  correctColors: "Không đổi màu trái phép",
  correctPosition: "Đúng vị trí",
  sufficientProminence: "Đủ nổi bật",
};

const TRADEMARK_CHECK_LABELS = {
  variantMatch: "Đúng hình dạng biểu tượng",
  colorMatch: "Dùng màu được phép",
  positionMatch: "Bố cục phù hợp",
  prominenceMatch: "Đủ nổi bật",
};

export function computeOverallScore(categories) {
  const scores = CATEGORY_KEYS
    .map((key) => categories?.[key]?.score)
    .filter((score) => typeof score === "number");

  if (scores.length === 0) return null;

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.round(average * 10) / 10;
}

function renderTrademarkDetection(category) {
  const items = [];

  if (typeof category.detected === "boolean") {
    if (category.type === "watermark") {
      items.push(`<li class="status-item">${ICONS.checklistSuccess()}Đã nhận diện watermark Z</li>`);
    } else if (category.detected) {
      items.push(`<li class="status-item">${ICONS.checklistSuccess()}Đã nhận diện: Có</li>`);
    } else {
      items.push(`<li class="status-item">${ICONS.checklistFailure()}Không phát hiện trademark Z</li>`);
    }
  }
  if (typeof category.confidence === "number") {
    items.push(`<li class="metric-item">${ICONS.confidenceMetric()}Độ tin cậy: ${Math.round(category.confidence * 100)}%</li>`);
  }
  if (category.matchedVariant) {
    items.push(`<li class="metric-item">${ICONS.variantMetric()}Đúng phiên bản: <code>${category.matchedVariant}</code></li>`);
  }

  if (items.length === 0) return "";
  return `**Kết quả nhận diện:**\n\n<ul class="checklist">\n${items.join("\n")}\n</ul>\n`;
}

function renderChecklist(checks, labels) {
  if (!checks) return "";
  const items = Object.entries(labels).map(([key, label]) => {
    const value = checks[key];
    const icon = value === true ? ICONS.checklistSuccess() : value === false ? ICONS.checklistFailure() : ICONS.checklistWarning();
    return `<li class="check-item">${icon}${label}</li>`;
  });
  return `**Danh sách kiểm tra:**\n\n<ul class="checklist">\n${items.join("\n")}\n</ul>\n`;
}

const TRADEMARK_CHECK_ICONS = {
  variantMatch: ICONS.variantMatchIcon,
  colorMatch: ICONS.colorMatchIcon,
  positionMatch: ICONS.positionMatchIcon,
  prominenceMatch: ICONS.prominenceMatchIcon,
};

function renderTrademarkChecklist(category) {
  const checks = category.checks;
  if (!checks) return "";
  const items = Object.entries(TRADEMARK_CHECK_LABELS).map(([key, label]) => {
    const value = checks[key];
    const getIcon = TRADEMARK_CHECK_ICONS[key];
    if (key === "prominenceMatch" && value === false && category.type === "watermark") {
      return `<li class="check-item">${getIcon("warning")}Độ nổi bật thấp</li>`;
    }
    const status = value === true ? "success" : value === false ? "danger" : "warning";
    return `<li class="check-item">${getIcon(status)}${label}</li>`;
  });
  return `**Danh sách kiểm tra:**\n\n<ul class="checklist">\n${items.join("\n")}\n</ul>\n`;
}

function renderCategory(index, key, category) {
  const label = CATEGORY_LABELS[key] || key;

  if (category?.score === null || category?.score === undefined) {
    const conclusion = category?.conclusion ? `\n${category.conclusion}\n` : "";
    return `## ${index}. ${label} — Chưa đánh giá\n${conclusion}`;
  }

  const sections = [
    key === "logoCompliance" ? renderChecklist(category.checks, LOGO_CHECK_LABELS) : "",
    key === "trademarkCompliance" ? renderTrademarkDetection(category) : "",
    key === "trademarkCompliance" ? renderTrademarkChecklist(category) : "",
    category.conclusion ? `${category.conclusion}\n` : "",
  ].filter(Boolean).join("\n");

  return `## ${index}. ${label} — ${category.score}/10\n\n${sections}`;
}

function renderConsolidatedFindings(mainIssues, improvementSuggestions) {
  const lines = [];

  if (mainIssues && mainIssues.length > 0) {
    lines.push(`<h2 class="section-title">${ICONS.mainIssues()}Các vấn đề chính</h2>`);
    lines.push("");
    lines.push('<ul class="checklist">');
    mainIssues.forEach((item) => lines.push(`<li class="issue-item">${ICONS.mainIssueItem()}${item}</li>`));
    lines.push("</ul>");
    lines.push("");
  }

  if (improvementSuggestions && improvementSuggestions.length > 0) {
    lines.push(`<h2 class="section-title">${ICONS.improvementSuggestions()}Đề xuất cải thiện</h2>`);
    lines.push("");
    lines.push('<ul class="checklist">');
    improvementSuggestions.forEach((item) => lines.push(`<li class="improvement-item">${ICONS.improvementItem()}${item}</li>`));
    lines.push("</ul>");
    lines.push("");
  }

  return lines.join("\n");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function renderPromptCard(label, value, getIcon) {
  return [
    `<div class="prompt-card" data-expanded="false">`,
    `<div class="prompt-card-header">`,
    `<div class="prompt-card-title">${getIcon()}<strong>Prompt cho ${label}</strong></div>`,
    `<div class="prompt-card-meta">${countWords(value)} từ</div>`,
    `<div class="prompt-card-actions">`,
    `<button type="button" class="prompt-action-btn" data-action="copy-prompt" aria-label="Sao chép prompt">${ICONS.copyAction()}</button>`,
    `<button type="button" class="prompt-action-btn prompt-toggle-btn" data-action="toggle-prompt" aria-label="Xem prompt">${ICONS.chevronRight()}${ICONS.chevronDown()}<span class="toggle-label">Xem prompt</span></button>`,
    `</div>`,
    `</div>`,
    `<div class="prompt-card-body hidden"><pre><code>${escapeHtml(value)}</code></pre></div>`,
    `</div>`,
  ].join("\n");
}

function renderAiRedesignPrompt(aiRedesignPrompt) {
  if (!aiRedesignPrompt) return "";

  const lines = [`<h2 class="section-title">${ICONS.redesignPrompt()}Gợi ý cải tiến thiết kế bằng Prompt mới</h2>`, ""];

  const variants = [
    ["ChatGPT", aiRedesignPrompt.chatgptPrompt, ICONS.chatgptPrompt],
    ["Gemini", aiRedesignPrompt.geminiPrompt, ICONS.geminiPrompt],
  ];

  variants.forEach(([label, value, getIcon]) => {
    if (!value) return;
    lines.push(renderPromptCard(label, value, getIcon));
    lines.push("");
  });

  return lines.join("\n");
}

const COMPARE_CATEGORY_LABELS = {
  visualImpact: "Tác động thị giác",
  brandCompliance: "Tuân thủ thương hiệu",
  logoVisibility: "Độ nổi bật logo",
  typography: "Font chữ",
  colorUsage: "Sử dụng màu sắc",
};

const COMPARE_WINNER_LABELS = {
  my: "Của tôi",
  competitor: "Đối thủ",
  tie: "Hòa",
};

export function renderCompareReport(comparison) {
  const lines = [];

  lines.push(`# Báo cáo so sánh thiết kế — ${comparison.myDesignName || "Thiết kế của tôi"} vs ${comparison.competitorDesignName || "Thiết kế đối thủ"}`);
  lines.push("");

  if (comparison.summary) {
    lines.push("## Tóm tắt");
    lines.push("");
    lines.push(comparison.summary);
    lines.push("");
  }

  lines.push("## Bảng so sánh");
  lines.push("");
  lines.push("| Hạng mục | Điểm của tôi | Điểm đối thủ | Bên tốt hơn |");
  lines.push("|---|---|---|---|");

  COMPARE_CATEGORY_KEYS.forEach((key) => {
    const category = comparison.categories?.[key];
    if (!category) return;
    const label = COMPARE_CATEGORY_LABELS[key] || key;
    const myScore = typeof category.myScore === "number" ? `${category.myScore}/10` : "—";
    const competitorScore = typeof category.competitorScore === "number" ? `${category.competitorScore}/10` : "—";
    const winner = COMPARE_WINNER_LABELS[category.winner] || category.winner || "—";
    lines.push(`| ${label} | ${myScore} | ${competitorScore} | ${winner} |`);
  });
  lines.push("");

  if (comparison.overallWinner) {
    lines.push(`**Tổng kết:** ${COMPARE_WINNER_LABELS[comparison.overallWinner] || comparison.overallWinner}`);
    lines.push("");
  }

  lines.push("## Chi tiết theo hạng mục");
  lines.push("");

  COMPARE_CATEGORY_KEYS.forEach((key) => {
    const category = comparison.categories?.[key];
    if (!category) return;
    const label = COMPARE_CATEGORY_LABELS[key] || key;

    lines.push(`### ${label}`);
    lines.push("");

    if (category.conclusion) {
      lines.push(category.conclusion);
      lines.push("");
    }
  });

  const findingsSection = renderConsolidatedFindings(comparison.mainIssues, comparison.recommendations);
  if (findingsSection) {
    lines.push(findingsSection);
  }

  lines.push("---");
  lines.push("_Được tạo bởi AI Design Critic Agent_");

  return lines.join("\n");
}

export function renderMarkdownReport(analysis, overallScore) {
  const lines = [];

  lines.push(`# Báo cáo đánh giá thiết kế AI — ${analysis.designName || "Thiết kế chưa có tên"}`);
  lines.push("");
  lines.push(`**Điểm tổng thể:** ${overallScore !== null ? `${overallScore}/10` : "Chưa xác định"}`);
  lines.push("");

  if (analysis.summary) {
    lines.push("## Tóm tắt");
    lines.push("");
    lines.push(analysis.summary);
    lines.push("");
  }

  REPORT_SECTION_KEYS.forEach((key, idx) => {
    lines.push(renderCategory(idx + 1, key, analysis.categories?.[key]));
    lines.push("");
  });

  const findingsSection = renderConsolidatedFindings(analysis.mainIssues, analysis.improvementSuggestions);
  if (findingsSection) {
    lines.push(findingsSection);
    lines.push("");
  }

  const redesignSection = renderAiRedesignPrompt(analysis.aiRedesignPrompt);
  if (redesignSection) {
    lines.push(redesignSection);
    lines.push("");
  }

  lines.push("---");
  lines.push("_Được tạo bởi AI Design Critic Agent_");

  return lines.join("\n");
}
