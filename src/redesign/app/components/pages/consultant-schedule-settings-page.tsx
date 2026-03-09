import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { ConsultantAvailability } from "@/redesign/app/lib/types";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { cn } from "@/redesign/app/components/ui/utils";

interface ConsultantScheduleSettingsPageProps {
  consultantName?: string;
  availability?: ConsultantAvailability[];
  saving?: boolean;
  onSave: (availability: ConsultantAvailability[]) => Promise<void> | void;
}

const SCHEDULE_DAYS = [
  { value: 2, label: "화" },
  { value: 4, label: "목" },
] as const;

const TIME_SLOTS = Array.from({ length: 9 }, (_, index) => {
  const startHour = 9 + index;
  const endHour = startHour + 1;
  return {
    start: `${String(startHour).padStart(2, "0")}:00`,
    end: `${String(endHour).padStart(2, "0")}:00`,
  };
});

function buildDefaultAvailability(): ConsultantAvailability[] {
  return SCHEDULE_DAYS.map((day) => ({
    dayOfWeek: day.value,
    slots: TIME_SLOTS.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: false,
    })),
  }));
}

function normalizeAvailability(
  input: ConsultantAvailability[] | undefined
): ConsultantAvailability[] {
  const base = buildDefaultAvailability();
  if (!input || input.length === 0) return base;
  return base.map((baseDay) => {
    const found = input.find((item) => item.dayOfWeek === baseDay.dayOfWeek);
    if (!found) return baseDay;
    return {
      ...baseDay,
      slots: baseDay.slots.map((baseSlot) => {
        const existing = found.slots.find(
          (slot) => slot.start === baseSlot.start && slot.end === baseSlot.end
        );
        return existing ?? baseSlot;
      }),
    };
  });
}

function countAvailableSlots(availability: ConsultantAvailability[]) {
  return availability.reduce((sum, day) => {
    return sum + day.slots.filter((slot) => slot.available).length;
  }, 0);
}

export function ConsultantScheduleSettingsPage({
  consultantName,
  availability,
  saving = false,
  onSave,
}: ConsultantScheduleSettingsPageProps) {
  const normalized = useMemo(
    () => normalizeAvailability(availability),
    [availability]
  );
  const [draftAvailability, setDraftAvailability] = useState<ConsultantAvailability[]>(
    normalized
  );

  useEffect(() => {
    setDraftAvailability(normalized);
  }, [normalized]);

  const totalAvailableCount = countAvailableSlots(draftAvailability);
  const initialAvailableCount = countAvailableSlots(normalized);
  const isDirty =
    JSON.stringify(draftAvailability) !== JSON.stringify(normalized);

  function toggleSlot(dayOfWeek: number, slotStart: string) {
    setDraftAvailability((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) return day;
        return {
          ...day,
          slots: day.slots.map((slot) =>
            slot.start === slotStart
              ? { ...slot, available: !slot.available }
              : slot
          ),
        };
      })
    );
  }

  function setAllSlots(available: boolean) {
    setDraftAvailability((prev) =>
      prev.map((day) => ({
        ...day,
        slots: day.slots.map((slot) => ({
          ...slot,
          available,
        })),
      }))
    );
  }

  async function handleSave() {
    await onSave(draftAvailability);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="w-4 h-4" />
            내 스케줄 설정
          </CardTitle>
          <CardDescription>
            {consultantName ? `${consultantName} 컨설턴트` : "컨설턴트"}의 정기 오피스아워 가능 시간입니다.
            요일은 화/목, 시간은 09:00~18:00 1시간 단위로 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">선택 슬롯 {totalAvailableCount}개</Badge>
              {isDirty ? (
                <Badge variant="outline">변경됨</Badge>
              ) : (
                <Badge variant="outline">저장됨</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAllSlots(true)}
                disabled={saving}
              >
                전체 선택
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAllSlots(false)}
                disabled={saving}
              >
                전체 해제
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraftAvailability(normalized)}
                disabled={saving || !isDirty}
              >
                되돌리기
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving || !isDirty}
              >
                {saving ? "저장 중..." : "스케줄 저장"}
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            {draftAvailability.map((day) => {
              const dayInfo = SCHEDULE_DAYS.find((item) => item.value === day.dayOfWeek);
              return (
                <div key={day.dayOfWeek} className="border rounded-lg p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {dayInfo?.label || "-"}요일
                    </div>
                    <div className="text-xs text-muted-foreground">
                      선택 {day.slots.filter((slot) => slot.available).length}개
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-9">
                    {day.slots.map((slot) => (
                      <button
                        key={`${day.dayOfWeek}-${slot.start}`}
                        type="button"
                        aria-pressed={slot.available}
                        title={slot.available ? "가능 일정" : "불가 일정"}
                        onClick={() => toggleSlot(day.dayOfWeek, slot.start)}
                        className={cn(
                          "rounded-lg border px-2 py-2 text-xs transition",
                          slot.available
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {slot.start}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-4 text-xs text-slate-700">
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded border border-slate-900 bg-slate-900" />
              가능 일정
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded border border-slate-300 bg-white" />
              불가 일정
            </span>
          </div>

          {!isDirty && totalAvailableCount !== initialAvailableCount ? (
            <p className="mt-3 text-xs text-muted-foreground">
              변경사항이 반영되도록 저장 버튼을 눌러주세요.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export { buildDefaultAvailability, normalizeAvailability };
