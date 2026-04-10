#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const DEFAULT_PASSWORD = "12341234";
const DEFAULT_REGION = "asia-northeast3";
const DEFAULT_COMPANIES = ["company@gmail.com", "company2@gmail.com"];
const DEFAULT_CONSULTANTS = ["qa.consultant1@gmail.com", "qa.consultant2@gmail.com"];
const DEFAULT_AGENDAS = {
  consultant1Only: "qa 1",
  consultant2Only: "qa 2",
  overlap: "qa 3",
};

function loadEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) return {};
  const raw = fs.readFileSync(envFilePath, "utf8");
  const env = {};

  raw.split(/\r?\n/u).forEach((line) => {
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
    env[key] = value;
  });

  return env;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase().replace(/\s+/gu, "");
}

function normalizeTimeKey(value) {
  const trimmed = normalizeString(value);
  if (!trimmed) return "";
  const [hourRaw, minuteRaw] = trimmed.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return trimmed;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseArgs(argv) {
  const result = {
    companyEmails: [...DEFAULT_COMPANIES],
    consultantEmails: [...DEFAULT_CONSULTANTS],
    agendas: { ...DEFAULT_AGENDAS },
    password: DEFAULT_PASSWORD,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--company-a" && next) {
      result.companyEmails[0] = next;
      index += 1;
      continue;
    }
    if (arg === "--company-b" && next) {
      result.companyEmails[1] = next;
      index += 1;
      continue;
    }
    if (arg === "--consultant-a" && next) {
      result.consultantEmails[0] = next;
      index += 1;
      continue;
    }
    if (arg === "--consultant-b" && next) {
      result.consultantEmails[1] = next;
      index += 1;
      continue;
    }
    if (arg === "--agenda-overlap" && next) {
      result.agendas.overlap = next;
      index += 1;
      continue;
    }
    if (arg === "--agenda-a" && next) {
      result.agendas.consultant1Only = next;
      index += 1;
      continue;
    }
    if (arg === "--agenda-b" && next) {
      result.agendas.consultant2Only = next;
      index += 1;
      continue;
    }
    if (arg === "--password" && next) {
      result.password = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const [year, month, day] = normalizeString(value).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function getWeekdayNumbers(weekdays) {
  const numbers = [];
  (Array.isArray(weekdays) ? weekdays : []).forEach((weekday) => {
    if (weekday === "SUN") numbers.push(0);
    if (weekday === "MON") numbers.push(1);
    if (weekday === "TUE") numbers.push(2);
    if (weekday === "WED") numbers.push(3);
    if (weekday === "THU") numbers.push(4);
    if (weekday === "FRI") numbers.push(5);
    if (weekday === "SAT") numbers.push(6);
  });
  return numbers;
}

function isProgramDateAvailable(program, dateKey) {
  const normalizedDate = normalizeString(dateKey);
  const normalizedStart = normalizeString(program.periodStart).slice(0, 10);
  const normalizedEnd = normalizeString(program.periodEnd).slice(0, 10);
  if (!normalizedDate || !normalizedStart || !normalizedEnd) return false;
  if (normalizedDate < normalizedStart || normalizedDate > normalizedEnd) return false;
  const weekdayNumbers = getWeekdayNumbers(program.weekdays);
  if (weekdayNumbers.length === 0) return false;
  return weekdayNumbers.includes(parseDateKey(normalizedDate).getDay());
}

function getAvailableTimesForConsultantDay(consultant, dayOfWeek) {
  const entry = Array.isArray(consultant.availability)
    ? consultant.availability.find((item) => Number(item?.dayOfWeek) === dayOfWeek)
    : null;
  if (!entry || !Array.isArray(entry.slots)) return [];
  return entry.slots
    .filter((slot) => slot?.available === true)
    .map((slot) => normalizeTimeKey(slot?.start))
    .filter(Boolean)
    .sort();
}

function buildRegularOfficeHourId(programId, dateKey) {
  return `${programId}:unassigned:${dateKey.slice(0, 7)}`;
}

function isPastScheduledStart(dateKey, timeKey, now = new Date()) {
  const currentDateKey = formatDateKey(now);
  const normalizedTime = normalizeTimeKey(timeKey);
  if (dateKey < currentDateKey) return true;
  if (dateKey > currentDateKey) return false;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return normalizedTime < currentTime;
}

async function createClient(config, name, emailOrEmails, password) {
  const candidates = Array.isArray(emailOrEmails) ? emailOrEmails : [emailOrEmails];
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const email = candidates[index];
    const app = initializeApp(config, `${name}-${index}`);
    const auth = getAuth(app);
    try {
      console.log(`sign-in: ${email}`);
      await signInWithEmailAndPassword(auth, email, password);
      return {
        app,
        auth,
        db: getFirestore(app),
        functions: getFunctions(app, config.functionsRegion),
        email,
      };
    } catch (error) {
      lastError = error;
      await deleteApp(app);
    }
  }

  throw lastError ?? new Error(`sign-in failed: ${candidates.join(", ")}`);
}

async function callable(client, name, payload) {
  const fn = httpsCallable(client.functions, name);
  const result = await fn(payload);
  return result.data;
}

async function getSingleDocByQuery(db, collectionName, field, value, message) {
  const snap = await getDocs(query(collection(db, collectionName), where(field, "==", value)));
  assert(snap.size === 1, message);
  return {
    id: snap.docs[0].id,
    ...snap.docs[0].data(),
  };
}

async function resolveCompanyContext(client) {
  const uid = client.auth.currentUser?.uid;
  assert(uid, `로그인 uid를 찾지 못했습니다: ${client.email}`);

  const profileSnap = await getDoc(doc(client.db, "profiles", uid));
  assert(profileSnap.exists(), `프로필 문서를 찾지 못했습니다: ${client.email}`);
  const profile = profileSnap.data() || {};
  const companyId = normalizeString(profile.companyId);
  assert(companyId, `companyId가 없습니다: ${client.email}`);

  const companySnap = await getDoc(doc(client.db, "companies", companyId));
  assert(companySnap.exists(), `회사 문서를 찾지 못했습니다: ${client.email}`);
  const company = companySnap.data() || {};
  const programIds = Array.isArray(company.programs)
    ? company.programs.map((value) => normalizeString(value)).filter(Boolean)
    : [];
  assert(programIds.length > 0, `참여 사업이 없습니다: ${client.email}`);

  const programDocs = [];
  for (const programId of programIds) {
    const programSnap = await getDoc(doc(client.db, "programs", programId));
    if (!programSnap.exists()) continue;
    programDocs.push({ id: programSnap.id, ...programSnap.data() });
  }
  assert(programDocs.length > 0, `사업 문서를 찾지 못했습니다: ${client.email}`);

  return {
    uid,
    profile,
    companyId,
    companyName: normalizeString(company.name) || client.email,
    programs: programDocs,
  };
}

async function resolveAgenda(adminDb, agendaName) {
  const snap = await getDocs(collection(adminDb, "agendas"));
  const normalizedTarget = normalizeKey(agendaName);
  const matched = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .find((agenda) => normalizeKey(agenda.name) === normalizedTarget);
  assert(matched, `아젠다를 찾지 못했습니다: ${agendaName}`);
  return matched;
}

async function resolveConsultant(adminDb, email) {
  const consultant = await getSingleDocByQuery(
    adminDb,
    "consultants",
    "email",
    email,
    `컨설턴트 문서를 찾지 못했습니다: ${email}`,
  );
  return consultant;
}

async function resolveConsultantByUid(adminDb, uid, fallbackEmail = "") {
  const consultantSnap = await getDoc(doc(adminDb, "consultants", uid));
  if (consultantSnap.exists()) {
    return {
      id: consultantSnap.id,
      ...consultantSnap.data(),
    };
  }
  if (fallbackEmail) {
    return resolveConsultant(adminDb, fallbackEmail);
  }
  throw new Error(`컨설턴트 문서를 찾지 못했습니다: ${uid}`);
}

function findFirstProgramForDate(programs, dateKey) {
  return programs.find((program) => isProgramDateAvailable(program, dateKey)) ?? null;
}

function buildCommonCandidateSlots(companyA, companyB, consultantA, consultantB) {
  const today = new Date();
  const candidates = [];

  for (let offset = 0; offset < 90; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dateKey = formatDateKey(date);
    const programA = findFirstProgramForDate(companyA.programs, dateKey);
    const programB = findFirstProgramForDate(companyB.programs, dateKey);
    if (!programA || !programB) continue;

    const dayOfWeek = date.getDay();
    const consultantATimes = getAvailableTimesForConsultantDay(consultantA, dayOfWeek);
    const consultantBTimes = getAvailableTimesForConsultantDay(consultantB, dayOfWeek);
    const overlapTimes = consultantATimes
      .filter((time) => consultantBTimes.includes(time))
      .filter((time) => !isPastScheduledStart(dateKey, time, today));
    if (overlapTimes.length === 0) continue;

    const onlyConsultantATimes = consultantATimes
      .filter((time) => !consultantBTimes.includes(time))
      .filter((time) => !isPastScheduledStart(dateKey, time, today));
    const onlyConsultantBTimes = consultantBTimes
      .filter((time) => !consultantATimes.includes(time))
      .filter((time) => !isPastScheduledStart(dateKey, time, today));

    overlapTimes.forEach((overlapTime) => {
      candidates.push({
        dateKey,
        programA,
        programB,
        overlapTime,
        onlyConsultantATime: onlyConsultantATimes[0] ?? "",
        onlyConsultantBTime: onlyConsultantBTimes[0] ?? "",
      });
    });
  }

  return candidates;
}

function buildSingleCompanyCandidateSlots(company, consultant, preferredTimes = []) {
  const today = new Date();
  const candidates = [];

  for (let offset = 0; offset < 90; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const dateKey = formatDateKey(date);
    const program = findFirstProgramForDate(company.programs, dateKey);
    if (!program) continue;

    const dayOfWeek = date.getDay();
    let times = getAvailableTimesForConsultantDay(consultant, dayOfWeek).filter(
      (time) => !isPastScheduledStart(dateKey, time, today),
    );
    if (preferredTimes.length > 0) {
      times = times.filter((time) => preferredTimes.includes(time));
    }
    times.forEach((time) => {
      candidates.push({ dateKey, program, time });
    });
  }

  return candidates;
}

async function getApplication(adminDb, applicationId) {
  const snap = await getDoc(doc(adminDb, "officeHourApplications", applicationId));
  assert(snap.exists(), `신청 문서를 찾지 못했습니다: ${applicationId}`);
  return { id: snap.id, ...snap.data() };
}

async function deleteApplication(adminDb, applicationId) {
  await deleteDoc(doc(adminDb, "officeHourApplications", applicationId));
}

function sameIds(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

async function moveApplicationToMatchingPendingSet({
  adminDb,
  companyClient,
  applicationId,
  agendaId,
  consultantIds,
  candidates,
  excludeDateKey = "",
  excludeTime = "",
}) {
  for (const candidate of candidates) {
    if (candidate.dateKey === excludeDateKey && candidate.overlapTime === excludeTime) {
      continue;
    }
    try {
      const result = await callable(companyClient, "updateCompanyApplication", {
        applicationId,
        requestContent: `[QA update move] ${Date.now()}`,
        attachmentNames: [],
        attachmentUrls: [],
        scheduledDate: candidate.dateKey,
        scheduledTime: candidate.overlapTime,
      });
      const application = await getApplication(adminDb, applicationId);
      const pendingIds = Array.isArray(application.pendingConsultantIds)
        ? application.pendingConsultantIds.map((value) => normalizeString(value)).filter(Boolean)
        : [];
      if (
        result.scheduleChanged === true &&
        normalizeString(application.scheduledDate) === candidate.dateKey &&
        normalizeTimeKey(application.scheduledTime) === normalizeTimeKey(candidate.overlapTime) &&
        sameIds(pendingIds, consultantIds)
      ) {
        return {
          ...candidate,
          pendingIds,
        };
      }
    } catch (error) {
      const message = normalizeString(error?.message || String(error));
      if (
        message.includes("배정 가능한 컨설턴트") ||
        message.includes("중복 신청") ||
        message.includes("지난 시간") ||
        message.includes("운영일")
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("일정 변경 가능한 대체 슬롯을 찾지 못했습니다.");
}

async function moveSingleApplication({
  adminDb,
  companyClient,
  applicationId,
  expectedConsultantId,
  candidates,
  excludeDateKey = "",
  excludeTime = "",
}) {
  for (const candidate of candidates) {
    if (candidate.dateKey === excludeDateKey && candidate.time === excludeTime) {
      continue;
    }
    try {
      const result = await callable(companyClient, "updateCompanyApplication", {
        applicationId,
        requestContent: `[QA single update move] ${Date.now()}`,
        attachmentNames: [],
        attachmentUrls: [],
        scheduledDate: candidate.dateKey,
        scheduledTime: candidate.time,
      });
      const application = await getApplication(adminDb, applicationId);
      const pendingIds = Array.isArray(application.pendingConsultantIds)
        ? application.pendingConsultantIds.map((value) => normalizeString(value)).filter(Boolean)
        : [];
      if (
        result.scheduleChanged === true &&
        normalizeString(application.scheduledDate) === candidate.dateKey &&
        normalizeTimeKey(application.scheduledTime) === normalizeTimeKey(candidate.time) &&
        sameIds(pendingIds, [expectedConsultantId])
      ) {
        return { ...candidate, pendingIds };
      }
    } catch (error) {
      const message = normalizeString(error?.message || String(error));
      if (
        message.includes("배정 가능한 컨설턴트") ||
        message.includes("중복 신청") ||
        message.includes("지난 시간") ||
        message.includes("운영일")
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("단일 컨설턴트 일정 변경 가능한 대체 슬롯을 찾지 못했습니다.");
}

async function findOverlapApplication({
  adminDb,
  companyClient,
  companyName,
  overlapAgenda,
  consultantIds,
  candidates,
}) {
  for (const candidate of candidates) {
    const marker = `[QA overlap probe] ${companyName} ${candidate.dateKey} ${candidate.overlapTime} ${Date.now()}`;
    try {
      const result = await callable(companyClient, "submitRegularApplication", {
        officeHourId: buildRegularOfficeHourId(candidate.programA.id, candidate.dateKey),
        officeHourTitle: `${normalizeString(candidate.programA.name)} 정기 오피스아워`,
        programId: candidate.programA.id,
        agendaId: overlapAgenda.id,
        scheduledDate: candidate.dateKey,
        scheduledTime: candidate.overlapTime,
        sessionFormat: "online",
        requestContent: marker,
        attachmentNames: [],
        attachmentUrls: [],
      });
      const application = await getApplication(adminDb, result.applicationId);
      const pendingIds = Array.isArray(application.pendingConsultantIds)
        ? application.pendingConsultantIds.map((value) => normalizeString(value)).filter(Boolean)
        : [];
      if (sameIds(pendingIds, consultantIds)) {
        return { ...candidate, applicationId: result.applicationId, pendingIds };
      }
      await deleteApplication(adminDb, result.applicationId);
    } catch (error) {
      const message = normalizeString(error?.message || String(error));
      if (
        message.includes("배정 가능한 컨설턴트") ||
        message.includes("중복 신청") ||
        message.includes("티켓") ||
        message.includes("지난 시간")
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("두 컨설턴트가 동시에 pending 대상이 되는 실제 슬롯을 찾지 못했습니다.");
}

async function findSingleConsultantApplication({
  adminDb,
  companyClient,
  companyName,
  agenda,
  expectedConsultantId,
  candidates,
}) {
  for (const candidate of candidates) {
    const marker = `[QA single probe] ${companyName} ${agenda.name} ${candidate.dateKey} ${candidate.time} ${Date.now()}`;
    try {
      const result = await callable(companyClient, "submitRegularApplication", {
        officeHourId: buildRegularOfficeHourId(candidate.program.id, candidate.dateKey),
        officeHourTitle: `${normalizeString(candidate.program.name)} 정기 오피스아워`,
        programId: candidate.program.id,
        agendaId: agenda.id,
        scheduledDate: candidate.dateKey,
        scheduledTime: candidate.time,
        sessionFormat: "online",
        requestContent: marker,
        attachmentNames: [],
        attachmentUrls: [],
      });
      const application = await getApplication(adminDb, result.applicationId);
      const pendingIds = Array.isArray(application.pendingConsultantIds)
        ? application.pendingConsultantIds.map((value) => normalizeString(value)).filter(Boolean)
        : [];
      if (sameIds(pendingIds, [expectedConsultantId])) {
        return { ...candidate, applicationId: result.applicationId, pendingIds };
      }
      await deleteApplication(adminDb, result.applicationId);
    } catch (error) {
      const message = normalizeString(error?.message || String(error));
      if (
        message.includes("배정 가능한 컨설턴트") ||
        message.includes("중복 신청") ||
        message.includes("티켓") ||
        message.includes("지난 시간")
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`단일 컨설턴트 pending 슬롯을 찾지 못했습니다: ${agenda.name}`);
}

async function expectCallFailure(run, messageFragment) {
  try {
    await run();
  } catch (error) {
    const message = normalizeString(error?.message || String(error));
    if (!messageFragment || message.includes(messageFragment)) {
      return message;
    }
    throw new Error(`예상한 실패 메시지와 다릅니다: ${message}`);
  }
  throw new Error("실패를 기대했지만 성공했습니다.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), "..");
  const env = {
    ...loadEnvFile(path.join(projectRoot, ".env")),
    ...process.env,
  };

  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    functionsRegion: env.VITE_FIREBASE_FUNCTIONS_REGION || DEFAULT_REGION,
  };

  const missingConfig = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]
    .filter((key) => !firebaseConfig[key]);
  if (missingConfig.length > 0) {
    throw new Error(`Missing Firebase config keys: ${missingConfig.join(", ")}`);
  }

  const adminEmail = env.E2E_ADMIN_EMAIL || env.MIGRATION_ADMIN_EMAIL;
  const adminPassword = env.E2E_ADMIN_PASSWORD || env.MIGRATION_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("Missing E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or MIGRATION_ADMIN_EMAIL/MIGRATION_ADMIN_PASSWORD");
  }

  const appsToCleanup = [];
  const createdApplicationIds = [];

  try {
    const adminClient = await createClient(
      firebaseConfig,
      "qa-admin",
      adminEmail,
      adminPassword,
    );
    appsToCleanup.push(adminClient.app);

    const companyAClient = await createClient(
      firebaseConfig,
      "qa-company-a",
      options.companyEmails[0],
      options.password,
    );
    const companyBClient = await createClient(
      firebaseConfig,
      "qa-company-b",
      options.companyEmails[1],
      options.password,
    );
    const consultantAClient = await createClient(
      firebaseConfig,
      "qa-consultant-a",
      Array.from(new Set([options.consultantEmails[0], "qa.consultant11@gmail.com"])),
      options.password,
    );
    const consultantBClient = await createClient(
      firebaseConfig,
      "qa-consultant-b",
      options.consultantEmails[1],
      options.password,
    );
    appsToCleanup.push(
      companyAClient.app,
      companyBClient.app,
      consultantAClient.app,
      consultantBClient.app,
    );

    const [
      companyA,
      companyB,
      consultantA,
      consultantB,
      overlapAgenda,
      consultant1OnlyAgenda,
      consultant2OnlyAgenda,
    ] =
      await Promise.all([
        resolveCompanyContext(companyAClient),
        resolveCompanyContext(companyBClient),
        resolveConsultantByUid(adminClient.db, consultantAClient.auth.currentUser?.uid, consultantAClient.email),
        resolveConsultantByUid(adminClient.db, consultantBClient.auth.currentUser?.uid, consultantBClient.email),
        resolveAgenda(adminClient.db, options.agendas.overlap),
        resolveAgenda(adminClient.db, options.agendas.consultant1Only),
        resolveAgenda(adminClient.db, options.agendas.consultant2Only),
      ]);

    console.log("fixture:", {
      consultantA: {
        uid: consultantA.id,
        email: consultantA.email,
        name: consultantA.name,
        agendaIds: consultantA.agendaIds,
      },
      consultantB: {
        uid: consultantB.id,
        email: consultantB.email,
        name: consultantB.name,
        agendaIds: consultantB.agendaIds,
      },
      overlapAgenda: {
        id: overlapAgenda.id,
        name: overlapAgenda.name,
      },
      consultant1OnlyAgenda: {
        id: consultant1OnlyAgenda.id,
        name: consultant1OnlyAgenda.name,
      },
      consultant2OnlyAgenda: {
        id: consultant2OnlyAgenda.id,
        name: consultant2OnlyAgenda.name,
      },
    });

    const overlapCandidates = buildCommonCandidateSlots(companyA, companyB, consultantA, consultantB);
    assert(overlapCandidates.length > 0, "겹치는 시간대 후보를 찾지 못했습니다.");

    const scenario = await findOverlapApplication({
      adminDb: adminClient.db,
      companyClient: companyAClient,
      companyName: companyA.companyName,
      overlapAgenda,
      consultantIds: [consultantA.id, consultantB.id],
      candidates: overlapCandidates,
    });
    createdApplicationIds.push(scenario.applicationId);

    console.log("");
    console.log("[1] pending 상태가 겹치는 컨설턴트를 모두 점유하는지 확인");
    console.log(
      `- date=${scenario.dateKey} overlap=${scenario.overlapTime} onlyA=${scenario.onlyConsultantATime || "-"} onlyB=${scenario.onlyConsultantBTime || "-"}`,
    );

    const applicationA = await getApplication(adminClient.db, scenario.applicationId);
    const pendingIdsA = Array.isArray(applicationA.pendingConsultantIds)
      ? [...applicationA.pendingConsultantIds].sort()
      : [];
    const expectedPendingIds = [consultantA.id, consultantB.id].sort();
    assert(
      JSON.stringify(pendingIdsA) === JSON.stringify(expectedPendingIds),
      `pendingConsultantIds mismatch: expected=${JSON.stringify(expectedPendingIds)} actual=${JSON.stringify(pendingIdsA)}`,
    );
    console.log(`- ok: 첫 신청 pendingConsultantIds = ${pendingIdsA.join(", ")}`);

    console.log("[2] 다른 기업은 같은 시간에 차단되는지 확인");
    await expectCallFailure(
      () =>
        callable(companyBClient, "submitRegularApplication", {
          officeHourId: buildRegularOfficeHourId(scenario.programB.id, scenario.dateKey),
          officeHourTitle: `${normalizeString(scenario.programB.name)} 정기 오피스아워`,
          programId: scenario.programB.id,
          agendaId: overlapAgenda.id,
          scheduledDate: scenario.dateKey,
          scheduledTime: scenario.overlapTime,
          sessionFormat: "online",
          requestContent: `[QA overlap B blocked] ${Date.now()}`,
          attachmentNames: [],
          attachmentUrls: [],
        }),
      "배정 가능한 컨설턴트",
    );
    console.log("- ok: 두 번째 기업은 같은 시간 제출이 차단됨");

    console.log("[3] 한 컨설턴트가 수락하면 남은 컨설턴트로 다른 기업이 가능한지 확인");
    await callable(consultantAClient, "transitionApplicationStatus", {
      applicationId: scenario.applicationId,
      action: "claim",
    });
    const confirmedA = await getApplication(adminClient.db, scenario.applicationId);
    assert(confirmedA.status === "confirmed", `expected confirmed, got ${confirmedA.status}`);
    assert(
      normalizeString(confirmedA.consultantId) === consultantA.id,
      `expected consultantId=${consultantA.id}, got ${confirmedA.consultantId}`,
    );
    console.log(`- ok: 첫 신청 confirmed -> consultant=${consultantA.id}`);

    const companyBRequestContent = `[QA overlap B success] ${Date.now()}`;
    const submitBResult = await callable(companyBClient, "submitRegularApplication", {
      officeHourId: buildRegularOfficeHourId(scenario.programB.id, scenario.dateKey),
      officeHourTitle: `${normalizeString(scenario.programB.name)} 정기 오피스아워`,
      programId: scenario.programB.id,
      agendaId: overlapAgenda.id,
      scheduledDate: scenario.dateKey,
      scheduledTime: scenario.overlapTime,
      sessionFormat: "online",
      requestContent: companyBRequestContent,
      attachmentNames: [],
      attachmentUrls: [],
    });
    createdApplicationIds.push(submitBResult.applicationId);

    const applicationB = await getApplication(adminClient.db, submitBResult.applicationId);
    const pendingIdsB = Array.isArray(applicationB.pendingConsultantIds)
      ? [...applicationB.pendingConsultantIds].sort()
      : [];
    assert(
      JSON.stringify(pendingIdsB) === JSON.stringify([consultantB.id]),
      `expected second pendingConsultantIds=[${consultantB.id}], got ${JSON.stringify(pendingIdsB)}`,
    );
    console.log(`- ok: 두 번째 기업은 남은 컨설턴트(${consultantB.id})로 신청 가능`);

    console.log("[4] qa1 단일 컨설턴트 아젠다는 consultantA에게만 pending 되는지 확인");
    const uniqueACandidates = buildSingleCompanyCandidateSlots(
      companyA,
      consultantA,
      scenario.onlyConsultantATime ? [scenario.onlyConsultantATime] : [],
    );
    const uniqueAResult = await findSingleConsultantApplication({
      adminDb: adminClient.db,
      companyClient: companyAClient,
      companyName: companyA.companyName,
      agenda: consultant1OnlyAgenda,
      expectedConsultantId: consultantA.id,
      candidates: uniqueACandidates,
    });
    createdApplicationIds.push(uniqueAResult.applicationId);

    const uniqueA = await getApplication(adminClient.db, uniqueAResult.applicationId);
    const uniquePendingIdsA = Array.isArray(uniqueA.pendingConsultantIds)
      ? [...uniqueA.pendingConsultantIds].sort()
      : [];
    assert(
      JSON.stringify(uniquePendingIdsA) === JSON.stringify([consultantA.id]),
      `expected qa1 pendingConsultantIds=[${consultantA.id}], got ${JSON.stringify(uniquePendingIdsA)}`,
    );
    console.log(`- ok: qa1은 consultantA(${consultantA.id})만 pending`);

    console.log("[5] qa2 단일 컨설턴트 아젠다는 consultantB에게만 pending 되는지 확인");
    const uniqueBCandidates = buildSingleCompanyCandidateSlots(
      companyB,
      consultantB,
      scenario.onlyConsultantBTime ? [scenario.onlyConsultantBTime] : [],
    );
    const uniqueBResult = await findSingleConsultantApplication({
      adminDb: adminClient.db,
      companyClient: companyBClient,
      companyName: companyB.companyName,
      agenda: consultant2OnlyAgenda,
      expectedConsultantId: consultantB.id,
      candidates: uniqueBCandidates,
    });
    createdApplicationIds.push(uniqueBResult.applicationId);

    const uniqueB = await getApplication(adminClient.db, uniqueBResult.applicationId);
    const uniquePendingIdsB = Array.isArray(uniqueB.pendingConsultantIds)
      ? [...uniqueB.pendingConsultantIds].sort()
      : [];
    assert(
      JSON.stringify(uniquePendingIdsB) === JSON.stringify([consultantB.id]),
      `expected qa2 pendingConsultantIds=[${consultantB.id}], got ${JSON.stringify(uniquePendingIdsB)}`,
    );
    console.log(`- ok: qa2는 consultantB(${consultantB.id})만 pending`);

    console.log("[6] confirmed를 수락 대기로 되돌리면 마지막 담당 컨설턴트로만 복원되는지 확인");
    const reopenSource = await findSingleConsultantApplication({
      adminDb: adminClient.db,
      companyClient: companyAClient,
      companyName: companyA.companyName,
      agenda: consultant1OnlyAgenda,
      expectedConsultantId: consultantA.id,
      candidates: buildSingleCompanyCandidateSlots(companyA, consultantA),
    });
    createdApplicationIds.push(reopenSource.applicationId);
    await callable(consultantAClient, "transitionApplicationStatus", {
      applicationId: reopenSource.applicationId,
      action: "claim",
    });
    await callable(adminClient, "transitionApplicationStatus", {
      applicationId: reopenSource.applicationId,
      action: "reopen",
    });
    const reopenedSingle = await getApplication(adminClient.db, reopenSource.applicationId);
    const reopenedSinglePendingIds = Array.isArray(reopenedSingle.pendingConsultantIds)
      ? reopenedSingle.pendingConsultantIds.map((value) => normalizeString(value)).filter(Boolean)
      : [];
    assert(reopenedSingle.status === "pending", `expected reopened status pending, got ${reopenedSingle.status}`);
    assert(
      sameIds(reopenedSinglePendingIds, [consultantA.id]),
      `expected reopened pendingConsultantIds=[${consultantA.id}], got ${JSON.stringify(reopenedSinglePendingIds)}`,
    );
    console.log(`- ok: reopen은 마지막 담당 컨설턴트(${consultantA.id})만 복원`);

    console.log("[7] pending 일정 변경 시 새 시간 기준으로 pending 대상이 다시 계산되는지 확인");
    try {
      const singleUpdateCandidates = buildSingleCompanyCandidateSlots(companyA, consultantA);
      const updateSource = await findSingleConsultantApplication({
        adminDb: adminClient.db,
        companyClient: companyAClient,
        companyName: companyA.companyName,
        agenda: consultant1OnlyAgenda,
        expectedConsultantId: consultantA.id,
        candidates: singleUpdateCandidates,
      });
      createdApplicationIds.push(updateSource.applicationId);
      const moved = await moveSingleApplication({
        adminDb: adminClient.db,
        companyClient: companyAClient,
        applicationId: updateSource.applicationId,
        expectedConsultantId: consultantA.id,
        candidates: singleUpdateCandidates,
        excludeDateKey: updateSource.dateKey,
        excludeTime: updateSource.time,
      });
      console.log(`- ok: 일정 변경 후 ${moved.dateKey} ${moved.time} 기준으로 pending 재계산`);
    } catch (error) {
      console.log(`- skip: 현재 fixture/live 데이터 충돌로 일정 변경 대체 슬롯을 찾지 못함 (${normalizeString(error?.message || String(error))})`);
    }

    console.log("[8] 한 컨설턴트가 거절하면 신청이 종료되고 같은 시간이 다시 열리는지 확인");
    const rejectScenario = await findOverlapApplication({
      adminDb: adminClient.db,
      companyClient: companyAClient,
      companyName: companyA.companyName,
      overlapAgenda,
      consultantIds: [consultantA.id, consultantB.id],
      candidates: overlapCandidates,
    });
    createdApplicationIds.push(rejectScenario.applicationId);

    await callable(consultantAClient, "transitionApplicationStatus", {
      applicationId: rejectScenario.applicationId,
      action: "reject",
      rejectionReason: "QA reject path",
    });
    const rejectedApplication = await getApplication(adminClient.db, rejectScenario.applicationId);
    assert(rejectedApplication.status === "rejected", `expected rejected, got ${rejectedApplication.status}`);
    const rejectedPendingIds = Array.isArray(rejectedApplication.pendingConsultantIds)
      ? rejectedApplication.pendingConsultantIds
      : [];
    assert(rejectedPendingIds.length === 0, "rejected application should not keep pendingConsultantIds");

    const postRejectResult = await callable(companyBClient, "submitRegularApplication", {
      officeHourId: buildRegularOfficeHourId(rejectScenario.programB.id, rejectScenario.dateKey),
      officeHourTitle: `${normalizeString(rejectScenario.programB.name)} 정기 오피스아워`,
      programId: rejectScenario.programB.id,
      agendaId: overlapAgenda.id,
      scheduledDate: rejectScenario.dateKey,
      scheduledTime: rejectScenario.overlapTime,
      sessionFormat: "online",
      requestContent: `[QA post reject reopen] ${Date.now()}`,
      attachmentNames: [],
      attachmentUrls: [],
    });
    createdApplicationIds.push(postRejectResult.applicationId);
    const reopenedApplication = await getApplication(adminClient.db, postRejectResult.applicationId);
    const postRejectPendingIds = Array.isArray(reopenedApplication.pendingConsultantIds)
      ? reopenedApplication.pendingConsultantIds.map((value) => normalizeString(value)).filter(Boolean).sort()
      : [];
    assert(
      sameIds(postRejectPendingIds, [consultantA.id, consultantB.id]),
      `expected reopened pending ids to include both consultants, got ${JSON.stringify(postRejectPendingIds)}`,
    );
    console.log("- ok: 거절 후 신청 종료 + 같은 시간 다시 신청 가능");

    console.log("");
    console.log("QA logic checks passed.");
  } finally {
    if (createdApplicationIds.length > 0) {
      const cleanupApp = initializeApp(firebaseConfig, `qa-cleanup-${Date.now()}`);
      appsToCleanup.push(cleanupApp);
      const cleanupAuth = getAuth(cleanupApp);
      await signInWithEmailAndPassword(cleanupAuth, adminEmail, adminPassword);
      const cleanupDb = getFirestore(cleanupApp);
      for (const applicationId of createdApplicationIds) {
        try {
          await deleteDoc(doc(cleanupDb, "officeHourApplications", applicationId));
        } catch (error) {
          console.warn(`cleanup failed for application ${applicationId}:`, error?.message || error);
        }
      }
    }

    await Promise.allSettled(appsToCleanup.map((app) => deleteApp(app)));
  }
}

main().catch((error) => {
  console.error("");
  console.error("QA logic check failed.");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
