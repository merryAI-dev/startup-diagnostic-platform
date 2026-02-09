import { cn } from "../components/ui/utils";

export type ApplicationStatus = 
  | "pending" 
  | "review" 
  | "confirmed" 
  | "cancelled" 
  | "completed";

interface StatusChipProps {
  status: ApplicationStatus;
  className?: string;
  size?: "sm" | "md";
}

const statusConfig = {
  pending: {
    label: "신청중",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  review: {
    label: "검토중",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  confirmed: {
    label: "확정",
    className: "bg-green-50 text-green-700 border-green-200",
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
