// Centralized icon helpers for the Markdown report.
// All icons are rendered as Lucide placeholders (`<i data-lucide="...">`),
// converted to inline SVG client-side via `lucide.createIcons()`. No emoji or
// custom SVG badges are used anywhere in the report — only Lucide Icons.

const ZALOPAY_COLORS = {
  blue: "#0033C9",
  green: "#00CF6A",
  orange: "#FF8A00",
  red: "#FF4D4F",
  alertRed: "#EF4444",
};

// Status -> color mapping shared by every status-driven icon in the report.
const STATUS_COLORS = {
  success: ZALOPAY_COLORS.green,
  warning: ZALOPAY_COLORS.orange,
  danger: ZALOPAY_COLORS.alertRed,
};

// Lucide icon placeholder, 18px, stroke-width 2, colored by status (or an explicit color).
function lucideIcon(name, status, size = 18) {
  const color = STATUS_COLORS[status] || status;
  return `<i data-lucide="${name}" class="checklist-icon" style="color:${color};width:${size}px;height:${size}px;" stroke-width="2" aria-hidden="true"></i>`;
}

const ICONS = {
  // Consolidated findings section headings and list item icons
  mainIssues: () => lucideIcon("alert-triangle", "danger"),
  mainIssueItem: () => lucideIcon("alert-triangle", "danger"),
  improvementSuggestions: () => lucideIcon("lightbulb", "success"),
  improvementItem: () => lucideIcon("lightbulb", "success"),

  // AI redesign prompt section
  redesignPrompt: () => lucideIcon("sparkles", "success"),
  chatgptPrompt: () => lucideIcon("bot", "success"),
  geminiPrompt: () => lucideIcon("bot", "success"),

  // Generic checklist / detection status icons
  checklistSuccess: () => lucideIcon("circle-check-big", "success"),
  checklistFailure: () => lucideIcon("circle-x", "danger"),
  checklistWarning: () => lucideIcon("alert-triangle", "warning"),

  // Detection result metric rows (confidence, matched variant)
  confidenceMetric: () => lucideIcon("gauge", "success"),
  variantMetric: () => lucideIcon("file-check", "success"),

  // Trademark checklist — fixed icon per check, colored by pass/fail/warning status
  variantMatchIcon: (status) => lucideIcon("shapes", status),
  colorMatchIcon: (status) => lucideIcon("paint-bucket", status),
  positionMatchIcon: (status) => lucideIcon("layout-grid", status),
  prominenceMatchIcon: (status) => lucideIcon("eye", status),

  // Prompt card affordances
  chevronDown: () => lucideIcon("chevron-down", "#9aa3b2"),
  chevronRight: () => lucideIcon("chevron-right", "#9aa3b2"),
  copyAction: () => lucideIcon("copy", ZALOPAY_COLORS.blue),
};

export { ICONS, ZALOPAY_COLORS, STATUS_COLORS };
