import assert from "node:assert/strict";

await import("../dashboard-core.js");
const core = globalThis.AXDashboardCore;

assert.equal(core.getStageLabel("A"), "내부 검증");
assert.equal(core.getStageLabel("B"), "의사결정 검토");
assert.equal(core.getStageLabel("C"), "일부 사용자 테스트");
assert.equal(core.getStageLabel("D"), "배포/전환");
assert.equal(core.getStageLabel("L"), "라이브 운영");
assert.equal(core.getStageLabel("unknown"), "단계 미정");

assert.deepEqual(
  core.parseGitGanttMetadata(`<!-- gitgantt:start:2026-04-23 -->
<!-- gitgantt:end:2026-05-14 -->
<!-- gitgantt:assignee:이지 -->
<!-- gitgantt:status:todo -->`),
  {
    startDate: "2026-04-23",
    endDate: "2026-05-14",
    owner: "이지",
    status: "todo",
  },
);

const sampleWork = [
  { id: "github-1", status: "todo", endDate: "2026-04-22", issueNumber: 1 },
  { id: "github-2", status: "done", endDate: "2026-04-20", issueNumber: 2 },
  { id: "github-3", status: "blocked", endDate: "2026-05-14", issueNumber: 3 },
];

assert.deepEqual(core.summarizeWorkItems(sampleWork, new Date("2026-04-24T00:00:00+09:00")), {
  total: 3,
  done: 1,
  blocked: 1,
  delayed: 1,
  completionRate: 33,
});

assert.equal(
  core.classifyRisk({ status: "done", endDate: "2026-04-20" }, new Date("2026-04-24T00:00:00+09:00")),
  "완료",
);
assert.equal(
  core.classifyRisk({ status: "blocked", endDate: "2026-05-14" }, new Date("2026-04-24T00:00:00+09:00")),
  "막힘",
);
assert.equal(
  core.classifyRisk({ status: "todo", endDate: "2026-04-20" }, new Date("2026-04-24T00:00:00+09:00")),
  "지연",
);
assert.equal(
  core.classifyRisk({ status: "todo", endDate: "2026-05-14" }, new Date("2026-04-24T00:00:00+09:00")),
  "진행 예정",
);

assert.equal(core.formatTokenCount(1280), "1.3K");
assert.equal(core.formatTokenCount(2_500_000), "2.5M");
assert.equal(core.getTokenBudgetRatio({ totalTokens: 2500, budgetTokens: 10000 }), 25);

assert.deepEqual(
  core.groupWorkItemsByType([
    { id: "a", type: "policy" },
    { id: "b", type: "task" },
    { id: "c", type: "policy" },
  ]),
  {
    policy: [
      { id: "a", type: "policy" },
      { id: "c", type: "policy" },
    ],
    task: [{ id: "b", type: "task" }],
  },
);

console.log("dashboard-core tests passed");
