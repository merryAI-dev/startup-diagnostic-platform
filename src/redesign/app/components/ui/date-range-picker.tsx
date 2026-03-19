"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Button } from "@/redesign/app/components/ui/button";
import { Calendar } from "@/redesign/app/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/redesign/app/components/ui/popover";
import { cn } from "@/redesign/app/components/ui/utils";

type DateRangePickerProps = {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
};

function formatRangeLabel(value?: DateRange) {
  if (!value?.from && !value?.to) {
    return "yyyy-mm-dd ~ yyyy-mm-dd";
  }

  if (value.from && value.to) {
    return `${format(value.from, "yyyy-MM-dd")} ~ ${format(value.to, "yyyy-MM-dd")}`;
  }

  if (value.from) {
    return `${format(value.from, "yyyy-MM-dd")} ~ yyyy-mm-dd`;
  }

  return "yyyy-mm-dd ~ yyyy-mm-dd";
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "yyyy-mm-dd ~ yyyy-mm-dd",
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState<DateRange | undefined>(value);
  const hasValue = Boolean(value?.from || value?.to);

  React.useEffect(() => {
    if (open) return;
    setDraftValue(value);
  }, [open, value]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setDraftValue(value);
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2 text-left font-normal text-slate-700"
          >
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            <span>{hasValue ? formatRangeLabel(value) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={draftValue}
            onSelect={setDraftValue}
            numberOfMonths={2}
            locale={ko}
          />
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-slate-500"
              onClick={() => setDraftValue(undefined)}
            >
              초기화
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftValue(value);
                  setOpen(false);
                }}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onChange(draftValue?.from || draftValue?.to ? draftValue : undefined);
                  setOpen(false);
                }}
              >
                저장
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
