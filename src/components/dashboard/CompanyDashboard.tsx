import { useCompanyInfoForm } from "../../hooks/useCompanyInfoForm"

type CompanyDashboardProps = {
  onLogout: () => void
  companyId: string
}

export function CompanyDashboard({
  onLogout,
  companyId,
}: CompanyDashboardProps) {
  const {
    form,
    setForm,
    investmentRows,
    addInvestmentRow,
    removeInvestmentRow,
    updateInvestmentRow,
    loading,
    saveStatus,
    canSubmit,
    formatNumberInput,
    formatBusinessNumber,
    markTouched,
    isFieldInvalid,
    formatPhoneNumber,
    saveCompanyInfo,
  } = useCompanyInfoForm(companyId)

  function inputClass(invalid?: boolean, extra?: string) {
    return [
      "mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-700 focus:outline-none",
      invalid ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-slate-400",
      extra,
    ]
      .filter(Boolean)
      .join(" ")
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          Company Dashboard
        </h1>
        <button
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          onClick={onLogout}
        >
          로그아웃
        </button>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            기업 정보와 자가 진단표를 완료해야 다음 단계로 진행할 수
            있습니다.
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-700">
              진행 단계
            </div>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-700">
                  Step 1. 기업 정보
                </div>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                  미완료
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-700">
                  Step 2. 자가 진단표
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                  잠금
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
            필수 입력 항목을 완료하면 Step 2가 열립니다.
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900">
                Step 1. 기업 정보
              </div>

            </div>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              필수 입력
            </span>
          </div>

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
              기존 데이터를 불러오는 중입니다.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <section>
                <div className="text-sm font-semibold text-slate-700">
                  기본 정보
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500">
                  기업정보
                  <input
                      className={inputClass(isFieldInvalid("companyInfo"))}
                      placeholder="회사명, 법인/개인 구분 등"
                      value={form.companyInfo}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          companyInfo: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("companyInfo")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  대표자 성명
                  <input
                      className={inputClass(isFieldInvalid("ceoName"))}
                      placeholder="홍길동"
                      value={form.ceoName}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          ceoName: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("ceoName")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  대표자 이메일
                  <input
                      className={inputClass(isFieldInvalid("ceoEmail"))}
                      placeholder="ceo@company.com"
                      value={form.ceoEmail}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          ceoEmail: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("ceoEmail")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  대표자 전화번호
                  <input
                      className={inputClass(isFieldInvalid("ceoPhone"))}
                      placeholder="010-0000-0000"
                      value={form.ceoPhone}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          ceoPhone: formatPhoneNumber(e.target.value),
                        }))
                      }
                      onBlur={() => markTouched("ceoPhone")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  법인 설립일자
                  <input
                      type="date"
                      className={inputClass(isFieldInvalid("foundedAt"))}
                      value={form.foundedAt}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          foundedAt: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("foundedAt")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  사업자등록번호
                  <input
                      className={inputClass(isFieldInvalid("businessNumber"))}
                      placeholder="000-00-00000"
                      value={form.businessNumber}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          businessNumber: formatBusinessNumber(
                            e.target.value
                          ),
                        }))
                      }
                      onBlur={() => markTouched("businessNumber")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  주업태
                  <input
                      className={inputClass(isFieldInvalid("primaryBusiness"))}
                      placeholder="예: 정보통신업"
                      value={form.primaryBusiness}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          primaryBusiness: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("primaryBusiness")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  주업종
                  <input
                      className={inputClass(isFieldInvalid("primaryIndustry"))}
                      placeholder="예: 소프트웨어 개발"
                      value={form.primaryIndustry}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          primaryIndustry: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("primaryIndustry")}
                  />
                </label>
                </div>
              </section>

              <section>
                <div className="text-sm font-semibold text-slate-700">
                  소재지
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500">
                  본점 소재지
                  <input
                      className={inputClass(isFieldInvalid("headOffice"))}
                      placeholder="서울시 강남구 ..."
                      value={form.headOffice}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          headOffice: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("headOffice")}
                  />
                </label>
                  <label className="text-xs text-slate-500">
                    지점 또는 연구소 소재지
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      placeholder="없으면 '없음' 입력"
                      value={form.branchOffice}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          branchOffice: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </section>

              <section>
                <div className="text-sm font-semibold text-slate-700">
                  인력 및 재무
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500">
                  종업원수 (정규)
                  <input
                      className={inputClass(isFieldInvalid("workforceFullTime"))}
                      placeholder="0"
                      value={form.workforceFullTime}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          workforceFullTime: formatNumberInput(
                            e.target.value
                          ),
                        }))
                      }
                      onBlur={() => markTouched("workforceFullTime")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  종업원수 (계약)
                  <input
                      className={inputClass(isFieldInvalid("workforceContract"))}
                      placeholder="0"
                      value={form.workforceContract}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          workforceContract: formatNumberInput(
                            e.target.value
                          ),
                        }))
                      }
                      onBlur={() => markTouched("workforceContract")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  매출액 (2025년)
                  <input
                      className={inputClass(isFieldInvalid("revenue2025"))}
                      placeholder="예: 12.5억"
                      value={form.revenue2025}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          revenue2025: formatNumberInput(e.target.value),
                        }))
                      }
                      onBlur={() => markTouched("revenue2025")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  매출액 (2026년)
                  <input
                      className={inputClass(isFieldInvalid("revenue2026"))}
                      placeholder="예: 18.0억"
                      value={form.revenue2026}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          revenue2026: formatNumberInput(e.target.value),
                        }))
                      }
                      onBlur={() => markTouched("revenue2026")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  자본총계 (원)
                  <input
                      className={inputClass(isFieldInvalid("capitalTotal"))}
                      placeholder="예: 300,000,000"
                      value={form.capitalTotal}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          capitalTotal: formatNumberInput(e.target.value),
                        }))
                      }
                      onBlur={() => markTouched("capitalTotal")}
                  />
                </label>
                </div>
              </section>

              <section>
                <div className="text-sm font-semibold text-slate-700">
                  인증 및 이력
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500">
                  인증/지정 여부
                  <input
                      className={inputClass(isFieldInvalid("certification"))}
                      placeholder="예: 벤처기업 인증"
                      value={form.certification}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          certification: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("certification")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  TIPS/LIPS 이력
                  <input
                      className={inputClass(isFieldInvalid("tipsLipsHistory"))}
                      placeholder="예: TIPS 2024 선정"
                      value={form.tipsLipsHistory}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          tipsLipsHistory: e.target.value,
                        }))
                      }
                      onBlur={() => markTouched("tipsLipsHistory")}
                  />
                </label>
                </div>
              </section>

              <section>
                <div className="text-sm font-semibold text-slate-700">
                  투자이력 (순서별 작성)
                </div>
                <div className="mt-3 space-y-3">
                  {investmentRows.map((row, idx) => (
                    <div
                      key={`investment-${idx}`}
                      className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                    >
                      <label className="text-xs text-slate-500">
                        <span className="block whitespace-nowrap">
                          투자단계
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          placeholder="Seed/Series A"
                          value={row.stage}
                          onChange={(e) =>
                            updateInvestmentRow(idx, "stage", e.target.value)
                          }
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        <span className="block whitespace-nowrap">
                          투자일시
                        </span>
                        <input
                          type="date"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          value={row.date}
                          onChange={(e) =>
                            updateInvestmentRow(idx, "date", e.target.value)
                          }
                        />
                      </label>

                      <label className="text-xs text-slate-500">
                        <span className="block whitespace-nowrap">
                          투자금액 (억)
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          placeholder="예: 25"
                          value={row.postMoney}
                          onChange={(e) =>
                            updateInvestmentRow(
                              idx,
                              "postMoney",
                              formatNumberInput(e.target.value)
                            )
                          }
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        <span className="block whitespace-nowrap">
                          주요주주명
                        </span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          placeholder="투자사/주주명"
                          value={row.majorShareholder}
                          onChange={(e) =>
                            updateInvestmentRow(
                              idx,
                              "majorShareholder",
                              e.target.value
                            )
                          }
                        />
                      </label>
                      <div className="flex items-end justify-end sm:col-span-2 lg:col-span-1">
                        <button
                          type="button"
                          className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => removeInvestmentRow(idx)}
                          disabled={investmentRows.length <= 1}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={addInvestmentRow}
                  >
                    + 투자이력 추가
                  </button>
                </div>
              </section>

              <section>
                <div className="text-sm font-semibold text-slate-700">
                  투자 희망
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-500">
                  2026년 내 희망 투자액
                  <input
                      className={inputClass(
                        isFieldInvalid("desiredInvestment2026")
                      )}
                      placeholder="예: 20억"
                      value={form.desiredInvestment2026}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          desiredInvestment2026: formatNumberInput(
                            e.target.value
                          ),
                        }))
                      }
                      onBlur={() => markTouched("desiredInvestment2026")}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  투자전 희망기업가치 (Pre-Value)
                  <input
                      className={inputClass(isFieldInvalid("desiredPreValue"))}
                      placeholder="예: 200억"
                      value={form.desiredPreValue}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          desiredPreValue: formatNumberInput(
                            e.target.value
                          ),
                        }))
                      }
                      onBlur={() => markTouched("desiredPreValue")}
                  />
                </label>
                </div>
              </section>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={saveCompanyInfo}
              disabled={!canSubmit}
            >
              임시 저장
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={saveCompanyInfo}
              disabled={!canSubmit}
            >
              제출
            </button>
            <div className="text-xs text-rose-600">
              필수 항목 누락 시 제출할 수 없습니다.
              {saveStatus ? ` · ${saveStatus}` : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
