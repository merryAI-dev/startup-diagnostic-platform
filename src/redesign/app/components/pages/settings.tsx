import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { Spinner } from "@/redesign/app/components/ui/spinner";
import { User as UserType } from "@/redesign/app/lib/types";
import { Switch } from "@/redesign/app/components/ui/switch";

interface SettingsProps {
  user: UserType;
  serviceNotificationConsentEnabled?: boolean;
  serviceNotificationConsentSaving?: boolean;
  onToggleServiceNotificationConsent?: (checked: boolean) => Promise<void> | void;
  marketingConsentEnabled?: boolean;
  marketingConsentSaving?: boolean;
  onToggleMarketingConsent?: (checked: boolean) => Promise<void> | void;
}

function ConsentStatus({
  enabled,
  saving,
}: {
  enabled?: boolean;
  saving?: boolean;
}) {
  const active = Boolean(enabled);

  return (
    <div
      className={
        active
          ? "inline-flex items-center gap-2 text-xs font-medium text-emerald-700"
          : "inline-flex items-center gap-2 text-xs font-medium text-slate-500"
      }
    >
      <span
        className={
          active
            ? "h-2 w-2 rounded-full bg-emerald-500"
            : "h-2 w-2 rounded-full bg-slate-300"
        }
      />
      <span>{active ? "동의" : "미동의"}</span>
      {saving ? <Spinner className="h-3.5 w-3.5" /> : null}
    </div>
  );
}

function ConsentItem({
  title,
  description,
  enabled,
  saving,
  onToggle,
  bordered = true,
}: {
  title: string;
  description: string;
  enabled?: boolean;
  saving?: boolean;
  onToggle?: (checked: boolean) => Promise<void> | void;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? "border-t border-slate-200 px-6 py-5" : "px-6 py-5"}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ConsentStatus enabled={enabled} saving={saving} />
          <Switch
            checked={Boolean(enabled)}
            disabled={saving}
            onCheckedChange={(checked) => {
              void onToggle?.(checked);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function Settings({
  user,
  serviceNotificationConsentEnabled,
  serviceNotificationConsentSaving = false,
  onToggleServiceNotificationConsent,
  marketingConsentEnabled,
  marketingConsentSaving = false,
  onToggleMarketingConsent,
}: SettingsProps) {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="mb-2">설정</h1>
        <p className="text-sm text-muted-foreground">
          계정 동의 상태를 관리하세요
        </p>
      </div>

      <div className="max-w-2xl">
        <Card className="overflow-hidden border-slate-200">
          <CardHeader className="border-b border-slate-200 bg-slate-50/80 pb-5">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              동의 관리
            </CardTitle>
            <CardDescription>
              {user.companyName} 계정의 알림 및 마케팅 수신 여부를 변경할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ConsentItem
              title="소식 알림 수신 동의"
              description="오피스아워 신청 안내, 일정 확정, 일정 리마인드 등 운영에 필요한 안내를 메일 및 카카오톡으로 보내드립니다."
              enabled={serviceNotificationConsentEnabled}
              saving={serviceNotificationConsentSaving}
              onToggle={onToggleServiceNotificationConsent}
              bordered={false}
            />
            <ConsentItem
              title="마케팅 정보 수신 동의"
              description="프로그램 안내, 이벤트, 뉴스레터 등 운영/마케팅 안내 수신 여부를 관리합니다."
              enabled={marketingConsentEnabled}
              saving={marketingConsentSaving}
              onToggle={onToggleMarketingConsent}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
