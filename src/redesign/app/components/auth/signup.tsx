import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/redesign/app/components/ui/card";
import { Label } from "@/redesign/app/components/ui/label";
import { Input } from "@/redesign/app/components/ui/input";
import { Button } from "@/redesign/app/components/ui/button";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import type { CompanyInfoForm } from "@/redesign/types/company";
import { DEFAULT_FORM } from "@/redesign/types/company";

interface SignupProps {
  onSignup: (payload: SignupPayload) => void;
  onNavigateToLogin: () => void;
}

type SignupRole = "company" | "consultant";
type SignupStep = "info" | "account";

type ConsultantSignupInfo = {
  name: string;
  organization: string;
  email: string;
  phone: string;
  secondaryEmail: string;
  secondaryPhone: string;
  fixedMeetingLink: string;
  expertise: string;
  bio: string;
};

type SignupPayload =
  | {
      role: "company";
      email: string;
      password: string;
      programName: string;
      companyInfo: CompanyInfoForm;
    }
  | {
      role: "consultant";
      email: string;
      password: string;
      consultantInfo: ConsultantSignupInfo;
    };

const defaultConsultantInfo: ConsultantSignupInfo = {
  name: "",
  organization: "",
  email: "",
  phone: "",
  secondaryEmail: "",
  secondaryPhone: "",
  fixedMeetingLink: "",
  expertise: "",
  bio: "",
};

export function Signup({ onSignup, onNavigateToLogin }: SignupProps) {
  const [role, setRole] = useState<SignupRole>("company");
  const [step, setStep] = useState<SignupStep>("info");
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoForm>(DEFAULT_FORM);
  const [programName, setProgramName] = useState("MYSC EMA");
  const [consultantInfo, setConsultantInfo] = useState<ConsultantSignupInfo>(defaultConsultantInfo);
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");

  const companyInfoValid =
    companyInfo.companyInfo.trim().length > 0
    && companyInfo.ceoName.trim().length > 0
    && companyInfo.ceoEmail.trim().length > 0;
  const consultantInfoValid =
    consultantInfo.name.trim().length > 0
    && consultantInfo.email.trim().length > 0
    && consultantInfo.bio.trim().length > 0;
  const canProceedInfo = role === "company" ? companyInfoValid : consultantInfoValid;
  const canSubmit = accountEmail.trim().length > 0 && password.length >= 8;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (role === "company") {
      onSignup({
        role: "company",
        email: accountEmail.trim(),
        password,
        programName: programName.trim(),
        companyInfo,
      });
      return;
    }
    onSignup({
      role: "consultant",
      email: accountEmail.trim(),
      password,
      consultantInfo,
    });
  };

  const title = useMemo(() => (
    role === "company" ? "기업 회원가입" : "컨설턴트 회원가입"
  ), [role]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            회원가입 전에 기본 정보를 먼저 입력하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Button
              type="button"
              variant={role === "company" ? "default" : "outline"}
              onClick={() => {
                setRole("company");
                setStep("info");
              }}
            >
              기업 회원
            </Button>
            <Button
              type="button"
              variant={role === "consultant" ? "default" : "outline"}
              onClick={() => {
                setRole("consultant");
                setStep("info");
              }}
            >
              컨설턴트
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === "info" && role === "company" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="companyInfo">기업명</Label>
                  <Input
                    id="companyInfo"
                    placeholder="예: 임팩트스타트업"
                    value={companyInfo.companyInfo}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, companyInfo: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ceoName">대표자 성명</Label>
                  <Input
                    id="ceoName"
                    value={companyInfo.ceoName}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, ceoName: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ceoEmail">대표자 이메일</Label>
                  <Input
                    id="ceoEmail"
                    type="email"
                    value={companyInfo.ceoEmail}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, ceoEmail: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ceoPhone">대표자 전화번호</Label>
                  <Input
                    id="ceoPhone"
                    value={companyInfo.ceoPhone}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, ceoPhone: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="businessNumber">사업자등록번호</Label>
                  <Input
                    id="businessNumber"
                    value={companyInfo.businessNumber}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, businessNumber: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="primaryBusiness">주업태</Label>
                  <Input
                    id="primaryBusiness"
                    value={companyInfo.primaryBusiness}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, primaryBusiness: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="primaryIndustry">주업종</Label>
                  <Input
                    id="primaryIndustry"
                    value={companyInfo.primaryIndustry}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, primaryIndustry: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="headOffice">본점 소재지</Label>
                  <Input
                    id="headOffice"
                    value={companyInfo.headOffice}
                    onChange={(e) =>
                      setCompanyInfo((prev) => ({ ...prev, headOffice: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="programName">프로그램</Label>
                  <Input
                    id="programName"
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {step === "info" && role === "consultant" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="consultant-name">컨설턴트명</Label>
                  <Input
                    id="consultant-name"
                    value={consultantInfo.name}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="consultant-organization">소속</Label>
                  <Input
                    id="consultant-organization"
                    value={consultantInfo.organization}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, organization: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="consultant-email">이메일</Label>
                  <Input
                    id="consultant-email"
                    type="email"
                    value={consultantInfo.email}
                    onChange={(e) => {
                      const next = e.target.value;
                      setConsultantInfo((prev) => ({ ...prev, email: next }));
                      if (!accountEmail) {
                        setAccountEmail(next);
                      }
                    }}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="consultant-phone">전화번호</Label>
                  <Input
                    id="consultant-phone"
                    value={consultantInfo.phone}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, phone: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="consultant-secondary-email">보조 이메일</Label>
                  <Input
                    id="consultant-secondary-email"
                    type="email"
                    value={consultantInfo.secondaryEmail}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, secondaryEmail: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="consultant-secondary-phone">보조 전화번호</Label>
                  <Input
                    id="consultant-secondary-phone"
                    value={consultantInfo.secondaryPhone}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, secondaryPhone: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="consultant-meeting-link">고정 화상회의 링크</Label>
                  <Input
                    id="consultant-meeting-link"
                    value={consultantInfo.fixedMeetingLink}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, fixedMeetingLink: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="consultant-expertise">전문 분야 (쉼표 구분)</Label>
                  <Input
                    id="consultant-expertise"
                    value={consultantInfo.expertise}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, expertise: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="consultant-bio">메모</Label>
                  <Textarea
                    id="consultant-bio"
                    rows={3}
                    value={consultantInfo.bio}
                    onChange={(e) =>
                      setConsultantInfo((prev) => ({ ...prev, bio: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
            )}

            {step === "account" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="account-email">계정 이메일</Label>
                  <Input
                    id="account-email"
                    type="email"
                    placeholder="account@example.com"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="password">비밀번호</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="8자 이상"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(step === "info" ? "info" : "info")}
                disabled={step === "info"}
              >
                이전
              </Button>
              {step === "info" ? (
                <Button
                  type="button"
                  onClick={() => setStep("account")}
                  disabled={!canProceedInfo}
                >
                  다음
                </Button>
              ) : (
                <Button type="submit" disabled={!canSubmit}>
                  회원가입
                </Button>
              )}
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="text-sm text-primary hover:underline"
              >
                이미 계정이 있으신가요? 로그인
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
