import { spawnSync } from "node:child_process";

const PROJECTS = {
  stage: "startup-diagnosis-platform",
  live: "startup-acceleration-platform",
};

const DEPLOY_TARGETS = {
  functions: "functions",
  core: [
    "functions:submitRegularApplication",
    "functions:cancelApplication",
    "functions:approvePendingUser",
    "functions:transitionApplicationStatus",
    "functions:runApplicationMaintenance",
    "functions:scheduledApplicationMaintenance",
  ].join(","),
  report: "functions:generateCompanyAnalysisReport",
  rules: "firestore:rules,storage",
  app: [
    "functions:submitRegularApplication",
    "functions:cancelApplication",
    "functions:approvePendingUser",
    "functions:transitionApplicationStatus",
    "functions:runApplicationMaintenance",
    "functions:scheduledApplicationMaintenance",
    "functions:generateCompanyAnalysisReport",
    "firestore:rules",
    "storage",
  ].join(","),
};

function printUsage() {
  console.log(`Usage:
  node scripts/firebase-deploy.mjs <stage|live|both> <functions|core|report|rules|app>

Examples:
  node scripts/firebase-deploy.mjs stage core
  node scripts/firebase-deploy.mjs live report
  node scripts/firebase-deploy.mjs both app
`);
}

const [, , scopeArg, targetArg] = process.argv;
const scope = scopeArg?.trim().toLowerCase();
const targetKey = targetArg?.trim().toLowerCase();

if (!scope || !targetKey || !["stage", "live", "both"].includes(scope) || !DEPLOY_TARGETS[targetKey]) {
  printUsage();
  process.exit(1);
}

const projectEntries =
  scope === "both"
    ? Object.entries(PROJECTS)
    : [[scope, PROJECTS[scope]]];

for (const [alias, projectId] of projectEntries) {
  console.log(`\n==> Deploying '${targetKey}' to ${alias} (${projectId})`);

  const result = spawnSync(
    "firebase",
    ["deploy", "--project", projectId, "--only", DEPLOY_TARGETS[targetKey]],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

