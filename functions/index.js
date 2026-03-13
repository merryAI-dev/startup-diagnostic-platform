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

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApplicationStatus(value) {
  const normalized = normalizeString(value);
  if (normalized === "review") return "pending";
  return normalized || "pending";
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

function normalizeConsultantDisplayName(value) {
  return normalizeString(value).replace(/\s*컨설턴트\s*$/u, "").toLowerCase();
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeString(value));
}

function isSessionFormat(value) {
  return value === "online" || value === "offline";
}

function getApplicationDurationHours(application, slotDoc) {
  const raw = Number(application?.duration ?? slotDoc?.duration ?? 2);
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
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

      let slotSnap = null;
      if (officeHourSlotId) {
        const slotRef = db.collection("officeHourSlots").doc(officeHourSlotId);
        slotSnap = await transaction.get(slotRef);
      } else {
        const slotQuery = db
          .collection("officeHourSlots")
          .where("type", "==", "regular")
          .where("date", "==", scheduledDate)
          .where("startTime", "==", scheduledTime)
          .where("status", "==", "open");
        const candidateSlots = await transaction.get(slotQuery);
        slotSnap =
          candidateSlots.docs.find((doc) => {
            const data = doc.data() || {};
            if (programId && normalizeString(data.programId) !== programId) return false;
            return true;
          }) ?? null;
      }

      if (!slotSnap || !slotSnap.exists) {
        throw new HttpsError("failed-precondition", "선택한 시간이 이미 마감되었거나 존재하지 않습니다.");
      }

      const slotDoc = slotSnap.data() || {};
      if (slotDoc.status !== "open") {
        throw new HttpsError("failed-precondition", "선택한 시간이 이미 마감되었습니다.");
      }
      if (normalizeString(slotDoc.type || "regular") !== "regular") {
        throw new HttpsError("failed-precondition", "정기 오피스아워 슬롯만 신청할 수 있습니다.");
      }
      if (normalizeString(slotDoc.date) !== scheduledDate || normalizeTimeKey(slotDoc.startTime) !== scheduledTime) {
        throw new HttpsError("failed-precondition", "선택한 슬롯 정보가 일치하지 않습니다.");
      }
      if (programId && normalizeString(slotDoc.programId) !== programId) {
        throw new HttpsError("failed-precondition", "선택한 사업 슬롯 정보가 일치하지 않습니다.");
      }

      const relatedSlotSnaps = await getRelatedRegularSlotSnapshots(transaction, slotSnap);
      const companyRef = db.collection("companies").doc(companyId);
      const companySnap = await transaction.get(companyRef);
      const companyDoc = companySnap.exists ? companySnap.data() || {} : {};

      const programIdsFromCompany = Array.isArray(companyDoc.programs)
        ? companyDoc.programs.map((item) => normalizeString(item)).filter(Boolean)
        : [];
      const effectiveProgramId = normalizeString(slotDoc.programId || programId);
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
        let scope = null;
        if (data.type === "irregular" && typeof data.isInternal === "boolean") {
          scope = data.isInternal ? "internal" : "external";
        } else if (normalizeString(data.agendaId) === agendaId) {
          scope = agendaScope;
        } else {
          scope = null;
        }
        if (scope !== agendaScope) return;
        if (data.status === "completed") {
          completedCount += 1;
        } else if (RESERVED_APPLICATION_STATUSES.has(normalizeString(data.status || "pending"))) {
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

      const assignableConsultants = linkedConsultantsSnap.docs.filter((doc) => {
        const consultant = { id: doc.id, ...doc.data() };
        if (!isConsultantAvailableAt(consultant, scheduledDate, scheduledTime)) {
          return false;
        }

        const consultantNameKey = normalizeConsultantDisplayName(consultant.name);
        return !sameTimeApplicationsSnap.docs.some((applicationDoc) => {
          const application = applicationDoc.data() || {};
          if (!ACTIVE_APPLICATION_STATUSES.has(normalizeString(application.status || "pending"))) {
            return false;
          }
          if (normalizeString(application.consultantId) === consultant.id) {
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
        officeHourSlotId: slotSnap.id,
        companyId,
        programId: effectiveProgramId || null,
        officeHourTitle: officeHourTitle || normalizeString(slotDoc.title) || "오피스아워 신청",
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

      updateSlotSnapshots(transaction, relatedSlotSnaps, "booked");

      return {
        applicationId: applicationRef.id,
        slotId: slotSnap.id,
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
    schedule: "every 30 minutes",
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

      if (action === "claim" || action === "confirm" || action === "reject") {
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
  }
);
