import { Plus, Filter } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent } from "@/redesign/app/components/ui/card";
import { StatusChip } from "@/redesign/app/components/status-chip";
import { Application } from "@/redesign/app/lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { EmptyState } from "@/redesign/app/components/empty-state";
import { CalendarClock } from "lucide-react";

interface IrregularOfficeHoursProps {
  applications: Application[];
  onStartApplication: () => void;
  onViewApplication: (id: string) => void;
}

export function IrregularOfficeHours({
  applications,
  onStartApplication,
  onViewApplication,
}: IrregularOfficeHoursProps) {
  const shouldShowConsultant = (consultant?: string) =>
    Boolean(consultant && consultant !== "담당자 배정 중");

  const irregularApplications = applications.filter(
    (app) => app.type === "irregular"
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2">비정기 오피스아워</h1>
          <p className="text-sm text-muted-foreground">
            맞춤형 일정으로 오피스아워를 신청하세요
          </p>
        </div>
        <Button onClick={onStartApplication}>
          <Plus className="w-4 h-4 mr-2" />
          신청하기
        </Button>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="text-sm">
              <p className="mb-1">
                <strong>비정기 오피스아워</strong>는 프로젝트별로 필요한 시점에
                신청할 수 있습니다.
              </p>
              <p className="text-xs text-muted-foreground">
                • 내부 컨설팅: 프로그램 참여 기업 대상 (잔여 횟수 제한)
                <br />• 외부 컨설팅: 별도 비용 발생 가능
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {irregularApplications.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2>신청 내역</h2>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              필터
            </Button>
          </div>

          <div className="space-y-3">
            {irregularApplications.map((app) => (
              <Card key={app.id} className="hover:border-primary transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <StatusChip status={app.status} />
                        <span className="text-xs text-muted-foreground">
                          {format(app.createdAt, "M월 d일 신청", { locale: ko })}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-sm mb-1">{app.officeHourTitle}</h3>
                        {(() => {
                          const parts = [];
                          if (shouldShowConsultant(app.consultant)) parts.push(app.consultant);
                          if (app.agenda) parts.push(app.agenda);
                          return parts.length > 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {parts.join(" · ")}
                            </p>
                          ) : null;
                        })()}
                      </div>
                      {app.periodFrom && (
                        <p className="text-xs text-muted-foreground">
                          희망 기간:{" "}
                          {format(new Date(app.periodFrom), "M월 d일", { locale: ko })} ~{" "}
                          {format(new Date(app.periodTo!), "M월 d일", { locale: ko })}
                        </p>
                      )}
                      {app.scheduledDate && (
                        <p className="text-sm">
                          확정 일정:{" "}
                          {format(new Date(app.scheduledDate), "M월 d일 (E)", {
                            locale: ko,
                          })}{" "}
                          {app.scheduledTime}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewApplication(app.id)}
                    >
                      상세 보기
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title="신청 내역이 없습니다"
          description="비정기 오피스아워를 신청하여 맞춤형 컨설팅을 받아보세요"
          actionLabel="신청하기"
          onAction={onStartApplication}
        />
      )}
    </div>
  );
}
