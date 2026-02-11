import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Consultant } from "../../lib/types";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

export type ConsultantProfileFormValues = {
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

interface ConsultantProfilePageProps {
  consultant: Consultant | null;
  defaultEmail?: string | null;
  saving?: boolean;
  onSubmit: (values: ConsultantProfileFormValues) => Promise<void> | void;
}

function buildInitialValues(
  consultant: Consultant | null,
  defaultEmail?: string | null
): ConsultantProfileFormValues {
  return {
    name: consultant?.name ?? "",
    organization: consultant?.organization ?? "",
    email: consultant?.email ?? defaultEmail ?? "",
    phone: consultant?.phone ?? "",
    secondaryEmail: consultant?.secondaryEmail ?? "",
    secondaryPhone: consultant?.secondaryPhone ?? "",
    fixedMeetingLink: consultant?.fixedMeetingLink ?? "",
    expertise: consultant?.expertise?.join(", ") ?? "",
    bio: consultant?.bio ?? "",
  };
}

export function ConsultantProfilePage({
  consultant,
  defaultEmail,
  saving = false,
  onSubmit,
}: ConsultantProfilePageProps) {
  const [formValues, setFormValues] = useState<ConsultantProfileFormValues>(() =>
    buildInitialValues(consultant, defaultEmail)
  );

  const initialValues = useMemo(
    () => buildInitialValues(consultant, defaultEmail),
    [consultant, defaultEmail]
  );

  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  const isInvalid =
    !formValues.name.trim() ||
    !formValues.email.trim() ||
    !formValues.bio.trim();

  function updateField<K extends keyof ConsultantProfileFormValues>(
    key: K,
    value: ConsultantProfileFormValues[K]
  ) {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isInvalid) return;
    await onSubmit(formValues);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>내 정보 입력</CardTitle>
          <CardDescription>
            관리자 계정 생성 시 사용하는 필드와 동일합니다. 저장하면 내 프로필에 반영됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block" htmlFor="consultant-name">
                컨설턴트명
              </Label>
              <Input
                id="consultant-name"
                value={formValues.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="홍길동"
                required
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-organization">
                소속
              </Label>
              <Input
                id="consultant-organization"
                value={formValues.organization}
                onChange={(event) => updateField("organization", event.target.value)}
                placeholder="MYSC"
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-email">
                이메일
              </Label>
              <Input
                id="consultant-email"
                type="email"
                value={formValues.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-phone">
                전화번호
              </Label>
              <Input
                id="consultant-phone"
                value={formValues.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="010-0000-0000"
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-secondary-email">
                보조 이메일
              </Label>
              <Input
                id="consultant-secondary-email"
                type="email"
                value={formValues.secondaryEmail}
                onChange={(event) => updateField("secondaryEmail", event.target.value)}
              />
            </div>

            <div>
              <Label className="mb-2 block" htmlFor="consultant-secondary-phone">
                보조 전화번호
              </Label>
              <Input
                id="consultant-secondary-phone"
                value={formValues.secondaryPhone}
                onChange={(event) => updateField("secondaryPhone", event.target.value)}
                placeholder="010-0000-0000"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-2 block" htmlFor="consultant-meeting-link">
                고정 화상회의 링크
              </Label>
              <Input
                id="consultant-meeting-link"
                value={formValues.fixedMeetingLink}
                onChange={(event) => updateField("fixedMeetingLink", event.target.value)}
                placeholder="https://zoom.us/j/..."
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-2 block" htmlFor="consultant-expertise">
                전문 분야 (쉼표 구분)
              </Label>
              <Input
                id="consultant-expertise"
                value={formValues.expertise}
                onChange={(event) => updateField("expertise", event.target.value)}
                placeholder="예: 투자유치, 임팩트측정, BM"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-2 block" htmlFor="consultant-bio">
                메모
              </Label>
              <Textarea
                id="consultant-bio"
                rows={4}
                value={formValues.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="컨설팅 소개 및 메모"
                required
              />
            </div>

            <div className="col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormValues(initialValues)}
                disabled={saving}
              >
                초기화
              </Button>
              <Button type="submit" disabled={saving || isInvalid}>
                {saving ? "저장 중..." : "정보 저장"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
