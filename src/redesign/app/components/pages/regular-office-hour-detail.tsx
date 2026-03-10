import { ArrowLeft, Calendar, Info } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Card, CardContent } from "@/redesign/app/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/redesign/app/components/ui/tabs";
import { RegularOfficeHour, Application } from "@/redesign/app/lib/types";
import { format, isBefore, parseISO, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { StatusChip } from "@/redesign/app/components/status-chip";

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
  const hasFutureAvailableDate = officeHour.availableDates.some(
    (date) => !isBefore(parseISO(date), startOfDay(new Date()))
  );
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
        <p className="text-sm text-muted-foreground">{officeHour.description}</p>
      </div>

      <Tabs defaultValue="apply" className="w-full">
        <TabsList className="justify-start">
          <TabsTrigger
            value="apply"
            className="text-slate-500 hover:text-slate-700 data-[state=active]:text-slate-900"
          >
            신청하기
          </TabsTrigger>
          <TabsTrigger
            value="confirmed"
            className="text-slate-500 hover:text-slate-700 data-[state=active]:text-slate-900"
          >
            확정 일정 ({confirmedApplications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apply" className="space-y-4">
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="mb-1">신청 안내</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    아래 버튼을 클릭하여 오피스아워 신청을 시작하세요. 날짜/시간,
                    진행 형태, 요청 내용 입력 순서로 진행됩니다.
                  </p>
                  <Button onClick={onStartApplication} disabled={!hasFutureAvailableDate}>
                    신청 시작하기
                  </Button>
                  {!hasFutureAvailableDate && (
                    <p className="text-xs text-rose-600 mt-2">
                      오늘 이전 일정만 남아 있어 신청할 수 없습니다.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

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
