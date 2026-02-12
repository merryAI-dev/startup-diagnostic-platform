import { useState } from "react";
import { User, Database, Bell, Shield, Server, Activity, Wifi, WifiOff, HardDrive, RefreshCw, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { User as UserType } from "@/redesign/app/lib/types";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Switch } from "@/redesign/app/components/ui/switch";
import { isFirebaseConfigured } from "@/redesign/app/lib/firebase";
import { useConnectionStatus } from "@/redesign/app/hooks/use-firestore";
import { firestoreService } from "@/redesign/app/lib/firestore-service";
import { toast } from "sonner";

interface SettingsProps {
  user: UserType;
}

export function Settings({ user }: SettingsProps) {
  const { status, isOnline, isFirebaseReady, isMockMode } = useConnectionStatus();
  const [notifSettings, setNotifSettings] = useState({
    scheduleConfirm: true,
    dayBeforeReminder: true,
    messageNotif: true,
    reportReminder: true,
    teamUpdate: true,
  });

  const activeSubscriptions = firestoreService.getActiveSubscriptionCount();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="mb-2">설정</h1>
        <p className="text-sm text-muted-foreground">
          계정, 시스템 연동 및 알림을 관리하세요
        </p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        {/* 프로필 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              프로필 정보
            </CardTitle>
            <CardDescription>
              현재 로그인된 계정 정보입니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">기업명</p>
              <p className="text-sm">{user.companyName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">프로그램</p>
              <p className="text-sm">{user.programName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">이메일</p>
              <p className="text-sm">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">역할</p>
              <Badge variant="outline" className="capitalize">{user.role}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Firebase / Firestore 연동 상태 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Firebase 연동 상태
            </CardTitle>
            <CardDescription>
              500명 동시 접속을 위한 Firestore 백엔드 상태
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 연결 상태 */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm">네트워크 상태</span>
              </div>
              <Badge variant={isOnline ? "default" : "destructive"} className={isOnline ? "bg-green-500" : ""}>
                {status === "online" ? "온라인" : status === "offline" ? "오프라인" : "재연결 중"}
              </Badge>
            </div>

            {/* Firebase 상태 */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span className="text-sm">Firebase 연결</span>
              </div>
              <Badge variant={isFirebaseReady ? "default" : "secondary"} className={isFirebaseReady ? "bg-green-500" : ""}>
                {isFirebaseReady ? "연결됨" : "Mock 모드"}
              </Badge>
            </div>

            {/* 오프라인 지원 */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-600" />
                <span className="text-sm">오프라인 캐시</span>
              </div>
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                활성화
              </Badge>
            </div>

            {/* 활성 구독 수 */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-orange-500" />
                <span className="text-sm">실시간 구독</span>
              </div>
              <span className="text-sm text-muted-foreground">{activeSubscriptions}개 활성</span>
            </div>

            {/* Firestore 기능 요약 */}
            {isFirebaseReady && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <p className="text-sm text-blue-900">활성 기능</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    실시간 동기화
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    오프라인 퍼시스턴스
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    멀티탭 지원
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    배치 쓰기 (500건)
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    레이트 리미팅
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    낙관적 업데이트
                  </div>
                </div>
              </div>
            )}

            {isMockMode && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-900 mb-2">
                  Firebase가 설정되지 않아 Mock 모드로 실행 중입니다.
                </p>
                <p className="text-xs text-amber-700 mb-3">
                  환경 변수에 Firebase 설정을 추가하면 실시간 데이터베이스 기능이 활성화됩니다.
                </p>
                <div className="bg-white p-3 rounded border text-xs font-mono text-gray-600 space-y-1">
                  <p>VITE_FIREBASE_API_KEY=your_api_key</p>
                  <p>VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com</p>
                  <p>VITE_FIREBASE_PROJECT_ID=your_project_id</p>
                  <p>VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com</p>
                  <p>VITE_FIREBASE_APP_ID=your_app_id</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 캘린더 설정 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              캘린더 설정
            </CardTitle>
            <CardDescription>
              Firestore 기반 캘린더 이벤트 관리
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-lg space-y-2">
              <p className="text-sm text-sky-900">Firestore 캘린더</p>
              <ul className="text-xs text-sky-700 space-y-1 list-disc list-inside">
                <li>오피스아워 확정 시 자동 캘린더 등록</li>
                <li>실시간 일정 동기화 (멀티탭/멀티디바이스)</li>
                <li>시간대 충돌 자동 감지</li>
                <li>오프라인에서도 일정 조회 가능</li>
              </ul>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm">오피스아워 자동 등록</span>
              <span className="text-green-600 text-sm">활성화</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm">일정 충돌 알림</span>
              <span className="text-green-600 text-sm">활성화</span>
            </div>
          </CardContent>
        </Card>

        {/* 알림 설정 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              알림 설정
            </CardTitle>
            <CardDescription>
              오피스아워 관련 알림을 관리합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>일정 확정 알림</span>
                <Switch
                  checked={notifSettings.scheduleConfirm}
                  onCheckedChange={(checked) =>
                    setNotifSettings((prev) => ({ ...prev, scheduleConfirm: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>일정 하루 전 리마인더</span>
                <Switch
                  checked={notifSettings.dayBeforeReminder}
                  onCheckedChange={(checked) =>
                    setNotifSettings((prev) => ({ ...prev, dayBeforeReminder: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>메시지 수신 알림</span>
                <Switch
                  checked={notifSettings.messageNotif}
                  onCheckedChange={(checked) =>
                    setNotifSettings((prev) => ({ ...prev, messageNotif: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>보고서 작성 리마인더</span>
                <Switch
                  checked={notifSettings.reportReminder}
                  onCheckedChange={(checked) =>
                    setNotifSettings((prev) => ({ ...prev, reportReminder: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span>팀 활동 알림</span>
                <Switch
                  checked={notifSettings.teamUpdate}
                  onCheckedChange={(checked) =>
                    setNotifSettings((prev) => ({ ...prev, teamUpdate: checked }))
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 보안 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              보안 및 권한
            </CardTitle>
            <CardDescription>
              계정 보안 설정을 관리합니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
              <span>세션 타임아웃</span>
              <span className="text-muted-foreground">24시간</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
              <span>Firestore Security Rules</span>
              <Badge variant="default" className="bg-green-500">적용됨</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
              <span>데이터 암호화</span>
              <Badge variant="default" className="bg-green-500">AES-256</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
