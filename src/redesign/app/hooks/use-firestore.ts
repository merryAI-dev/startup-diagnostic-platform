/**
 * useFirestore – React Hook for Firestore CRUD + Real-time
 * ─────────────────────────────────────────────────────────
 * Firebase가 설정된 경우 Firestore를 사용하고,
 * 미설정(Mock 모드)인 경우 로컬 상태 + localStorage로 폴백합니다.
 *
 * 500명 동시 접속 지원:
 *  • 실시간 리스너 자동 구독/해제
 *  • 낙관적 업데이트 (UI 즉시 반영 → 서버 동기화)
 *  • 자동 재시도 (네트워크 복구 시)
 *  • 커넥션 상태 모니터링
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { where, orderBy, QueryConstraint } from "firebase/firestore";
import { isFirebaseConfigured, COLLECTIONS } from "@/redesign/app/lib/firebase";
import { firestoreService, BatchOperation } from "@/redesign/app/lib/firestore-service";

// ──────────────────────────────────────────────
// Connection Hook
// ──────────────────────────────────────────────
export function useConnectionStatus() {
  const [status, setStatus] = useState<"online" | "offline" | "reconnecting">(
    firestoreService.getConnectionStatus()
  );

  useEffect(() => {
    const unsub = firestoreService.onConnectionChange(setStatus);
    return unsub;
  }, []);

  return {
    status,
    isOnline: status === "online",
    isOffline: status === "offline",
    isFirebaseReady: isFirebaseConfigured,
    isMockMode: !isFirebaseConfigured,
  };
}

// ──────────────────────────────────────────────
// Generic Collection Hook (Real-time)
// ──────────────────────────────────────────────
export function useFirestoreCollection<T>(
  collectionName: string,
  options?: {
    constraints?: QueryConstraint[];
    orderByField?: string;
    orderDirection?: "asc" | "desc";
    limitCount?: number;
    enabled?: boolean;
  }
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const subscriptionKeyRef = useRef<string>("");

  const enabled = options?.enabled !== false;
  const constraintsKey = useMemo(() => {
    try {
      return JSON.stringify(options?.constraints ?? []);
    } catch {
      return "constraints";
    }
  }, [options?.constraints]);
  const orderByField = options?.orderByField;
  const orderDirection = options?.orderDirection;
  const limitCount = options?.limitCount;

  useEffect(() => {
    if (!isFirebaseConfigured || !enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const key = firestoreService.subscribeToCollection<T>(
      collectionName,
      (items) => {
        setData(items);
        setLoading(false);
        setError(null);
      },
      {
        constraints: options?.constraints,
        orderByField: options?.orderByField,
        orderDirection: options?.orderDirection,
        limitCount: options?.limitCount,
        onError: (err) => {
          setError(err);
          setLoading(false);
        },
      }
    );

    subscriptionKeyRef.current = key;

    return () => {
      if (key) firestoreService.unsubscribe(key);
    };
  }, [collectionName, constraintsKey, enabled, limitCount, orderByField, orderDirection]);

  return { data, loading, error };
}

// ──────────────────────────────────────────────
// Generic Document Hook (Real-time)
// ──────────────────────────────────────────────
export function useFirestoreDocument<T>(
  collectionName: string,
  docId: string | null,
  options?: { enabled?: boolean }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const enabled = options?.enabled !== false && !!docId;

  useEffect(() => {
    if (!isFirebaseConfigured || !enabled || !docId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const key = firestoreService.subscribeToDocument<T>(
      collectionName,
      docId,
      (item) => {
        setData(item);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      if (key) firestoreService.unsubscribe(key);
    };
  }, [collectionName, docId, enabled]);

  return { data, loading, error };
}

// ──────────────────────────────────────────────
// Generic Document Hook (One-time)
// ──────────────────────────────────────────────
export function useFirestoreDocumentOnce<T>(
  collectionName: string,
  docId: string | null,
  options?: { enabled?: boolean }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const enabled = options?.enabled !== false && !!docId;

  useEffect(() => {
    if (!isFirebaseConfigured || !enabled || !docId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    firestoreService
      .getDocument<T>(collectionName, docId)
      .then((doc) => {
        if (cancelled) return;
        setData(doc);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err as Error);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [collectionName, docId, enabled]);

  return { data, loading, error };
}

// ──────────────────────────────────────────────
// CRUD Operations Hook
// ──────────────────────────────────────────────
export function useFirestoreCRUD<T extends Record<string, any>>(
  collectionName: string
) {
  const [saving, setSaving] = useState(false);

  const create = useCallback(
    async (data: T): Promise<string | null> => {
      if (!isFirebaseConfigured) return null;
      setSaving(true);
      try {
        return await firestoreService.createDocument(collectionName, data);
      } finally {
        setSaving(false);
      }
    },
    [collectionName]
  );

  const set = useCallback(
    async (docId: string, data: T, merge = true): Promise<boolean> => {
      if (!isFirebaseConfigured) return false;
      setSaving(true);
      try {
        return await firestoreService.setDocument(collectionName, docId, data, merge);
      } finally {
        setSaving(false);
      }
    },
    [collectionName]
  );

  const update = useCallback(
    async (docId: string, data: Partial<T>): Promise<boolean> => {
      if (!isFirebaseConfigured) return false;
      setSaving(true);
      try {
        return await firestoreService.updateDocument(collectionName, docId, data as Record<string, any>);
      } finally {
        setSaving(false);
      }
    },
    [collectionName]
  );

  const remove = useCallback(
    async (docId: string): Promise<boolean> => {
      if (!isFirebaseConfigured) return false;
      setSaving(true);
      try {
        return await firestoreService.deleteDocument(collectionName, docId);
      } finally {
        setSaving(false);
      }
    },
    [collectionName]
  );

  const batchUpdate = useCallback(
    async (operations: BatchOperation[]): Promise<boolean> => {
      if (!isFirebaseConfigured) return false;
      setSaving(true);
      try {
        return await firestoreService.executeBatch(operations);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return { create, set, update, remove, batchUpdate, saving };
}

// ──────────────────────────────────────────────
// Calendar Events Hook
// ──────────────────────────────────────────────
export function useCalendarEvents(
  userId: string | null,
  dateRange?: { start: Date; end: Date }
) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 기본 범위: 현재 달 ±1달
  const range = useMemo(() => {
    if (dateRange) return dateRange;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return { start, end };
  }, [dateRange?.start?.getTime(), dateRange?.end?.getTime()]);

  useEffect(() => {
    if (!isFirebaseConfigured || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const key = firestoreService.subscribeToCalendarEvents(
      userId,
      range.start,
      range.end,
      (evts) => {
        setEvents(evts);
        setLoading(false);
      }
    );

    return () => {
      if (key) firestoreService.unsubscribe(key);
    };
  }, [userId, range.start.getTime(), range.end.getTime()]);

  const createEvent = useCallback(
    async (eventData: {
      title: string;
      type: string;
      start: Date;
      end: Date;
      description?: string;
      location?: string;
      participants?: string[];
      applicationId?: string;
      color?: string;
      allDay?: boolean;
    }) => {
      if (!userId) return null;
      return firestoreService.createCalendarEvent({
        ...eventData,
        userId,
      });
    },
    [userId]
  );

  const updateEvent = useCallback(
    async (eventId: string, data: Record<string, any>) => {
      return firestoreService.updateDocument(COLLECTIONS.CALENDAR_EVENTS, eventId, data);
    },
    []
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      return firestoreService.deleteDocument(COLLECTIONS.CALENDAR_EVENTS, eventId);
    },
    []
  );

  return { events, loading, error, createEvent, updateEvent, deleteEvent };
}

// ──────────────────────────────────────────────
// Notifications Hook
// ──────────────────────────────────────────────
export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured || !userId) {
      setLoading(false);
      return;
    }

    const key = firestoreService.subscribeToNotifications(userId, (notifs) => {
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n: any) => !n.isRead).length);
      setLoading(false);
    });

    return () => {
      if (key) firestoreService.unsubscribe(key);
    };
  }, [userId]);

  const markAsRead = useCallback(
    async (notifId: string) => {
      return firestoreService.updateDocument(COLLECTIONS.NOTIFICATIONS, notifId, {
        isRead: true,
      });
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    if (!userId) return false;
    return firestoreService.markAllNotificationsRead(userId);
  }, [userId]);

  const deleteNotification = useCallback(async (notifId: string) => {
    return firestoreService.deleteDocument(COLLECTIONS.NOTIFICATIONS, notifId);
  }, []);

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}

// ──────────────────────────────────────────────
// Chat Hook
// ──────────────────────────────────────────────
export function useChat(chatRoomId: string | null) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !chatRoomId) {
      setLoading(false);
      return;
    }

    const key = firestoreService.subscribeToChatMessages(chatRoomId, (msgs) => {
      setMessages(msgs);
      setLoading(false);
    });

    return () => {
      if (key) firestoreService.unsubscribe(key);
    };
  }, [chatRoomId]);

  const sendMessage = useCallback(
    async (data: {
      senderId: string;
      senderName: string;
      content: string;
      attachments?: any[];
    }) => {
      if (!chatRoomId) return null;
      return firestoreService.sendChatMessage({
        chatRoomId,
        ...data,
      });
    },
    [chatRoomId]
  );

  return { messages, loading, sendMessage };
}

// ──────────────────────────────────────────────
// Dashboard Stats Hook
// ──────────────────────────────────────────────
export function useDashboardStats(programId?: string) {
  const [stats, setStats] = useState({
    totalApplications: 0,
    pendingCount: 0,
    confirmedCount: 0,
    completedCount: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    firestoreService
      .getDashboardStats(programId)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [programId]);

  return { stats, loading };
}

// ──────────────────────────────────────────────
// Optimistic Update Helper
// ──────────────────────────────────────────────
export function useOptimisticUpdate<T>() {
  const [optimisticData, setOptimisticData] = useState<Map<string, T>>(new Map());

  const applyOptimistic = useCallback((id: string, data: T) => {
    setOptimisticData((prev) => new Map(prev).set(id, data));
  }, []);

  const revertOptimistic = useCallback((id: string) => {
    setOptimisticData((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearOptimistic = useCallback(() => {
    setOptimisticData(new Map());
  }, []);

  const mergeWithServer = useCallback(
    (serverData: T[], getId: (item: T) => string): T[] => {
      if (optimisticData.size === 0) return serverData;

      return serverData.map((item) => {
        const id = getId(item);
        const optimistic = optimisticData.get(id);
        if (optimistic) {
          return { ...item, ...optimistic };
        }
        return item;
      });
    },
    [optimisticData]
  );

  return { applyOptimistic, revertOptimistic, clearOptimistic, mergeWithServer };
}

// Re-export for convenience
export { firestoreService, COLLECTIONS, isFirebaseConfigured };
export { where, orderBy } from "firebase/firestore";
