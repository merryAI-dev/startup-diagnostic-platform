import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { loadE2EEnv } from "./support/env";

const env = loadE2EEnv();

const adminCredentials = {
  email: env.adminEmail,
  password: env.adminPassword,
};

const firebaseConfig = {
  apiKey: env.firebaseApiKey,
  projectId: env.firebaseProjectId,
};

const qaCredentials = {
  password: "12341234",
  consultants: ["qa.consultant11@gmail.com", "qa.consultant2@gmail.com"],
  companies: ["company@gmail.com", "company2@gmail.com"],
} as const;

type FirestoreDocument = {
  id: string;
  path: string;
  data: Record<string, unknown>;
};

type E2EAgendaRef = {
  agendaId: string;
  agendaName: string;
};

let adminIdTokenPromise: Promise<string> | null = null;

function cleanupPreviewTestAccounts() {
  execFileSync("npm", ["run", "cleanup:test-accounts", "--", "--commit"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
    timeout: 2 * 60 * 1000,
  });
}

function uniqueSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertFirebaseTestEnv() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("E2E Firestore 검증을 위한 VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID가 필요합니다.");
  }
  if (!adminCredentials.email || !adminCredentials.password) {
    throw new Error("E2E admin 계정 정보가 필요합니다.");
  }
}

function decodeFirestoreValue(
  value:
    | {
        stringValue?: string;
        integerValue?: string;
        doubleValue?: number;
        booleanValue?: boolean;
        nullValue?: null;
        timestampValue?: string;
        arrayValue?: { values?: any[] };
        mapValue?: { fields?: Record<string, any> };
      }
    | undefined,
): unknown {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue ?? "";
  if ("integerValue" in value) return Number(value.integerValue ?? "0");
  if ("doubleValue" in value) return value.doubleValue ?? 0;
  if ("booleanValue" in value) return value.booleanValue ?? false;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue ?? "";
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map((item) => decodeFirestoreValue(item));
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue?.fields ?? {}).map(([key, fieldValue]) => [
        key,
        decodeFirestoreValue(fieldValue),
      ]),
    );
  }
  return undefined;
}

function parseFirestoreDocument(raw: {
  name: string;
  fields?: Record<string, any>;
}): FirestoreDocument {
  const nameParts = raw.name.split("/");
  return {
    id: nameParts[nameParts.length - 1] ?? raw.name,
    path: raw.name,
    data: Object.fromEntries(
      Object.entries(raw.fields ?? {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
    ),
  };
}

function encodeFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
            key,
            encodeFirestoreValue(entryValue),
          ]),
        ),
      },
    };
  }
  throw new Error(`Unsupported Firestore value: ${String(value)}`);
}

async function getAdminIdToken() {
  assertFirebaseTestEnv();
  if (!adminIdTokenPromise) {
    adminIdTokenPromise = (async () => {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: adminCredentials.email,
            password: adminCredentials.password,
            returnSecureToken: true,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || typeof payload?.idToken !== "string") {
        throw new Error(`Firebase admin sign-in failed: ${response.status} ${JSON.stringify(payload)}`);
      }
      return payload.idToken;
    })();
  }
  return adminIdTokenPromise;
}

async function signInWithFirebaseEmail(email: string, password: string) {
  assertFirebaseTestEnv();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok || typeof payload?.localId !== "string") {
    throw new Error(`Firebase sign-in failed for ${email}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return {
    uid: payload.localId as string,
    idToken: typeof payload.idToken === "string" ? payload.idToken : "",
  };
}

async function runFirestoreQuery(
  collection: string,
  field: string,
  value: string,
): Promise<FirestoreDocument[]> {
  const idToken = await getAdminIdToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
        },
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Firestore query failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  if (!Array.isArray(payload)) {
    throw new Error(`Unexpected Firestore query payload: ${JSON.stringify(payload)}`);
  }
  return payload
    .filter((item) => item?.document)
    .map((item) => parseFirestoreDocument(item.document));
}

async function listFirestoreDocuments(collection: string): Promise<FirestoreDocument[]> {
  const idToken = await getAdminIdToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${collection}`,
    {
      headers: {
        authorization: `Bearer ${idToken}`,
      },
    },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Firestore list failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return Array.isArray(payload.documents)
    ? payload.documents.map((item: any) => parseFirestoreDocument(item))
    : [];
}

async function getFirestoreDocument(documentPath: string): Promise<FirestoreDocument | null> {
  const idToken = await getAdminIdToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${documentPath}`,
    {
      headers: {
        authorization: `Bearer ${idToken}`,
      },
    },
  );
  if (response.status === 404) return null;
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Firestore get failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return parseFirestoreDocument(payload);
}

async function getExistingQaConsultant(index: 0 | 1) {
  const email = qaCredentials.consultants[index];
  const consultantDoc = await waitForConsultantDoc(email);
  return {
    consultant: {
      name: String(consultantDoc.data.name ?? email),
      email,
      password: qaCredentials.password,
    },
    consultantId: consultantDoc.id,
  };
}

async function getExistingQaCompany(index: 0 | 1) {
  const email = qaCredentials.companies[index];
  const { uid } = await signInWithFirebaseEmail(email, qaCredentials.password);
  const profileDoc = await getFirestoreDocument(`profiles/${uid}`);
  if (!profileDoc) {
    throw new Error(`QA company profile not found: ${email}`);
  }
  const companyId = String(profileDoc.data.companyId ?? uid);
  const companyDoc = await getFirestoreDocument(`companies/${companyId}`);
  if (!companyDoc) {
    throw new Error(`QA company doc not found: ${email} (${companyId})`);
  }
  return {
    company: {
      name: String(companyDoc.data.name ?? email),
      email,
      password: qaCredentials.password,
    },
    companyId,
  };
}

async function waitForConsultantDoc(consultantEmail: string): Promise<FirestoreDocument> {
  let consultant: FirestoreDocument | undefined;
  await expect
    .poll(async () => {
      const docs = await runFirestoreQuery("consultants", "email", consultantEmail);
      consultant = docs[0];
      return consultant ? 1 : 0;
    }, { timeout: 30_000 })
    .toBe(1);
  return consultant!;
}

async function updateFirestoreDocument(documentPath: string, fields: Record<string, unknown>) {
  const idToken = await getAdminIdToken();
  const params = new URLSearchParams();
  Object.keys(fields).forEach((fieldPath) => {
    params.append("updateMask.fieldPaths", fieldPath);
  });
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${documentPath}?${params.toString()}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value)]),
        ),
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Firestore update failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return parseFirestoreDocument(payload);
}

async function deleteFirestoreDocument(documentPath: string) {
  const idToken = await getAdminIdToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${documentPath}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${idToken}`,
      },
    },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Firestore delete failed: ${response.status} ${payload}`);
  }
}

async function cleanupE2EAgendas() {
  const agendas = await listFirestoreDocuments("agendas");
  const targets = agendas.filter((agenda) => String(agenda.data.name ?? "").startsWith("E2E Agenda "));
  for (const agenda of targets) {
    await deleteFirestoreDocument(`agendas/${agenda.id}`);
  }
}

async function createE2EAgenda(seed: string, scope: "internal" | "external" = "internal") {
  const agendaId = `e2e-agenda-${seed}`;
  const agendaName = `E2E Agenda ${seed}`;
  await updateFirestoreDocument(`agendas/${agendaId}`, {
    name: agendaName,
    scope,
    active: true,
    description: "E2E isolated agenda",
  });
  return { agendaId, agendaName };
}

async function resolveAgendaRef(agenda: E2EAgendaRef | string): Promise<E2EAgendaRef> {
  if (typeof agenda !== "string") {
    return agenda;
  }
  const agendas = await runFirestoreQuery("agendas", "name", agenda);
  const matched = agendas[0];
  if (!matched) {
    throw new Error(`아젠다 문서를 찾지 못했습니다: ${agenda}`);
  }
  return {
    agendaId: matched.id,
    agendaName: String(matched.data.name ?? agenda),
  };
}

async function getApplicationsByCompanyName(companyName: string) {
  return runFirestoreQuery("officeHourApplications", "companyName", companyName);
}

async function expectSingleCompanyDoc(companyName: string) {
  await expect.poll(async () => (await runFirestoreQuery("companies", "name", companyName)).length, {
    timeout: 30_000,
  }).toBe(1);
  const [companyDoc] = await runFirestoreQuery("companies", "name", companyName);
  if (!companyDoc) {
    throw new Error(`Expected one company doc for ${companyName}`);
  }
  return companyDoc;
}

async function getRegularOfficeHourIdForCompany(companyName: string, agendaName: string) {
  const companyDoc = await expectSingleCompanyDoc(companyName);
  const programIds = Array.isArray(companyDoc.data.programs)
    ? companyDoc.data.programs.map((value) => String(value))
    : [];
  if (programIds.length === 0) {
    throw new Error(`회사 ${companyName}에 연결된 program이 없습니다.`);
  }

  await resolveAgendaRef(agendaName);

  let matchedGroupId = "";
  let matchedDateKey = "";

  for (const programId of programIds) {
    const programDoc = await getFirestoreDocument(`programs/${programId}`);
    if (!programDoc) continue;

    const periodStart =
      typeof programDoc.data.periodStart === "string" ? normalizeDateKey(programDoc.data.periodStart) : "";
    const periodEnd =
      typeof programDoc.data.periodEnd === "string" ? normalizeDateKey(programDoc.data.periodEnd) : "";
    if (!periodStart || !periodEnd) continue;

    const startDate = parseDateKey(periodStart);
    const endDate = parseDateKey(periodEnd);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      continue;
    }

    const weekdays = new Set(getWeekdayNumbers(programDoc.data.weekdays));
    if (weekdays.size === 0) continue;

    const today = parseDateKey(formatDateKey(new Date()));
    const cursor = startDate < today ? new Date(today) : new Date(startDate);
    while (cursor <= endDate) {
      if (weekdays.has(cursor.getDay())) {
        const dateKey = formatDateKey(cursor);
        const groupId = `${programId}:unassigned:${dateKey.slice(0, 7)}`;
        if (!matchedDateKey || dateKey < matchedDateKey) {
          matchedDateKey = dateKey;
          matchedGroupId = groupId;
        }
        break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  if (matchedGroupId) {
    return matchedGroupId;
  }

  throw new Error(`회사 ${companyName} / 아젠다 ${agendaName}에 대한 신청 가능한 정기 오피스아워를 찾지 못했습니다.`);
}

async function expectSingleApplicationDoc(companyName: string) {
  await expect.poll(async () => (await getApplicationsByCompanyName(companyName)).length, {
    timeout: 30_000,
  }).toBe(1);
  const [application] = await getApplicationsByCompanyName(companyName);
  if (!application) {
    throw new Error(`Expected one application for ${companyName}`);
  }
  return application;
}

function buildFullAvailability() {
  return [2, 4].map((dayOfWeek) => ({
    dayOfWeek,
    slots: Array.from({ length: 9 }, (_, index) => {
      const startHour = 9 + index;
      const endHour = startHour + 1;
      return {
        start: `${String(startHour).padStart(2, "0")}:00`,
        end: `${String(endHour).padStart(2, "0")}:00`,
        available: true,
      };
    }),
  }));
}

function normalizeDateKey(value: string) {
  return value.trim().slice(0, 10);
}

function parseDateKey(value: string) {
  const [year, month, day] = normalizeDateKey(value).split("-").map((part) => Number(part));
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayNumbers(weekdays: unknown) {
  const source = Array.isArray(weekdays) && weekdays.length > 0 ? weekdays : ["TUE", "THU"];
  const numbers: number[] = [];
  source.forEach((weekday) => {
    if (weekday === "TUE") numbers.push(2);
    if (weekday === "THU") numbers.push(4);
  });
  return numbers;
}

async function setConsultantAvailability(consultantEmail: string) {
  const consultant = await waitForConsultantDoc(consultantEmail);
  await updateFirestoreDocument(`consultants/${consultant.id}`, {
    availability: buildFullAvailability(),
  });
}

async function expectConsultantAgendaSlotsReady(consultantEmail: string, agenda: E2EAgendaRef | string) {
  const agendaRef = await resolveAgendaRef(agenda);
  await expect.poll(async () => {
    const refreshedConsultants = await runFirestoreQuery("consultants", "email", consultantEmail);
    const refreshedConsultant = refreshedConsultants[0];
    const agendaIds = Array.isArray(refreshedConsultant?.data.agendaIds)
      ? refreshedConsultant.data.agendaIds.map((value) => String(value))
      : [];
    if (!agendaIds.includes(agendaRef.agendaId)) return 0;
    const availability = Array.isArray(refreshedConsultant?.data.availability)
      ? refreshedConsultant.data.availability
      : [];
    return availability.length;
  }, { timeout: 30_000 }).toBeGreaterThan(0);
}

async function assignAgendaToConsultantRecord(consultantEmail: string, agenda: E2EAgendaRef | string) {
  const consultant = await waitForConsultantDoc(consultantEmail);
  const agendaRef = await resolveAgendaRef(agenda);
  const existingAgendaIds = Array.isArray(consultant.data.agendaIds)
    ? consultant.data.agendaIds.map((value) => String(value))
    : [];
  const nextAgendaIds = Array.from(new Set([...existingAgendaIds, agendaRef.agendaId]));
  await updateFirestoreDocument(`consultants/${consultant.id}`, {
    agendaIds: nextAgendaIds,
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
}

async function waitForAuthLoadingToClear(page: Page) {
  await expect
    .poll(async () => {
      const loadingTexts = [
        page.getByText("로딩 중..."),
        page.getByText("Loading..."),
      ];
      const counts = await Promise.all(loadingTexts.map((locator) => locator.count()));
      return counts.reduce((sum, count) => sum + count, 0);
    }, { timeout: 30_000 })
    .toBe(0);
}

async function loginAndWaitForCompany(page: Page, email: string, password: string) {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/company/, { timeout: 30_000 });
  await waitForAuthLoadingToClear(page);
  await expect(page.getByText("대시보드").first()).toBeVisible({ timeout: 30_000 });
}

async function waitForRegularCalendarReady(page: Page) {
  const loadingText = page.getByText("정기 오피스아워 일정을 불러오는 중입니다.");
  const contentLoading = page.getByText("Loading...");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await expect
        .poll(async () => {
          const sessionCount = await page.locator('[data-testid^="regular-calendar-session-"]').count();
          if (sessionCount > 0) return 0;
          const emptyStateCount = await page.getByText("표시할 정기 오피스아워가 없습니다").count();
          if (emptyStateCount > 0) return 0;
          const [calendarLoadingCount, contentLoadingCount] = await Promise.all([
            loadingText.count(),
            contentLoading.count(),
          ]);
          return calendarLoadingCount + contentLoadingCount;
        }, { timeout: 30_000 })
        .toBe(0);
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.reload();
      await waitForAuthLoadingToClear(page);
    }
  }
}

async function clickCalendarSessionCell(page: Page, sessionCard: Locator) {
  await sessionCard.evaluate((node) => {
    let current: HTMLElement | null = node.parentElement;
    while (current) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= 40 && rect.height >= 40) {
        current.click();
        return;
      }
      current = current.parentElement;
    }
    throw new Error("정기 오피스아워 클릭 가능한 날짜 셀을 찾지 못했습니다.");
  });
  await page.waitForTimeout(200);
  if (await page.getByTestId("regular-officehour-trigger").count()) {
    return;
  }

  const box = await sessionCard.boundingBox();
  if (!box) {
    throw new Error("정기 오피스아워 캘린더 셀 위치를 찾지 못했습니다.");
  }
  await page.mouse.click(box.x + Math.min(box.width / 2, 24), box.y + Math.min(box.height / 2, 24));
}

async function findRegularOfficeHourCards(page: Page, officeHourId: string) {
  let officeHourCards = page.getByTestId(`regular-calendar-session-${officeHourId}`);
  let count = await officeHourCards.count();
  if (count === 0) {
    const [programId] = officeHourId.split(":");
    const programDoc = programId ? await getFirestoreDocument(`programs/${programId}`) : null;
    const programName = String(programDoc?.data.name ?? "").trim();
    if (programName) {
      officeHourCards = page
        .locator('[data-testid^="regular-calendar-session-"]')
        .filter({ hasText: programName });
      count = await officeHourCards.count();
    }
  }

  return { officeHourCards, count };
}

async function openRegularApplicationSheetForOfficeHour(
  page: Page,
  officeHourId: string,
  sessionIndex = 0,
) {
  await page.goto("/company/regular");
  await waitForAuthLoadingToClear(page);
  await waitForRegularCalendarReady(page);

  const { officeHourCards, count } = await findRegularOfficeHourCards(page, officeHourId);
  if (count === 0) {
    throw new Error(`정기 오피스아워 카드를 찾지 못했습니다: ${officeHourId}`);
  }
  if (sessionIndex >= count) {
    throw new Error(`정기 오피스아워 카드 인덱스가 범위를 벗어났습니다: ${sessionIndex}/${count}`);
  }

  const officeHourCard = officeHourCards.nth(sessionIndex);
  await expect(officeHourCard).toBeVisible({ timeout: 30_000 });
  const officeHourTitle = ((await officeHourCard.textContent()) ?? "").trim() || "정기 오피스아워";

  await clickCalendarSessionCell(page, officeHourCard);
  await expect(page.getByTestId("regular-officehour-trigger")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("regular-officehour-trigger").click();
  await page.getByRole("option", { name: new RegExp(`^${escapeRegExp(officeHourTitle)}$`) }).click();

  return { officeHourTitle };
}

async function loginAndWaitForAdmin(page: Page, email: string, password: string) {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
  await waitForAuthLoadingToClear(page);
}

async function signupConsultant(page: Page, email: string, password: string, name: string) {
  await page.goto("/signup");
  await page.getByTestId("signup-role-consultant").click();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  await expect(page).toHaveURL(/\/signup-info/);
  console.log("e2e: consultant signup:infoPage", email);

  await page.locator("#consultant-name").fill(name);
  console.log("e2e: consultant signup:filled:name", email);
  await page.locator("#consultant-organization").fill("E2E Consulting");
  await page.locator("#consultant-email").fill(email);
  await page.locator("#consultant-phone").fill("01012345678");
  await page.locator("#consultant-expertise").fill("BM, GTM, Product");
  await page.locator("#consultant-bio").fill("Preview smoke test consultant profile.");
  console.log("e2e: consultant signup:filled:profile", email);
  await page.getByRole("button", { name: "승인 대기 요청" }).click();
  console.log("e2e: consultant signup:submitted", email);

  await expect(page).toHaveURL(/\/pending/);
  console.log("e2e: consultant signup:pending", email);
}

async function fillCompanySignupForm(page: Page, email: string, companyName: string) {
  console.log("e2e: company signup:fill:start", email);
  await page.getByTestId("company-type-prestartup").click();
  await page.getByTestId("company-signup-name").fill(companyName);
  console.log("e2e: company signup:fill:basic", email);

  await page.getByTestId("company-program-trigger").click();
  const firstProgramOption = page.locator('[data-testid^="company-program-option-"]').first();
  await expect(firstProgramOption).toBeVisible();
  await firstProgramOption.click();
  console.log("e2e: company signup:fill:program", email);

  await page.getByLabel("대표 솔루션 한 줄 소개").fill("글로벌 진출을 준비하는 B2B SaaS 솔루션을 운영합니다");
  console.log("e2e: company signup:fill:solution", email);
  await page.getByLabel("UN SDGs 우선순위 1위").selectOption({ index: 1 });
  await page.getByLabel("UN SDGs 우선순위 2위").selectOption({ index: 2 });
  console.log("e2e: company signup:fill:sdg", email);
  await page.getByLabel("대표자 성명").fill("홍길동");
  await page.getByLabel("대표자 나이").fill("35");
  await page.getByLabel("대표자 이메일").fill(email);
  await page.getByLabel("대표자 전화번호").fill("01012345678");
  await page
    .locator("label")
    .filter({ hasText: "대표자 성별" })
    .getByRole("button", { name: "남" })
    .click();
  await page.getByLabel("대표자 국적").fill("대한민국");
  await page.getByLabel("이전 창업 횟수").fill("1");
  await page.getByTestId("company-corep-no").click();
  console.log("e2e: company signup:fill:representative", email);
  await page.getByLabel("2026년 내 희망 투자액").fill("2050000000");
  await page.getByLabel("투자전 희망기업가치 (Pre-Value)").fill("20000000000");
  await page.getByLabel("MYSC에 가장 기대하는 점").fill("실행 연결과 후속 지원까지 밀도 있게 기대합니다");
  console.log("e2e: company signup:fill:funding", email);
  console.log("e2e: company signup:fill:done", email);
}

async function submitCompanySignup(page: Page, options?: { doubleConfirm?: boolean }) {
  const submitButton = page.getByTestId("company-signup-submit");
  await expect(submitButton).toBeEnabled({ timeout: 30_000 });
  await submitButton.click();
  console.log("e2e: company signup:consentOpen");
  await expect(page.getByTestId("company-consent-privacy")).toBeVisible();
  await page.getByTestId("company-consent-privacy").check();
  if (options?.doubleConfirm) {
    await page.evaluate(() => {
      const target = document.querySelector('[data-testid="company-consent-confirm"]');
      if (!(target instanceof HTMLElement)) {
        throw new Error("company-consent-confirm button not found");
      }
      target.click();
      target.click();
    });
  } else {
    const confirmButton = page.getByTestId("company-consent-confirm");
    await confirmButton.click();
  }
  console.log("e2e: company signup:consentSubmitted");
}

async function signupCompany(page: Page, email: string, password: string, companyName: string) {
  await page.goto("/signup");
  await page.getByTestId("signup-role-company").click();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  await expect(page).toHaveURL(/\/signup-info/);
  console.log("e2e: company signup:infoPage", email);

  await fillCompanySignupForm(page, email, companyName);
  await submitCompanySignup(page);

  await expect(page).toHaveURL(/\/pending/);
  console.log("e2e: company signup:pending", email);
}

async function approvePendingUser(page: Page, email: string) {
  console.log("e2e: approvePendingUser:start", email);
  await page.goto("/admin/admin-users");
  await page.getByPlaceholder("이메일 검색").fill(email);

  const approvalRow = page.locator("div.p-4").filter({ hasText: email }).first();
  await expect(approvalRow).toBeVisible();
  await approvalRow.getByRole("button", { name: "승인" }).click();
  await expect(approvalRow).toBeHidden({ timeout: 30_000 });
  console.log("e2e: approvePendingUser:done", email);
}

async function mapFirstAgendaToConsultant(
  page: Page,
  consultantName: string,
  preferredAgendaName?: string,
) {
  console.log("e2e: mapFirstAgendaToConsultant:start", consultantName, preferredAgendaName ?? "<first>");
  await page.goto("/admin/admin-consultants");
  await page.getByPlaceholder("컨설턴트 이름 검색").fill(consultantName);

  const row = page.locator("tr").filter({ hasText: consultantName }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "아젠다 매칭" }).click();

  const dialog = page.getByRole("dialog").filter({ hasText: `${consultantName} 아젠다 매칭` });
  await expect(dialog).toBeVisible();

  const agendaButton = preferredAgendaName
    ? dialog.locator(".space-y-2 > button").filter({ hasText: preferredAgendaName }).first()
    : dialog.locator(".space-y-2 > button").first();
  await expect(agendaButton).toBeVisible();

  const agendaName = (await agendaButton.locator("span.truncate").textContent())?.trim();
  if (!agendaName) {
    throw new Error("매칭할 아젠다를 찾지 못했습니다.");
  }

  await agendaButton.click();
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  console.log("e2e: mapFirstAgendaToConsultant:done", consultantName, agendaName);
  return agendaName;
}

async function enableConsultantSchedule(page: Page) {
  await page.goto("/admin/consultant-profile");
  const selectAllButton = page.getByTestId("consultant-schedule-select-all");
  const saveButton = page.getByTestId("consultant-schedule-save");
  await expect(selectAllButton).toBeVisible();
  await expect(saveButton).toBeVisible();
  const scheduleCard = page.locator("div").filter({ hasText: "내 스케줄 설정" }).first();
  const unavailableSlot = scheduleCard.locator('button[aria-pressed="false"]').first();
  if ((await unavailableSlot.count()) === 0) {
    await expect(saveButton).toBeDisabled();
    return;
  }

  await selectAllButton.click();
  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await saveButton.click();
  await expect(saveButton).toBeDisabled({ timeout: 15_000 });
}

function ticketSummaryCard(page: Page, label: "내부 티켓" | "외부 티켓") {
  return page.locator("div.rounded-lg.border.p-3").filter({ hasText: label }).first();
}

async function openRegularApplicationAgendaStepForOfficeHour(page: Page, officeHourId: string) {
  await openRegularApplicationSheetForOfficeHour(page, officeHourId);
  await expect(page.getByTestId("regular-agenda-trigger")).toBeVisible({ timeout: 30_000 });
}

async function submitRegularApplication(
  page: Page,
  companyName: string,
  agendaName: string,
  preferredSelection?: { dateIndex: number; time: string; expectDisabled?: boolean },
) {
  const officeHourId = await getRegularOfficeHourIdForCompany(companyName, agendaName);
  const { officeHourTitle, selectedDateIndex, selectedTime } =
    await openRegularApplicationWizardForOfficeHour(page, officeHourId, agendaName, preferredSelection);

  const functionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("submitRegularApplication") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );

  await page.getByTestId("regular-wizard-submit").click();
  const functionResponse = await functionResponsePromise;
  const responseText = await functionResponse.text();
  console.log(
    "submitRegularApplication response:",
    functionResponse.status(),
    responseText.slice(0, 600),
  );
  if (!functionResponse.ok()) {
    throw new Error(`정기 예약 제출 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
  }

  await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });

  return { officeHourTitle, officeHourId, selectedDateIndex, selectedTime };
}

async function claimApplication(page: Page, companyName: string) {
  await page.goto("/admin/admin-applications");
  await page.getByPlaceholder("신청 기업명으로 검색").fill(companyName);

  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await rows.first().getByRole("button", { name: "상세보기" }).click();

  const modal = page.getByRole("dialog").filter({ hasText: companyName });
  await expect(modal).toBeVisible();
  await modal.getByTestId("application-accept").click();

  const actionDialog = page.getByRole("dialog").filter({ hasText: "확정 확인" });
  await expect(actionDialog).toBeVisible();
  const functionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("transitionApplicationStatus") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await actionDialog.getByTestId("application-action-confirm").click();
  const functionResponse = await functionResponsePromise;
  const responseText = await functionResponse.text();
  console.log("transitionApplicationStatus accept:", functionResponse.status(), responseText.slice(0, 600));
  if (!functionResponse.ok()) {
    throw new Error(`수락 처리 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
  }
  await expect(actionDialog).toBeHidden({ timeout: 30_000 });
}

async function openPendingApplication(page: Page, applicationId: string) {
  await page.goto(`/company/application?id=${applicationId}`);
  await waitForAuthLoadingToClear(page);
  await expect(page).toHaveURL(new RegExp(`/company/application\\?id=${escapeRegExp(applicationId)}`), {
    timeout: 30_000,
  });
}

async function cancelPendingApplication(page: Page, applicationId: string) {
  await openPendingApplication(page, applicationId);
  const deleteButton = page.getByRole("button", { name: "신청 삭제" }).first();
  await expect(deleteButton).toBeVisible({ timeout: 30_000 });
  const functionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("cancelApplication") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await deleteButton.click();

  const dialog = page.getByRole("alertdialog").filter({ hasText: "신청을 삭제하시겠습니까?" }).first();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "삭제" }).click();
  const functionResponse = await functionResponsePromise;
  const responseText = await functionResponse.text();
  console.log("cancelApplication:", functionResponse.status(), responseText.slice(0, 600));
  if (!functionResponse.ok()) {
    throw new Error(`취소 처리 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
  }

  await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
}

async function rejectApplication(page: Page, companyName: string, reason: string) {
  await page.goto("/admin/admin-applications");
  await page.getByPlaceholder("신청 기업명으로 검색").fill(companyName);

  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
  const row = page.locator("tbody tr").first();
  await row.getByRole("button", { name: "상세보기" }).click();

  const modal = page.getByRole("dialog").filter({ hasText: companyName });
  await expect(modal).toBeVisible();
  await modal.getByTestId("application-reject").click();

  const actionDialog = page.getByRole("dialog").filter({ hasText: "거절 사유 입력" });
  await expect(actionDialog).toBeVisible();
  await actionDialog.locator("#reject-reason").fill(reason);
  const functionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("transitionApplicationStatus") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await actionDialog.getByTestId("application-action-confirm").click();
  await expect(actionDialog).toBeHidden({ timeout: 15_000 });
  const functionResponse = await functionResponsePromise;
  const responseText = await functionResponse.text();
  console.log("transitionApplicationStatus reject:", functionResponse.status(), responseText.slice(0, 600));
  if (!functionResponse.ok()) {
    throw new Error(`거절 처리 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
  }
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

async function provisionApprovedConsultant(browser: Browser, seed = uniqueSeed()) {
  const consultant = {
    name: `E2E Consultant ${seed}`,
    email: `e2e-consultant-${seed}@example.com`,
    password: "Pw123456!",
  };

  {
    const { context, page } = await newPage(browser);
    await signupConsultant(page, consultant.email, consultant.password, consultant.name);
    await context.close();
  }

  const adminSession = await newPage(browser);
  await loginAndWaitForAdmin(adminSession.page, adminCredentials.email!, adminCredentials.password!);
  await approvePendingUser(adminSession.page, consultant.email);
  const agendaName = await mapFirstAgendaToConsultant(adminSession.page, consultant.name);
  await setConsultantAvailability(consultant.email);

  await adminSession.context.close();

  return {
    consultant,
    agendaName,
  };
}

async function provisionApprovedConsultantAccount(browser: Browser, seed = uniqueSeed()) {
  const consultant = {
    name: `E2E Consultant ${seed}`,
    email: `e2e-consultant-${seed}@example.com`,
    password: "Pw123456!",
  };

  {
    const { context, page } = await newPage(browser);
    console.log("e2e: consultant signup:start", consultant.email);
    await signupConsultant(page, consultant.email, consultant.password, consultant.name);
    console.log("e2e: consultant signup:done", consultant.email);
    await context.close();
  }

  const adminSession = await newPage(browser);
  console.log("e2e: consultant approval:start", consultant.email);
  await loginAndWaitForAdmin(adminSession.page, adminCredentials.email!, adminCredentials.password!);
  await approvePendingUser(adminSession.page, consultant.email);
  console.log("e2e: consultant approval:done", consultant.email);
  await adminSession.context.close();

  return { consultant };
}

async function getFirstAgendaOptionForCompany(browser: Browser, company: { email: string; password: string }) {
  const { context, page } = await newPage(browser);
  await loginAndWaitForCompany(page, company.email, company.password);
  await page.goto("/company/regular");
  await waitForRegularCalendarReady(page);
  const session = page.locator('[data-testid^="regular-calendar-session-"]').first();
  await expect(session).toBeVisible({ timeout: 30_000 });
  await session.click();
  await page.getByTestId("regular-start-application").click();
  await expect(page.getByTestId("regular-agenda-trigger")).toBeVisible();
  await page.getByTestId("regular-agenda-trigger").click();
  const firstAgendaOption = page.locator('[role="option"]').first();
  await expect(firstAgendaOption).toBeVisible({ timeout: 30_000 });
  const rawText = ((await firstAgendaOption.textContent()) ?? "").trim();
  await context.close();
  const agendaName = rawText.split("·")[0]?.trim();
  if (!agendaName) {
    throw new Error("회사 regular wizard에서 사용할 아젠다를 찾지 못했습니다.");
  }
  return agendaName;
}

async function configureConsultantAgendaAndSchedule(
  browser: Browser,
  consultant: { name: string; email: string; password: string },
  agenda: E2EAgendaRef | string,
) {
  const agendaRef = await resolveAgendaRef(agenda);
  console.log("e2e: configureConsultant:start", consultant.email, agendaRef.agendaName);
  await assignAgendaToConsultantRecord(consultant.email, agenda);
  console.log("e2e: configureConsultant:agendaAssigned", consultant.email, agendaRef.agendaName);
  await setConsultantAvailability(consultant.email);
  console.log("e2e: configureConsultant:availabilitySet", consultant.email);
  await expectConsultantAgendaSlotsReady(consultant.email, agenda);
  console.log("e2e: configureConsultant:ready", consultant.email, agendaRef.agendaName);
}

async function provisionApprovedConsultantWithAgenda(
  browser: Browser,
  agendaName: string,
  seed = uniqueSeed(),
) {
  const consultant = {
    name: `E2E Consultant ${seed}`,
    email: `e2e-consultant-${seed}@example.com`,
    password: "Pw123456!",
  };

  {
    const { context, page } = await newPage(browser);
    await signupConsultant(page, consultant.email, consultant.password, consultant.name);
    await context.close();
  }

  const adminSession = await newPage(browser);
  await loginAndWaitForAdmin(adminSession.page, adminCredentials.email!, adminCredentials.password!);
  await approvePendingUser(adminSession.page, consultant.email);
  const mappedAgendaName = await mapFirstAgendaToConsultant(
    adminSession.page,
    consultant.name,
    agendaName,
  );
  await setConsultantAvailability(consultant.email);

  await adminSession.context.close();

  return {
    consultant,
    agendaName: mappedAgendaName,
  };
}

async function provisionApprovedCompany(browser: Browser, seed = uniqueSeed()) {
  const company = {
    name: `E2E Company ${seed}`,
    email: `e2e-company-${seed}@example.com`,
    password: "Pw123456!",
  };

  {
    const { context, page } = await newPage(browser);
    console.log("e2e: company signup:start", company.email);
    await signupCompany(page, company.email, company.password, company.name);
    console.log("e2e: company signup:done", company.email);
    await context.close();
  }

  const adminSession = await newPage(browser);
  console.log("e2e: company approval:start", company.email);
  await loginAndWaitForAdmin(adminSession.page, adminCredentials.email!, adminCredentials.password!);
  await adminSession.page.goto("/admin/admin-users");
  await approvePendingUser(adminSession.page, company.email);
  console.log("e2e: company approval:done", company.email);
  await adminSession.context.close();

  return {
    company,
  };
}

async function provisionApprovedConsultantAndCompany(browser: Browser, seed = uniqueSeed()) {
  const agenda = await createE2EAgenda(seed);
  const { consultant } = await provisionApprovedConsultantAccount(browser, seed);
  const { company } = await provisionApprovedCompany(browser, seed);
  await configureConsultantAgendaAndSchedule(browser, consultant, agenda);

  return {
    consultant,
    company,
    agendaName: agenda.agendaName,
    agendaId: agenda.agendaId,
  };
}

async function expectSinglePendingApproval(page: Page, email: string) {
  await page.goto("/admin/admin-users");
  await page.getByPlaceholder("이메일 검색").fill(email);
  await expect(page.locator("div.p-4").filter({ hasText: email })).toHaveCount(1, {
    timeout: 30_000,
  });
}

async function expectSingleApplicationRow(page: Page, companyName: string) {
  await page.goto("/admin/admin-applications");
  await page.getByPlaceholder("신청 기업명으로 검색").fill(companyName);
  await expect(page.locator("tbody tr").filter({ hasText: companyName })).toHaveCount(1, {
    timeout: 30_000,
  });
}

async function expectNoApplicationRow(page: Page, companyName: string) {
  await page.goto("/admin/admin-applications");
  await page.getByPlaceholder("신청 기업명으로 검색").fill(companyName);
  await expect(page.locator("tbody tr").filter({ hasText: companyName })).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function openRegularApplicationWizard(
  page: Page,
  agendaName: string,
  preferredSelection?: { sessionIndex?: number; dateIndex: number; time: string; expectDisabled?: boolean },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/company/regular");
    await waitForAuthLoadingToClear(page);
    await waitForRegularCalendarReady(page);
    const sessionCards = page.locator('[data-testid^="regular-calendar-session-"]');
    const sessionCount = await sessionCards.count();
    const targetSessionIndexes =
      preferredSelection && typeof preferredSelection.sessionIndex === "number"
        ? [preferredSelection.sessionIndex]
        : Array.from({ length: sessionCount }, (_, index) => index);

    for (const sessionIndex of targetSessionIndexes) {
      await page.goto("/company/regular");
      await waitForRegularCalendarReady(page);
      const sessionCard = page.locator('[data-testid^="regular-calendar-session-"]').nth(sessionIndex);
      await expect(sessionCard).toBeVisible({ timeout: 30_000 });
      await sessionCard.click();

      const officeHourTitle =
        (await page.locator("h1").first().textContent())?.trim() || "정기 오피스아워";

      await page.getByTestId("regular-start-application").click();
      await expect(page.getByTestId("regular-agenda-trigger")).toBeVisible();

      await page.getByTestId("regular-agenda-trigger").click();
      await page
        .getByText(new RegExp(`^${escapeRegExp(agendaName)}\\s+·`))
        .click();
      await page.getByTestId("regular-wizard-next").click();

      const enabledDates = page.locator('[role="gridcell"]:not([disabled]):not([aria-disabled="true"])');
      const enabledDateCount = await enabledDates.count();
      let foundSchedulableDate = false;
      let selectedDateIndex = -1;
      let selectedTime = "";

  if (selection) {
        const dateCell = enabledDates.nth(preferredSelection.dateIndex);
        await expect(dateCell).toBeVisible();
        await dateCell.click();
        const preferredTime = page.getByTestId(
          `regular-time-slot-${preferredSelection.time.replace(":", "-")}`,
        );
        await expect(preferredTime).toBeVisible();
        if (preferredSelection.expectDisabled) {
          await expect(preferredTime).toBeDisabled();
        } else {
          await expect(preferredTime).toBeEnabled();
          await preferredTime.click();
        }
        selectedDateIndex = preferredSelection.dateIndex;
        selectedTime = preferredSelection.time;
        foundSchedulableDate = !preferredSelection.expectDisabled;
      }

      for (let index = 0; index < enabledDateCount; index += 1) {
        if (preferredSelection) break;
        const dateCell = enabledDates.nth(index);
        await expect(dateCell).toBeVisible();
        await dateCell.click();

        const firstEnabledTime = page.locator('[data-testid^="regular-time-slot-"]:not([disabled])').first();
        if (await firstEnabledTime.count()) {
          selectedDateIndex = index;
          selectedTime = ((await firstEnabledTime.textContent()) ?? "").trim().split(/\s+/u)[0] ?? "";
          await firstEnabledTime.click();
          foundSchedulableDate = true;
          break;
        }
      }

      if (!foundSchedulableDate && !preferredSelection) {
        continue;
      }

      if (preferredSelection?.expectDisabled) {
        return {
          officeHourTitle,
          sessionIndex,
          selectedDateIndex,
          selectedTime,
        };
      }

      if (!foundSchedulableDate) {
        continue;
      }

      await page.getByTestId("regular-wizard-next").click();
      await page.getByTestId("regular-wizard-next").click();

      await page
        .getByTestId("regular-request-currentSituation")
        .fill("현재 제품 출시 전환과 초기 매출 확보를 동시에 준비 중입니다.");
      await page
        .getByTestId("regular-request-keyChallenges")
        .fill("시장 진입 우선순위와 초기 세일즈 메시지가 명확하지 않아 실행이 지연됩니다.");
      await page
        .getByTestId("regular-request-requestedSupport")
        .fill("우선 타겟 고객군과 초기 영업 접근 전략을 함께 정리하고 싶습니다.");
      await page.getByTestId("regular-wizard-next").click();

      return { officeHourTitle, sessionIndex, selectedDateIndex, selectedTime };
    }
  }

  throw new Error("신청 가능한 regular office hour session을 찾지 못했습니다.");
}

async function openRegularApplicationWizardForOfficeHour(
  page: Page,
  officeHourId: string,
  agendaName: string,
  preferredSelection?: { dateIndex: number; time: string; expectDisabled?: boolean },
) {
  await page.goto(`/company/regular-detail?id=${encodeURIComponent(officeHourId)}`);
  await waitForAuthLoadingToClear(page);
  const officeHourTitle =
    (await page.locator("h1").first().textContent())?.trim() || "정기 오피스아워";
  await expect(page.getByTestId("regular-start-application")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("regular-start-application").click();
  await expect(page.getByTestId("regular-agenda-trigger")).toBeVisible({ timeout: 30_000 });

  const sessionIndexes = preferredSelection
    ? [preferredSelection.dateIndex]
    : Array.from({ length: 31 }, (_, index) => index);

  for (const sessionIndex of sessionIndexes) {
    if (sessionIndex > 0 || preferredSelection) {
      await page.goto(`/company/regular-detail?id=${encodeURIComponent(officeHourId)}`);
      await waitForAuthLoadingToClear(page);
      await expect(page.getByTestId("regular-start-application")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("regular-start-application").click();
      await expect(page.getByTestId("regular-agenda-trigger")).toBeVisible({ timeout: 30_000 });
    }

    await page.getByTestId("regular-agenda-trigger").click();
    await page
      .getByText(new RegExp(`^${escapeRegExp(agendaName)}\\s+·`))
      .click();

    let selectedTime = "";
    let foundSchedulableTime = false;

    if (preferredSelection) {
      const preferredTime = page.getByTestId(
        `regular-time-slot-${preferredSelection.time.replace(":", "-")}`,
      );
      await expect(preferredTime).toBeVisible({ timeout: 30_000 });
      if (preferredSelection.expectDisabled) {
        await expect(preferredTime).toBeDisabled();
        return { officeHourTitle, selectedDateIndex: sessionIndex, selectedTime: preferredSelection.time };
      }
      if (await preferredTime.isEnabled()) {
        await preferredTime.click();
        selectedTime = preferredSelection.time;
        foundSchedulableTime = true;
      }
    } else {
      const firstEnabledTime = page.locator('[data-testid^="regular-time-slot-"]:not([disabled])').first();
      if (await firstEnabledTime.count()) {
        selectedTime = ((await firstEnabledTime.textContent()) ?? "").trim().split(/\s+/u)[0] ?? "";
        await firstEnabledTime.click();
        foundSchedulableTime = true;
      }
    }

    if (!foundSchedulableTime) {
      continue;
    }

    await page
      .getByTestId("regular-request-currentSituation")
      .fill("현재 제품 출시 전환과 초기 매출 확보를 동시에 준비 중입니다.");
    await page
      .getByTestId("regular-request-keyChallenges")
      .fill("시장 진입 우선순위와 초기 세일즈 메시지가 명확하지 않아 실행이 지연됩니다.");
    await page
      .getByTestId("regular-request-requestedSupport")
      .fill("우선 타겟 고객군과 초기 영업 접근 전략을 함께 정리하고 싶습니다.");
    await page.getByTestId("regular-wizard-next").click();

    return { officeHourTitle, selectedDateIndex: sessionIndex, selectedTime };
  }

  if (preferredSelection) {
    throw new Error("선택한 날짜/시간으로는 현재 신청 가능한 정기 오피스아워를 찾지 못했습니다.");
  }

  throw new Error("선택한 정기 오피스아워에서 신청 가능한 시간대를 찾지 못했습니다.");
}

test.describe("preview smoke", () => {
  test.skip(
    !adminCredentials.email ||
      !adminCredentials.password ||
      !firebaseConfig.apiKey ||
      !firebaseConfig.projectId,
    "관리자 계정과 Firebase env가 필요합니다. E2E_ADMIN_EMAIL/PASSWORD 및 VITE_FIREBASE_API_KEY/PROJECT_ID를 설정하세요.",
  );

  test.beforeEach(() => {
    cleanupPreviewTestAccounts();
  });

  test.beforeEach(async () => {
    await cleanupE2EAgendas();
  });

  test("consultant and company flow stays consistent through approval and regular booking", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    console.log("step: consultant/company provisioning");
    const { consultant, company, agendaName } = await provisionApprovedConsultantAndCompany(browser);
    const officeHourId = await getRegularOfficeHourIdForCompany(company.name, agendaName);

    let officeHourTitle = "";
    let applicationId = "";
    {
      console.log("step: company regular application");
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      ({ officeHourTitle } = await openRegularApplicationWizardForOfficeHour(page, officeHourId, agendaName));
      const functionResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("submitRegularApplication") &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByTestId("regular-wizard-submit").click();
      const functionResponse = await functionResponsePromise;
      const responseText = await functionResponse.text();
      if (!functionResponse.ok()) {
        throw new Error(`정기 예약 제출 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
      }
      await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
      await expect(page.getByText(officeHourTitle)).toBeVisible();
      await expect(page.getByText("수락 대기").first()).toBeVisible();
      const applicationDoc = await expectSingleApplicationDoc(company.name);
      applicationId = applicationDoc.id;
      expect(applicationDoc.data.status).toBe("pending");
      expect(applicationDoc.data.agenda).toBe(agendaName);
      expect(Array.isArray(applicationDoc.data.pendingConsultantIds)).toBe(true);
      expect((applicationDoc.data.pendingConsultantIds as unknown[]).length).toBe(1);
      await context.close();
    }

    {
      console.log("step: consultant claim");
      const { context, page } = await newPage(browser);
      await loginAndWaitForAdmin(page, consultant.email, consultant.password);
      await claimApplication(page, company.name);
      await expect.poll(async () => {
        const applicationDoc = await expectSingleApplicationDoc(company.name);
        return applicationDoc.data.status;
      }, { timeout: 30_000 }).toBe("confirmed");
      const claimedDoc = await expectSingleApplicationDoc(company.name);
      expect(String(claimedDoc.data.consultantId ?? "")).not.toBe("");
      expect(claimedDoc.data.consultant).toBe(consultant.name);
      await context.close();
    }

    {
      console.log("step: company verification");
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      await page.goto(`/company/application?id=${applicationId}`);
      await expect(page).toHaveURL(new RegExp(`/company/application\\?id=${escapeRegExp(applicationId)}`), {
        timeout: 30_000,
      });
      await expect(page.locator("main")).toContainText(officeHourTitle, {
        timeout: 30_000,
      });
      await expect(page.getByText("확정").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(consultant.name).first()).toBeVisible({ timeout: 30_000 });
      await context.close();
    }
  });

  test("company can cancel a pending application and ticket usage is restored", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    const { company, agendaName } = await provisionApprovedConsultantAndCompany(browser);
    const officeHourId = await getRegularOfficeHourIdForCompany(company.name, agendaName);

    let officeHourTitle = "";
    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      ({ officeHourTitle } = await openRegularApplicationWizardForOfficeHour(page, officeHourId, agendaName));
      const functionResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("submitRegularApplication") &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByTestId("regular-wizard-submit").click();
      const functionResponse = await functionResponsePromise;
      const responseText = await functionResponse.text();
      if (!functionResponse.ok()) {
        throw new Error(`정기 예약 제출 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
      }
      await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
        timeout: 30_000,
      });
      const applicationDoc = await expectSingleApplicationDoc(company.name);
      expect(applicationDoc.data.status).toBe("pending");
      await cancelPendingApplication(page, applicationDoc.id);
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(async () => (await getApplicationsByCompanyName(company.name)).length, {
        timeout: 30_000,
      }).toBe(0);
      await context.close();
    }
  });

  test("consultant can reject a pending application and company sees rejection reason", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    const { consultant, company, agendaName } = await provisionApprovedConsultantAndCompany(browser);
    const rejectionReason = "현재 해당 시간에 지원 가능한 범위가 아닙니다.";

    let officeHourTitle = "";
    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      ({ officeHourTitle } = await submitRegularApplication(page, company.name, agendaName));
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
        timeout: 30_000,
      });
      const applicationDoc = await expectSingleApplicationDoc(company.name);
      expect(applicationDoc.data.status).toBe("pending");
      await context.close();
    }

    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForAdmin(page, consultant.email, consultant.password);
      await rejectApplication(page, company.name, rejectionReason);
      await expect.poll(async () => {
        const applicationDoc = await expectSingleApplicationDoc(company.name);
        return applicationDoc.data.status;
      }, { timeout: 30_000 }).toBe("rejected");
      await context.close();
    }

    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      await page.goto("/company/dashboard");
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
        timeout: 30_000,
      });
      const rejectedTab = page.getByRole("button", { name: /거절됨/ }).first();
      await expect(rejectedTab).toBeVisible({ timeout: 30_000 });
      await rejectedTab.click();
      await page.getByText(officeHourTitle).first().click();
      await expect(page.getByText(rejectionReason, { exact: true })).toBeVisible({ timeout: 30_000 });
      const rejectedDoc = await expectSingleApplicationDoc(company.name);
      expect(rejectedDoc.data.status).toBe("rejected");
      expect(rejectedDoc.data.rejectionReason).toBe(rejectionReason);
      await context.close();
    }
  });

  test("internal ticket limit of one blocks a second booking until cancellation restores it", async ({
    browser,
  }) => {
    test.setTimeout(6 * 60 * 1000);
    const seed = uniqueSeed();
    const agenda = await createE2EAgenda(seed);
    try {
      const { consultant } = await provisionApprovedConsultantAccount(browser, seed);
      const { company } = await provisionApprovedCompany(browser, seed);
      await configureConsultantAgendaAndSchedule(browser, consultant, agenda);

      const companyDoc = await expectSingleCompanyDoc(company.name);
      const programIds = Array.isArray(companyDoc.data.programs) ? companyDoc.data.programs : [];
      expect(programIds).toHaveLength(1);
      const [programId] = programIds.map((value) => String(value));
      if (!programId) {
        throw new Error("티켓 override를 설정할 programId를 찾지 못했습니다.");
      }
      await updateFirestoreDocument(`companies/${companyDoc.id}`, {
        programTicketOverrides: {
          [programId]: {
            internal: 1,
            external: 0,
          },
        },
      });

      let officeHourTitle = "";
      const officeHourId = await getRegularOfficeHourIdForCompany(company.name, agenda.agendaName);
      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, company.email, company.password);
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
          timeout: 30_000,
        });
        ({ officeHourTitle } = await openRegularApplicationWizardForOfficeHour(page, officeHourId, agenda.agendaName));
        const functionResponsePromise = page.waitForResponse(
          (response) =>
            response.url().includes("submitRegularApplication") &&
            response.request().method() === "POST",
          { timeout: 30_000 },
        );
        await page.getByTestId("regular-wizard-submit").click();
        const functionResponse = await functionResponsePromise;
        const responseText = await functionResponse.text();
        if (!functionResponse.ok()) {
          throw new Error(`정기 예약 제출 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
        }
        await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
          timeout: 30_000,
        });
        const applicationDoc = await expectSingleApplicationDoc(company.name);
        expect(applicationDoc.data.status).toBe("pending");
        expect(Array.isArray(applicationDoc.data.pendingConsultantIds)).toBe(true);
        expect((applicationDoc.data.pendingConsultantIds as unknown[]).length).toBe(1);
        await context.close();
      }

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, company.email, company.password);
        await openRegularApplicationAgendaStepForOfficeHour(page, officeHourId);
        await page.getByTestId("regular-agenda-trigger").click();
        const exhaustedAgendaOption = page.getByRole("option", {
          name: new RegExp(`^${escapeRegExp(agenda.agendaName)}\\s+·\\s+내부\\s+\\(티켓 소진\\)$`),
        });
        await expect(exhaustedAgendaOption).toBeVisible({ timeout: 30_000 });
        await expect(exhaustedAgendaOption).toHaveAttribute("aria-disabled", "true");
        await page.keyboard.press("Escape");
        await expect.poll(async () => (await getApplicationsByCompanyName(company.name)).length, {
          timeout: 30_000,
        }).toBe(1);
        await context.close();
      }

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, company.email, company.password);
        const applicationDoc = await expectSingleApplicationDoc(company.name);
        await cancelPendingApplication(page, applicationDoc.id);
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
          timeout: 30_000,
        });
        await expect.poll(async () => (await getApplicationsByCompanyName(company.name)).length, {
          timeout: 30_000,
        }).toBe(0);
        await context.close();
      }

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, company.email, company.password);
        await openRegularApplicationWizardForOfficeHour(page, officeHourId, agenda.agendaName);
        const functionResponsePromise = page.waitForResponse(
          (response) =>
            response.url().includes("submitRegularApplication") &&
            response.request().method() === "POST",
          { timeout: 30_000 },
        );
        await page.getByTestId("regular-wizard-submit").click();
        const functionResponse = await functionResponsePromise;
        const responseText = await functionResponse.text();
        if (!functionResponse.ok()) {
          throw new Error(`정기 예약 재신청 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
        }
        await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
          timeout: 30_000,
        });
        const applicationDoc = await expectSingleApplicationDoc(company.name);
        expect(applicationDoc.data.status).toBe("pending");
        await context.close();
      }
    } finally {
      await cleanupE2EAgendas();
    }
  });

  test("internal and external tickets are tracked independently", async ({
    browser,
  }) => {
    test.setTimeout(7 * 60 * 1000);
    const seed = uniqueSeed();
    const internalAgenda = await createE2EAgenda(`${seed}-internal`, "internal");
    const externalAgenda = await createE2EAgenda(`${seed}-external`, "external");
    try {
      const { consultant } = await provisionApprovedConsultantAccount(browser, seed);
      const { company } = await provisionApprovedCompany(browser, seed);
      await configureConsultantAgendaAndSchedule(browser, consultant, internalAgenda);
      await configureConsultantAgendaAndSchedule(browser, consultant, externalAgenda);

      const companyDoc = await expectSingleCompanyDoc(company.name);
      const programIds = Array.isArray(companyDoc.data.programs) ? companyDoc.data.programs : [];
      expect(programIds).toHaveLength(1);
      const [programId] = programIds.map((value) => String(value));
      if (!programId) {
        throw new Error("티켓 override를 설정할 programId를 찾지 못했습니다.");
      }
      await updateFirestoreDocument(`companies/${companyDoc.id}`, {
        programTicketOverrides: {
          [programId]: {
            internal: 1,
            external: 1,
          },
        },
      });

      let selectedDateIndex = -1;
      let selectedTime = "";
      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, company.email, company.password);
        ({ selectedDateIndex, selectedTime } = await submitRegularApplication(
          page,
          company.name,
          internalAgenda.agendaName,
        ));
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
          timeout: 30_000,
        });
        await expect(ticketSummaryCard(page, "외부 티켓").getByText("예약 0")).toBeVisible({
          timeout: 30_000,
        });
        await context.close();
      }

      const externalOfficeHourId = await getRegularOfficeHourIdForCompany(company.name, externalAgenda.agendaName);
      {
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      await openRegularApplicationAgendaStepForOfficeHour(page, externalOfficeHourId);
      await page.getByTestId("regular-agenda-trigger").click();
      const exhaustedAgendaOption = page
        .getByRole("option")
        .filter({
          hasText: new RegExp(`^${escapeRegExp(externalAgenda.agendaName)}\\s+·\\s+외부\\s+\\(티켓\\s+소진\\)`),
        })
        .first();
      await expect(exhaustedAgendaOption).toBeVisible({ timeout: 30_000 });
      await expect(exhaustedAgendaOption).toHaveAttribute("aria-disabled", "true");
      await page.keyboard.press("Escape");
      await context.close();
      }

      await expect.poll(async () => (await getApplicationsByCompanyName(company.name)).length, {
        timeout: 30_000,
      }).toBe(2);

      const applicationDocs = await getApplicationsByCompanyName(company.name);
      const agendaIds = new Set(applicationDocs.map((doc) => String(doc.data.agendaId ?? "")));
      expect(agendaIds).toEqual(new Set([internalAgenda.agendaId, externalAgenda.agendaId]));
    } finally {
      await cleanupE2EAgendas();
    }
  });

  test("company signup stays single even if the final confirmation is retried", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    const seed = uniqueSeed();
    const company = {
      name: `E2E Company ${seed}`,
      email: `e2e-company-${seed}@example.com`,
      password: "Pw123456!",
    };

    {
      console.log("step: duplicate company signup submit");
      const { context, page } = await newPage(browser);
      await page.goto("/signup");
      await page.getByTestId("signup-role-company").click();
      await page.getByTestId("auth-email").fill(company.email);
      await page.getByTestId("auth-password").fill(company.password);
      await page.getByTestId("auth-submit").click();
      await expect(page).toHaveURL(/\/signup-info/);

      await fillCompanySignupForm(page, company.email, company.name);
      await submitCompanySignup(page, { doubleConfirm: true });
      await expect(page).toHaveURL(/\/pending/, { timeout: 10_000 });
      await context.close();
    }

    {
      console.log("step: duplicate company signup admin verification");
      const { context, page } = await newPage(browser);
      await loginAndWaitForAdmin(page, adminCredentials.email!, adminCredentials.password!);
      await expectSinglePendingApproval(page, company.email);
      await expect.poll(async () => {
        const docs = await runFirestoreQuery("signupRequests", "email", company.email);
        return docs.length;
      }, { timeout: 30_000 }).toBe(1);
      await context.close();
    }
  });

  test("regular application submit stays single even if submit is clicked twice", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
      console.log("step: duplicate regular submit provisioning");
      const { company, agendaName } = await provisionApprovedConsultantAndCompany(browser);
      const officeHourId = await getRegularOfficeHourIdForCompany(company.name, agendaName);

      {
        console.log("step: duplicate regular submit company action");
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, company.email, company.password);
        await openRegularApplicationWizardForOfficeHour(page, officeHourId, agendaName);

      const responses: Array<{ status: number; body: string }> = [];
      page.on("response", async (response) => {
        if (
          response.url().includes("submitRegularApplication") &&
          response.request().method() === "POST"
        ) {
          responses.push({
            status: response.status(),
            body: (await response.text()).slice(0, 600),
          });
        }
      });

      const submitButton = page.getByTestId("regular-wizard-submit");
      await submitButton.dispatchEvent("click");
      await submitButton.dispatchEvent("click");

      await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 10_000 });
      await expect.poll(() => responses.length, { timeout: 10_000 }).toBe(1);
      expect(responses[0]?.status).toBe(200);
      await expect(page.locator("div.cursor-pointer.rounded-xl").filter({ hasText: "수락 대기" })).toHaveCount(1, {
        timeout: 30_000,
      });
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
        timeout: 30_000,
      });
      const applicationDoc = await expectSingleApplicationDoc(company.name);
      expect(applicationDoc.data.status).toBe("pending");
      expect(Array.isArray(applicationDoc.data.pendingConsultantIds)).toBe(true);
      expect((applicationDoc.data.pendingConsultantIds as unknown[]).length).toBe(1);
      await context.close();
    }

    {
      console.log("step: duplicate regular submit admin verification");
      const { context, page } = await newPage(browser);
      await loginAndWaitForAdmin(page, adminCredentials.email!, adminCredentials.password!);
      await expectSingleApplicationRow(page, company.name);
      await expect.poll(async () => (await getApplicationsByCompanyName(company.name)).length, {
        timeout: 30_000,
      }).toBe(1);
      await context.close();
    }
  });

  test("same slot cannot be requested twice by different companies", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    console.log("step: same slot duplicate provisioning");
    const seed = uniqueSeed();
    const agenda = await createE2EAgenda(seed);
    try {
      const { consultant } = await provisionApprovedConsultantAccount(browser, `${seed}-a`);
      const { company: companyA } = await provisionApprovedCompany(browser, `${seed}-a`);
      const { company: companyB } = await provisionApprovedCompany(browser, `${seed}-b`);
      await configureConsultantAgendaAndSchedule(browser, consultant, agenda);

      let selectedDateIndex = -1;
      let selectedTime = "";
      {
        console.log("step: same slot duplicate company A submit");
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, companyA.email, companyA.password);
        ({ selectedDateIndex, selectedTime } = await submitRegularApplication(
          page,
          companyA.name,
          agenda.agendaName,
        ));
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
          timeout: 30_000,
        });
        const applicationDoc = await expectSingleApplicationDoc(companyA.name);
        expect(applicationDoc.data.status).toBe("pending");
        await context.close();
      }

      {
        console.log("step: same slot duplicate company B blocked");
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, companyB.email, companyB.password);
        const officeHourIdB = await getRegularOfficeHourIdForCompany(companyB.name, agenda.agendaName);
        await openRegularApplicationWizardForOfficeHour(page, officeHourIdB, agenda.agendaName, {
          dateIndex: selectedDateIndex,
          time: selectedTime,
          expectDisabled: true,
        });
        await page.goto("/company/dashboard");
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
          timeout: 30_000,
        });
        await context.close();
      }

      {
        console.log("step: same slot duplicate admin verification");
        const { context, page } = await newPage(browser);
        await loginAndWaitForAdmin(page, adminCredentials.email!, adminCredentials.password!);
        await expectSingleApplicationRow(page, companyA.name);
        await expectNoApplicationRow(page, companyB.name);
        await expect.poll(async () => (await getApplicationsByCompanyName(companyA.name)).length, {
          timeout: 30_000,
        }).toBe(1);
        await expect.poll(async () => (await getApplicationsByCompanyName(companyB.name)).length, {
          timeout: 30_000,
        }).toBe(0);
        await context.close();
      }
    } finally {
      await cleanupE2EAgendas();
    }
  });

  test("multi-consultant pending targets both consultants and blocks the same time for others", async ({
    browser,
  }) => {
    test.setTimeout(6 * 60 * 1000);
    console.log("step: multi-consultant same slot provisioning");
    const seed = uniqueSeed();
    const agenda = await createE2EAgenda(seed);
    try {
      const { consultant: primaryConsultant } = await getExistingQaConsultant(0);
      const { consultant: secondaryConsultant } = await getExistingQaConsultant(1);
      const { company: companyA } = await getExistingQaCompany(0);
      const { company: companyB } = await getExistingQaCompany(1);
      await configureConsultantAgendaAndSchedule(browser, primaryConsultant, agenda);
      await configureConsultantAgendaAndSchedule(browser, secondaryConsultant, agenda);

      let selectedDateIndex = -1;
      let selectedTime = "";
      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, companyA.email, companyA.password);
        ({ selectedDateIndex, selectedTime } = await submitRegularApplication(
          page,
          companyA.name,
          agenda.agendaName,
        ));
        await context.close();
      }

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, companyB.email, companyB.password);
        const officeHourIdB = await getRegularOfficeHourIdForCompany(companyB.name, agenda.agendaName);
        await openRegularApplicationWizardForOfficeHour(page, officeHourIdB, agenda.agendaName, {
          dateIndex: selectedDateIndex,
          time: selectedTime,
          expectDisabled: true,
        });
        await page.goto("/company/dashboard");
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
          timeout: 30_000,
        });
        await context.close();
      }

      const primaryConsultantDoc = await waitForConsultantDoc(primaryConsultant.email);
      const secondaryConsultantDoc = await waitForConsultantDoc(secondaryConsultant.email);
      const applicationA = await expectSingleApplicationDoc(companyA.name);
      expect(applicationA.data.status).toBe("pending");
      expect(applicationA.data.pendingConsultantIds).toEqual(
        [primaryConsultantDoc.id, secondaryConsultantDoc.id].sort(),
      );

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForAdmin(page, primaryConsultant.email, primaryConsultant.password);
        await expectSingleApplicationRow(page, companyA.name);
        await expectNoApplicationRow(page, companyB.name);
        await context.close();
      }

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForAdmin(page, secondaryConsultant.email, secondaryConsultant.password);
        await expectSingleApplicationRow(page, companyA.name);
        await expectNoApplicationRow(page, companyB.name);
        await context.close();
      }

      await expect.poll(async () => (await getApplicationsByCompanyName(companyB.name)).length, {
        timeout: 30_000,
      }).toBe(0);
    } finally {
      await cleanupE2EAgendas();
    }
  });

  test("same consultant cannot accept two agendas at the same time", async ({
    browser,
  }) => {
    test.setTimeout(6 * 60 * 1000);
      const seed = uniqueSeed();
      const agendaA = await createE2EAgenda(`${seed}-a`);
      const agendaB = await createE2EAgenda(`${seed}-b`);
    try {
      const { consultant } = await provisionApprovedConsultantAccount(browser, seed);
      const { company: companyA } = await provisionApprovedCompany(browser, `${seed}-a`);
      const { company: companyB } = await provisionApprovedCompany(browser, `${seed}-b`);
      await configureConsultantAgendaAndSchedule(browser, consultant, agendaA);
      await configureConsultantAgendaAndSchedule(browser, consultant, agendaB);

      let selectedDateIndex = -1;
      let selectedTime = "";
      const officeHourIdA = await getRegularOfficeHourIdForCompany(companyA.name, agendaA.agendaName);
      const officeHourIdB = await getRegularOfficeHourIdForCompany(companyB.name, agendaB.agendaName);
      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, companyA.email, companyA.password);
        ({ selectedDateIndex, selectedTime } = await openRegularApplicationWizardForOfficeHour(
          page,
          officeHourIdA,
          agendaA.agendaName,
        ));
        const functionResponsePromise = page.waitForResponse(
          (response) =>
            response.url().includes("submitRegularApplication") &&
            response.request().method() === "POST",
          { timeout: 30_000 },
        );
        await page.getByTestId("regular-wizard-submit").click();
        const functionResponse = await functionResponsePromise;
        const responseText = await functionResponse.text();
        if (!functionResponse.ok()) {
          throw new Error(`정기 예약 제출 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
        }
        await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
        await context.close();
      }

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForCompany(page, companyB.email, companyB.password);
        await openRegularApplicationWizardForOfficeHour(page, officeHourIdB, agendaB.agendaName, {
          dateIndex: selectedDateIndex,
          time: selectedTime,
          expectDisabled: true,
        });
        await page.goto("/company/dashboard");
        await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
          timeout: 30_000,
        });
        await context.close();
      }

      {
        const { context, page } = await newPage(browser);
        await loginAndWaitForAdmin(page, adminCredentials.email!, adminCredentials.password!);
        await expectSingleApplicationRow(page, companyA.name);
        await expectNoApplicationRow(page, companyB.name);
        await context.close();
      }
    } finally {
      await cleanupE2EAgendas();
    }
  });
});
