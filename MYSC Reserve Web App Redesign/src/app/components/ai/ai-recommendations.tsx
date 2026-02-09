import { useState } from "react";
import { AIRecommendation, User, Consultant } from "../../lib/types";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Separator } from "../ui/separator";
import {
  Sparkles, UserCheck, BookOpen, Clock, Lightbulb,
  TrendingUp, Target, Calendar, ChevronRight, X, Check,
  Brain, Zap, Award, Users
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../ui/utils";

interface AIRecommendationsProps {
  currentUser: User;
  recommendations: AIRecommendation[];
  consultants?: Consultant[];
  onApply: (recommendationId: string) => void;
  onDismiss: (recommendationId: string) => void;
}

const recommendationIcons = {
  consultant: { icon: UserCheck, color: "text-blue-600", bg: "bg-blue-50" },
  topic: { icon: BookOpen, color: "text-purple-600", bg: "bg-purple-50" },
  timing: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  content: { icon: Lightbulb, color: "text-emerald-600", bg: "bg-emerald-50" },
  partnership: { icon: Users, color: "text-indigo-600", bg: "bg-indigo-50" },
};

export function AIRecommendations({
  currentUser,
  recommendations,
  consultants = [],
  onApply,
  onDismiss,
}: AIRecommendationsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedRecommendations = [...recommendations]
    .filter(r => !r.isApplied)
    .sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-[#5DADE2] to-[#0A2540] rounded-xl">
              <Brain className="size-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#0A2540]">AI 추천</h1>
              <p className="text-slate-600">데이터 기반 맞춤형 성장 전략</p>
            </div>
          </div>
          <Badge className="bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0">
            <Sparkles className="size-3 mr-1" />
            {sortedRecommendations.length}개의 새로운 추천
          </Badge>
        </motion.div>

        {/* AI 인사이트 요약 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8"
        >
          <Card className="p-6 bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white rounded-lg shadow-sm">
                <Zap className="size-6 text-violet-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-[#0A2540] mb-2">이번 주 핵심 인사이트</h3>
                <p className="text-sm text-slate-700 mb-3">
                  {currentUser.companyName}님의 최근 활동과 성장 패턴을 분석한 결과, 
                  다음 분기에 마케팅 및 고객 확보 전략에 집중하시면 
                  <span className="font-semibold text-[#5DADE2]"> 매출 30% 증가</span>를 기대할 수 있습니다.
                </p>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs">
                    <TrendingUp className="size-3 mr-1" />
                    성장 가능성 높음
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Target className="size-3 mr-1" />
                    정확도 87%
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* 추천 목록 */}
        <div className="grid md:grid-cols-2 gap-6">
          <AnimatePresence>
            {sortedRecommendations.map((recommendation, index) => {
              const iconConfig = recommendationIcons[recommendation.type];
              const Icon = iconConfig.icon;
              const isExpanded = expandedId === recommendation.id;

              return (
                <motion.div
                  key={recommendation.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card className="p-6 hover:shadow-xl transition-all duration-300 group relative overflow-hidden">
                    {/* 신뢰도 배지 */}
                    <div className="absolute top-4 right-4">
                      <Badge
                        className={cn(
                          "text-xs font-semibold",
                          recommendation.confidence >= 80
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : recommendation.confidence >= 60
                            ? "bg-blue-100 text-blue-700 border-blue-200"
                            : "bg-amber-100 text-amber-700 border-amber-200"
                        )}
                      >
                        {recommendation.confidence}% 일치
                      </Badge>
                    </div>

                    {/* 아이콘 & 제목 */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className={cn("p-3 rounded-xl", iconConfig.bg)}>
                        <Icon className={cn("size-6", iconConfig.color)} />
                      </div>
                      <div className="flex-1 pr-20">
                        <h3 className="font-semibold text-[#0A2540] mb-1 group-hover:text-[#5DADE2] transition-colors">
                          {recommendation.title}
                        </h3>
                        <p className="text-sm text-slate-600 line-clamp-2">
                          {recommendation.description}
                        </p>
                      </div>
                    </div>

                    {/* 신뢰도 바 */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-slate-600">AI 신뢰도</span>
                        <span className="font-semibold text-[#5DADE2]">
                          {recommendation.confidence}%
                        </span>
                      </div>
                      <Progress value={recommendation.confidence} className="h-2" />
                    </div>

                    <Separator className="my-4" />

                    {/* 추천 이유 */}
                    <div className="mb-4">
                      <p className="text-sm text-slate-700 leading-relaxed">
                        <span className="font-medium text-[#0A2540]">추천 이유:</span>{" "}
                        {recommendation.reason}
                      </p>
                    </div>

                    {/* 상세 정보 (확장) */}
                    <AnimatePresence>
                      {isExpanded && recommendation.relatedData && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mb-4 p-4 bg-slate-50 rounded-lg"
                        >
                          {recommendation.type === "consultant" && recommendation.relatedData.consultantId && (
                            <div>
                              {(() => {
                                const consultant = consultants.find(
                                  c => c.id === recommendation.relatedData.consultantId
                                );
                                return consultant ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5DADE2] to-[#0A2540] flex items-center justify-center text-white font-semibold">
                                        {consultant.name.charAt(0)}
                                      </div>
                                      <div>
                                        <h4 className="font-semibold text-[#0A2540]">{consultant.name}</h4>
                                        <p className="text-xs text-slate-600">{consultant.title}</p>
                                      </div>
                                    </div>
                                    <p className="text-sm text-slate-700">{consultant.bio}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {consultant.expertise.slice(0, 3).map((exp) => (
                                        <Badge key={exp} variant="outline" className="text-xs">
                                          {exp}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          )}

                          {recommendation.type === "topic" && (
                            <div className="space-y-2">
                              <h4 className="font-semibold text-[#0A2540] text-sm">예상 효과</h4>
                              <ul className="text-sm text-slate-700 space-y-1">
                                <li className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#5DADE2]" />
                                  매출 증대 가능성: 25-40%
                                </li>
                                <li className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#5DADE2]" />
                                  고객 만족도 향상 예상
                                </li>
                                <li className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#5DADE2]" />
                                  시장 경쟁력 강화
                                </li>
                              </ul>
                            </div>
                          )}

                          {recommendation.type === "timing" && (
                            <div className="space-y-2">
                              <h4 className="font-semibold text-[#0A2540] text-sm">최적 시기</h4>
                              <div className="flex items-center gap-2 text-sm text-slate-700">
                                <Calendar className="size-4 text-[#5DADE2]" />
                                <span>다음 주 화요일, 오전 10시</span>
                              </div>
                              <p className="text-xs text-slate-600">
                                이 시간대에 신청하면 더 빠른 승인이 가능합니다.
                              </p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* 액션 버튼 */}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => onApply(recommendation.id)}
                        className="flex-1 bg-[#5DADE2] hover:bg-[#5DADE2]/90 gap-2"
                      >
                        <Check className="size-4" />
                        적용하기
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : recommendation.id)
                        }
                      >
                        {isExpanded ? "접기" : "상세"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => onDismiss(recommendation.id)}
                        className="text-slate-500 hover:text-red-600"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* 빈 상태 */}
        {sortedRecommendations.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="size-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              모든 추천을 확인했습니다!
            </h3>
            <p className="text-slate-500">
              새로운 추천이 생기면 알려드리겠습니다.
            </p>
          </motion.div>
        )}

        {/* 하단 정보 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 p-6 bg-white rounded-xl border border-slate-200"
        >
          <div className="flex items-start gap-4">
            <Sparkles className="size-5 text-[#5DADE2] flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-[#0A2540] mb-2">AI 추천 시스템 정보</h4>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                이 추천은 {currentUser.companyName}님의 활동 패턴, 성장 데이터, 업계 트렌드를 
                종합적으로 분석하여 생성되었습니다. 추천을 적용하면 더 정확한 맞춤형 제안을 받으실 수 있습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  <Brain className="size-3 mr-1" />
                  머신러닝 기반
                </Badge>
                <Badge variant="outline" className="text-xs">
                  실시간 업데이트
                </Badge>
                <Badge variant="outline" className="text-xs">
                  개인정보 보호
                </Badge>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
