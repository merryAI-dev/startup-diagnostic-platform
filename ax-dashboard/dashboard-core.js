(function initDashboardCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AXDashboardCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createDashboardCore() {
  const STAGE_LABELS = {
    A: "내부 검증",
    B: "의사결정 검토",
    C: "일부 사용자 테스트",
    D: "배포/전환",
    L: "라이브 운영",
  };

  const DONE_STATUSES = new Set(["done", "completed", "closed"]);
  const BLOCKED_STATUSES = new Set(["blocked", "stalled"]);

  function getStageLabel(stage) {
    return STAGE_LABELS[String(stage || "").trim().toUpperCase()] || "단계 미정";
  }

  function parseGitGanttMetadata(body) {
    const source = String(body || "");
    const read = (key) => {
      const match = source.match(new RegExp(`<!--\\s*gitgantt:${key}:([^>]+?)\\s*-->`, "i"));
      return match ? match[1].trim() : "";
    };
    return {
      startDate: read("start"),
      endDate: read("end"),
      owner: read("assignee"),
      status: read("status"),
    };
  }

  function isDone(status) {
    return DONE_STATUSES.has(String(status || "").trim().toLowerCase());
  }

  function isBlocked(status) {
    return BLOCKED_STATUSES.has(String(status || "").trim().toLowerCase());
  }

  function parseDateKey(value) {
    if (!value) return null;
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function classifyRisk(item, now = new Date()) {
    if (isDone(item.status)) return "완료";
    if (isBlocked(item.status)) return "막힘";

    const endDate = parseDateKey(item.endDate);
    if (endDate) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (endDate < today) return "지연";
    }

    return "진행 예정";
  }

  function summarizeWorkItems(items, now = new Date()) {
    const list = Array.isArray(items) ? items : [];
    const done = list.filter((item) => isDone(item.status)).length;
    const blocked = list.filter((item) => isBlocked(item.status)).length;
    const delayed = list.filter((item) => classifyRisk(item, now) === "지연").length;
    return {
      total: list.length,
      done,
      blocked,
      delayed,
      completionRate: list.length > 0 ? Math.round((done / list.length) * 100) : 0,
    };
  }

  function groupWorkItemsByType(items) {
    return (Array.isArray(items) ? items : []).reduce((groups, item) => {
      const key = item.type || "work";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  }

  function formatTokenCount(value) {
    const numeric = Number(value) || 0;
    if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
    if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
    return String(Math.round(numeric));
  }

  function getTokenBudgetRatio(tokenUsage) {
    const total = Number(tokenUsage && tokenUsage.totalTokens) || 0;
    const budget = Number(tokenUsage && tokenUsage.budgetTokens) || 0;
    if (budget <= 0) return 0;
    return Math.min(100, Math.round((total / budget) * 100));
  }

  return {
    classifyRisk,
    formatTokenCount,
    getStageLabel,
    getTokenBudgetRatio,
    groupWorkItemsByType,
    parseGitGanttMetadata,
    summarizeWorkItems,
  };
});
