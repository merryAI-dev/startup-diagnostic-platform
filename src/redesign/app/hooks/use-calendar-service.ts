/**
 * useCalendarService – Firestore 기반 캘린더 서비스
 * ──────────────────────────────────────────────────
 * Google Calendar 대신 Firestore에 캘린더 이벤트를 저장/관리합니다.
 * 500명 동시 사용 환경에서 실시간 동기화됩니다.
 *
 * 기능:
 *  • 이벤트 CRUD
 *  • 시간대 충돌 감지
 *  • 반복 일정 지원
 *  • 오프라인 → 온라인 자동 동기화
 */

import { useState, useCallback, useMemo } from "react";
import { isFirebaseConfigured, COLLECTIONS } from "@/redesign/app/lib/firebase";
import { firestoreService } from "@/redesign/app/lib/firestore-service";
import { useCalendarEvents } from "@/redesign/app/hooks/use-firestore";

export interface CalendarEventData {
  title: string;
  type: "office_hour" | "meeting" | "deadline" | "milestone" | "other";
  start: Date;
  end: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  participants?: string[];
  applicationId?: string;
  color?: string;
  recurrence?: "none" | "daily" | "weekly" | "monthly";
  reminders?: { method: "email" | "push"; minutesBefore: number }[];
}

export interface AvailableSlot {
  start: string; // "HH:mm"
  end: string;
  available: boolean;
  reason?: string;
}

export function useCalendarService(userId: string | null) {
  const [isLoading, setIsLoading] = useState(false);

  // 현재 달 ±2달 범위의 이벤트 실시간 구독
  const dateRange = useMemo(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 3, 0),
    };
  }, []);

  const {
    events,
    loading: eventsLoading,
    createEvent: firestoreCreateEvent,
    updateEvent: firestoreUpdateEvent,
    deleteEvent: firestoreDeleteEvent,
  } = useCalendarEvents(userId, dateRange);

  // ─── 이벤트 생성 ───
  const createEvent = useCallback(
    async (eventData: CalendarEventData) => {
      setIsLoading(true);
      try {
        const id = await firestoreCreateEvent(eventData);
        return id;
      } finally {
        setIsLoading(false);
      }
    },
    [firestoreCreateEvent]
  );

  // ─── 이벤트 수정 ───
  const updateEvent = useCallback(
    async (eventId: string, updates: Partial<CalendarEventData>) => {
      setIsLoading(true);
      try {
        const data: Record<string, any> = { ...updates };
        // Date → Timestamp 변환은 firestoreService에서 처리
        return await firestoreUpdateEvent(eventId, data);
      } finally {
        setIsLoading(false);
      }
    },
    [firestoreUpdateEvent]
  );

  // ─── 이벤트 삭제 ───
  const deleteEvent = useCallback(
    async (eventId: string) => {
      setIsLoading(true);
      try {
        return await firestoreDeleteEvent(eventId);
      } finally {
        setIsLoading(false);
      }
    },
    [firestoreDeleteEvent]
  );

  // ─── 특정 날짜의 가용 시간대 계산 ───
  const getAvailableSlots = useCallback(
    (date: string): AvailableSlot[] => {
      const dateObj = new Date(date);
      const dayStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      // 해당 날짜의 이벤트 필터링
      const dayEvents = events.filter((evt: any) => {
        const evtStart = evt.start instanceof Date ? evt.start : new Date(evt.start);
        return evtStart >= dayStart && evtStart < dayEnd;
      });

      // 9시~18시까지 1시간 단위 슬롯 생성
      const slots: AvailableSlot[] = [];
      for (let hour = 9; hour < 18; hour++) {
        const slotStart = new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

        const conflict = dayEvents.find((evt: any) => {
          const evtStart = evt.start instanceof Date ? evt.start : new Date(evt.start);
          const evtEnd = evt.end instanceof Date ? evt.end : new Date(evt.end);
          return (
            (slotStart >= evtStart && slotStart < evtEnd) ||
            (slotEnd > evtStart && slotEnd <= evtEnd) ||
            (slotStart <= evtStart && slotEnd >= evtEnd)
          );
        });

        slots.push({
          start: `${String(hour).padStart(2, "0")}:00`,
          end: `${String(hour + 1).padStart(2, "0")}:00`,
          available: !conflict,
          reason: conflict ? `${conflict.title} 일정과 충돌` : undefined,
        });
      }

      return slots;
    },
    [events]
  );

  // ─── 오피스아워 확정 시 캘린더 자동 등록 ───
  const registerOfficeHourEvent = useCallback(
    async (data: {
      applicationId: string;
      title: string;
      date: string;
      startTime: string;
      duration: number; // hours
      consultant: string;
      location?: string;
    }) => {
      const startDateTime = new Date(`${data.date}T${data.startTime}:00`);
      const endDateTime = new Date(
        startDateTime.getTime() + data.duration * 60 * 60 * 1000
      );

      return createEvent({
        title: `[오피스아워] ${data.title}`,
        type: "office_hour",
        start: startDateTime,
        end: endDateTime,
        description: `컨설턴트: ${data.consultant}`,
        location: data.location || "온라인",
        applicationId: data.applicationId,
        color: "#5DADE2",
        participants: [data.consultant],
      });
    },
    [createEvent]
  );

  // ─── Mock 데이터 (Firebase 미설정 시) ───
  const getMockAvailableSlots = useCallback((date: string): AvailableSlot[] => {
    const unavailableTimes = ["11:00", "14:00", "16:00"];
    const slots: AvailableSlot[] = [];
    for (let hour = 9; hour < 18; hour++) {
      const startTime = `${String(hour).padStart(2, "0")}:00`;
      slots.push({
        start: startTime,
        end: `${String(hour + 1).padStart(2, "0")}:00`,
        available: !unavailableTimes.includes(startTime),
        reason: unavailableTimes.includes(startTime) ? "기존 일정 있음" : undefined,
      });
    }
    return slots;
  }, []);

  return {
    // State
    events,
    isLoading: isLoading || eventsLoading,
    isFirebaseReady: isFirebaseConfigured,

    // CRUD
    createEvent,
    updateEvent,
    deleteEvent,

    // Calendar-specific
    getAvailableSlots: isFirebaseConfigured ? getAvailableSlots : getMockAvailableSlots,
    registerOfficeHourEvent,

    // Mock fallback
    getMockAvailableSlots,
  };
}
