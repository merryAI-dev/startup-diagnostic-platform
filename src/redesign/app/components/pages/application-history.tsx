import { Filter, Calendar, Clock } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent } from "@/redesign/app/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/redesign/app/components/ui/tabs";
import { StatusChip } from "@/redesign/app/components/status-chip";
import { Application, ApplicationStatus } from "@/redesign/app/lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { EmptyState } from "@/redesign/app/components/empty-state";
import { FileText } from "lucide-react";
import { parseLocalDateKey } from "@/redesign/app/lib/date-keys";

interface ApplicationHistoryProps {
  applications: Application[];
  onViewApplication: (id: string) => void;
}

export function ApplicationHistory({
  applications,
  onViewApplication,
}: ApplicationHistoryProps) {
  const shouldShowConsultant = (consultant?: string) =>
    Boolean(consultant && consultant !== "담당자 배정 중");

  const filterByStatus = (status?: ApplicationStatus) => {
    if (!status) return applications;
    return applications.filter((app) => app.status === status);
  };

  const ApplicationList = ({ apps }: { apps: Application[] }) => {
    if (apps.length === 0) {
      return (
        <EmptyState
          icon={FileText}
          title="신청 내역이 없습니다"
          description="해당 상태의 신청이 없습니다"
        />
      );
    }

    return (
      <div className="space-y-3">
        {apps.map((app) => (
          <Card key={app.id} className="hover:border-primary transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <StatusChip status={app.status} />
                    <span className="px-2 py-0.5 bg-muted rounded text-xs">
                      {app.type === "regular" ? "정기" : "비정기"}
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
                    {app.status === "rejected" && app.rejectionReason && (
                      <p className="text-xs text-rose-600 mt-1">
                        거절 사유: {app.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {app.scheduledDate ? (
                      <>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(parseLocalDateKey(app.scheduledDate)!, "M월 d일 (E)", {
                            locale: ko,
                          })}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {app.scheduledTime}
                        </div>
                      </>
                    ) : app.periodFrom ? (
                      <span>
                        희망 기간:{" "}
                        {format(parseLocalDateKey(app.periodFrom)!, "M월 d일", { locale: ko })} ~{" "}
                        {format(parseLocalDateKey(app.periodTo!)!, "M월 d일", { locale: ko })}
                      </span>
                    ) : (
                      <span>일정 미정</span>
                    )}
                  </div>
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
    );
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2">전체 내역</h1>
          <p className="text-sm text-muted-foreground">
            모든 오피스아워 신청 내역을 확인하세요
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Filter className="w-4 h-4 mr-2" />
          필터
        </Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            전체 ({applications.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            신청중 ({filterByStatus("pending").length})
          </TabsTrigger>
          <TabsTrigger value="review">
            진행중 ({filterByStatus("review").length})
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            확정 ({filterByStatus("confirmed").length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            거절됨 ({filterByStatus("rejected").length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            완료 ({filterByStatus("completed").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <ApplicationList apps={applications} />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <ApplicationList apps={filterByStatus("pending")} />
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <ApplicationList apps={filterByStatus("review")} />
        </TabsContent>

        <TabsContent value="confirmed" className="space-y-4">
          <ApplicationList apps={filterByStatus("confirmed")} />
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          <ApplicationList apps={filterByStatus("rejected")} />
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <ApplicationList apps={filterByStatus("completed")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
