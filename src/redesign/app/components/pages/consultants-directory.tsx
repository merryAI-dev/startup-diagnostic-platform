import { useState } from "react";
import { Mail, Phone, Linkedin, Star, Award, GraduationCap, FileText, Calendar } from "lucide-react";
import { Consultant } from "@/redesign/app/lib/types";
import { Badge } from "@/redesign/app/components/ui/badge";
import { Button } from "@/redesign/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/redesign/app/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/redesign/app/components/ui/tabs";

interface ConsultantsDirectoryProps {
  consultants: Consultant[];
}

export function ConsultantsDirectory({ consultants }: ConsultantsDirectoryProps) {
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [filterExpertise, setFilterExpertise] = useState<string>("all");

  // 모든 전문 분야 추출
  const allExpertise = Array.from(
    new Set(consultants.flatMap((c) => c.expertise))
  );

  const filteredConsultants =
    filterExpertise === "all"
      ? consultants
      : consultants.filter((c) => c.expertise.includes(filterExpertise));

  const formatDate = (date?: Date | string) => {
    if (!date) return "-";
    const parsedDate = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
    }).format(parsedDate);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white py-20">
        <div className="mx-auto max-w-[1600px] px-8">
          <h1 className="text-4xl font-bold mb-4">Our Consultants</h1>
          <p className="text-xl text-gray-200 max-w-2xl">
            임팩트 비즈니스 성장을 이끄는 각 분야의 전문가들을 만나보세요
          </p>
          <div className="mt-8 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              <span>{consultants.length}명의 전문 컨설턴트</span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5" />
              <span>평균 {(consultants.reduce((sum, c) => sum + (c.rating || 0), 0) / consultants.length).toFixed(1)}점</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <span>{consultants.reduce((sum, c) => sum + (c.sessionsCompleted ?? 0), 0)}건 이상 세션 완료</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-8 -mt-8">
        {/* Filter */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-700">전문 분야:</span>
            <Button
              variant={filterExpertise === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterExpertise("all")}
            >
              전체
            </Button>
            {allExpertise.map((expertise) => (
              <Button
                key={expertise}
                variant={filterExpertise === expertise ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterExpertise(expertise)}
              >
                {expertise}
              </Button>
            ))}
          </div>
        </div>

        {/* Consultants Grid */}
        <div className="grid grid-cols-3 gap-6 pb-12">
          {filteredConsultants.map((consultant) => (
            <div
              key={consultant.id}
              className="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={() => setSelectedConsultant(consultant)}
            >
              {/* Profile Image */}
              <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative overflow-hidden">
                {consultant.avatarUrl ? (
                  <img
                    src={consultant.avatarUrl}
                    alt={consultant.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-5xl font-bold text-primary">
                      {consultant.name[0]}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {consultant.name}
                  </h3>
                  <p className="text-sm text-primary font-medium">
                    {consultant.title}
                  </p>
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                  {consultant.bio}
                </p>

                <div className="flex flex-wrap gap-1 mb-4">
                  {consultant.expertise.slice(0, 3).map((exp, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {exp}
                    </Badge>
                  ))}
                  {consultant.expertise.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{consultant.expertise.length - 3}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">{consultant.rating?.toFixed(1) || "N/A"}</span>
                  </div>
                  <div className="text-xs">
                    {consultant.sessionsCompleted}건 완료
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Consultant Detail Modal */}
      {selectedConsultant && (
        <Dialog open={!!selectedConsultant} onOpenChange={() => setSelectedConsultant(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="sr-only">{selectedConsultant.name} 프로필</DialogTitle>
            </DialogHeader>

            {/* Profile Header */}
            <div className="flex gap-6 pb-6 border-b">
              <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0 flex items-center justify-center">
                {selectedConsultant.avatarUrl ? (
                  <img
                    src={selectedConsultant.avatarUrl}
                    alt={selectedConsultant.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <span className="text-4xl font-bold text-primary">
                    {selectedConsultant.name[0]}
                  </span>
                )}
              </div>

              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                  {selectedConsultant.name}
                </h2>
                <p className="text-primary font-medium mb-4">
                  {selectedConsultant.title}
                </p>

                <div className="flex flex-wrap gap-1 mb-4">
                  {selectedConsultant.expertise.map((exp, idx) => (
                    <Badge key={idx} variant="secondary">
                      {exp}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    <a
                      href={`mailto:${selectedConsultant.email}`}
                      className="hover:text-primary"
                    >
                      {selectedConsultant.email}
                    </a>
                  </div>
                  {selectedConsultant.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      <span>{selectedConsultant.phone}</span>
                    </div>
                  )}
                  {selectedConsultant.linkedIn && (
                    <div className="flex items-center gap-1">
                      <Linkedin className="w-4 h-4" />
                      <a
                        href={`https://${selectedConsultant.linkedIn}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary"
                      >
                        LinkedIn
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">{selectedConsultant.rating?.toFixed(1) || "N/A"}</span>
                    <span className="text-gray-500">평점</span>
                  </div>
                  <div className="text-gray-600">
                    <span className="font-semibold">{selectedConsultant.sessionsCompleted}</span>건 세션 완료
                  </div>
                  <div className="text-gray-600">
                    {formatDate(selectedConsultant.joinedDate)} 합류
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="mt-6">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">개요</TabsTrigger>
                <TabsTrigger value="education" className="flex-1">학력 및 자격</TabsTrigger>
                <TabsTrigger value="publications" className="flex-1">저서 및 논문</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6 space-y-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Award className="w-5 h-5 text-primary" />
                    전문 분야
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {selectedConsultant.detailedBio || selectedConsultant.bio}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-primary">
                        {selectedConsultant.sessionsCompleted}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">완료 세션</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-primary">
                        {selectedConsultant.rating?.toFixed(1) || "N/A"}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">평균 평점</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-primary">
                        {selectedConsultant.expertise.length}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">전문 영역</div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="education" className="mt-6 space-y-6">
                {selectedConsultant.education && selectedConsultant.education.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <GraduationCap className="w-5 h-5 text-primary" />
                      학력
                    </h3>
                    <ul className="space-y-2">
                      {selectedConsultant.education.map((edu, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-gray-700 pl-4 border-l-2 border-gray-200"
                        >
                          {edu}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedConsultant.certifications && selectedConsultant.certifications.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Award className="w-5 h-5 text-primary" />
                      자격 및 인증
                    </h3>
                    <ul className="space-y-2">
                      {selectedConsultant.certifications.map((cert, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-gray-700 pl-4 border-l-2 border-gray-200"
                        >
                          {cert}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="publications" className="mt-6">
                {selectedConsultant.publications && selectedConsultant.publications.length > 0 ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      주요 저서 및 논문
                    </h3>
                    <ul className="space-y-3">
                      {selectedConsultant.publications.map((pub, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-gray-700 p-3 bg-gray-50 rounded-lg"
                        >
                          {pub}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    등록된 저서 및 논문이 없습니다
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-6 pt-6 border-t">
              <Button className="w-full" size="lg">
                <Calendar className="w-4 h-4 mr-2" />
                오피스아워 신청하기
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
