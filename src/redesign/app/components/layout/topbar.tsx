import { LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/redesign/app/components/ui/dropdown-menu";
import { User } from "@/redesign/app/lib/types";

interface TopbarProps {
  user: User;
  displayName?: string;
  roleLabel?: string;
  onLogout: () => void;
  onNavigate?: (page: string) => void;
  disabledPages?: Set<string>;
  companyInfoNeedsAttention?: boolean;
}

export function Topbar({
  user,
  displayName,
  roleLabel,
  onLogout,
  onNavigate,
  disabledPages,
  companyInfoNeedsAttention = false,
}: TopbarProps) {
  const companyInfoDisabled = disabledPages?.has("company-info") ?? false;
  const resolvedRoleLabel = roleLabel
    ?? (user.role === "admin"
      ? "관리자"
      : user.role === "consultant"
        ? "컨설턴트"
        : user.role === "staff"
          ? "스태프"
          : "회사");
  const resolvedDisplayName = displayName || user.companyName;

  return (
    <div className="h-16 border-b bg-white flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="font-semibold">MYSC 기업육성플랫폼</h2>
            <p className="text-xs text-muted-foreground">{user.programName}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <UserIcon className="w-5 h-5" />
              {companyInfoNeedsAttention ? (
                <span
                  className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
                  aria-label="자가진단표 미완료"
                />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span>{resolvedDisplayName}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {resolvedRoleLabel}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {user.role !== "user" ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    if (user.role === "consultant") {
                      onNavigate?.("consultant-profile");
                    } else {
                      onNavigate?.("settings");
                    }
                  }}
                >
                  프로필 설정
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {user.role === "user" ? (
              <>
                <DropdownMenuItem
                  disabled={companyInfoDisabled}
                  onClick={() => {
                    if (companyInfoDisabled) return;
                    onNavigate?.("company-info");
                  }}
                >
                  <span className="flex flex-1 items-center justify-between gap-3">
                    <span>기업 정보 입력</span>
                    {companyInfoNeedsAttention ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                        자가진단표 미완료
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onClick={onLogout}>로그아웃</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
