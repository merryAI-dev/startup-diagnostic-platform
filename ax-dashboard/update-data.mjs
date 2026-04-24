#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, "dashboard-data.js");
const tokenUsagePath = resolve(__dirname, "codex-token-usage.local.json");
const repo = process.env.AX_DASHBOARD_REPO || "merryAI-dev/startup-diagnostic-platform";

function runGh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseGitGanttMetadata(body = "") {
  const read = (key) => {
    const match = String(body).match(new RegExp(`<!--\\s*gitgantt:${key}:([^>]+?)\\s*-->`, "i"));
    return match ? match[1].trim() : "";
  };
  return {
    startDate: read("start"),
    endDate: read("end"),
    owner: read("assignee"),
    status: read("status") || "todo",
  };
}

function inferType(number, title) {
  if (number === 56 || title.includes("[EPIC]")) return "epic";
  if (title.includes("[오피스아워 정책]")) return "policy";
  if (title.includes("[Story]")) return "story";
  return "task";
}

function inferGroup(title) {
  if (title.includes("자동 확정") || title.includes("72시간")) return "자동 확정";
  if (title.includes("대기") || title.includes("차단") || title.includes("슬롯")) return "대기/잠금";
  if (title.includes("Calendar") || title.includes("Gmail") || title.includes("Meet") || title.includes("연동")) return "외부 연동";
  if (title.includes("요일") || title.includes("날짜") || title.includes("시간") || title.includes("일정 선택")) return "일정 선택";
  if (title.includes("QA") || title.includes("비노출")) return "QA";
  if (title.includes("정책")) return "정책 확정";
  return "오피스아워";
}

function cleanTitle(title) {
  return String(title)
    .replace(/^\[EPIC\]\s*/u, "")
    .replace(/^\[Story\]\s*/u, "")
    .replace(/^\[오피스아워 정책\]\s*/u, "")
    .replace(/^\[오피스아워\]\[[^\]]+\]\s*/u, "")
    .trim();
}

function loadTokenUsage() {
  if (!existsSync(tokenUsagePath)) {
    return {
      period: "수동 입력 전",
      updatedAt: new Date().toISOString(),
      totalTokens: 0,
      budgetTokens: 0,
      byProject: [],
    };
  }

  return JSON.parse(readFileSync(tokenUsagePath, "utf8"));
}

function buildDashboardData(issues) {
  const workItems = issues.map((issue) => {
    const meta = parseGitGanttMetadata(issue.body);
    const title = issue.title || "";
    return {
      id: `github-${issue.number}`,
      issueNumber: issue.number,
      title,
      plainTitle: cleanTitle(title),
      type: inferType(issue.number, title),
      group: inferGroup(title),
      status: meta.status || (issue.state === "CLOSED" ? "done" : "todo"),
      owner: meta.owner || "",
      startDate: meta.startDate || "",
      endDate: meta.endDate || "",
      stage: issue.number >= 70 ? "A" : issue.number >= 57 ? "C" : issue.number >= 64 ? "B" : "D",
      outcome: "data-assets",
      output: "company-growth-platform",
      nextAction: "GitHub 이슈 본문 기준으로 다음 액션 확인",
      url: issue.url,
    };
  });

  return {
    meta: {
      title: "AX Orchestrate Dashboard",
      subtitle: "GitHub/GitGantt, AXR 변화이론, Codex 사용량을 한 화면에서 보는 비개발자용 운영판",
      period: "GitGantt 기준",
      updatedAt: new Date().toISOString(),
      updateMode: "로컬 CLI 수동 업데이트",
      source: `${repo}, issues #56-#76`,
    },
    impact: {
      label: "Impact",
      title: "혁신을 위한 AI혁신기업",
      summary:
        "기능 수를 늘리는 것보다 운영 가능성과 제품 구조를 정리해, 실제 업무 전환이 가능한 AX 체계를 만든다.",
    },
    outcomes: [
      {
        id: "productivity",
        label: "Outcome 1",
        title: "생산성 강화 및 업무 표준화",
        shortOutcome: "업무효율화, 수작업 오류와 비용 최소화",
      },
      {
        id: "data-assets",
        label: "Outcome 2",
        title: "데이터 자산화",
        shortOutcome: "스타트업 데이터와 내부 지식 데이터 축적",
      },
      {
        id: "ax-foundation",
        label: "Outcome 3",
        title: "AX를 위한 기초 인프라",
        shortOutcome: "AX 기반 기능, 리스크관리, 역량강화",
      },
    ],
    outputs: [
      {
        id: "company-growth-platform",
        name: "기업육성 플랫폼",
        outcome: "data-assets",
        stage: "D",
        status: "배포/전환",
        currentActivity: "오피스아워 TF 의견 반영",
        nextActivity: "정책 설계와 QA 반영",
        linkedWorkItems: ["github-56"],
      },
    ],
    workItems,
    tools: [
      { id: "ax-admin", kind: "agent", label: "예산, 운영, 신청 관리 정리", phase: "operate" },
      { id: "ax-architect", kind: "agent", label: "자료 구조와 업무 흐름 설계", phase: "organize" },
      { id: "ax-builder", kind: "agent", label: "자동화와 화면 구현 지원", phase: "execute" },
      { id: "ax-researcher", kind: "agent", label: "인터뷰, 문서, 근거 분석", phase: "understand" },
      { id: "ax-storyteller", kind: "agent", label: "보고, 공유, 외부 발신 정리", phase: "share" },
      { id: "ax-publisher", kind: "agent", label: "배포, 전환, 운영 기준 정리", phase: "organize" },
      { id: "ax-orchestrate", kind: "skill", label: "전체 작업 흐름 조율", phase: "all" },
    ],
    phases: [
      { id: "understand", title: "이해", subtitle: "문제와 자료 파악" },
      { id: "organize", title: "정리", subtitle: "정책과 구조 확정" },
      { id: "execute", title: "실행", subtitle: "운영 전환과 검증" },
    ],
    tokenUsage: loadTokenUsage(),
  };
}

function main() {
  const issues = JSON.parse(
    runGh([
      "issue",
      "list",
      "--repo",
      repo,
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title,state,body,url",
    ]),
  ).filter((issue) => issue.number >= 56 && issue.number <= 76);

  const dashboardData = buildDashboardData(issues);
  writeFileSync(
    outputPath,
    `window.AX_DASHBOARD_DATA = ${JSON.stringify(dashboardData, null, 2)};\n`,
    "utf8",
  );
  console.log(`Updated ${outputPath}`);
}

main();
