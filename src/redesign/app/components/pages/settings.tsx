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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              동의 관리
            </CardTitle>
            <CardDescription>
              {user.companyName} 계정의 알림 및 마케팅 수신 여부를 변경할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">소식 알림 수신 동의</p>
                <p className="text-xs text-slate-500">
                  오피스아워 신청 현황 등 홈페이지 이용에 필요한 안내 사항을 메일 및 카카오톡 알림으로 보내드립니다.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ConsentStatus
                  enabled={serviceNotificationConsentEnabled}
                  saving={serviceNotificationConsentSaving}
                />
                <Switch
                  checked={Boolean(serviceNotificationConsentEnabled)}
                  disabled={serviceNotificationConsentSaving}
                  onCheckedChange={(checked) => {
                    void onToggleServiceNotificationConsent?.(checked);
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">마케팅 정보 수신 동의</p>
                <p className="text-xs text-slate-500">
                  프로그램 안내, 이벤트, 뉴스레터 등 운영/마케팅 안내 수신 여부
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ConsentStatus
                  enabled={marketingConsentEnabled}
                  saving={marketingConsentSaving}
                />
                <Switch
                  checked={Boolean(marketingConsentEnabled)}
                  disabled={marketingConsentSaving}
                  onCheckedChange={(checked) => {
                    void onToggleMarketingConsent?.(checked);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
