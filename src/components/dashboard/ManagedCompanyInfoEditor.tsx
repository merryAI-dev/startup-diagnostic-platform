import { CompanyInfoEditorPanel } from "@/components/dashboard/CompanyInfoEditorPanel"
import {
  useCompanyInfoForm,
  type CompanyInfoPersistPayload,
} from "@/hooks/useCompanyInfoForm"
import { saveManagedCompanyInfoViaFunction } from "@/redesign/app/lib/functions"
import { toast } from "sonner"
import { useState } from "react"

type ManagedCompanyInfoEditorProps = {
  companyId: string
  companyName: string
  programNames: string[]
  embedded?: boolean
  onRequestClose?: () => void
}

export function ManagedCompanyInfoEditor({
  companyId,
  companyName,
  programNames,
  embedded = false,
  onRequestClose,
}: ManagedCompanyInfoEditorProps) {
  const [savingAction, setSavingAction] = useState<"draft" | "final" | null>(null)
  const persistCompanyInfo = async ({
    companyId: targetCompanyId,
    companyInfo,
    saveType,
  }: CompanyInfoPersistPayload) => {
    await saveManagedCompanyInfoViaFunction({
      companyId: targetCompanyId,
      companyInfo,
      saveType,
    })
  }

  const {
    form,
    setForm,
    investmentRows,
    addInvestmentRow,
    removeInvestmentRow,
    updateInvestmentRow,
    loading,
    saving,
    saveStatus,
    canSubmit,
    markTouched,
    isFieldInvalid,
    isFieldValid,
    saveCompanyInfo,
    saveCompanyInfoDraft,
  } = useCompanyInfoForm(companyId, {
    allowProgramEditing: false,
    persistCompanyInfo,
  })

  const handleSaveDraft = async () => {
    setSavingAction("draft")
    try {
      const ok = await saveCompanyInfoDraft()
      if (!ok) return
      toast.success("임시저장되었습니다")
      onRequestClose?.()
    } finally {
      setSavingAction(null)
    }
  }

  const handleSave = async () => {
    setSavingAction("final")
    try {
      await saveCompanyInfo()
    } finally {
      setSavingAction(null)
    }
  }

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-col bg-white"
          : "rounded-2xl border border-slate-200 bg-white"
      }
    >
      <div className={embedded ? "border-b border-slate-100 px-6 py-4" : "border-b border-slate-100 px-5 py-4"}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">{companyName} 정보 수정</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {programNames.map((programName) => (
              <span
                key={programName}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {programName}
              </span>
            ))}
          </div>
        </div>
        {saveStatus ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {saveStatus}
          </div>
        ) : null}
      </div>

      <div className={embedded ? "flex min-h-0 flex-1 flex-col bg-[#f8fafc]" : "min-h-0 bg-[#f8fafc]"}>
        {loading ? (
          <div className="p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              기업 정보를 불러오는 중입니다.
            </div>
          </div>
        ) : (
          <div className={embedded ? "flex min-h-0 flex-1 flex-col" : undefined}>
            <CompanyInfoEditorPanel
              form={form}
              setForm={setForm}
              investmentRows={investmentRows}
              addInvestmentRow={addInvestmentRow}
              removeInvestmentRow={removeInvestmentRow}
            updateInvestmentRow={updateInvestmentRow}
            saving={saving}
            savingAction={savingAction}
            canSubmit={canSubmit}
            showSaveActions
            showPrograms={false}
            onSaveDraft={handleSaveDraft}
            onSave={handleSave}
            isFieldInvalid={isFieldInvalid}
            isFieldValid={isFieldValid}
            markTouched={markTouched}
            />
          </div>
        )}
      </div>
    </div>
  )
}
