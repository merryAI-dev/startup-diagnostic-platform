import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type LoadedEnv = {
  baseUrl?: string;
  adminEmail?: string;
  adminPassword?: string;
  firebaseApiKey?: string;
  firebaseProjectId?: string;
};

function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const source = fs.readFileSync(filePath, "utf8");
  const entries: Record<string, string> = {};

  source.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  });

  return entries;
}

export function loadE2EEnv(): LoadedEnv {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, "..", "..");
  const dotEnv = parseDotEnvFile(path.join(repoRoot, ".env"));
  const merged = {
    ...dotEnv,
    ...process.env,
  };

  return {
    baseUrl: merged.E2E_BASE_URL || merged.PLAYWRIGHT_BASE_URL || undefined,
    adminEmail: merged.E2E_ADMIN_EMAIL || merged.MIGRATION_ADMIN_EMAIL || undefined,
    adminPassword: merged.E2E_ADMIN_PASSWORD || merged.MIGRATION_ADMIN_PASSWORD || undefined,
    firebaseApiKey: merged.VITE_FIREBASE_API_KEY || undefined,
    firebaseProjectId: merged.VITE_FIREBASE_PROJECT_ID || undefined,
  };
}
