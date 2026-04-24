(function initAxDashboard() {
  const data = window.AX_DASHBOARD_DATA;
  const core = window.AXDashboardCore;

  if (!data || !core) {
    document.body.innerHTML = "<p>대시보드 데이터를 불러오지 못했습니다.</p>";
    return;
  }

  const $ = (selector) => document.querySelector(selector);
  const byId = (id) => document.getElementById(id);

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function typeLabel(type) {
    return {
      epic: "상위 목표",
      policy: "정책 확정",
      story: "실행 흐름",
      task: "세부 작업",
    }[type] || "작업";
  }

  function outcomeById(id) {
    return data.outcomes.find((outcome) => outcome.id === id);
  }

  function outputById(id) {
    return data.outputs.find((output) => output.id === id);
  }

  function renderHeader() {
    byId("sourceLine").textContent = `${data.meta.updateMode} · ${data.meta.period}`;
    byId("change-title").textContent = data.impact.title;
    byId("impactSummary").textContent = data.impact.summary;
    byId("ganttPeriod").textContent = data.meta.period;
    byId("lastUpdated").textContent = formatDateTime(data.meta.updatedAt);
  }

  function renderMetrics() {
    const summary = core.summarizeWorkItems(data.workItems);
    const metrics = [
      { value: summary.total, label: "전체 작업" },
      { value: summary.completionRate + "%", label: "완료율" },
      { value: summary.blocked, label: "막힌 작업" },
      { value: data.outputs.length, label: "연결된 AX 산출물" },
    ];
    byId("metricStrip").innerHTML = metrics
      .map(
        (metric) => `
          <div class="metric">
            <strong>${metric.value}</strong>
            <span>${metric.label}</span>
          </div>
        `,
      )
      .join("");
  }

  function renderMatrix() {
    const heads = data.phases
      .map(
        (phase) => `
          <div class="matrix-head">
            <small>Phase</small>
            <strong>${phase.title}</strong>
            <small>${phase.subtitle}</small>
          </div>
        `,
      )
      .join("");

    const rows = data.outcomes
      .map((outcome) => {
        const outputs = data.outputs.filter((output) => output.outcome === outcome.id);
        const cells = data.phases
          .map((phase) => {
            const phaseOutputs = outputs.filter((output) => {
              if (phase.id === "understand") return output.stage === "A";
              if (phase.id === "organize") return output.stage === "B" || output.stage === "C";
              return output.stage === "D" || output.stage === "L";
            });
            const content =
              phaseOutputs.length > 0
                ? phaseOutputs
                    .map(
                      (output) => `
                        <button class="output-chip" type="button" title="${output.nextActivity}">
                          <small>${output.stage} · ${core.getStageLabel(output.stage)}</small>
                          <span>${output.name}</span>
                        </button>
                      `,
                    )
                    .join("")
                : `<p class="muted">연결된 산출물 없음</p>`;
            return `<div class="matrix-cell">${content}</div>`;
          })
          .join("");

        return `
          <div class="outcome-label">
            <small>${outcome.label}</small>
            <strong>${outcome.title}</strong>
            <span>${outcome.shortOutcome}</span>
          </div>
          ${cells}
        `;
      })
      .join("");

    byId("changeMatrix").innerHTML = `
      <div class="matrix-corner">
        <small>Pillar / Phase</small>
        <strong>AX 변화이론</strong>
      </div>
      ${heads}
      ${rows}
    `;
  }

  function renderTools() {
    byId("toolGrid").innerHTML = data.tools
      .map(
        (tool) => `
          <div class="tool-tile ${tool.kind === "skill" ? "skill" : "agent"}">
            <strong>${tool.id}</strong>
            <span>${tool.label}</span>
          </div>
        `,
      )
      .join("");
  }

  function renderGantt() {
    const rows = data.workItems
      .map((item) => {
        const risk = core.classifyRisk(item);
        const outcome = outcomeById(item.outcome);
        const output = outputById(item.output);
        return `
          <div class="gantt-row">
            <div>
              <span class="issue-kicker">#${item.issueNumber} · ${typeLabel(item.type)}</span>
              <div class="gantt-title">${item.plainTitle || item.title}</div>
            </div>
            <div>
              <strong>${item.group}</strong>
              <p class="muted">${outcome ? outcome.title : "Outcome 미지정"}</p>
            </div>
            <div>
              <strong>${output ? output.name : "산출물 미지정"}</strong>
              <p class="muted">${core.getStageLabel(item.stage)}</p>
            </div>
            <div>
              <strong>${item.startDate} ~ ${item.endDate}</strong>
              <p class="muted">담당: ${item.owner || "미지정"}</p>
            </div>
            <div>
              <span class="risk-pill" data-risk="${risk}">${risk}</span>
              <p class="muted">${item.nextAction}</p>
            </div>
          </div>
        `;
      })
      .join("");

    byId("ganttBoard").innerHTML = `
      <div class="gantt-row header">
        <div>Work</div>
        <div>Group / Outcome</div>
        <div>Output / Stage</div>
        <div>Schedule / Owner</div>
        <div>Status / Next</div>
      </div>
      ${rows}
    `;
  }

  function renderTokens() {
    const usage = data.tokenUsage;
    const ratio = core.getTokenBudgetRatio(usage);
    byId("tokenTotal").textContent = core.formatTokenCount(usage.totalTokens);
    byId("tokenMeter").style.width = `${ratio}%`;
    byId("tokenList").innerHTML = [
      ["남은 작업 예산", usage.budgetTokens ? `${100 - ratio}%` : "수동 입력 전"],
      ["측정 기간", usage.period],
      ["마지막 업데이트", formatDateTime(usage.updatedAt)],
      ["갱신 방식", "로컬 CLI"],
    ]
      .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
      .join("");
  }

  function renderWorkbench() {
    const priorityGroups = ["정책 확정", "자동 확정", "대기/잠금", "외부 연동"];
    const cards = priorityGroups
      .map((group) => data.workItems.find((item) => item.group === group))
      .filter(Boolean);

    byId("workCards").innerHTML = cards
      .map((item, index) => {
        const tool = data.tools[index % data.tools.length];
        const risk = core.classifyRisk(item);
        return `
          <article class="work-card">
            <div>
              <p class="eyebrow">#${item.issueNumber} · ${typeLabel(item.type)}</p>
              <h3>${item.plainTitle || item.title}</h3>
            </div>
            <p class="muted">${item.title}</p>
            <div class="work-meta">
              <span>${item.owner || "담당 미정"}</span>
              <span>${core.getStageLabel(item.stage)}</span>
              <span>${risk}</span>
              <span>${tool.id}</span>
            </div>
            <div class="next-action">
              <strong>Next Action</strong>
              <p>${item.nextAction}</p>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function bindTabs() {
    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.view;
        document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("is-active"));
        document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.remove("is-visible"));
        button.classList.add("is-active");
        $(`#view-${view}`).classList.add("is-visible");
      });
    });
  }

  renderHeader();
  renderMetrics();
  renderMatrix();
  renderTools();
  renderGantt();
  renderTokens();
  renderWorkbench();
  bindTabs();
})();
