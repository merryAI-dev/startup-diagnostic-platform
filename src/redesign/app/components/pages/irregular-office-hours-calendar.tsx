import { Calendar, Filter, Search } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Input } from "@/redesign/app/components/ui/input";
import { useState } from "react";

export function IrregularOfficeHoursCalendar({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    { id: "marketing", name: "마케팅/브랜딩", count: 12, color: "#3b82f6" },
    { id: "finance", name: "재무/회계", count: 8, color: "#10b981" },
    { id: "legal", name: "법률/지식재산", count: 6, color: "#8b5cf6" },
    { id: "tech", name: "기술/개발", count: 15, color: "#f59e0b" },
    { id: "hr", name: "인사/조직", count: 7, color: "#ec4899" },
    { id: "sales", name: "영업/사업개발", count: 10, color: "#06b6d4" },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">비정기 오피스아워</h1>
            <p className="text-sm text-muted-foreground mt-1">
              필요할 때 전문가와 1:1 컨설팅을 신청하세요
            </p>
          </div>
          <Button onClick={() => onNavigate("irregular-wizard")}>
            새 컨설팅 신청
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="컨설턴트, 전문분야 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="mx-auto max-w-[1600px]">
          {/* Categories Grid */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">전문 분야별 컨설턴트</h2>
            <div className="grid grid-cols-3 gap-4">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="bg-white border rounded-lg p-6 hover:shadow-lg cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}15` }}
                    >
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: category.color }}
                      />
                    </div>
                    <Badge variant="secondary">{category.count}명</Badge>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{category.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    전문 컨설턴트와 상담하세요
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* How it Works */}
          <div className="bg-white border rounded-lg p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">신청 방법</h2>
            <div className="grid grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center mx-auto mb-3">
                  1
                </div>
                <h3 className="font-medium text-gray-900 mb-1">분야 선택</h3>
                <p className="text-sm text-muted-foreground">
                  필요한 컨설팅 분야를 선택합니다
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center mx-auto mb-3">
                  2
                </div>
                <h3 className="font-medium text-gray-900 mb-1">일정 제안</h3>
                <p className="text-sm text-muted-foreground">
                  희망하는 날짜와 시간을 제안합니다
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center mx-auto mb-3">
                  3
                </div>
                <h3 className="font-medium text-gray-900 mb-1">매칭 대기</h3>
                <p className="text-sm text-muted-foreground">
                  적합한 컨설턴트가 배정됩니다
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center mx-auto mb-3">
                  4
                </div>
                <h3 className="font-medium text-gray-900 mb-1">컨설팅 진행</h3>
                <p className="text-sm text-muted-foreground">
                  확정된 일정에 컨설팅을 받습니다
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
