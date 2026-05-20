#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const functionsPolicy = require("../functions/regular-office-hour-policy.cjs");
const sharedPolicy = require("../src/shared/regular-office-hour-policy.cjs");

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeWeekInfo(info) {
  if (!info) {
    return null;
  }
  return {
    monthKey: info.monthKey,
    weekOfMonth: info.weekOfMonth,
    weekStart: formatDate(info.weekStart),
    weekThursday: formatDate(info.weekThursday),
  };
}

function assertEqual(a, b, message, context) {
  if (a !== b) {
    console.error(message);
    if (context) {
      console.error("  context:", context);
    }
    throw new Error(message);
  }
}

function assertDeepEqual(a, b, message, context) {
  const aText = JSON.stringify(a);
  const bText = JSON.stringify(b);
  if (aText !== bText) {
    console.error(message);
    if (context) {
      console.error("  context:", context);
    }
    console.error("  expected:", bText);
    console.error("  actual:", aText);
    throw new Error(message);
  }
}

function addMonths(date, amount) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + amount, 1);
  next.setHours(12, 0, 0, 0);
  return next;
}

function collectMonthlyScopeDates(policy, monthKey, scope) {
  const result = policy.getRegularOfficeHourDateKeysForMonth(monthKey, scope);
  return [...result];
}

function collectMonthlyDayNumberDates(policy, monthKey, dayNumbers) {
  const result = policy.getRegularOfficeHourDateKeysForDayNumbers(monthKey, dayNumbers);
  return [...result];
}

const functionMissing = [
  "getRegularOfficeHourDateKeysForDayNumbers",
  "getCompanyApplicationWindow",
  "shouldDispatchCompanyApplicationAlert",
  "shouldDispatchConsultantScheduleRegistrationAlert",
].filter(
  (name) => !Object.prototype.hasOwnProperty.call(sharedPolicy, name),
);
if (functionMissing.length > 0) {
  throw new Error(`shared policy missing expected exports: ${functionMissing.join(", ")}`);
}

assertDeepEqual(
  [...functionsPolicy.REGULAR_OFFICE_HOUR_WEEK_NUMBERS].sort((a, b) => a - b),
  [...sharedPolicy.REGULAR_OFFICE_HOUR_WEEK_NUMBERS].sort((a, b) => a - b),
  "REGULAR_OFFICE_HOUR_WEEK_NUMBERS mismatch between function and shared policy",
);

assertEqual(
  functionsPolicy.CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER,
  sharedPolicy.CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER,
  "CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER mismatch between function and shared policy",
);

assertEqual(
  functionsPolicy.COMPANY_APPLICATION_OPEN_WEEK_NUMBER,
  sharedPolicy.COMPANY_APPLICATION_OPEN_WEEK_NUMBER,
  "COMPANY_APPLICATION_OPEN_WEEK_NUMBER mismatch between function and shared policy",
);

function assertNoDiff() {
  const start = new Date("2015-01-01T12:00:00.000+09:00");
  const end = new Date("2030-12-31T12:00:00.000+09:00");
  const cursor = new Date(start.getTime());

  while (cursor <= end) {
    const dateKey = formatDate(cursor);
    const functionsWeek = normalizeWeekInfo(functionsPolicy.getOfficeHourWeekInfo(dateKey));
    const sharedWeek = normalizeWeekInfo(sharedPolicy.getOfficeHourWeekInfo(dateKey));
    assertDeepEqual(
      functionsWeek,
      sharedWeek,
      "getOfficeHourWeekInfo output mismatch",
      { dateKey, functionsWeek, sharedWeek },
    );

    const scopes = [undefined, "internal", "external"];
    for (const scope of scopes) {
      const functionsScopeResult = functionsPolicy.isRegularOfficeHourDateForScope(dateKey, scope);
      const sharedScopeResult = sharedPolicy.isRegularOfficeHourDateForScope(dateKey, scope);
      assertEqual(
        functionsScopeResult,
        sharedScopeResult,
        "isRegularOfficeHourDateForScope output mismatch",
        { dateKey, scope, functionsScopeResult, sharedScopeResult },
      );
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  let monthCursor = new Date("2015-01-01T12:00:00.000+09:00");
  const monthEnd = new Date("2030-12-01T12:00:00.000+09:00");
  while (monthCursor <= monthEnd) {
    const monthKey = formatDate(monthCursor).slice(0, 7);
    const functionsMonth = collectMonthlyScopeDates(functionsPolicy, monthKey);
    const sharedMonth = collectMonthlyScopeDates(sharedPolicy, monthKey);
    assertDeepEqual(functionsMonth, sharedMonth, "getRegularOfficeHourDateKeysForMonth mismatch", {
      monthKey,
    });

    const functionsMonthInternal = collectMonthlyScopeDates(functionsPolicy, monthKey, "internal");
    const sharedMonthInternal = collectMonthlyScopeDates(sharedPolicy, monthKey, "internal");
    assertDeepEqual(
      functionsMonthInternal,
      sharedMonthInternal,
      "getRegularOfficeHourDateKeysForMonth mismatch (internal)",
      { monthKey },
    );

    const functionsMonthExternal = collectMonthlyScopeDates(functionsPolicy, monthKey, "external");
    const sharedMonthExternal = collectMonthlyScopeDates(sharedPolicy, monthKey, "external");
    assertDeepEqual(
      functionsMonthExternal,
      sharedMonthExternal,
      "getRegularOfficeHourDateKeysForMonth mismatch (external)",
      { monthKey },
    );

    const dayNumbers = [2, 3, 4];
    const functionsDayNumbers = collectMonthlyDayNumberDates(
      functionsPolicy,
      monthKey,
      dayNumbers,
    );
    const sharedDayNumbers = collectMonthlyDayNumberDates(sharedPolicy, monthKey, dayNumbers);
    assertDeepEqual(
      functionsDayNumbers,
      sharedDayNumbers,
      "getRegularOfficeHourDateKeysForDayNumbers mismatch",
      { monthKey, dayNumbers },
    );

    const now = new Date(`${monthKey}-15T10:00:00+09:00`);
    const nextMonth = formatDate(addMonths(new Date(now.getTime()), 1)).slice(0, 7);
    const functionsCanConsultant = functionsPolicy.canConsultantEditMonthlyAvailability(nextMonth, now);
    const sharedCanConsultant = sharedPolicy.canConsultantEditMonthlyAvailability(nextMonth, now);
    assertEqual(
      functionsCanConsultant,
      sharedCanConsultant,
      "canConsultantEditMonthlyAvailability mismatch",
      {
        monthKey: nextMonth,
        now: formatDate(now),
      },
    );

    const functionsCanCompany = functionsPolicy.canCompanyManageRegularApplication(nextMonth, now);
    const sharedCanCompany = sharedPolicy.canCompanyManageRegularApplication(nextMonth, now);
    assertEqual(
      functionsCanCompany,
      sharedCanCompany,
      "canCompanyManageRegularApplication mismatch",
      {
        monthKey: nextMonth,
        now: formatDate(now),
      },
    );

    const testDate = `${monthKey}-01`;
    const monthFromFunctions = functionsPolicy.getMonthKeyFromDateKey(testDate);
    const monthFromShared = sharedPolicy.getMonthKeyFromDateKey(testDate);
    assertEqual(monthFromFunctions, monthFromShared, "getMonthKeyFromDateKey mismatch", { testDate });

    monthCursor = addMonths(monthCursor, 1);
  }
}

assertNoDiff();

const pilotConsultantStart = new Date("2026-05-20T10:00:00+09:00");
const pilotConsultantEnd = new Date("2026-05-28T10:00:00+09:00");
const originalConsultantAlertDate = new Date("2026-05-18T09:00:00+09:00");
const originalCompanyAlertDate = new Date("2026-05-25T09:00:00+09:00");
const pilotCompanyStart = new Date("2026-05-29T10:00:00+09:00");
const pilotCompanyAlertDate = new Date("2026-05-29T09:00:00+09:00");
const pilotCompanyEnd = new Date("2026-06-04T10:00:00+09:00");
const postPilotCompany = new Date("2026-06-05T10:00:00+09:00");

assertEqual(
  functionsPolicy.canConsultantEditMonthlyAvailability("2026-06", originalConsultantAlertDate),
  false,
  "pilot consultant registration should not use the original third-week opening date",
);
assertEqual(
  functionsPolicy.canConsultantEditMonthlyAvailability("2026-06", pilotConsultantStart),
  true,
  "pilot consultant registration start should be open",
);
assertEqual(
  functionsPolicy.canConsultantEditMonthlyAvailability("2026-06", pilotConsultantEnd),
  true,
  "pilot consultant registration end should be open",
);
assertEqual(
  functionsPolicy.canCompanyManageRegularApplication("2026-06", originalCompanyAlertDate),
  false,
  "pilot company application should not use the original fourth-week opening date",
);
assertEqual(
  functionsPolicy.canCompanyManageRegularApplication("2026-06", pilotCompanyStart),
  true,
  "pilot company application start should be open",
);
assertEqual(
  functionsPolicy.canCompanyManageRegularApplication("2026-06", pilotCompanyEnd),
  true,
  "pilot company application end should be open",
);
assertEqual(
  functionsPolicy.canCompanyManageRegularApplication("2026-06", postPilotCompany),
  false,
  "pilot company application should close after the exception window",
);
assertEqual(
  functionsPolicy.shouldDispatchConsultantScheduleRegistrationAlert(originalConsultantAlertDate),
  false,
  "pilot consultant registration alert should be suppressed",
);
assertEqual(
  functionsPolicy.shouldDispatchCompanyApplicationAlert(originalCompanyAlertDate),
  false,
  "pilot company application alert should skip the original fourth-week Monday",
);
assertEqual(
  functionsPolicy.shouldDispatchCompanyApplicationAlert(pilotCompanyAlertDate),
  true,
  "pilot company application alert should dispatch on 2026-05-29",
);
assertDeepEqual(
  functionsPolicy.getCompanyApplicationWindow(pilotCompanyStart),
  sharedPolicy.getCompanyApplicationWindow(pilotCompanyStart),
  "pilot company application window mismatch",
);
console.log("OK: regular office-hour policy sync validated (functions <-> shared)");
