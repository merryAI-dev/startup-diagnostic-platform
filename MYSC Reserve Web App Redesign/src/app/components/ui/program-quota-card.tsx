import { AlertCircle, CheckCircle } from "lucide-react";
import { Program } from "../../lib/types";
import { Progress } from "./progress";
import { Badge } from "./badge";

interface ProgramQuotaCardProps {
  program: Program;
}

export function ProgramQuotaCard({ program }: ProgramQuotaCardProps) {
  const remainingApplications = program.maxApplications - program.usedApplications;
  const usagePercentage = Math.round(
    (program.usedApplications / program.maxApplications) * 100
  );
  
  const isLow = remainingApplications <= 3 && remainingApplications > 0;
  const isExhausted = remainingApplications <= 0;

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: program.color }}
          />
          <h3 className="font-semibold text-sm">{program.name}</h3>
        </div>
        {isExhausted ? (
          <Badge variant="destructive" className="text-xs">
            소진
          </Badge>
        ) : isLow ? (
          <Badge variant="outline" className="text-xs border-orange-500 text-orange-700">
            부족
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs border-green-500 text-green-700">
            충분
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">남은 신청 횟수</p>
            <p className="text-2xl font-bold" style={{ color: isExhausted ? '#ef4444' : isLow ? '#f59e0b' : program.color }}>
              {remainingApplications}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                / {program.maxApplications}회
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">사용</p>
            <p className="text-sm font-semibold">{program.usedApplications}회</p>
          </div>
        </div>

        <Progress 
          value={usagePercentage} 
          className="h-2"
          style={{ 
            backgroundColor: '#e5e7eb'
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground mt-2">{program.description}</p>
    </div>
  );
}