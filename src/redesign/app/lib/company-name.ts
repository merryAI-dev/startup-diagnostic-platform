import type { CompanyDirectoryItem } from "@/redesign/app/lib/types";

const CORPORATE_MARKERS = [
  /\(주\)/giu,
  /（주）/giu,
  /㈜/giu,
  /주식회사/giu,
  /유한회사/giu,
  /합자회사/giu,
  /합명회사/giu,
  /co\.?\s*ltd\.?/giu,
  /co\.?,?\s*limited/giu,
  /inc\.?/giu,
  /corp\.?/giu,
  /corporation/giu,
  /ltd\.?/giu,
  /limited/giu,
  /llc/giu,
];

export function normalizeCompanyName(value: string) {
  let normalized = value.normalize("NFKC").trim().toLowerCase();
  CORPORATE_MARKERS.forEach((pattern) => {
    normalized = normalized.replace(pattern, "");
  });
  return normalized
    .replace(/[.,·ㆍ"'`~!@#$%^&*+=:;<>?()[\]{}|\\/]/gu, "")
    .replace(/[-_]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
}

export function parseCompanyAliases(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function normalizedCandidates(company: Pick<CompanyDirectoryItem, "name" | "normalizedName" | "aliases">) {
  return Array.from(
    new Set(
      [
        company.normalizedName,
        normalizeCompanyName(company.name ?? ""),
        ...(company.aliases ?? []).map((alias) => normalizeCompanyName(alias)),
      ].filter((item): item is string => Boolean(item)),
    ),
  );
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (previous[rightIndex] ?? 0) + 1,
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + cost,
      );
    }
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
}

export function getExactCompanyNameMatches(
  input: string,
  companies: CompanyDirectoryItem[],
  ignoredCompanyId?: string | null,
) {
  const normalizedInput = normalizeCompanyName(input);
  if (!normalizedInput) return [];

  return companies.filter((company) => {
    if (company.id === ignoredCompanyId) return false;
    return normalizedCandidates(company).includes(normalizedInput);
  });
}

export function getSimilarCompanyNameMatches(
  input: string,
  companies: CompanyDirectoryItem[],
  ignoredCompanyId?: string | null,
) {
  const normalizedInput = normalizeCompanyName(input);
  if (!normalizedInput) return [];

  return companies
    .filter((company) => company.id !== ignoredCompanyId)
    .map((company) => {
      const candidates = normalizedCandidates(company);
      const score = candidates.reduce((best, candidate) => {
        if (!candidate) return best;
        if (candidate === normalizedInput) return Math.max(best, 100);
        if (candidate.includes(normalizedInput) || normalizedInput.includes(candidate)) {
          return Math.max(best, 80);
        }
        if (normalizedInput.length >= 3 && candidate.length >= 3) {
          const distance = levenshteinDistance(normalizedInput, candidate);
          const threshold = normalizedInput.length <= 5 ? 1 : 2;
          if (distance <= threshold) return Math.max(best, 60 - distance);
        }
        return best;
      }, 0);
      return { company, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name, "ko-KR"))
    .map((item) => item.company);
}
