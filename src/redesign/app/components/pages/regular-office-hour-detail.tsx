import { ArrowLeft, Calendar, User, Info } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { RegularOfficeHour, Application } from "../../lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { StatusChip } from "../status-chip";

interface RegularOfficeHourDetailProps {
  officeHour: RegularOfficeHour;
  applications: Application[];
  onBack: () => void;
  onStartApplication: () => void;
  onViewApplication: (id: string) => void;
}

export function RegularOfficeHourDetail({
  officeHour,
  applications,
  onBack,
  onStartApplication,
  onViewApplication,
}: RegularOfficeHourDetailProps) {
  const myApplications = applications.filter(
    (app) => app.officeHourId === officeHour.id
  );

  const confirmedApplications = myApplications.filter(
    (app) => app.status === "confirmed"
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          목록으로
        </Button>
        <h1 className="mb-2">{officeHour.title}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span>{officeHour.consultant}</span>
        </div>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList>
          <TabsTrigger value="info">기본 정보</TabsTrigger>
          <TabsTrigger value="apply">신청하기</TabsTrigger>
          <TabsTrigger value="confirmed">
            확정 일정 ({confirmedApplications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="mb-2">프로그램 설명</h3>
                <p className="text-sm text-muted-foreground">
                  {officeHour.description}
                </p>
              </div>
              <div>
                <h3 className="mb-2">신청 가능 일정</h3>
                <div className="flex flex-wrap gap-2">
                  {officeHour.availableDates.map((date) => (
                    <div
                      key={date}
                      className="px-3 py-2 bg-muted rounded-lg text-sm"
                    >
                      <Calendar className="w-4 h-4 inline mr-2" />
                      {format(new Date(date), "M월 d일 (E)", { locale: ko })}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apply" className="space-y-4">
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="mb-1">신청 안내</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    아래 버튼을 클릭하여 오피스아워 신청을 시작하세요. 날짜 선택,
                    진행 형태, 아젠다, 요청 내용 입력 순서로 진행됩니다.
                  </p>
                  <Button onClick={onStartApplication}>
                    신청 시작하기
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {myApplications.length > 0 && (
            <div>
              <h3 className="mb-3">내 신청 내역</h3>
              <div className="space-y-2">
                {myApplications.map((app) => (
                  <Card key={app.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <StatusChip status={app.status} />
                          <div>
                            <p className="text-sm">
                              {app.scheduledDate
                                ? format(new Date(app.scheduledDate), "M월 d일 (E) · ", {
                                    locale: ko,
                                  }) + app.scheduledTime
                                : "일정 미정"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {app.agenda}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewApplication(app.id)}
                        >
                          상세
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="confirmed" className="space-y-4">
          {confirmedApplications.length > 0 ? (
            <div className="space-y-4">
              {confirmedApplications.map((app) => (
                <Card key={app.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-2">
                          <StatusChip status={app.status} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <span>
                                {format(new Date(app.scheduledDate!), "M월 d일 (E)", {
                                  locale: ko,
                                })}
                              </span>
                            </div>
                            <span>{app.scheduledTime}</span>
                            <div className="px-2 py-1 bg-muted rounded text-xs">
                              {app.sessionFormat === "online"
                                ? "온라인"
                                : "오프라인"}
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            아젠다: {app.agenda}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => onViewApplication(app.id)}
                      >
                        전달사항
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  확정된 일정이 없습니다
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
