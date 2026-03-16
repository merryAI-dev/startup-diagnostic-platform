import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Agenda, Consultant, ConsultantAvailability } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { Input } from "@/redesign/app/components/ui/input";
import { Label } from "@/redesign/app/components/ui/label";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { cn } from "@/redesign/app/components/ui/utils";

export type ConsultantProfileFormValues = {
  name: string;
  organization: string;
  email: string;
  phone: string;
  secondaryEmail: string;
  secondaryPhone: string;
  fixedMeetingLink: string;
  expertise: string;
  bio: string;
};

interface ConsultantProfilePageProps {
  consultant: Consultant | null;
  agendas?: Agenda[];
  defaultEmail?: string | null;
  saving?: boolean;
  embedded?: boolean;
  hideFooterActions?: boolean;
  submitLabel?: string;
  submitClassName?: string;
  hideReset?: boolean;
  hideDescription?: boolean;
  onBack?: () => void;
  backLabel?: string;
  scheduleSaving?: boolean;
  onSaveSchedule?: (availability: ConsultantAvailability[]) => Promise<void> | void;
  onSubmit: (values: ConsultantProfileFormValues) => Promise<void> | void;
}

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/[^\d]/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (digits.length < 4) return digits;
  if (digits.length < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length < 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function buildInitialValues(
  consultant: Consultant | null,
  defaultEmail?: string | null
): ConsultantProfileFormValues {
  return {
    name: consultant?.name ?? "",
    organization: consultant?.organization ?? "",
    email: consultant?.email ?? defaultEmail ?? "",
    phone: formatPhoneNumber(consultant?.phone ?? ""),
    secondaryEmail: consultant?.secondaryEmail ?? "",
    secondaryPhone: formatPhoneNumber(consultant?.secondaryPhone ?? ""),
    fixedMeetingLink: consultant?.fixedMeetingLink ?? "",
    expertise: consultant?.expertise?.join(", ") ?? "",
    bio: consultant?.bio ?? "",
  };
}

export function ConsultantProfilePage({
  consultant,
  agendas = [],
  defaultEmail,
  saving = false,
  scheduleSaving = false,
  embedded = false,
  hideFooterActions = false,
  submitLabel,
  submitClassName,
  hideReset = false,
  hideDescription = false,
  onBack,
  backLabel,
  onSaveSchedule,
  onSubmit,
}: ConsultantProfilePageProps) {
  const pageTitleClassName = "text-2xl font-semibold text-slate-900";
  const pageDescriptionClassName = "mt-1 text-sm text-slate-500";
  const consultantPageContainerClassName = "mx-auto w-full max-w-[1440px]";
  const [formValues, setFormValues] = useState<ConsultantProfileFormValues>(() =>
    buildInitialValues(consultant, defaultEmail)
  );

  const initialValues = useMemo(
    () => buildInitialValues(consultant, defaultEmail),
    [consultant, defaultEmail]
  );

  const scheduleDays = useMemo(
    () => [
      { value: 2, label: "화" },
      { value: 4, label: "목" },
    ],
    []
  );

  const timeSlots = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => {
        const startHour = 9 + index;
        const endHour = startHour + 1;
        return {
          start: `${String(startHour).padStart(2, "0")}:00`,
          end: `${String(endHour).padStart(2, "0")}:00`,
        };
      }),
    []
  );

  const buildDefaultAvailability = useCallback(
    () =>
      scheduleDays.map((day) => ({
        dayOfWeek: day.value,
        slots: timeSlots.map((slot) => ({
          start: slot.start,
          end: slot.end,
          available: false,
        })),
      })),
    [scheduleDays, timeSlots]
  );

  const normalizedAvailability = useMemo(
    () => {
      const base = buildDefaultAvailability();
      const input = consultant?.availability;
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
    },
    [consultant?.availability, buildDefaultAvailability]
  );
  const [draftAvailability, setDraftAvailability] = useState<ConsultantAvailability[]>(
    normalizedAvailability
  );

  useEffect(() => {
    setDraftAvailability(normalizedAvailability);
  }, [normalizedAvailability]);

  const isScheduleDirty =
    JSON.stringify(draftAvailability) !== JSON.stringify(normalizedAvailability);

  const toggleSlot = (dayOfWeek: number, slotStart: string) => {
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
  };

  const setAllSlots = (available: boolean) => {
    setDraftAvailability((prev) =>
      prev.map((day) => ({
        ...day,
        slots: day.slots.map((slot) => ({
          ...slot,
          available,
        })),
      }))
    );
  };

  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  const isInvalid =
    !formValues.name.trim() ||
    !formValues.organization.trim() ||
    !formValues.email.trim() ||
    !formValues.phone.trim() ||
    !formValues.fixedMeetingLink.trim() ||
    !formValues.expertise.trim() ||
    !formValues.bio.trim();

  function updateField<K extends keyof ConsultantProfileFormValues>(
    key: K,
    value: ConsultantProfileFormValues[K]
  ) {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isInvalid) return;
    await onSubmit(formValues);
  }

  const requiredMark = (
    <span className="text-rose-600 text-xs self-start -mt-1" aria-hidden="true">
      *
    </span>
  );

  const sectionCardClassName = cn(
    "w-full overflow-hidden border-slate-200 bg-white shadow-sm shadow-slate-200/60",
    embedded && "border-0 shadow-none"
  );
  const cardHeaderClassName = embedded
    ? "px-0 pt-0"
    : "gap-1 border-b border-slate-200 bg-slate-50 px-6 py-5";
  const cardContentClassName = embedded ? "px-0 pb-0 pt-6" : "p-6";
  const hasSchedulePanel = Boolean(onSaveSchedule);
  const content = (
    <div
      className={cn(
        "grid gap-6",
        hasSchedulePanel
          ? "mx-auto w-full xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]"
          : "mx-auto w-full max-w-4xl"
      )}
    >
      <Card className={sectionCardClassName}>
        <CardHeader className={cardHeaderClassName}>
          <CardTitle className="text-xl font-semibold text-slate-900">
            {embedded ? "내 정보 입력" : "기본 정보"}
          </CardTitle>
          {embedded || hideDescription ? null : (
            <CardDescription className="text-sm text-slate-500">
              컨설턴트 프로필과 기본 연락처를 입력합니다.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={cardContentClassName}>
          <form
            id="consultant-profile-form"
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <div>
              <Label className="mb-2 block" htmlFor="consultant-name">
                컨설턴트명
                {requiredMark}
              </Label>
              <Input
                id="consultant-name"
                value={formValues.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="홍길동"
                required
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-organization">
                소속
                {requiredMark}
              </Label>
              <Input
                id="consultant-organization"
                value={formValues.organization}
                onChange={(event) => updateField("organization", event.target.value)}
                placeholder="MYSC"
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-email">
                이메일
                {requiredMark}
              </Label>
              <Input
                id="consultant-email"
                type="email"
                value={formValues.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-phone">
                전화번호
                {requiredMark}
              </Label>
              <Input
                id="consultant-phone"
                value={formValues.phone}
                inputMode="numeric"
                onChange={(event) =>
                  updateField("phone", formatPhoneNumber(event.target.value))
                }
                placeholder="010-0000-0000"
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-secondary-email">
                보조 이메일
              </Label>
              <Input
                id="consultant-secondary-email"
                type="email"
                value={formValues.secondaryEmail}
                onChange={(event) => updateField("secondaryEmail", event.target.value)}
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-secondary-phone">
                보조 전화번호
              </Label>
              <Input
                id="consultant-secondary-phone"
                value={formValues.secondaryPhone}
                inputMode="numeric"
                onChange={(event) =>
                  updateField("secondaryPhone", formatPhoneNumber(event.target.value))
                }
                placeholder="010-0000-0000"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-2 block" htmlFor="consultant-meeting-link">
                고정 화상회의 링크
                {requiredMark}
              </Label>
              <Input
                id="consultant-meeting-link"
                value={formValues.fixedMeetingLink}
                onChange={(event) => updateField("fixedMeetingLink", event.target.value)}
                placeholder="https://zoom.us/j/..."
              />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-2 block" htmlFor="consultant-expertise">
                전문 분야 (쉼표 구분)
                {requiredMark}
              </Label>
              <Input
                id="consultant-expertise"
                value={formValues.expertise}
                onChange={(event) => updateField("expertise", event.target.value)}
                placeholder="예: 투자유치, 임팩트측정, BM"
              />
            </div>

            <div className="md:col-span-2">
              <Label className="mb-2 block" htmlFor="consultant-bio">
                메모
                {requiredMark}
              </Label>
              <Textarea
                id="consultant-bio"
                rows={4}
                value={formValues.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="컨설팅 소개 및 메모"
                required
              />
            </div>
          </form>
          {hideFooterActions ? null : (
            <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4">
              {onBack && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onBack}
                  disabled={saving}
                  className="text-slate-500 hover:text-slate-700"
                >
                  {backLabel ?? "로그인으로 돌아가기"}
                </Button>
              )}
              {!hideReset && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormValues(initialValues)}
                  disabled={saving}
                >
                  초기화
                </Button>
              )}
              <Button
                type="submit"
                form="consultant-profile-form"
                disabled={saving || isInvalid}
                className={submitClassName}
              >
                {saving ? "저장 중..." : (submitLabel ?? "정보 저장")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {onSaveSchedule && (
        <Card className={sectionCardClassName}>
          <CardHeader className={cardHeaderClassName}>
            <CardTitle className="text-xl font-semibold text-slate-900">
              내 스케줄 설정
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              화요일/목요일 기준으로 가능한 시간을 선택하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className={cardContentClassName}>
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAllSlots(true)}
                disabled={scheduleSaving}
                data-testid="consultant-schedule-select-all"
              >
                전체 선택
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAllSlots(false)}
                disabled={scheduleSaving}
              >
                전체 해제
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={scheduleSaving || !isScheduleDirty}
                onClick={() => setDraftAvailability(normalizedAvailability)}
              >
                되돌리기
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={scheduleSaving || !isScheduleDirty}
                onClick={() => onSaveSchedule(draftAvailability)}
                data-testid="consultant-schedule-save"
              >
                {scheduleSaving ? "저장 중..." : "스케줄 저장"}
              </Button>
            </div>
            <div className="grid gap-3">
              {draftAvailability.map((day) => {
                const dayInfo = scheduleDays.find((item) => item.value === day.dayOfWeek);
                return (
                  <div key={day.dayOfWeek} className="rounded-lg border p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-600">
                      {dayInfo?.label || "-"}요일
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 md:grid-cols-6">
                      {day.slots.map((slot) => (
                        <button
                          key={`${day.dayOfWeek}-${slot.start}`}
                          type="button"
                          aria-pressed={slot.available}
                          title={slot.available ? "가능 일정" : "불가 일정"}
                          onClick={() => toggleSlot(day.dayOfWeek, slot.start)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-[11px] transition",
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
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className={cn(embedded ? "h-full" : "flex min-h-full flex-col bg-slate-50")}>
      {embedded ? (
        <div className="h-full">{content}</div>
      ) : (
        <>
          <div className="border-b bg-white px-6 py-5">
            <div className={consultantPageContainerClassName}>
              <h1 className={pageTitleClassName}>내 정보 입력</h1>
              <p className={pageDescriptionClassName}>
                프로필과 정기 오피스아워 가능 시간을 관리합니다.
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <div className={cn(consultantPageContainerClassName, "p-5")}>
              {content}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
