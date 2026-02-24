import { cn } from "@/redesign/app/components/ui/utils";

export type ApplicationStatus = 
  | "pending" 
  | "review" 
  | "confirmed" 
  | "rejected"
  | "cancelled" 
  | "completed";

interface StatusChipProps {
  status: ApplicationStatus;
  className?: string;
  size?: "sm" | "md";
}

const statusConfig = {
  pending: {
    label: "진행중",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  review: {
    label: "진행중",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  confirmed: {
    label: "확정",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  rejected: {
    label: "거절됨",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  cancelled: {
    label: "취소",
    className: "bg-gray-50 text-gray-700 border-gray-200",
  },
  completed: {
    label: "완료",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

export function StatusChip({ status, className, size = "md" }: StatusChipProps) {
  const config = statusConfig[status];
  const sizeClass =
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border transition-colors",
        sizeClass,
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
