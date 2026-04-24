# AX Dashboard Design

Date: 2026-04-24  
Source references:
- `/Users/boram/Documents/[AXR] Weekly Report_20260417.pdf`
- `/Users/boram/Documents/[AXR] Weekly Report_20260417.pptx`
- GitHub repository: `merryAI-dev/startup-diagnostic-platform`
- Reference issues: #56 through #76

## Goal

Create a branded AX dashboard that turns GitHub/GitGantt work items, AXR weekly report language, and local Codex token usage into a non-developer-friendly operating view.

The dashboard should not feel like a developer issue tracker. It should feel like an AX command board for executives, PMs, and team members who need to understand what is moving, what is delayed, what needs a decision, and which AX tools are being used.

## Non-Goals

- No GitHub API key entry in the dashboard.
- No OpenAI or Codex API key entry in the dashboard.
- No direct implementation of feature logic from GitHub issues.
- No developer-only wording such as branch, commit, callable function, schema migration, or stack trace in the primary UI.
- No automatic background sync in the first version.

## Operating Assumptions

- GitHub/GitGantt data is updated manually through local CLI commands.
- Codex token usage is a usage/budget metric, not an authentication token.
- The first version is a local HTML dashboard that can be opened in a browser.
- Data refresh is explicit: a user runs a local command, then reloads the dashboard.
- All labels must be understandable to non-developers.

## Theory Of Change Mapping

The dashboard uses the AXR weekly report structure as its main strategic language.

| Weekly Report Layer | Dashboard Label | Meaning |
| --- | --- | --- |
| Impact | Long-term impact | What this AX effort contributes to |
| Long-term Outcome | Strategic outcome | The major organizational result |
| Short-term Outcome | Near-term change | The behavior or capability being improved |
| Output | AX product/tool | The concrete platform, agent, or tool |
| Activity | Current work | What is happening this week or next |

Primary outcomes:
- Productivity and work standardization
- Data asset building
- AX foundation infrastructure

Primary AX outputs:
- Merry investment reviewer
- AI agent workbench
- Project management platform
- Company application platform
- Company growth platform
- PPT archive
- HWP editor
- PDF/image analysis
- Security and governance
- AX design support
- Internal education/campaigns

## Stage Language

The weekly report's A/B/C/D/L development stages are preserved, but shown with plain Korean labels.

| Code | Internal Meaning | Dashboard Label |
| --- | --- | --- |
| A | AXR Team Internal | 내부 검증 |
| B | Board & Committee Review | 의사결정 검토 |
| C | Closed Open | 일부 사용자 테스트 |
| D | Deployment | 배포/전환 |
| L | LIVE | 라이브 운영 |

Color guidance:
- A: neutral gray, exploratory
- B: blue, decision needed
- C: amber, feedback in progress
- D: green, launch/transition
- L: black or deep navy, operating

## Three Dashboard Views

### 1. Executive / Customer View: AX Change Map

Purpose: Explain how AX work connects to the bigger theory of change.

Primary question: "What change are we creating, and what evidence shows progress?"

Core modules:
- Impact banner: "혁신을 위한 AI혁신기업"
- Outcome lanes: productivity, data assets, AX foundation
- Pillar x phase matrix inspired by the reference images
- Highlight cards for updated items, delayed items, and decision-needed items
- Before/after or this-week/next-week summary

Language examples:
- "기능 수 확대보다 운영 가능성과 제품 구조 정리에 집중"
- "내부 DB 연결 일원화"
- "실사용 테스트와 피드백 반영 중"
- "운영 전환 준비"

What not to show prominently:
- Raw GitHub issue titles unless expanded
- Issue IDs as primary labels
- Technical error names

### 2. PM / Operator View: AX Execution Gantt

Purpose: Convert GitHub/GitGantt into a readable operating board.

Primary question: "What is on track, what is late, and what needs coordination?"

Core modules:
- Timeline by date range
- Work grouped by EPIC, Story, Task, Policy
- Owner and status columns
- Risk chips: delayed, blocked, decision needed, ready for QA
- GitGantt metadata display in friendly language
- Parent/child grouping for GitHub issues

Sample mapping from current GitHub data:
- Parent EPIC: #56 정기 오피스아워 일정 선택 및 확정 연동 고도화
- Policy items: #64 through #69
- Story items: #57 through #63
- Detailed tasks: #70 through #76

Recommended grouping:
- Policy confirmation
- Date/time selection
- Waiting status and slot lock
- 72-hour auto confirmation
- Calendar/Gmail/Meet follow-up
- QA and non-regular office hour visibility

### 3. Team Member View: Today's AX Workbench

Purpose: Help each non-developer team member know what to do today.

Primary question: "What should I act on now, with which tool?"

Core modules:
- Today cards
- My assigned work
- Next action
- Needed material
- Suggested AX tool/agent/skill
- Codex token estimate or actual usage

Example card:
- Work: "오피스아워 자동 확정 정책 확인"
- Why it matters: "기업 신청 후 대기 시간이 길어지는 문제를 줄임"
- Current step: "정책 확정"
- Next action: "72시간 기준 시점 확인"
- Tool: "ax-orchestrate"
- Token budget: "low / medium / high"

## Branded Tool Taxonomy

The dashboard brands tools as a visible AX operating system. Tool names are allowed, but each must include a plain-language explanation.

### Custom Agents

| Brand | Plain-language role |
| --- | --- |
| ax-admin | 예산, 운영, 신청 관리 정리 |
| ax-architect | 자료 구조와 업무 흐름 설계 |
| ax-builder | 자동화와 화면 구현 지원 |
| ax-researcher | 인터뷰, 문서, 근거 분석 |
| ax-storyteller | 보고, 공유, 외부 발신 정리 |
| ax-publisher | 배포, 전환, 운영 기준 정리 |

### Skills / Recipes

| Brand | Plain-language role |
| --- | --- |
| ax-infra-ops | Gmail, 예산, 인프라 점검 |
| ax-tool-migration | 기존 도구에서 새 도구로 옮기기 |
| ax-deploy-guide | 배포와 전환 절차 안내 |
| ax-interview | 인터뷰 진행과 정리 |
| ax-show-tell | 시연과 공유회 구성 |
| ax-restructure | Drive/Notion 자료 재구조화 |
| ax-data-audit | 데이터 누락, 중복, 품질 점검 |
| ax-orchestrate | 전체 작업 흐름 조율 |

## Codex Token Panel

Codex token usage is shown as a budget and productivity indicator.

Primary metrics:
- This week's token usage
- Token budget remaining
- Token use by project
- Token use by AX output
- Output per token: issues organized, reports drafted, QA items processed, pages reviewed
- Last local update time

Recommended labels:
- "이번 주 Codex 사용량"
- "남은 작업 예산"
- "프로젝트별 사용 비중"
- "토큰 대비 산출물"
- "마지막 수동 업데이트"

Avoid:
- "API key"
- "auth token"
- "secret"
- "model billing internals"

## Manual Data Refresh

The first version uses local files generated by CLI commands.

Suggested data files:
- `data/github-issues.json`
- `data/gitgantt-items.json`
- `data/codex-token-usage.json`
- `data/ax-weekly-report-summary.json`
- `data/dashboard-meta.json`

Suggested local command:

```bash
npm run ax-dashboard:update
```

What it should do later:
- Export GitHub issues with `gh issue list`
- Parse GitGantt metadata from issue bodies
- Read or import Codex token usage from a local file
- Refresh dashboard metadata with timestamp

For the design phase, this is only a data contract. No implementation is required yet.

## Data Model Draft

### Work Item

```json
{
  "id": "github-56",
  "source": "github",
  "issueNumber": 56,
  "title": "정기 오피스아워 일정 선택 및 확정 연동 고도화",
  "group": "오피스아워",
  "type": "epic",
  "status": "todo",
  "owner": "이지",
  "startDate": "2026-04-23",
  "endDate": "2026-05-14",
  "stage": "D",
  "outcome": "생산성 강화 및 업무 표준화",
  "output": "기업육성 플랫폼",
  "risk": "none",
  "nextAction": "정책/스토리/세부 Task 진행률 확인"
}
```

### Token Usage

```json
{
  "period": "2026-04-20/2026-04-24",
  "updatedAt": "2026-04-24T13:00:00+09:00",
  "totalTokens": 0,
  "budgetTokens": 0,
  "byProject": [
    {
      "project": "startup-diagnostic-platform",
      "tokens": 0,
      "outputs": 0
    }
  ]
}
```

### AX Output

```json
{
  "id": "company-growth-platform",
  "name": "기업육성 플랫폼",
  "outcome": "데이터 자산화",
  "stage": "D",
  "statusLabel": "배포/전환",
  "currentActivity": "오피스아워 TF 의견 반영",
  "nextActivity": "정책 설계와 QA 반영",
  "linkedWorkItems": ["github-56"]
}
```

## Visual Direction

The visual identity should borrow from the provided references:
- Black/white/blue editorial dashboard
- Strong grid lines
- Dense but readable information architecture
- Large phase headers
- Monospace labels for agent/tool names
- Dotted outlines for skills/recipes
- Solid black cards for agents
- Blue highlight for orchestration or selected lane

Avoid:
- Decorative gradients
- Rounded marketing cards
- Overly colorful SaaS dashboard style
- Developer IDE aesthetics

## First Prototype Scope

The first prototype should include:
- Three view tabs: Change Map, Execution Gantt, Workbench
- Static sample data from #56 through #76
- Manual token panel with initial values that can be edited after each local update
- AXR weekly report outcome/output mapping
- No live API connection
- No authentication

## Acceptance Criteria

- A non-developer can understand the dashboard without GitHub knowledge.
- The executive view explains "why this work matters."
- The PM view shows what is due, delayed, or blocked.
- The team view shows the next concrete action.
- GitHub issue numbers remain available but secondary.
- Codex token usage is shown only as usage/budget, never as credential data.
- Data refresh is explicitly manual and local.

## Initial Decisions

- Final home for the first version: standalone local HTML.
- Tool display: show `ax-*` brand names with Korean explanations beside them.
- Token usage: start with manual/local-file entry, then later allow import from exported Codex session summaries if available.
- Weekly export: not included in the first prototype, but the layout should be compatible with future PDF/PPT export.
