import { Calendar, Clock, AlertCircle, CheckCircle2, MessageSquare, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { StatusChip } from "../status-chip";
import { Application, Message } from "../../lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface AdminDashboardProps {
  applications: Application[];
  messages: Message[];
  onNavigate: (page: string) => void;
}

export function AdminDashboard({ applications, messages, onNavigate }: AdminDashboardProps) {
  // Statistics
  const totalApplications = applications.length;
  const reviewPending = applications.filter((app) => app.status === "review" || app.status === "pending").length;
  const confirmed = applications.filter((app) => app.status === "confirmed").length;
  const completed = applications.filter((app) => app.status === "completed").length;

  // Messages needing response
  const needsResponse = messages.filter((msg) => msg.sender === "user").length;

  // This week's applications
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeekApplications = applications.filter(
    (app) => new Date(app.createdAt) >= oneWeekAgo
  ).length;

  // Recent activity
  const recentApplications = [...applications]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="mb-2">관리자 대시보드</h1>
        <p className="text-sm text-muted-foreground">
          전체 오피스아워 신청 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">전체 신청</p>
                <p className="text-3xl font-bold">{totalApplications}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  금주 +{thisWeekApplications}건
                </p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">검토 대기</p>
                <p className="text-3xl font-bold text-amber-600">{reviewPending}</p>
                <p className="text-xs text-amber-600 mt-2">확인 필요</p>
              </div>
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">확정</p>
                <p className="text-3xl font-bold text-green-600">{confirmed}</p>
                <p className="text-xs text-muted-foreground mt-2">일정 확정됨</p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">완료</p>
                <p className="text-3xl font-bold text-purple-600">{completed}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  완료율 {totalApplications > 0 ? Math.round((completed / totalApplications) * 100) : 0}%
                </p>
              </div>
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Priority Actions */}
      <div>
        <h2 className="mb-4">우선 처리 필요</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card
            className={reviewPending > 0 ? "border-amber-200 bg-amber-50/50 cursor-pointer hover:bg-amber-50" : ""}
            onClick={() => reviewPending > 0 && onNavigate("admin-applications")}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <span>검토 필요한 신청</span>
                </div>
                <span className="text-2xl font-bold text-amber-600">{reviewPending}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reviewPending > 0 ? (
                <p className="text-sm text-muted-foreground">
                  신청자가 승인을 기다리고 있습니다
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  모든 신청이 처리되었습니다
                </p>
              )}
            </CardContent>
          </Card>

          <Card
            className={needsResponse > 0 ? "border-blue-200 bg-blue-50/50 cursor-pointer hover:bg-blue-50" : ""}
            onClick={() => needsResponse > 0 && onNavigate("admin-applications")}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <span>답변 대기 메시지</span>
                </div>
                <span className="text-2xl font-bold text-primary">{needsResponse}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {needsResponse > 0 ? (
                <p className="text-sm text-muted-foreground">
                  신청자의 메시지에 답변이 필요합니다
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  모든 메시지에 답변했습니다
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2>최근 활동</h2>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("admin-applications")}>
            전체 보기
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentApplications.length > 0 ? (
                recentApplications.map((app) => (
                  <div key={app.id} className="p-4 hover:bg-accent cursor-pointer transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <StatusChip status={app.status} />
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(app.updatedAt), "M월 d일 HH:mm", { locale: ko })}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{app.officeHourTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {app.consultant} · {app.agenda}
                          </p>
                        </div>
                        {app.scheduledDate && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {format(new Date(app.scheduledDate), "M월 d일 (E)", { locale: ko })}
                            </span>
                            {app.scheduledTime && (
                              <>
                                <Clock className="w-3 h-3 ml-2" />
                                <span>{app.scheduledTime}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">활동 내역이 없습니다</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
