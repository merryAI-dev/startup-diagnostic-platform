import { expect, test, type Browser, type Page } from "@playwright/test";
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

type FirestoreDocument = {
  id: string;
  path: string;
  data: Record<string, unknown>;
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

async function getApplicationsByCompanyName(companyName: string) {
  return runFirestoreQuery("officeHourApplications", "companyName", companyName);
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
  return new Date(`${normalizeDateKey(value)}T00:00:00`);
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
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

function buildRegularSlotId(programId: string, consultantId: string, dateKey: string, startTime: string) {
  return ["regular", programId, consultantId, dateKey, startTime].join("_").replace(/:/g, "-");
}

async function syncRegularSlotsForConsultant(consultantEmail: string) {
  const consultants = await runFirestoreQuery("consultants", "email", consultantEmail);
  const consultant = consultants[0];
  if (!consultant) {
    throw new Error(`컨설턴트 문서를 찾지 못했습니다: ${consultantEmail}`);
  }
  const consultantId = consultant.id;
  const consultantName = String(consultant.data.name ?? "컨설턴트");
  const agendaIds = Array.isArray(consultant.data.agendaIds) ? consultant.data.agendaIds : [];
  const availability = Array.isArray(consultant.data.availability) ? consultant.data.availability : [];
  const programs = await listFirestoreDocuments("programs");

  for (const program of programs) {
    const periodStart = typeof program.data.periodStart === "string" ? normalizeDateKey(program.data.periodStart) : "";
    const periodEnd = typeof program.data.periodEnd === "string" ? normalizeDateKey(program.data.periodEnd) : "";
    if (!periodStart || !periodEnd) continue;
    const startDate = parseDateKey(periodStart);
    const endDate = parseDateKey(periodEnd);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      continue;
    }
    const weekdays = new Set(getWeekdayNumbers(program.data.weekdays));
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      if (weekdays.has(cursor.getDay())) {
        const dateKey = formatDateKey(cursor);
        const dayAvailability = availability.find(
          (item: any) => Number(item?.dayOfWeek) === cursor.getDay(),
        );
        const slots = Array.isArray(dayAvailability?.slots) ? dayAvailability.slots : [];
        for (const slot of slots) {
          if (!slot?.available) continue;
          const startTime = String(slot.start ?? "");
          const endTime = String(slot.end ?? "");
          if (!startTime || !endTime) continue;
          await updateFirestoreDocument(
            `officeHourSlots/${buildRegularSlotId(program.id, consultantId, dateKey, startTime)}`,
            {
              type: "regular",
              programId: program.id,
              consultantId,
              consultantName,
              agendaIds,
              title: `${String(program.data.name ?? "사업")} 정기 오피스아워`,
              description: String(program.data.description ?? `${String(program.data.name ?? "사업")} 사업`),
              date: dateKey,
              startTime,
              endTime,
              status: "open",
            },
          );
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
}

async function setConsultantAvailability(consultantEmail: string) {
  const consultants = await runFirestoreQuery("consultants", "email", consultantEmail);
  const consultant = consultants[0];
  if (!consultant) {
    throw new Error(`컨설턴트 문서를 찾지 못했습니다: ${consultantEmail}`);
  }
  await updateFirestoreDocument(`consultants/${consultant.id}`, {
    availability: buildFullAvailability(),
  });
  await syncRegularSlotsForConsultant(consultantEmail);
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
      const loadingText = page.getByText("로딩 중...");
      return await loadingText.count();
    }, { timeout: 30_000 })
    .toBe(0);
}

async function loginAndWaitForCompany(page: Page, email: string, password: string) {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/company/, { timeout: 30_000 });
  await waitForAuthLoadingToClear(page);
  await expect(page.getByText("대시보드").first()).toBeVisible({ timeout: 30_000 });
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

  await page.locator("#consultant-name").fill(name);
  await page.locator("#consultant-organization").fill("E2E Consulting");
  await page.locator("#consultant-email").fill(email);
  await page.locator("#consultant-phone").fill("01012345678");
  await page.locator("#consultant-meeting-link").fill("https://meet.google.com/e2e-smoke");
  await page.locator("#consultant-expertise").fill("BM, GTM, Product");
  await page.locator("#consultant-bio").fill("Preview smoke test consultant profile.");
  await page.getByRole("button", { name: "승인 대기 요청" }).click();

  await expect(page).toHaveURL(/\/pending/);
}

async function fillCompanySignupForm(page: Page, email: string, companyName: string) {
  await page.getByTestId("company-type-prestartup").click();
  await page.getByTestId("company-signup-name").fill(companyName);

  await page.getByTestId("company-program-trigger").click();
  const firstProgramOption = page.locator('[data-testid^="company-program-option-"]').first();
  await expect(firstProgramOption).toBeVisible();
  await firstProgramOption.click();

  await page.getByLabel("대표 솔루션 한 줄 소개").fill("글로벌 진출을 준비하는 B2B SaaS 솔루션입니다");
  await page.getByLabel("UN SDGs 우선순위 1위").selectOption({ index: 1 });
  await page.getByLabel("UN SDGs 우선순위 2위").selectOption({ index: 2 });
  await page.getByLabel("대표자 성명").fill("홍길동");
  await page.getByLabel("대표자 나이").fill("35");
  await page.getByLabel("대표자 이메일").fill(email);
  await page.getByLabel("대표자 전화번호").fill("01012345678");
  await page.getByTestId("company-ceo-gender-male").click();
  await page.getByLabel("대표자 국적").fill("대한민국");
  await page.getByLabel("이전 창업 횟수").fill("1");
  await page.getByTestId("company-corep-no").click();
  await page.getByLabel("2026년 내 희망 투자액").fill("2050000000");
  await page.getByLabel("투자전 희망기업가치 (Pre-Value)").fill("20000000000");
  await page.getByLabel("MYSC에 가장 기대하는 점").fill("실행 연결");
}

async function submitCompanySignup(page: Page, options?: { doubleConfirm?: boolean }) {
  const submitButton = page.getByTestId("company-signup-submit");
  await expect(submitButton).toBeEnabled({ timeout: 30_000 });
  await submitButton.click();
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
}

async function signupCompany(page: Page, email: string, password: string, companyName: string) {
  await page.goto("/signup");
  await page.getByTestId("signup-role-company").click();
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  await expect(page).toHaveURL(/\/signup-info/);

  await fillCompanySignupForm(page, email, companyName);
  await submitCompanySignup(page);

  await expect(page).toHaveURL(/\/pending/);
}

async function approvePendingUser(page: Page, email: string) {
  await page.goto("/admin/admin-users");
  await page.getByPlaceholder("이메일 검색").fill(email);

  const approvalRow = page.locator("div.p-4").filter({ hasText: email }).first();
  await expect(approvalRow).toBeVisible();
  await approvalRow.getByRole("button", { name: "승인" }).click();
  await expect(approvalRow).toBeHidden({ timeout: 30_000 });
}

async function mapFirstAgendaToConsultant(
  page: Page,
  consultantName: string,
  preferredAgendaName?: string,
) {
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

async function submitRegularApplication(page: Page, agendaName: string) {
  const { officeHourTitle, sessionIndex, selectedDateIndex, selectedTime } = await openRegularApplicationWizard(
    page,
    agendaName,
  );

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

  return { officeHourTitle, sessionIndex, selectedDateIndex, selectedTime };
}

async function claimApplication(page: Page, companyName: string) {
  await page.goto("/admin/admin-applications");
  await page.getByPlaceholder("신청 기업명으로 검색").fill(companyName);

  const row = page.locator("tr").filter({ hasText: companyName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "상세보기" }).click();

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
  await expect(actionDialog).toBeHidden({ timeout: 15_000 });
  const functionResponse = await functionResponsePromise;
  const responseText = await functionResponse.text();
  console.log("transitionApplicationStatus accept:", functionResponse.status(), responseText.slice(0, 600));
  if (!functionResponse.ok()) {
    throw new Error(`수락 처리 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
  }
}

async function openPendingApplicationFromDashboard(page: Page, officeHourTitle: string) {
  await page.goto("/company/dashboard");
  const pendingCard = page
    .locator("div.cursor-pointer.rounded-xl")
    .filter({ hasText: officeHourTitle })
    .first();
  await expect(pendingCard).toBeVisible({ timeout: 30_000 });
  await pendingCard.click();
}

async function cancelPendingApplication(page: Page, officeHourTitle: string) {
  await openPendingApplicationFromDashboard(page, officeHourTitle);
  const applicationDialog = page.getByRole("dialog").filter({ hasText: officeHourTitle }).first();
  await expect(applicationDialog).toBeVisible({ timeout: 30_000 });
  const functionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("cancelApplication") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await applicationDialog.getByRole("button", { name: "신청 삭제" }).click();

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
  await expect(page.getByText(officeHourTitle)).toHaveCount(0);
}

async function rejectApplication(page: Page, companyName: string, reason: string) {
  await page.goto("/admin/admin-applications");
  await page.getByPlaceholder("신청 기업명으로 검색").fill(companyName);

  const row = page.locator("tr").filter({ hasText: companyName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
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
    await signupConsultant(page, consultant.email, consultant.password, consultant.name);
    await context.close();
  }

  const adminSession = await newPage(browser);
  await loginAndWaitForAdmin(adminSession.page, adminCredentials.email!, adminCredentials.password!);
  await approvePendingUser(adminSession.page, consultant.email);
  await adminSession.context.close();

  return { consultant };
}

async function getFirstAgendaOptionForCompany(browser: Browser, company: { email: string; password: string }) {
  const { context, page } = await newPage(browser);
  await loginAndWaitForCompany(page, company.email, company.password);
  await page.goto("/company/regular");
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
  agendaName: string,
) {
  const adminSession = await newPage(browser);
  await loginAndWaitForAdmin(adminSession.page, adminCredentials.email!, adminCredentials.password!);
  await mapFirstAgendaToConsultant(adminSession.page, consultant.name, agendaName);
  await adminSession.context.close();
  await setConsultantAvailability(consultant.email);
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
    await signupCompany(page, company.email, company.password, company.name);
    await context.close();
  }

  const adminSession = await newPage(browser);
  await loginAndWaitForAdmin(adminSession.page, adminCredentials.email!, adminCredentials.password!);
  await adminSession.page.goto("/admin/admin-users");
  await approvePendingUser(adminSession.page, company.email);
  await adminSession.context.close();

  return {
    company,
  };
}

async function provisionApprovedConsultantAndCompany(browser: Browser, seed = uniqueSeed()) {
  const { consultant } = await provisionApprovedConsultantAccount(browser, seed);
  const { company } = await provisionApprovedCompany(browser, seed);
  const agendaName = await getFirstAgendaOptionForCompany(browser, company);
  await configureConsultantAgendaAndSchedule(browser, consultant, agendaName);

  return {
    consultant,
    company,
    agendaName,
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
  await page.goto("/company/regular");
  await waitForAuthLoadingToClear(page);
  const sessionCards = page.locator('[data-testid^="regular-calendar-session-"]');
  const sessionCount = await sessionCards.count();
  const targetSessionIndexes =
    preferredSelection && typeof preferredSelection.sessionIndex === "number"
      ? [preferredSelection.sessionIndex]
      : Array.from({ length: sessionCount }, (_, index) => index);

  for (const sessionIndex of targetSessionIndexes) {
    await page.goto("/company/regular");
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

    if (preferredSelection) {
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

  throw new Error("신청 가능한 regular office hour session을 찾지 못했습니다.");
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

  test("consultant and company flow stays consistent through approval and regular booking", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    console.log("step: consultant/company provisioning");
    const { consultant, company, agendaName } = await provisionApprovedConsultantAndCompany(browser);

    let officeHourTitle = "";
    {
      console.log("step: company regular application");
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      ({ officeHourTitle } = await submitRegularApplication(page, agendaName));
      await expect(page.getByText(officeHourTitle)).toBeVisible();
      await expect(page.getByText("수락 대기").first()).toBeVisible();
      const applicationDoc = await expectSingleApplicationDoc(company.name);
      expect(applicationDoc.data.status).toBe("pending");
      expect(applicationDoc.data.agenda).toBe(agendaName);
      const slotId = String(applicationDoc.data.officeHourSlotId ?? "");
      expect(slotId).not.toBe("");
      const slotDoc = await getFirestoreDocument(`officeHourSlots/${slotId}`);
      expect(slotDoc?.data.status).toBe("booked");
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
      await page.goto("/company/dashboard");
      await expect(page.getByText("다가오는 일정")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("heading", { name: officeHourTitle }).first()).toBeVisible();
      await context.close();
    }
  });

  test("company can cancel a pending application and ticket usage is restored", async ({
    browser,
  }) => {
    test.setTimeout(5 * 60 * 1000);
    const { company, agendaName } = await provisionApprovedConsultantAndCompany(browser);

    let officeHourTitle = "";
    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      ({ officeHourTitle } = await submitRegularApplication(page, agendaName));
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
        timeout: 30_000,
      });
      const applicationDoc = await expectSingleApplicationDoc(company.name);
      expect(applicationDoc.data.status).toBe("pending");
      await cancelPendingApplication(page, officeHourTitle);
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 0")).toBeVisible({
        timeout: 30_000,
      });
      const slotId = String(applicationDoc.data.officeHourSlotId ?? "");
      await expect.poll(async () => (await getApplicationsByCompanyName(company.name)).length, {
        timeout: 30_000,
      }).toBe(0);
      const slotDoc = await getFirestoreDocument(`officeHourSlots/${slotId}`);
      expect(slotDoc?.data.status).toBe("open");
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
      ({ officeHourTitle } = await submitRegularApplication(page, agendaName));
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
      expect(rejectedDoc.data.rejectionReason).toBe(rejectionReason);
      const slotId = String(rejectedDoc.data.officeHourSlotId ?? "");
      const slotDoc = await getFirestoreDocument(`officeHourSlots/${slotId}`);
      expect(slotDoc?.data.status).toBe("open");
      await context.close();
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

    {
      console.log("step: duplicate regular submit company action");
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, company.email, company.password);
      const { officeHourTitle } = await openRegularApplicationWizard(page, agendaName);

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
      await expect(page.getByText(officeHourTitle)).toHaveCount(1);
      await expect(ticketSummaryCard(page, "내부 티켓").getByText("예약 1")).toBeVisible({
        timeout: 30_000,
      });
      const applicationDoc = await expectSingleApplicationDoc(company.name);
      expect(applicationDoc.data.status).toBe("pending");
      const slotId = String(applicationDoc.data.officeHourSlotId ?? "");
      const slotDoc = await getFirestoreDocument(`officeHourSlots/${slotId}`);
      expect(slotDoc?.data.status).toBe("booked");
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
    const { company: companyA, agendaName } = await provisionApprovedConsultantAndCompany(
      browser,
      `${uniqueSeed()}-a`,
    );
    const { company: companyB } = await provisionApprovedCompany(browser, `${uniqueSeed()}-b`);

    let sessionIndex = -1;
    let selectedDateIndex = -1;
    let selectedTime = "";
    {
      console.log("step: same slot duplicate company A submit");
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, companyA.email, companyA.password);
      ({ sessionIndex, selectedDateIndex, selectedTime } = await submitRegularApplication(page, agendaName));
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
      await openRegularApplicationWizard(page, agendaName, {
        sessionIndex,
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
  });

  test("same time can be booked twice when two consultants are available for the same agenda", async ({
    browser,
  }) => {
    test.setTimeout(6 * 60 * 1000);
    console.log("step: multi-consultant same slot provisioning");
    const primary = await provisionApprovedConsultant(browser);
    const secondary = await provisionApprovedConsultantWithAgenda(browser, primary.agendaName);
    const { company: companyA } = await provisionApprovedCompany(browser, `${uniqueSeed()}-a`);
    const { company: companyB } = await provisionApprovedCompany(browser, `${uniqueSeed()}-b`);

    let sessionIndex = -1;
    let selectedDateIndex = -1;
    let selectedTime = "";
    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, companyA.email, companyA.password);
      ({ sessionIndex, selectedDateIndex, selectedTime } = await submitRegularApplication(page, primary.agendaName));
      await context.close();
    }

    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForCompany(page, companyB.email, companyB.password);
      await openRegularApplicationWizard(page, primary.agendaName, {
        sessionIndex,
        dateIndex: selectedDateIndex,
        time: selectedTime,
      });
      const functionResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("submitRegularApplication") &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      );
      await page.getByTestId("regular-wizard-submit").click();
      const functionResponse = await functionResponsePromise;
      const responseText = await functionResponse.text();
      console.log("submitRegularApplication second consultant slot:", functionResponse.status(), responseText.slice(0, 600));
      if (!functionResponse.ok()) {
        throw new Error(`다중 컨설턴트 동일 시간 예약 실패: ${functionResponse.status()} ${responseText.slice(0, 300)}`);
      }
      await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
      await context.close();
    }

    const applicationA = await expectSingleApplicationDoc(companyA.name);
    const applicationB = await expectSingleApplicationDoc(companyB.name);
    expect(applicationA.data.status).toBe("pending");
    expect(applicationB.data.status).toBe("pending");
    const slotIdA = String(applicationA.data.officeHourSlotId ?? "");
    const slotIdB = String(applicationB.data.officeHourSlotId ?? "");
    expect(slotIdA).not.toBe("");
    expect(slotIdB).not.toBe("");
    expect(slotIdA).not.toBe(slotIdB);

    const slotDocA = await getFirestoreDocument(`officeHourSlots/${slotIdA}`);
    const slotDocB = await getFirestoreDocument(`officeHourSlots/${slotIdB}`);
    expect(slotDocA?.data.status).toBe("booked");
    expect(slotDocB?.data.status).toBe("booked");
    expect(slotDocA?.data.startTime).toBe(selectedTime);
    expect(slotDocB?.data.startTime).toBe(selectedTime);
    expect(slotDocA?.data.consultantName).not.toBe(slotDocB?.data.consultantName);

    const companyByConsultant = new Map<string, string>([
      [String(slotDocA?.data.consultantName ?? ""), companyA.name],
      [String(slotDocB?.data.consultantName ?? ""), companyB.name],
    ]);

    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForAdmin(page, primary.consultant.email, primary.consultant.password);
      const expectedCompany = companyByConsultant.get(primary.consultant.name);
      const otherCompany = expectedCompany === companyA.name ? companyB.name : companyA.name;
      if (!expectedCompany) {
        throw new Error(`컨설턴트 ${primary.consultant.name} 배정 회사를 찾지 못했습니다.`);
      }
      await expectSingleApplicationRow(page, expectedCompany);
      await expectNoApplicationRow(page, otherCompany);
      await context.close();
    }

    {
      const { context, page } = await newPage(browser);
      await loginAndWaitForAdmin(page, secondary.consultant.email, secondary.consultant.password);
      const expectedCompany = companyByConsultant.get(secondary.consultant.name);
      const otherCompany = expectedCompany === companyA.name ? companyB.name : companyA.name;
      if (!expectedCompany) {
        throw new Error(`컨설턴트 ${secondary.consultant.name} 배정 회사를 찾지 못했습니다.`);
      }
      await expectSingleApplicationRow(page, expectedCompany);
      await expectNoApplicationRow(page, otherCompany);
      await context.close();
    }
  });
});
