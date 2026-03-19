"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();
const REGION = process.env.FUNCTION_REGION || "asia-northeast3";
const ACTIVE_APPLICATION_STATUSES = new Set(["pending", "confirmed", "completed"]);
const RESERVED_APPLICATION_STATUSES = new Set(["pending", "confirmed"]);
const SLOT_BLOCKING_APPLICATION_STATUSES = new Set(["pending", "confirmed", "completed"]);
const AUTO_REJECT_REASON = "진행 예정 시간이 지나 자동 거절되었습니다.";
const AUTO_UNASSIGNABLE_REASON = "해당 시간대에 배정 가능한 컨설턴트가 없어 자동 거절되었습니다.";
const APPROVAL_ROLE_VALUES = new Set(["admin", "company", "consultant"]);
const DEFAULT_COMPANY_FORM = {
  companyType: "법인",
  companyInfo: "",
  representativeSolution: "",
  sdgPriority1: "",
  sdgPriority2: "",
  ceoName: "",
  ceoEmail: "",
  ceoPhone: "",
  ceoAge: "",
  ceoGender: "",
  ceoNationality: "",
  hasCoRepresentative: "",
  coRepresentativeName: "",
  coRepresentativeBirthDate: "",
  coRepresentativeGender: "",
  coRepresentativeTitle: "",
  founderSerialNumber: "",
  website: "",
  foundedAt: "",
  businessNumber: "",
  primaryBusiness: "",
  primaryIndustry: "",
  headOffice: "",
  branchOffice: "",
  targetCountries: "",
  workforceFullTime: "",
  workforceContract: "",
  revenue2025: "",
  revenue2026: "",
  capitalTotal: "",
  certification: "",
  tipsLipsHistory: "",
  exportVoucherHeld: "",
  exportVoucherAmount: "",
  exportVoucherUsageRate: "",
  innovationVoucherHeld: "",
  innovationVoucherAmount: "",
  innovationVoucherUsageRate: "",
  myscExpectation: "",
  desiredInvestment2026: "",
  desiredPreValue: "",
};

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApplicationStatus(value) {
  const normalized = normalizeString(value);
  if (normalized === "review") return "pending";
  return normalized || "pending";
}

function normalizeApprovalRole(value, fallback = "company") {
  const normalized = normalizeString(value);
  return APPROVAL_ROLE_VALUES.has(normalized) ? normalized : fallback;
}

function normalizeTimeKey(value) {
  const trimmed = normalizeString(value);
  if (!trimmed) return "";
  const [hourRaw, minuteRaw] = trimmed.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return trimmed;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getCurrentSeoulDateTimeKeys(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    timeKey: `${values.hour}:${values.minute}`,
  };
}

function isPastScheduledStart(dateKey, timeKey, now = new Date()) {
  const normalizedDate = normalizeString(dateKey);
  const normalizedTime = normalizeTimeKey(timeKey);
  if (!normalizedDate || !normalizedTime) return true;
  const { dateKey: currentDateKey, timeKey: currentTimeKey } = getCurrentSeoulDateTimeKeys(now);
  if (normalizedDate < currentDateKey) return true;
  if (normalizedDate > currentDateKey) return false;
  return normalizedTime < currentTimeKey;
}

function normalizeConsultantDisplayName(value) {
  return normalizeString(value).replace(/\s*컨설턴트\s*$/u, "").toLowerCase();
}

function toNumber(value) {
  const digits = normalizeString(value).replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

function toDecimalNumber(value) {
  const normalized = normalizeString(value).replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 10) / 10;
}

function toIsoDate(value) {
  const digits = normalizeString(value).replace(/[^\d]/g, "").slice(0, 8);
  if (digits.length !== 8) return normalizeString(value);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function toTargetCountries(value) {
  return normalizeString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function toPendingCompanyForm(value) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_COMPANY_FORM };
  }

  const source = value;
  return {
    ...DEFAULT_COMPANY_FORM,
    companyType: normalizeString(source.companyType) || DEFAULT_COMPANY_FORM.companyType,
    companyInfo: normalizeString(source.companyInfo),
    representativeSolution: normalizeString(source.representativeSolution),
    sdgPriority1: normalizeString(source.sdgPriority1),
    sdgPriority2: normalizeString(source.sdgPriority2),
    ceoName: normalizeString(source.ceoName),
    ceoEmail: normalizeString(source.ceoEmail),
    ceoPhone: normalizeString(source.ceoPhone),
    ceoAge: normalizeString(source.ceoAge),
    ceoGender: normalizeString(source.ceoGender),
    ceoNationality: normalizeString(source.ceoNationality),
    hasCoRepresentative: normalizeString(source.hasCoRepresentative),
    coRepresentativeName: normalizeString(source.coRepresentativeName),
    coRepresentativeBirthDate: normalizeString(source.coRepresentativeBirthDate),
    coRepresentativeGender: normalizeString(source.coRepresentativeGender),
    coRepresentativeTitle: normalizeString(source.coRepresentativeTitle),
    founderSerialNumber: normalizeString(source.founderSerialNumber),
    website: normalizeString(source.website),
    foundedAt: normalizeString(source.foundedAt),
    businessNumber: normalizeString(source.businessNumber),
    primaryBusiness: normalizeString(source.primaryBusiness),
    primaryIndustry: normalizeString(source.primaryIndustry),
    headOffice: normalizeString(source.headOffice),
    branchOffice: normalizeString(source.branchOffice),
    targetCountries: normalizeString(source.targetCountries),
    workforceFullTime: normalizeString(source.workforceFullTime),
    workforceContract: normalizeString(source.workforceContract),
    revenue2025: normalizeString(source.revenue2025),
    revenue2026: normalizeString(source.revenue2026),
    capitalTotal: normalizeString(source.capitalTotal),
    certification: normalizeString(source.certification),
    tipsLipsHistory: normalizeString(source.tipsLipsHistory),
    exportVoucherHeld: normalizeString(source.exportVoucherHeld),
    exportVoucherAmount: normalizeString(source.exportVoucherAmount),
    exportVoucherUsageRate: normalizeString(source.exportVoucherUsageRate),
    innovationVoucherHeld: normalizeString(source.innovationVoucherHeld),
    innovationVoucherAmount: normalizeString(source.innovationVoucherAmount),
    innovationVoucherUsageRate: normalizeString(source.innovationVoucherUsageRate),
    myscExpectation: normalizeString(source.myscExpectation),
    desiredInvestment2026: normalizeString(source.desiredInvestment2026),
    desiredPreValue: normalizeString(source.desiredPreValue),
  };
}

function toPendingInvestmentRows(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    stage: normalizeString(item?.stage),
    date: normalizeString(item?.date),
    postMoney: normalizeString(item?.postMoney),
    majorShareholder: normalizeString(item?.majorShareholder),
  }));
}

function buildCompanyInfoRecord(form, investmentRows) {
  return {
    basic: {
      companyType: form.companyType,
      companyInfo: form.companyInfo,
      representativeSolution: form.representativeSolution,
      ceo: {
        name: form.ceoName,
        email: form.ceoEmail,
        phone: form.ceoPhone,
        age: toNumber(form.ceoAge),
        gender: form.ceoGender,
        nationality: form.ceoNationality,
        coRepresentative: {
          enabled: form.hasCoRepresentative === "예",
          name: form.hasCoRepresentative === "예" ? form.coRepresentativeName : "",
          birthDate: form.hasCoRepresentative === "예" ? form.coRepresentativeBirthDate : "",
          gender: form.hasCoRepresentative === "예" ? form.coRepresentativeGender : "",
          title: form.hasCoRepresentative === "예" ? form.coRepresentativeTitle : "",
        },
      },
      founderSerialNumber: toNumber(form.founderSerialNumber),
      website: form.website,
      foundedAt: form.foundedAt,
      businessNumber: form.companyType === "예비창업" ? "" : form.businessNumber,
      primaryBusiness: form.primaryBusiness,
      primaryIndustry: form.primaryIndustry,
    },
    locations: {
      headOffice: form.headOffice,
      branchOrLab: form.branchOffice,
    },
    workforce: {
      fullTime: toNumber(form.workforceFullTime),
      contract: toNumber(form.workforceContract),
    },
    finance: {
      revenue: {
        y2025: toDecimalNumber(form.revenue2025),
        y2026: toDecimalNumber(form.revenue2026),
      },
      capitalTotal: toNumber(form.capitalTotal),
    },
    certifications: {
      designation: form.certification,
      tipsLipsHistory: form.tipsLipsHistory,
    },
    impact: {
      sdgPriority1: form.sdgPriority1,
      sdgPriority2: form.sdgPriority2,
      myscExpectation: form.myscExpectation,
    },
    globalExpansion: {
      targetCountries: toTargetCountries(form.targetCountries),
    },
    investments: (investmentRows ?? []).map((row) => ({
      stage: row.stage,
      date: toIsoDate(row.date),
      postMoney: toDecimalNumber(row.postMoney),
      majorShareholder: row.majorShareholder,
    })),
    vouchers: {
      exportVoucherHeld: form.exportVoucherHeld,
      exportVoucherAmount: form.exportVoucherAmount,
      exportVoucherUsageRate: form.exportVoucherUsageRate,
      innovationVoucherHeld: form.innovationVoucherHeld,
      innovationVoucherAmount: form.innovationVoucherAmount,
      innovationVoucherUsageRate: form.innovationVoucherUsageRate,
    },
    fundingPlan: {
      desiredAmount2026: toDecimalNumber(form.desiredInvestment2026),
      preValue: toDecimalNumber(form.desiredPreValue),
    },
    metadata: {
      updatedAt: FieldValue.serverTimestamp(),
      saveType: "final",
    },
  };
}

function buildDefaultConsultantAvailability() {
  const scheduleDays = [2, 4];
  const timeSlots = Array.from({ length: 9 }, (_, index) => {
    const startHour = 9 + index;
    const endHour = startHour + 1;
    return {
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(endHour).padStart(2, "0")}:00`,
    };
  });

  return scheduleDays.map((dayOfWeek) => ({
    dayOfWeek,
    slots: timeSlots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }));
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeString(value));
}

function parseDateKey(value) {
  if (!isDateKey(value)) return null;
  const parsed = new Date(`${normalizeString(value)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getProgramWeekdayNumbers(weekdays) {
  const source = Array.isArray(weekdays) && weekdays.length > 0 ? weekdays : ["TUE", "THU"];
  const numbers = [];
  source.forEach((weekday) => {
    if (weekday === "TUE") numbers.push(2);
    if (weekday === "THU") numbers.push(4);
  });
  return numbers;
}

function isProgramDateAvailable(programDoc, dateKey) {
  const targetDate = parseDateKey(dateKey);
  const startDate = parseDateKey(normalizeString(programDoc?.periodStart));
  const endDate = parseDateKey(normalizeString(programDoc?.periodEnd));
  if (!targetDate || !startDate || !endDate) {
    return false;
  }
  if (targetDate.getTime() < startDate.getTime() || targetDate.getTime() > endDate.getTime()) {
    return false;
  }
  return getProgramWeekdayNumbers(programDoc?.weekdays).includes(targetDate.getDay());
}

function buildRegularSlotId(programId, consultantId, dateKey, timeKey) {
  return [
    "regular",
    normalizeString(programId),
    normalizeString(consultantId),
    normalizeString(dateKey),
    normalizeTimeKey(timeKey),
  ]
    .join("_")
    .replace(/:/g, "-");
}

function getDefaultEndTime(startTime) {
  const normalized = normalizeTimeKey(startTime);
  if (!normalized) return "";
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "";
  const endHour = hour + 1;
  return `${String(endHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isSessionFormat(value) {
  return value === "online" || value === "offline";
}

function getApplicationDurationHours(application, slotDoc) {
  const raw = Number(application?.duration ?? slotDoc?.duration ?? 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function getSessionEndTime(application, slotDoc) {
  const dateKey = normalizeString(application?.scheduledDate || slotDoc?.date);
  const timeKey = normalizeTimeKey(application?.scheduledTime || slotDoc?.startTime);
  if (dateKey && timeKey) {
    const start = new Date(`${dateKey}T${timeKey}`);
    if (!Number.isNaN(start.getTime())) {
      if (slotDoc?.endTime) {
        const end = new Date(`${dateKey}T${normalizeTimeKey(slotDoc.endTime)}`);
        if (!Number.isNaN(end.getTime())) {
          return end;
        }
      }

      const durationHours = getApplicationDurationHours(application, slotDoc);
      return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    }
  }

  if (dateKey) {
    const fallback = new Date(`${dateKey}T23:59`);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback;
    }
  }

  return null;
}

function hasSessionEnded(application, slotDoc, now = new Date()) {
  const endTime = getSessionEndTime(application, slotDoc);
  return Boolean(endTime && now >= endTime);
}

function isConsultantAvailableAt(consultant, dateKey, time) {
  if (!isDateKey(dateKey) || !time) return false;
  const targetDate = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(targetDate.getTime())) return false;
  const dayOfWeek = targetDate.getDay();
  const availabilityList = Array.isArray(consultant.availability) ? consultant.availability : [];
  const dayAvailability = availabilityList.find((item) => item?.dayOfWeek === dayOfWeek);
  if (!dayAvailability || !Array.isArray(dayAvailability.slots)) return false;
  return dayAvailability.slots.some(
    (slot) => normalizeTimeKey(slot?.start) === time && slot?.available === true
  );
}

function getAgendaScope(agendaDoc) {
  return agendaDoc?.scope === "external" ? "external" : "internal";
}

function getProgramTicketValue(programDoc, companyDoc, scope) {
  const overrides =
    companyDoc?.programTicketOverrides && typeof companyDoc.programTicketOverrides === "object"
      ? companyDoc.programTicketOverrides
      : {};
  const overrideValue = overrides?.[programDoc.id]?.[scope];
  if (typeof overrideValue === "number") {
    return overrideValue;
  }
  if (scope === "internal") {
    return typeof programDoc.internalTicketLimit === "number" ? programDoc.internalTicketLimit : 0;
  }
  return typeof programDoc.externalTicketLimit === "number" ? programDoc.externalTicketLimit : 0;
}

async function getRelatedRegularSlotSnapshots(transaction, slotSnap) {
  if (!slotSnap?.exists) return [];

  const slotDoc = slotSnap.data() || {};
  const programId = normalizeString(slotDoc.programId);
  const consultantId = normalizeString(slotDoc.consultantId);
  const dateKey = normalizeString(slotDoc.date);
  const startTime = normalizeTimeKey(slotDoc.startTime);

  if (
    normalizeString(slotDoc.type || "regular") !== "regular" ||
    !programId ||
    !dateKey ||
    !startTime
  ) {
    return [slotSnap];
  }

  if (consultantId) {
    return [slotSnap];
  }

  const relatedSlotsQuery = db
    .collection("officeHourSlots")
    .where("type", "==", "regular")
    .where("programId", "==", programId)
    .where("date", "==", dateKey)
    .where("startTime", "==", startTime);
  const relatedSlotsSnap = await transaction.get(relatedSlotsQuery);

  return relatedSlotsSnap.empty ? [slotSnap] : relatedSlotsSnap.docs;
}

async function getRelatedSlotSnapshotsForApplication(transaction, application) {
  const slotId = normalizeString(application?.officeHourSlotId);
  if (!slotId) return [];

  const slotRef = db.collection("officeHourSlots").doc(slotId);
  const slotSnap = await transaction.get(slotRef);
  if (!slotSnap.exists) return [];

  return getRelatedRegularSlotSnapshots(transaction, slotSnap);
}

function collectSlotIds(slotSnaps) {
  return new Set(slotSnaps.map((snap) => snap.id));
}

function updateSlotSnapshots(transaction, slotSnaps, status) {
  slotSnaps.forEach((slotSnap) => {
    transaction.update(slotSnap.ref, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function hasBlockingApplicationForSlotGroup(
  transaction,
  application,
  excludedApplicationId,
  relatedSlotIds
) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);

  if (!scheduledDate || !scheduledTime || relatedSlotIds.size === 0) {
    return false;
  }

  const sameTimeQuery = db
    .collection("officeHourApplications")
    .where("scheduledDate", "==", scheduledDate)
    .where("scheduledTime", "==", scheduledTime);
  const sameTimeSnap = await transaction.get(sameTimeQuery);

  return sameTimeSnap.docs.some((doc) => {
    if (doc.id === excludedApplicationId) return false;
    const candidate = doc.data() || {};
    if (!SLOT_BLOCKING_APPLICATION_STATUSES.has(normalizeApplicationStatus(candidate.status))) {
      return false;
    }
    return relatedSlotIds.has(normalizeString(candidate.officeHourSlotId));
  });
}

function normalizeConsultantDoc(consultantSnap) {
  return {
    id: consultantSnap.id,
    ...(consultantSnap.data() || {}),
  };
}

function isSlotReservedForConsultant(slotDoc, consultant) {
  const slotConsultantId = normalizeString(slotDoc?.consultantId);
  if (slotConsultantId) {
    return slotConsultantId === consultant.id;
  }

  const slotConsultantName = normalizeConsultantDisplayName(slotDoc?.consultantName);
  const consultantName = normalizeConsultantDisplayName(consultant?.name);
  return slotConsultantName !== "" && consultantName !== "" && slotConsultantName === consultantName;
}

function isApplicationAssignedToConsultant(application, consultant) {
  if (normalizeString(application?.consultantId) === consultant.id) {
    return true;
  }

  const assignedName = normalizeConsultantDisplayName(application?.consultant);
  const consultantName = normalizeConsultantDisplayName(consultant?.name);
  return assignedName !== "" && consultantName !== "" && assignedName === consultantName;
}

async function consultantCanHandleApplication(transaction, consultant, application) {
  const consultantAgendaIds = Array.isArray(consultant?.agendaIds)
    ? consultant.agendaIds.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  if (consultantAgendaIds.length === 0) {
    return false;
  }

  const agendaId = normalizeString(application?.agendaId);
  if (agendaId && consultantAgendaIds.includes(agendaId)) {
    return true;
  }

  const agendaName = normalizeString(application?.agenda).toLowerCase();
  if (!agendaName) {
    return false;
  }

  const agendaRefs = consultantAgendaIds.map((id) => db.collection("agendas").doc(id));
  const agendaSnaps = await Promise.all(agendaRefs.map((ref) => transaction.get(ref)));

  return agendaSnaps.some((snap) => {
    if (!snap.exists) return false;
    return normalizeString(snap.data()?.name).toLowerCase() === agendaName;
  });
}

async function hasConsultantScheduleConflict(transaction, consultant, application, excludedApplicationId) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  if (!scheduledDate || !scheduledTime) {
    return false;
  }

  const sameTimeQuery = db
    .collection("officeHourApplications")
    .where("scheduledDate", "==", scheduledDate)
    .where("scheduledTime", "==", scheduledTime);
  const sameTimeSnap = await transaction.get(sameTimeQuery);
  const consultantNameKey = normalizeConsultantDisplayName(consultant?.name);

  return sameTimeSnap.docs.some((doc) => {
    if (doc.id === excludedApplicationId) return false;

    const candidate = doc.data() || {};
    const status = normalizeApplicationStatus(candidate.status);
    if (status !== "confirmed" && status !== "completed") {
      return false;
    }

    const consultantId = normalizeString(candidate.consultantId);
    if (consultantId) {
      return consultantId === consultant.id;
    }

    return (
      consultantNameKey !== "" &&
      normalizeConsultantDisplayName(candidate.consultant) === consultantNameKey
    );
  });
}

async function reserveApplicationSlotForConsultant(
  transaction,
  application,
  applicationId,
  consultant,
  assignedSlotDoc
) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  const effectiveProgramId =
    normalizeString(application?.programId) || normalizeString(assignedSlotDoc?.programId);

  if (!scheduledDate || !scheduledTime || !effectiveProgramId) {
    throw new HttpsError("failed-precondition", "신청 슬롯 정보를 확인할 수 없습니다.");
  }

  const previousSlotId = normalizeString(application?.officeHourSlotId);
  const previousRelatedSlotSnaps = await getRelatedSlotSnapshotsForApplication(transaction, application);
  const previousRelatedSlotIds = collectSlotIds(previousRelatedSlotSnaps);

  const targetSlotRef = db
    .collection("officeHourSlots")
    .doc(buildRegularSlotId(effectiveProgramId, consultant.id, scheduledDate, scheduledTime));
  const targetSlotSnap = await transaction.get(targetSlotRef);
  const targetSlotDoc = targetSlotSnap.exists ? targetSlotSnap.data() || {} : null;

  if (targetSlotDoc) {
    if (normalizeString(targetSlotDoc.type || "regular") !== "regular") {
      throw new HttpsError("failed-precondition", "정기 오피스아워 슬롯만 사용할 수 있습니다.");
    }
    if (
      normalizeString(targetSlotDoc.date) !== scheduledDate ||
      normalizeTimeKey(targetSlotDoc.startTime) !== scheduledTime
    ) {
      throw new HttpsError("failed-precondition", "선택 가능한 슬롯 정보가 일치하지 않습니다.");
    }
    if (
      normalizeString(targetSlotDoc.programId || effectiveProgramId) !== effectiveProgramId
    ) {
      throw new HttpsError("failed-precondition", "신청 사업과 일치하지 않는 슬롯입니다.");
    }
    if (!isSlotReservedForConsultant(targetSlotDoc, consultant)) {
      throw new HttpsError("failed-precondition", "현재 컨설턴트가 처리할 수 없는 슬롯입니다.");
    }
  }

  const targetDate = parseDateKey(scheduledDate);
  const endTime =
    (() => {
      if (!targetDate) {
        return normalizeTimeKey(targetSlotDoc?.endTime) || getDefaultEndTime(scheduledTime);
      }
      const dayAvailability = Array.isArray(consultant.availability)
        ? consultant.availability.find((item) => item?.dayOfWeek === targetDate.getDay())
        : null;
      const matchedSlot = Array.isArray(dayAvailability?.slots)
        ? dayAvailability.slots.find(
            (slot) => normalizeTimeKey(slot?.start) === scheduledTime && slot?.available === true
          )
        : null;
      return normalizeTimeKey(matchedSlot?.end) ||
        normalizeTimeKey(targetSlotDoc?.endTime) ||
        getDefaultEndTime(scheduledTime);
    })();

  let shouldOpenPreviousSlots = false;
  if (previousSlotId && previousSlotId !== targetSlotRef.id && previousRelatedSlotIds.size > 0) {
    const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
      transaction,
      application,
      applicationId,
      previousRelatedSlotIds
    );
    shouldOpenPreviousSlots = !hasBlockingApplication;
  }

  transaction.set(
    targetSlotRef,
    {
      type: "regular",
      programId: effectiveProgramId,
      consultantId: consultant.id,
      consultantName: normalizeString(consultant.name) || "컨설턴트",
      agendaIds: Array.isArray(consultant.agendaIds)
        ? consultant.agendaIds.map((item) => normalizeString(item)).filter(Boolean)
        : [],
      title:
        normalizeString(targetSlotDoc?.title) ||
        normalizeString(assignedSlotDoc?.title) ||
        normalizeString(application?.officeHourTitle) ||
        "정기 오피스아워",
      description:
        normalizeString(targetSlotDoc?.description) ||
        normalizeString(assignedSlotDoc?.description) ||
        "정기 오피스아워",
      date: scheduledDate,
      startTime: scheduledTime,
      endTime,
      status: "booked",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (shouldOpenPreviousSlots) {
    updateSlotSnapshots(transaction, previousRelatedSlotSnaps, "open");
  }

  return {
    slotRef: targetSlotRef,
    slotIdsUpdated: new Set([targetSlotRef.id]),
  };
}

async function getAssignableConsultantsForApplication(
  transaction,
  application,
  excludedApplicationId,
  reservedConsultant = null
) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  const agendaId = normalizeString(application?.agendaId);
  if (!scheduledDate || !scheduledTime || !agendaId) {
    return [];
  }

  const linkedConsultantsQuery = db
    .collection("consultants")
    .where("status", "==", "active")
    .where("agendaIds", "array-contains", agendaId);
  const [linkedConsultantsSnap, sameTimeApplicationsSnap, relatedSlotSnaps] = await Promise.all([
    transaction.get(linkedConsultantsQuery),
    transaction.get(
      db
        .collection("officeHourApplications")
        .where("scheduledDate", "==", scheduledDate)
        .where("scheduledTime", "==", scheduledTime)
    ),
    getRelatedSlotSnapshotsForApplication(transaction, application),
  ]);

  if (linkedConsultantsSnap.empty) {
    return [];
  }

  const assignedSlotSnap =
    relatedSlotSnaps.find((slotSnap) => slotSnap.id === normalizeString(application.officeHourSlotId)) ||
    relatedSlotSnaps[0] ||
    null;
  const assignedSlotDoc = assignedSlotSnap?.data?.() || null;
  const hasAssignedConsultant =
    Boolean(normalizeString(application?.consultantId)) ||
    Boolean(normalizeConsultantDisplayName(application?.consultant));

  return linkedConsultantsSnap.docs
    .map((doc) => normalizeConsultantDoc(doc))
    .filter((consultant) => {
      if (!isConsultantAvailableAt(consultant, scheduledDate, scheduledTime)) {
        return false;
      }
      if (assignedSlotDoc && !isSlotReservedForConsultant(assignedSlotDoc, consultant)) {
        return false;
      }
      if (hasAssignedConsultant && !isApplicationAssignedToConsultant(application, consultant)) {
        return false;
      }

      const consultantNameKey = normalizeConsultantDisplayName(consultant?.name);
      if (reservedConsultant?.id && reservedConsultant.id === consultant.id) {
        return false;
      }
      if (
        !reservedConsultant?.id &&
        normalizeConsultantDisplayName(reservedConsultant?.name) !== "" &&
        normalizeConsultantDisplayName(reservedConsultant?.name) === consultantNameKey
      ) {
        return false;
      }

      return !sameTimeApplicationsSnap.docs.some((doc) => {
        if (doc.id === excludedApplicationId) return false;

        const candidate = doc.data() || {};
        const status = normalizeApplicationStatus(candidate.status);
        if (status !== "confirmed" && status !== "completed") {
          return false;
        }

        const consultantId = normalizeString(candidate.consultantId);
        if (consultantId) {
          return consultantId === consultant.id;
        }

        return (
          consultantNameKey !== "" &&
          normalizeConsultantDisplayName(candidate.consultant) === consultantNameKey
        );
      });
    });
}

async function rejectUnassignableSameTimePendingApplications(
  transaction,
  application,
  excludedApplicationId,
  reservedConsultant = null
) {
  const scheduledDate = normalizeString(application?.scheduledDate);
  const scheduledTime = normalizeTimeKey(application?.scheduledTime);
  if (!scheduledDate || !scheduledTime) {
    return [];
  }

  const sameTimeApplicationsSnap = await transaction.get(
    db
      .collection("officeHourApplications")
      .where("scheduledDate", "==", scheduledDate)
      .where("scheduledTime", "==", scheduledTime)
  );

  const rejectedIds = [];

  for (const doc of sameTimeApplicationsSnap.docs) {
    if (doc.id === excludedApplicationId) continue;

    const candidate = doc.data() || {};
    if (normalizeApplicationStatus(candidate.status) !== "pending") {
      continue;
    }

    const assignableConsultants = await getAssignableConsultantsForApplication(
      transaction,
      candidate,
      doc.id,
      reservedConsultant
    );
    if (assignableConsultants.length > 0) {
      continue;
    }

    const relatedSlotSnaps = await getRelatedSlotSnapshotsForApplication(transaction, candidate);
    const relatedSlotIds = collectSlotIds(relatedSlotSnaps);
    const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
      transaction,
      candidate,
      doc.id,
      relatedSlotIds
    );

    transaction.update(doc.ref, {
      status: "rejected",
      rejectionReason: AUTO_UNASSIGNABLE_REASON,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!hasBlockingApplication) {
      updateSlotSnapshots(transaction, relatedSlotSnaps, "open");
    }
    rejectedIds.push(doc.id);
  }

  return rejectedIds;
}

async function runApplicationMaintenanceCore() {
  const candidateSnap = await db
    .collection("officeHourApplications")
    .where("status", "in", ["pending", "review", "confirmed"])
    .get();

  if (candidateSnap.empty) {
    return {
      rejectedCount: 0,
      completedCount: 0,
      slotCount: 0,
    };
  }

  const now = new Date();
  let rejectedCount = 0;
  let completedCount = 0;
  const updatedSlotIds = new Set();

  for (const candidateDoc of candidateSnap.docs) {
    const result = await db.runTransaction(async (transaction) => {
      const applicationRef = candidateDoc.ref;
      const applicationSnap = await transaction.get(applicationRef);
      if (!applicationSnap.exists) {
        return { outcome: "skipped", slotIdsUpdated: [] };
      }

      const application = applicationSnap.data() || {};
      const currentStatus = normalizeApplicationStatus(application.status);
      if (!["pending", "confirmed"].includes(currentStatus)) {
        return { outcome: "skipped", slotIdsUpdated: [] };
      }

      const relatedSlotSnaps = await getRelatedSlotSnapshotsForApplication(transaction, application);
      const relatedSlotIds = collectSlotIds(relatedSlotSnaps);
      const assignedSlotSnap =
        relatedSlotSnaps.find((slotSnap) => slotSnap.id === normalizeString(application.officeHourSlotId)) ||
        relatedSlotSnaps[0] ||
        null;
      const assignedSlotDoc = assignedSlotSnap?.data?.() || null;

      if (!hasSessionEnded(application, assignedSlotDoc, now)) {
        return { outcome: "skipped", slotIdsUpdated: [] };
      }

      if (currentStatus === "pending") {
        const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
          transaction,
          application,
          applicationSnap.id,
          relatedSlotIds
        );

        transaction.update(applicationRef, {
          status: "rejected",
          rejectionReason: normalizeString(application.rejectionReason) || AUTO_REJECT_REASON,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (!hasBlockingApplication) {
          updateSlotSnapshots(transaction, relatedSlotSnaps, "open");
        }

        return {
          outcome: "rejected",
          slotIdsUpdated: !hasBlockingApplication ? Array.from(relatedSlotIds) : [],
        };
      }

      transaction.update(applicationRef, {
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { outcome: "completed", slotIdsUpdated: [] };
    });

    if (result.outcome === "rejected") {
      rejectedCount += 1;
      result.slotIdsUpdated.forEach((slotId) => updatedSlotIds.add(slotId));
    } else if (result.outcome === "completed") {
      completedCount += 1;
    }
  }

  return {
    rejectedCount,
    completedCount,
    slotCount: updatedSlotIds.size,
  };
}

exports.submitRegularApplication = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const authEmail = normalizeString(request.auth.token?.email);
    const payload = request.data ?? {};

    const officeHourId = normalizeString(payload.officeHourId);
    const officeHourSlotId = normalizeString(payload.officeHourSlotId);
    const officeHourTitle = normalizeString(payload.officeHourTitle);
    const programId = normalizeString(payload.programId);
    const agendaId = normalizeString(payload.agendaId);
    const scheduledDate = normalizeString(payload.scheduledDate);
    const scheduledTime = normalizeTimeKey(payload.scheduledTime);
    const sessionFormat = normalizeString(payload.sessionFormat);
    const requestContent = normalizeString(payload.requestContent);
    const attachmentNames = Array.isArray(payload.attachmentNames)
      ? payload.attachmentNames.map((item) => normalizeString(item)).filter(Boolean)
      : [];
    const attachmentUrls = Array.isArray(payload.attachmentUrls)
      ? payload.attachmentUrls.map((item) => normalizeString(item)).filter(Boolean)
      : [];

    if (!officeHourId) {
      throw new HttpsError("invalid-argument", "오피스아워 정보를 확인할 수 없습니다.");
    }
    if (!agendaId) {
      throw new HttpsError("invalid-argument", "아젠다 정보가 필요합니다.");
    }
    if (!isDateKey(scheduledDate)) {
      throw new HttpsError("invalid-argument", "신청 날짜 형식이 올바르지 않습니다.");
    }
    if (!scheduledTime) {
      throw new HttpsError("invalid-argument", "신청 시간을 확인할 수 없습니다.");
    }
    if (!isSessionFormat(sessionFormat)) {
      throw new HttpsError("invalid-argument", "진행 형태 값이 올바르지 않습니다.");
    }
    if (!requestContent) {
      throw new HttpsError("invalid-argument", "요청 내용을 입력해주세요.");
    }
    if (isPastScheduledStart(scheduledDate, scheduledTime)) {
      throw new HttpsError("failed-precondition", "이미 지난 시간은 신청할 수 없습니다.");
    }

    const result = await db.runTransaction(async (transaction) => {
      const profileRef = db.collection("profiles").doc(uid);
      const agendaRef = db.collection("agendas").doc(agendaId);

      const [profileSnap, agendaSnap] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(agendaRef),
      ]);

      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      if (profile.active !== true || profile.role !== "company") {
        throw new HttpsError("permission-denied", "승인된 기업 계정만 신청할 수 있습니다.");
      }

      const companyId = normalizeString(profile.companyId || uid);
      if (!companyId) {
        throw new HttpsError("failed-precondition", "회사 식별자가 없습니다.");
      }

      if (!agendaSnap.exists) {
        throw new HttpsError("failed-precondition", "선택한 아젠다 정보를 찾지 못했습니다.");
      }

      const agendaDoc = agendaSnap.data() || {};
      if (agendaDoc.active === false) {
        throw new HttpsError("failed-precondition", "비활성 아젠다는 신청할 수 없습니다.");
      }

      const companyRef = db.collection("companies").doc(companyId);
      const companySnap = await transaction.get(companyRef);
      const companyDoc = companySnap.exists ? companySnap.data() || {} : {};

      const programIdsFromCompany = Array.isArray(companyDoc.programs)
        ? companyDoc.programs.map((item) => normalizeString(item)).filter(Boolean)
        : [];
      const effectiveProgramId = normalizeString(programId);
      let candidateProgramIds = programIdsFromCompany;

      if (candidateProgramIds.length === 0 && effectiveProgramId) {
        candidateProgramIds = [effectiveProgramId];
      }

      if (candidateProgramIds.length === 0) {
        throw new HttpsError("failed-precondition", "신청 가능한 사업 정보를 확인할 수 없습니다.");
      }

      const programRefs = candidateProgramIds.map((id) => db.collection("programs").doc(id));
      const programSnaps = await Promise.all(programRefs.map((ref) => transaction.get(ref)));
      const programDocs = programSnaps
        .filter((snap) => snap.exists)
        .map((snap) => ({ id: snap.id, ...snap.data() }));

      if (effectiveProgramId && !programDocs.some((program) => program.id === effectiveProgramId)) {
        throw new HttpsError("failed-precondition", "기업에 연결되지 않은 사업입니다.");
      }
      if (!effectiveProgramId) {
        throw new HttpsError("failed-precondition", "신청할 사업 정보를 확인할 수 없습니다.");
      }

      const targetProgramDoc = programDocs.find((program) => program.id === effectiveProgramId);
      if (!targetProgramDoc) {
        throw new HttpsError("failed-precondition", "신청할 사업 정보를 찾을 수 없습니다.");
      }
      if (!isProgramDateAvailable(targetProgramDoc, scheduledDate)) {
        throw new HttpsError("failed-precondition", "사업 운영일이 아니어서 신청할 수 없습니다.");
      }

      const agendaScope = getAgendaScope(agendaDoc);
      const totalTickets = programDocs.reduce(
        (sum, programDoc) => sum + getProgramTicketValue(programDoc, companyDoc, agendaScope),
        0
      );

      const companyApplicationsQuery = db
        .collection("officeHourApplications")
        .where("companyId", "==", companyId);
      const companyApplicationsSnap = await transaction.get(companyApplicationsQuery);

      let reservedCount = 0;
      let completedCount = 0;

      companyApplicationsSnap.docs.forEach((doc) => {
        const data = doc.data() || {};
        const normalizedStatus = normalizeApplicationStatus(data.status);
        let scope = null;
        if (data.type === "irregular" && typeof data.isInternal === "boolean") {
          scope = data.isInternal ? "internal" : "external";
        } else if (normalizeString(data.agendaId) === agendaId) {
          scope = agendaScope;
        } else {
          scope = null;
        }
        if (scope !== agendaScope) return;
        if (normalizedStatus === "completed") {
          completedCount += 1;
        } else if (RESERVED_APPLICATION_STATUSES.has(normalizedStatus)) {
          reservedCount += 1;
        }
      });

      const remainingTickets = Math.max(0, totalTickets - reservedCount - completedCount);
      if (remainingTickets <= 0) {
        throw new HttpsError(
          "failed-precondition",
          agendaScope === "internal"
            ? "내부 티켓이 모두 소진되어 신청할 수 없습니다."
            : "외부 티켓이 모두 소진되어 신청할 수 없습니다."
        );
      }

      const hasApplicantConflict = companyApplicationsSnap.docs.some((doc) => {
        const data = doc.data() || {};
        const normalizedStatus = normalizeApplicationStatus(data.status);
        if (!RESERVED_APPLICATION_STATUSES.has(normalizedStatus)) {
          return false;
        }
        if (normalizeString(data.scheduledDate) !== scheduledDate) {
          return false;
        }
        return normalizeTimeKey(data.scheduledTime) === scheduledTime;
      });
      if (hasApplicantConflict) {
        throw new HttpsError(
          "failed-precondition",
          "이미 같은 시간에 신청한 일정이 있어 중복 신청할 수 없습니다."
        );
      }

      const linkedConsultantsQuery = db
        .collection("consultants")
        .where("status", "==", "active")
        .where("agendaIds", "array-contains", agendaId);
      const linkedConsultantsSnap = await transaction.get(linkedConsultantsQuery);
      if (linkedConsultantsSnap.empty) {
        throw new HttpsError("failed-precondition", "선택한 아젠다에 연결된 활성 컨설턴트가 없습니다.");
      }

      const sameTimeApplicationsQuery = db
        .collection("officeHourApplications")
        .where("scheduledDate", "==", scheduledDate)
        .where("scheduledTime", "==", scheduledTime);
      const sameTimeApplicationsSnap = await transaction.get(sameTimeApplicationsQuery);
      const sameTimeSlotIds = Array.from(
        new Set(
          sameTimeApplicationsSnap.docs
            .map((doc) => normalizeString(doc.data()?.officeHourSlotId))
            .filter(Boolean)
        )
      );
      const sameTimeSlotSnapEntries = await Promise.all(
        sameTimeSlotIds.map(async (slotId) => {
          const slotSnap = await transaction.get(db.collection("officeHourSlots").doc(slotId));
          return [slotId, slotSnap.exists ? slotSnap.data() || {} : null];
        })
      );
      const sameTimeSlotById = new Map(sameTimeSlotSnapEntries);

      const assignableConsultants = linkedConsultantsSnap.docs.filter((doc) => {
        const consultant = { id: doc.id, ...doc.data() };
        if (!isConsultantAvailableAt(consultant, scheduledDate, scheduledTime)) {
          return false;
        }

        const consultantNameKey = normalizeConsultantDisplayName(consultant.name);
        return !sameTimeApplicationsSnap.docs.some((applicationDoc) => {
          const application = applicationDoc.data() || {};
          if (!ACTIVE_APPLICATION_STATUSES.has(normalizeApplicationStatus(application.status))) {
            return false;
          }
          const reservedSlotId = normalizeString(application.officeHourSlotId);
          const reservedSlotDoc = reservedSlotId ? sameTimeSlotById.get(reservedSlotId) : null;
          const reservedSlotConsultantId = normalizeString(reservedSlotDoc?.consultantId);
          if (normalizeString(application.consultantId) === consultant.id) {
            return true;
          }
          if (reservedSlotConsultantId === consultant.id) {
            return true;
          }
          return consultantNameKey !== "" &&
            normalizeConsultantDisplayName(application.consultant) === consultantNameKey;
        });
      });

      if (assignableConsultants.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "선택한 시간에 현재 배정 가능한 컨설턴트가 없어 신청할 수 없습니다."
        );
      }

      const explicitSlotSnap = officeHourSlotId
        ? await transaction.get(db.collection("officeHourSlots").doc(officeHourSlotId))
        : null;
      const explicitSlotDoc = explicitSlotSnap?.exists ? explicitSlotSnap.data() || {} : null;
      if (explicitSlotDoc) {
        if (normalizeString(explicitSlotDoc.type || "regular") !== "regular") {
          throw new HttpsError("failed-precondition", "정기 오피스아워 슬롯만 신청할 수 있습니다.");
        }
        if (
          normalizeString(explicitSlotDoc.date) !== scheduledDate ||
          normalizeTimeKey(explicitSlotDoc.startTime) !== scheduledTime
        ) {
          throw new HttpsError("failed-precondition", "선택한 슬롯 정보가 일치하지 않습니다.");
        }
        if (
          normalizeString(explicitSlotDoc.programId || effectiveProgramId) !== effectiveProgramId
        ) {
          throw new HttpsError("failed-precondition", "선택한 사업 슬롯 정보가 일치하지 않습니다.");
        }
      }

      const assignableConsultantEntries = assignableConsultants
        .map((doc) => normalizeConsultantDoc(doc))
        .sort((a, b) => a.id.localeCompare(b.id));
      const explicitConsultantId = normalizeString(explicitSlotDoc?.consultantId);
      if (explicitConsultantId) {
        assignableConsultantEntries.sort((a, b) => {
          const aPreferred = a.id === explicitConsultantId ? -1 : 0;
          const bPreferred = b.id === explicitConsultantId ? -1 : 0;
          if (aPreferred !== bPreferred) {
            return aPreferred - bPreferred;
          }
          return a.id.localeCompare(b.id);
        });
      }

      const targetDate = parseDateKey(scheduledDate);
      let selectedConsultant = null;
      let slotRef = null;
      let slotSnap = null;
      let slotDoc = null;

      for (const consultant of assignableConsultantEntries) {
        const candidateSlotRef = db
          .collection("officeHourSlots")
          .doc(buildRegularSlotId(effectiveProgramId, consultant.id, scheduledDate, scheduledTime));
        const candidateSlotSnap = await transaction.get(candidateSlotRef);
        const candidateSlotDoc = candidateSlotSnap.exists ? candidateSlotSnap.data() || {} : null;

        if (candidateSlotDoc) {
          const candidateSlotStatus = normalizeString(candidateSlotDoc.status || "open");
          if (normalizeString(candidateSlotDoc.type || "regular") !== "regular") {
            continue;
          }
          if (
            normalizeString(candidateSlotDoc.date) !== scheduledDate ||
            normalizeTimeKey(candidateSlotDoc.startTime) !== scheduledTime
          ) {
            continue;
          }
          if (
            normalizeString(candidateSlotDoc.programId || effectiveProgramId) !== effectiveProgramId
          ) {
            continue;
          }
          if (!isSlotReservedForConsultant(candidateSlotDoc, consultant)) {
            continue;
          }
          if (candidateSlotStatus !== "open") {
            continue;
          }
        }

        selectedConsultant = consultant;
        slotRef = candidateSlotRef;
        slotSnap = candidateSlotSnap.exists ? candidateSlotSnap : null;
        slotDoc = candidateSlotDoc;
        break;
      }

      if (!selectedConsultant || !slotRef) {
        throw new HttpsError(
          "failed-precondition",
          "선택한 시간에 현재 배정 가능한 컨설턴트가 없어 신청할 수 없습니다."
        );
      }

      const endTime =
        (() => {
          if (!targetDate) {
            return normalizeTimeKey(slotDoc?.endTime) || getDefaultEndTime(scheduledTime);
          }
          const dayAvailability = Array.isArray(selectedConsultant.availability)
            ? selectedConsultant.availability.find((item) => item?.dayOfWeek === targetDate.getDay())
            : null;
          const matchedSlot = Array.isArray(dayAvailability?.slots)
            ? dayAvailability.slots.find(
                (slot) => normalizeTimeKey(slot?.start) === scheduledTime && slot?.available === true
              )
            : null;
          return normalizeTimeKey(matchedSlot?.end) ||
            normalizeTimeKey(slotDoc?.endTime) ||
            getDefaultEndTime(scheduledTime);
        })();

      const applicationRef = db.collection("officeHourApplications").doc();
      const createdAt = FieldValue.serverTimestamp();
      const companyName =
        normalizeString(companyDoc.name) ||
        normalizeString(profile.companyName) ||
        "회사명 미입력";

      transaction.set(applicationRef, {
        type: "regular",
        status: "pending",
        officeHourId,
        officeHourSlotId: slotRef.id,
        companyId,
        programId: effectiveProgramId || null,
        officeHourTitle:
          officeHourTitle ||
          normalizeString(slotDoc?.title) ||
          `${normalizeString(targetProgramDoc.name) || "사업"} 정기 오피스아워`,
        agendaId,
        companyName,
        consultant: "담당자 배정 중",
        sessionFormat,
        agenda: normalizeString(agendaDoc.name) || "미지정",
        requestContent,
        attachments: attachmentNames,
        ...(attachmentUrls.length > 0 ? { attachmentUrls } : {}),
        applicantName: companyName,
        applicantEmail: authEmail || normalizeString(profile.email) || "",
        createdByUid: uid,
        scheduledDate,
        scheduledTime,
        createdAt,
        updatedAt: createdAt,
      });

      transaction.set(
        slotRef,
        {
          type: "regular",
          programId: effectiveProgramId,
          consultantId: selectedConsultant.id,
          consultantName: normalizeString(selectedConsultant.name) || "컨설턴트",
          agendaIds: Array.isArray(selectedConsultant.agendaIds)
            ? selectedConsultant.agendaIds.map((item) => normalizeString(item)).filter(Boolean)
            : [],
          title:
            officeHourTitle ||
            normalizeString(slotDoc?.title) ||
            `${normalizeString(targetProgramDoc.name) || "사업"} 정기 오피스아워`,
          description:
            normalizeString(slotDoc?.description) ||
            normalizeString(targetProgramDoc.description) ||
            `${normalizeString(targetProgramDoc.name) || "사업"} 사업`,
          date: scheduledDate,
          startTime: scheduledTime,
          endTime,
          status: "booked",
          updatedAt: createdAt,
        },
        { merge: true }
      );

      return {
        applicationId: applicationRef.id,
        slotId: slotRef.id,
      };
    });

    return result;
  }
);

exports.cancelApplication = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const applicationId = normalizeString(request.data?.applicationId);

    if (!applicationId) {
      throw new HttpsError("invalid-argument", "신청 식별자가 필요합니다.");
    }

    return db.runTransaction(async (transaction) => {
        const profileRef = db.collection("profiles").doc(uid);
        const applicationRef = db.collection("officeHourApplications").doc(applicationId);

        const [profileSnap, applicationSnap] = await Promise.all([
          transaction.get(profileRef),
          transaction.get(applicationRef),
        ]);

      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
      }
      if (!applicationSnap.exists) {
        throw new HttpsError("not-found", "신청 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      const actorRole = normalizeString(profile.role);
      const application = applicationSnap.data() || {};
      const currentStatus = normalizeApplicationStatus(application.status);

      if (currentStatus !== "pending") {
        throw new HttpsError("failed-precondition", "삭제할 수 있는 상태가 아닙니다.");
      }

      const applicationOwnerUid = normalizeString(application.createdByUid);
      const profileCompanyId = normalizeString(profile.companyId);
      const applicationCompanyId = normalizeString(application.companyId);
      const canDelete =
        actorRole === "company" &&
        ((applicationOwnerUid && applicationOwnerUid === uid) ||
          (profileCompanyId && applicationCompanyId && profileCompanyId === applicationCompanyId));

      if (!canDelete) {
        throw new HttpsError("permission-denied", "신청을 삭제할 권한이 없습니다.");
      }

      const relatedSlotSnaps = await getRelatedSlotSnapshotsForApplication(transaction, application);
      const relatedSlotIds = collectSlotIds(relatedSlotSnaps);
      const assignedSlotSnap =
        relatedSlotSnaps.find((slotSnap) => slotSnap.id === normalizeString(application.officeHourSlotId)) ||
        relatedSlotSnaps[0] ||
        null;
      const assignedSlotDoc = assignedSlotSnap?.data?.() || null;

      if (hasSessionEnded(application, assignedSlotDoc)) {
        const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
          transaction,
          application,
          applicationId,
          relatedSlotIds
        );

        transaction.update(applicationRef, {
          status: "rejected",
          rejectionReason: normalizeString(application.rejectionReason) || AUTO_REJECT_REASON,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (!hasBlockingApplication) {
          updateSlotSnapshots(transaction, relatedSlotSnaps, "open");
        }

        return {
          applicationId,
          outcome: "rejected",
          status: "rejected",
          slotIdsUpdated: Array.from(relatedSlotIds),
        };
      }

      const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
        transaction,
        application,
        applicationId,
        relatedSlotIds
      );

      transaction.delete(applicationRef);
      if (!hasBlockingApplication) {
        updateSlotSnapshots(transaction, relatedSlotSnaps, "open");
      }

      return {
        applicationId,
        outcome: "deleted",
        slotIdsUpdated: Array.from(relatedSlotIds),
      };
    });
  }
);

exports.approvePendingUser = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const adminUid = request.auth.uid;
    const targetUserId = normalizeString(request.data?.userId);

    if (!targetUserId) {
      throw new HttpsError("invalid-argument", "승인할 사용자 식별자가 필요합니다.");
    }

    return db.runTransaction(async (transaction) => {
      const adminProfileRef = db.collection("profiles").doc(adminUid);
      const profileRef = db.collection("profiles").doc(targetUserId);
      const signupRequestRef = db.collection("signupRequests").doc(targetUserId);

      const [adminProfileSnap, profileSnap, signupRequestSnap] = await Promise.all([
        transaction.get(adminProfileRef),
        transaction.get(profileRef),
        transaction.get(signupRequestRef),
      ]);

      if (!adminProfileSnap.exists) {
        throw new HttpsError("failed-precondition", "관리자 프로필을 찾을 수 없습니다.");
      }

      const adminProfile = adminProfileSnap.data() || {};
      if (normalizeString(adminProfile.role) !== "admin" || adminProfile.active !== true) {
        throw new HttpsError("permission-denied", "계정 승인 권한이 없습니다.");
      }

      if (!profileSnap.exists && !signupRequestSnap.exists) {
        throw new HttpsError("not-found", "승인 대상 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.exists ? profileSnap.data() || {} : {};
      const signupRequest = signupRequestSnap.exists ? signupRequestSnap.data() || {} : {};
      const approvedRole = normalizeApprovalRole(
        signupRequest.requestedRole || profile.requestedRole || signupRequest.role || profile.role,
        "company"
      );
      const fallbackEmail =
        normalizeString(signupRequest.email) || normalizeString(profile.email) || null;

      let approvedCompanyId = null;

      if (approvedRole === "consultant") {
        const consultantRef = db.collection("consultants").doc(targetUserId);
        const consultantSnap = await transaction.get(consultantRef);
        const existingConsultant = consultantSnap.exists ? consultantSnap.data() || {} : {};
        const source =
          (signupRequest.consultantInfo && typeof signupRequest.consultantInfo === "object"
            ? signupRequest.consultantInfo
            : null) ||
          (profile.pendingConsultantInfo && typeof profile.pendingConsultantInfo === "object"
            ? profile.pendingConsultantInfo
            : null) ||
          {};

        const phone = normalizeString(source.phone);
        const organization = normalizeString(source.organization);
        const secondaryEmail = normalizeString(source.secondaryEmail);
        const secondaryPhone = normalizeString(source.secondaryPhone);
        const fixedMeetingLink = normalizeString(source.fixedMeetingLink);
        const consultantName =
          normalizeString(source.name) ||
          (fallbackEmail ? fallbackEmail.split("@")[0] : "") ||
          "컨설턴트";
        const consultantEmail =
          fallbackEmail ||
          normalizeString(source.email) ||
          `${targetUserId}@pending.local`;
        const consultantExpertise = normalizeString(source.expertise)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

        transaction.set(
          consultantRef,
          {
            name: consultantName,
            title: "컨설턴트",
            email: consultantEmail,
            expertise: consultantExpertise,
            bio: normalizeString(source.bio) || `${consultantName} 컨설턴트`,
            status: "active",
            joinedDate: existingConsultant.joinedDate || FieldValue.serverTimestamp(),
            availability: Array.isArray(existingConsultant.availability)
              ? existingConsultant.availability
              : buildDefaultConsultantAvailability(),
            ...(phone ? { phone } : {}),
            ...(organization ? { organization } : {}),
            ...(secondaryEmail ? { secondaryEmail } : {}),
            ...(secondaryPhone ? { secondaryPhone } : {}),
            ...(fixedMeetingLink ? { fixedMeetingLink } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      if (approvedRole === "company") {
        approvedCompanyId =
          normalizeString(signupRequest.companyId) ||
          normalizeString(profile.companyId) ||
          targetUserId;

        const pendingCompanyForm = toPendingCompanyForm(
          signupRequest.companyInfo && typeof signupRequest.companyInfo === "object"
            ? signupRequest.companyInfo
            : profile.pendingCompanyInfo
        );
        const pendingInvestmentRows = toPendingInvestmentRows(
          Array.isArray(signupRequest.investmentRows)
            ? signupRequest.investmentRows
            : profile.pendingInvestmentRows
        );
        const companyInfoRecord = buildCompanyInfoRecord(pendingCompanyForm, pendingInvestmentRows);
        const companyName = normalizeString(pendingCompanyForm.companyInfo) || null;
        const approvedProgramIds = Array.isArray(signupRequest.programIds)
          ? signupRequest.programIds.map((value) => normalizeString(value)).filter(Boolean)
          : [];
        const companyRef = db.collection("companies").doc(approvedCompanyId);
        const companyInfoRef = db
          .collection("companies")
          .doc(approvedCompanyId)
          .collection("companyInfo")
          .doc("info");

        transaction.set(
          companyRef,
          {
            ownerUid: targetUserId,
            name: companyName,
            programs: approvedProgramIds,
            createdAt: profile.createdAt || signupRequest.createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        transaction.set(
          companyInfoRef,
          {
            ...companyInfoRecord,
            metadata: {
              ...companyInfoRecord.metadata,
              createdAt: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
      }

      transaction.set(
        profileRef,
        {
          role: approvedRole,
          requestedRole: approvedRole,
          active: true,
          email: fallbackEmail,
          companyId: approvedRole === "company" ? approvedCompanyId : null,
          ...(signupRequest.consents ? { consents: signupRequest.consents } : {}),
          activatedAt: FieldValue.serverTimestamp(),
          approvedAt: FieldValue.serverTimestamp(),
          approvedByUid: adminUid,
          createdAt: profile.createdAt || signupRequest.createdAt || FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (signupRequestSnap.exists) {
        transaction.delete(signupRequestRef);
      }

      return {
        userId: targetUserId,
        role: approvedRole,
        companyId: approvedRole === "company" ? approvedCompanyId : null,
      };
    });
  }
);

exports.runApplicationMaintenance = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const profileSnap = await db.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
    }

    const actorRole = normalizeString(profileSnap.data()?.role);
    if (actorRole !== "admin" && actorRole !== "consultant") {
      throw new HttpsError("permission-denied", "상태 동기화 권한이 없습니다.");
    }

    return runApplicationMaintenanceCore();
  }
);

exports.scheduledApplicationMaintenance = onSchedule(
  {
    region: REGION,
    schedule: "10 * * * *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    return runApplicationMaintenanceCore();
  }
);

exports.transitionApplicationStatus = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const uid = request.auth.uid;
    const payload = request.data ?? {};
    const applicationId = normalizeString(payload.applicationId);
    const action = normalizeString(payload.action);
    const rejectionReason = normalizeString(payload.rejectionReason);

    if (!applicationId) {
      throw new HttpsError("invalid-argument", "신청 식별자가 필요합니다.");
    }
    if (!action) {
      throw new HttpsError("invalid-argument", "처리할 작업을 확인할 수 없습니다.");
    }

    try {
      return await db.runTransaction(async (transaction) => {
      const profileRef = db.collection("profiles").doc(uid);
      const applicationRef = db.collection("officeHourApplications").doc(applicationId);

      const [profileSnap, applicationSnap] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(applicationRef),
      ]);

      if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "프로필 정보를 찾을 수 없습니다.");
      }
      if (!applicationSnap.exists) {
        throw new HttpsError("not-found", "신청 정보를 찾을 수 없습니다.");
      }

      const profile = profileSnap.data() || {};
      const actorRole = normalizeString(profile.role);
      const application = applicationSnap.data() || {};
      const currentStatus = normalizeApplicationStatus(application.status);
      const relatedSlotSnaps = await getRelatedSlotSnapshotsForApplication(transaction, application);
      const relatedSlotIds = collectSlotIds(relatedSlotSnaps);
      const assignedSlotSnap =
        relatedSlotSnaps.find((slotSnap) => slotSnap.id === normalizeString(application.officeHourSlotId)) ||
        relatedSlotSnaps[0] ||
        null;
      const assignedSlotDoc = assignedSlotSnap?.data?.() || null;

      if (action === "claim" || action === "confirm") {
        if (hasSessionEnded(application, assignedSlotDoc)) {
          throw new HttpsError("failed-precondition", "진행 시간이 지나 처리할 수 없습니다.");
        }
      }

      if (action === "reopen" && actorRole === "admin") {
        if (!["confirmed", "rejected"].includes(currentStatus)) {
          throw new HttpsError("failed-precondition", "수락 대기로 되돌릴 수 있는 상태가 아닙니다.");
        }

        const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
          transaction,
          application,
          applicationId,
          relatedSlotIds
        );

        transaction.update(applicationRef, {
          status: "pending",
          consultant: "담당자 배정 중",
          consultantId: "",
          rejectionReason: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (!hasBlockingApplication) {
          updateSlotSnapshots(transaction, relatedSlotSnaps, "open");
        }

        return {
          applicationId,
          status: "pending",
          consultant: "담당자 배정 중",
          consultantId: "",
          slotIdsUpdated: Array.from(relatedSlotIds),
        };
      }

      if (action === "claim" || action === "confirm" || action === "reject" || action === "reopen") {
        if (actorRole !== "consultant") {
          throw new HttpsError("permission-denied", "컨설턴트만 처리할 수 있습니다.");
        }

        const consultantRef = db.collection("consultants").doc(uid);
        const consultantSnap = await transaction.get(consultantRef);
        if (!consultantSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "컨설턴트 정보를 uid 기준으로 찾을 수 없습니다."
          );
        }

        const consultant = normalizeConsultantDoc(consultantSnap);
        if (normalizeString(consultant.status || "active") !== "active") {
          throw new HttpsError("failed-precondition", "비활성 컨설턴트는 처리할 수 없습니다.");
        }
        const isUnassigned =
          !normalizeString(application.consultantId) &&
          (!normalizeString(application.consultant) ||
            normalizeString(application.consultant) === "담당자 배정 중");
        const isAssignedToCurrent = isApplicationAssignedToConsultant(application, consultant);

        if (action === "claim") {
          if (currentStatus !== "pending" || !isUnassigned) {
            throw new HttpsError("failed-precondition", "담당 수락할 수 있는 상태가 아닙니다.");
          }
          if (!(await consultantCanHandleApplication(transaction, consultant, application))) {
            throw new HttpsError("failed-precondition", "배정된 아젠다와 일치하지 않습니다.");
          }
          if (await hasConsultantScheduleConflict(transaction, consultant, application, applicationId)) {
            throw new HttpsError("failed-precondition", "이미 동일한 시간에 확정된 일정이 있습니다.");
          }
          if (
            normalizeString(application.scheduledDate) &&
            normalizeTimeKey(application.scheduledTime) &&
            !isConsultantAvailableAt(
              consultant,
              normalizeString(application.scheduledDate),
              normalizeTimeKey(application.scheduledTime)
            )
          ) {
            throw new HttpsError("failed-precondition", "컨설턴트 설정상 가능한 시간이 아닙니다.");
          }

          const autoRejectedIds = await rejectUnassignableSameTimePendingApplications(
            transaction,
            application,
            applicationId,
            consultant
          );

          const reservedSlot = await reserveApplicationSlotForConsultant(
            transaction,
            application,
            applicationId,
            consultant,
            assignedSlotDoc
          );

          transaction.update(applicationRef, {
            status: "confirmed",
            consultant: normalizeString(consultant.name) || "컨설턴트",
            consultantId: consultant.id,
            officeHourSlotId: reservedSlot.slotRef.id,
            updatedAt: FieldValue.serverTimestamp(),
            rejectionReason: FieldValue.delete(),
          });

          return {
            applicationId,
            status: "confirmed",
            consultant: normalizeString(consultant.name) || "컨설턴트",
            consultantId: consultant.id,
            slotIdsUpdated: Array.from(reservedSlot.slotIdsUpdated),
            autoRejectedIds,
          };
        }

        if (action === "confirm") {
          if (currentStatus !== "pending" || !isAssignedToCurrent) {
            throw new HttpsError("failed-precondition", "확정할 수 있는 상태가 아닙니다.");
          }
          if (await hasConsultantScheduleConflict(transaction, consultant, application, applicationId)) {
            throw new HttpsError("failed-precondition", "이미 동일한 시간에 확정된 일정이 있습니다.");
          }
          if (
            normalizeString(application.scheduledDate) &&
            normalizeTimeKey(application.scheduledTime) &&
            !isConsultantAvailableAt(
              consultant,
              normalizeString(application.scheduledDate),
              normalizeTimeKey(application.scheduledTime)
            )
          ) {
            throw new HttpsError("failed-precondition", "컨설턴트 설정상 가능한 시간이 아닙니다.");
          }

          const autoRejectedIds = await rejectUnassignableSameTimePendingApplications(
            transaction,
            application,
            applicationId,
            consultant
          );

          transaction.update(applicationRef, {
            status: "confirmed",
            consultant: normalizeString(consultant.name) || "컨설턴트",
            consultantId: consultant.id,
            updatedAt: FieldValue.serverTimestamp(),
            rejectionReason: FieldValue.delete(),
          });
          updateSlotSnapshots(transaction, relatedSlotSnaps, "booked");

          return {
            applicationId,
            status: "confirmed",
            consultant: normalizeString(consultant.name) || "컨설턴트",
            consultantId: consultant.id,
            slotIdsUpdated: Array.from(relatedSlotIds),
            autoRejectedIds,
          };
        }

        if (action === "reopen") {
          if (!["confirmed", "rejected"].includes(currentStatus) || !isAssignedToCurrent) {
            throw new HttpsError("failed-precondition", "수락 대기로 되돌릴 수 있는 상태가 아닙니다.");
          }

          const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
            transaction,
            application,
            applicationId,
            relatedSlotIds
          );

          transaction.update(applicationRef, {
            status: "pending",
            consultant: "담당자 배정 중",
            consultantId: "",
            rejectionReason: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (!hasBlockingApplication) {
            updateSlotSnapshots(transaction, relatedSlotSnaps, "open");
          }

          return {
            applicationId,
            status: "pending",
            consultant: "담당자 배정 중",
            consultantId: "",
            slotIdsUpdated: Array.from(relatedSlotIds),
          };
        }

        if (!rejectionReason) {
          throw new HttpsError("invalid-argument", "거절 사유를 입력해주세요.");
        }
        if (currentStatus !== "pending" || !(isUnassigned || isAssignedToCurrent)) {
          throw new HttpsError("failed-precondition", "거절할 수 있는 상태가 아닙니다.");
        }

        const hasBlockingApplication = await hasBlockingApplicationForSlotGroup(
          transaction,
          application,
          applicationId,
          relatedSlotIds
        );

        transaction.update(applicationRef, {
          status: "rejected",
          consultant: normalizeString(consultant.name) || "컨설턴트",
          consultantId: consultant.id,
          rejectionReason,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (!hasBlockingApplication) {
          updateSlotSnapshots(transaction, relatedSlotSnaps, "open");
        }

        return {
          applicationId,
          status: "rejected",
          consultant: normalizeString(consultant.name) || "컨설턴트",
          consultantId: consultant.id,
          rejectionReason,
          slotIdsUpdated: Array.from(relatedSlotIds),
        };
      }

        throw new HttpsError("invalid-argument", "지원하지 않는 상태 변경 작업입니다.");
      });
    } catch (error) {
      console.error("transitionApplicationStatus failed", {
        uid,
        applicationId,
        action,
        rejectionReason,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw error;
    }
  }
);
