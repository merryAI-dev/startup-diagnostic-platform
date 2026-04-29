"use strict";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const REGULAR_OFFICE_HOUR_WEEK_NUMBERS = [2, 4];
const CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER = 3;
const COMPANY_APPLICATION_OPEN_WEEK_NUMBER = 4;
const INTERNAL_DAY_NUMBERS = [2, 3];
const EXTERNAL_DAY_NUMBERS = [4];
const ALL_DAY_NUMBERS = [2, 3, 4];
const STAGE_PROJECT_ID = "startup-diagnosis-platform";

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function normalizeDateKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMonthKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeDateKey(value));
}

function isMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(normalizeMonthKey(value));
}

function buildSeoulMiddayDate(year, month, day) {
  const parsed = new Date(`${year}-${padNumber(month)}-${padNumber(day)}T12:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSeoulDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function getSeoulTodayDate(value) {
  const parts = getSeoulDateParts(value);
  if (!parts) {
    return null;
  }
  return buildSeoulMiddayDate(parts.year, parts.month, parts.day);
}

function parseDateKey(dateKey) {
  if (!isDateKey(dateKey)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  return buildSeoulMiddayDate(Number(yearRaw), Number(monthRaw), Number(dayRaw));
}

function parseMonthKey(monthKey) {
  if (!isMonthKey(monthKey)) {
    return null;
  }

  const [yearRaw, monthRaw] = monthKey.split("-");
  return buildSeoulMiddayDate(Number(yearRaw), Number(monthRaw), 1);
}

function formatDateKey(date) {
  const parts = getSeoulDateParts(date);
  if (!parts) {
    return "";
  }
  return `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}`;
}

function formatMonthKey(date) {
  const parts = getSeoulDateParts(date);
  if (!parts) {
    return "";
  }
  return `${parts.year}-${padNumber(parts.month)}`;
}

function getMonthKeyFromDateKey(dateKey) {
  const parsed = parseDateKey(dateKey);
  return parsed ? formatMonthKey(parsed) : "";
}

function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const parts = getSeoulDateParts(date);
  if (!parts) {
    return null;
  }
  return buildSeoulMiddayDate(parts.year, parts.month + amount, 1);
}

function getWeekStartMonday(date) {
  const currentDay = date.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  return addDays(date, diff);
}

function getOfficeHourWeekInfo(value) {
  const sourceDate =
    typeof value === "string" ? parseDateKey(value) : getSeoulTodayDate(value instanceof Date ? value : new Date(value));
  if (!sourceDate) {
    return null;
  }

  const weekStart = getWeekStartMonday(sourceDate);
  const weekThursday = addDays(weekStart, 3);
  const monthKey = formatMonthKey(weekThursday);
  const monthStart = parseMonthKey(monthKey);
  if (!monthStart) {
    return null;
  }

  const firstWeekStart = getWeekStartMonday(monthStart);
  const firstWeekThursday = addDays(firstWeekStart, 3);
  const weekOfMonth =
    Math.floor((weekThursday.getTime() - firstWeekThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

  return {
    date: sourceDate,
    weekStart,
    weekThursday,
    monthKey,
    weekOfMonth,
  };
}

function getScopeDayNumbers(scope) {
  if (scope === "external") {
    return [...EXTERNAL_DAY_NUMBERS];
  }
  if (scope === "internal") {
    return [...INTERNAL_DAY_NUMBERS];
  }
  return [...ALL_DAY_NUMBERS];
}

function isRegularOfficeHourDateForScope(dateKey, scope) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return false;
  }

  const weekInfo = getOfficeHourWeekInfo(parsed);
  if (!weekInfo) {
    return false;
  }

  if (!REGULAR_OFFICE_HOUR_WEEK_NUMBERS.includes(weekInfo.weekOfMonth)) {
    return false;
  }

  return getScopeDayNumbers(scope).includes(parsed.getDay());
}

function getRegularOfficeHourDateKeysForMonth(monthKey, scope) {
  const monthStart = parseMonthKey(monthKey);
  if (!monthStart) {
    return [];
  }

  const targetMonthKey = formatMonthKey(monthStart);
  const nextMonth = addMonths(monthStart, 1);
  if (!nextMonth) {
    return [];
  }

  const dates = [];
  let cursor = new Date(monthStart.getTime());
  while (cursor.getTime() < nextMonth.getTime()) {
    const dateKey = formatDateKey(cursor);
    const weekInfo = getOfficeHourWeekInfo(cursor);
    if (
      weekInfo &&
      weekInfo.monthKey === targetMonthKey &&
      isRegularOfficeHourDateForScope(dateKey, scope)
    ) {
      dates.push(dateKey);
    }
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function getNextMonthKey(value) {
  const today = getSeoulTodayDate(value instanceof Date ? value : new Date(value));
  if (!today) {
    return "";
  }
  const nextMonth = addMonths(today, 1);
  return nextMonth ? formatMonthKey(nextMonth) : "";
}

function isRegularOfficeHourWindowOverrideEnabled() {
  if (process.env.REGULAR_OFFICE_HOUR_TESTING === "true") {
    return true;
  }

  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.FIREBASE_CONFIG_PROJECT_ID ||
    "";

  if (projectId === STAGE_PROJECT_ID) {
    return true;
  }

  const firebaseConfig = process.env.FIREBASE_CONFIG;
  if (typeof firebaseConfig !== "string" || firebaseConfig.length === 0) {
    return false;
  }

  try {
    const parsed = JSON.parse(firebaseConfig);
    return parsed?.projectId === STAGE_PROJECT_ID;
  } catch {
    return false;
  }
}

function canConsultantEditMonthlyAvailability(targetMonthKey, now) {
  if (!isMonthKey(targetMonthKey)) {
    return false;
  }

  const currentDate = now instanceof Date ? now : new Date(now || Date.now());
  if (isRegularOfficeHourWindowOverrideEnabled()) {
    return targetMonthKey === getNextMonthKey(currentDate);
  }

  const weekInfo = getOfficeHourWeekInfo(currentDate);
  if (!weekInfo) {
    return false;
  }

  return (
    weekInfo.weekOfMonth === CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER &&
    targetMonthKey === getNextMonthKey(currentDate)
  );
}

function canCompanyManageRegularApplication(targetMonthKey, now) {
  if (!isMonthKey(targetMonthKey)) {
    return false;
  }

  const currentDate = now instanceof Date ? now : new Date(now || Date.now());
  if (isRegularOfficeHourWindowOverrideEnabled()) {
    return targetMonthKey === getNextMonthKey(currentDate);
  }

  const weekInfo = getOfficeHourWeekInfo(currentDate);
  if (!weekInfo) {
    return false;
  }

  return (
    weekInfo.weekOfMonth === COMPANY_APPLICATION_OPEN_WEEK_NUMBER &&
    targetMonthKey === getNextMonthKey(currentDate)
  );
}

function canCompanyApplyForRegularDate(dateKey, now) {
  const monthKey = getMonthKeyFromDateKey(dateKey);
  if (!monthKey) {
    return false;
  }
  return canCompanyManageRegularApplication(monthKey, now);
}

module.exports = {
  REGULAR_OFFICE_HOUR_WEEK_NUMBERS,
  CONSULTANT_SCHEDULE_OPEN_WEEK_NUMBER,
  COMPANY_APPLICATION_OPEN_WEEK_NUMBER,
  INTERNAL_DAY_NUMBERS,
  EXTERNAL_DAY_NUMBERS,
  ALL_DAY_NUMBERS,
  SEOUL_TIME_ZONE,
  isDateKey,
  isMonthKey,
  parseDateKey,
  parseMonthKey,
  formatDateKey,
  formatMonthKey,
  getMonthKeyFromDateKey,
  getOfficeHourWeekInfo,
  getScopeDayNumbers,
  isRegularOfficeHourDateForScope,
  getRegularOfficeHourDateKeysForMonth,
  getNextMonthKey,
  canConsultantEditMonthlyAvailability,
  canCompanyManageRegularApplication,
  canCompanyApplyForRegularDate,
};
