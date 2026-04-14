import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { Spinner } from "@/redesign/app/components/ui/spinner";
import { User as UserType } from "@/redesign/app/lib/types";
import { Switch } from "@/redesign/app/components/ui/switch";

interface SettingsProps {
  user: UserType;
  marketingConsentEnabled?: boolean;
  marketingConsentSaving?: boolean;
  onToggleMarketingConsent?: (checked: boolean) => Promise<void> | void;
}

export function Settings({
  user,
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
              {user.companyName} 계정의 마케팅 정보 수신 여부를 변경할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">마케팅 정보 수신 동의</p>
                <p className="text-xs text-slate-500">
                  프로그램 안내, 이벤트, 뉴스레터 등 운영/마케팅 안내 수신 여부
                </p>
              </div>
              <Switch
                checked={Boolean(marketingConsentEnabled)}
                disabled={marketingConsentSaving}
                onCheckedChange={(checked) => {
                  void onToggleMarketingConsent?.(checked);
                }}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 text-xs text-slate-600">
              <span>현재 상태: {marketingConsentEnabled ? "수신 동의" : "수신 거부"}</span>
              {marketingConsentSaving ? <Spinner className="h-3.5 w-3.5" /> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
