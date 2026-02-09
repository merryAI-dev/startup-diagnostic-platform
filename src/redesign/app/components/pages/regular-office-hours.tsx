import { Calendar, User, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { RegularOfficeHour } from "../../lib/types";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface RegularOfficeHoursProps {
  officeHours: RegularOfficeHour[];
  onSelectOfficeHour: (id: string) => void;
}

export function RegularOfficeHours({
  officeHours,
  onSelectOfficeHour,
}: RegularOfficeHoursProps) {
  const groupedByMonth = officeHours.reduce((acc, oh) => {
    if (!acc[oh.month]) {
      acc[oh.month] = [];
    }
    acc[oh.month].push(oh);
    return acc;
  }, {} as Record<string, RegularOfficeHour[]>);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="mb-2">정기 오피스아워</h1>
        <p className="text-sm text-muted-foreground">
          매월 진행되는 정기 오피스아워 일정을 확인하고 신청하세요
        </p>
      </div>

      {Object.entries(groupedByMonth).map(([month, items]) => {
        const monthDate = new Date(month + "-01");
        return (
          <div key={month}>
            <h2 className="mb-4">
              {format(monthDate, "yyyy년 M월", { locale: ko })}
            </h2>
            <div className="grid gap-4">
              {items.map((oh) => (
                <Card key={oh.id} className="hover:border-primary transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div>
                          <h3 className="mb-1">{oh.title}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="w-4 h-4" />
                            <span>{oh.consultant}</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {oh.description}
                        </p>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>
                            신청 가능 일정: {oh.availableDates.length}개
                          </span>
                        </div>
                      </div>
                      <Button onClick={() => onSelectOfficeHour(oh.id)}>
                        상세 보기
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
