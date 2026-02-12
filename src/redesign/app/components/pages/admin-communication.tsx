import { useState } from "react";
import { Plus, Send, Edit, Trash2, Copy, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/redesign/app/components/ui/button";
import { Input } from "@/redesign/app/components/ui/input";
import { Label } from "@/redesign/app/components/ui/label";
import { Textarea } from "@/redesign/app/components/ui/textarea";
import { Badge } from "@/redesign/app/components/ui/badge";
import { MessageTemplate, Application } from "@/redesign/app/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/redesign/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/redesign/app/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/redesign/app/components/ui/tabs";
import { Checkbox } from "@/redesign/app/components/ui/checkbox";
import { toast } from "sonner";

interface AdminCommunicationProps {
  templates: MessageTemplate[];
  applications: Application[];
  onAddTemplate: (data: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">) => void;
  onUpdateTemplate: (id: string, data: Partial<MessageTemplate>) => void;
  onDeleteTemplate: (id: string) => void;
  onSendBulkMessage: (applicationIds: string[], templateId: string) => void;
}

export function AdminCommunication({
  templates,
  applications,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onSendBulkMessage,
}: AdminCommunicationProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBulkSendDialogOpen, setIsBulkSendDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);

  const handleCreateTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const newTemplate: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt"> = {
      title: formData.get("title") as string,
      category: formData.get("category") as MessageTemplate["category"],
      subject: formData.get("subject") as string,
      content: formData.get("content") as string,
      variables: (formData.get("variables") as string)
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v),
    };

    onAddTemplate(newTemplate);
    setIsCreateDialogOpen(false);
    toast.success("템플릿이 생성되었습니다");
  };

  const handleUpdateTemplate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    const formData = new FormData(e.currentTarget);

    onUpdateTemplate(selectedTemplate.id, {
      title: formData.get("title") as string,
      category: formData.get("category") as MessageTemplate["category"],
      subject: formData.get("subject") as string,
      content: formData.get("content") as string,
      variables: (formData.get("variables") as string)
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v),
    });

    setIsEditDialogOpen(false);
    toast.success("템플릿이 수정되었습니다");
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm("정말 이 템플릿을 삭제하시겠습니까?")) {
      onDeleteTemplate(id);
      toast.success("템플릿이 삭제되었습니다");
    }
  };

  const handleDuplicateTemplate = (template: MessageTemplate) => {
    onAddTemplate({
      title: `${template.title} (복사본)`,
      category: template.category,
      subject: template.subject,
      content: template.content,
      variables: template.variables,
    });
    toast.success("템플릿이 복사되었습니다");
  };

  const handleBulkSend = () => {
    if (selectedApplicationIds.length === 0) {
      toast.error("메시지를 보낼 신청을 선택해주세요");
      return;
    }
    if (!selectedTemplateId) {
      toast.error("사용할 템플릿을 선택해주세요");
      return;
    }

    onSendBulkMessage(selectedApplicationIds, selectedTemplateId);
    setIsBulkSendDialogOpen(false);
    setSelectedApplicationIds([]);
    setSelectedTemplateId("");
    toast.success(`${selectedApplicationIds.length}건의 메시지가 전송되었습니다`);
  };

  const toggleApplicationSelection = (id: string) => {
    setSelectedApplicationIds((prev) =>
      prev.includes(id) ? prev.filter((appId) => appId !== id) : [...prev, id]
    );
  };

  const getCategoryBadgeColor = (category: MessageTemplate["category"]) => {
    switch (category) {
      case "confirmation":
        return "bg-blue-100 text-blue-700";
      case "review":
        return "bg-yellow-100 text-yellow-700";
      case "reminder":
        return "bg-purple-100 text-purple-700";
      case "followup":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getCategoryLabel = (category: MessageTemplate["category"]) => {
    switch (category) {
      case "confirmation":
        return "확인";
      case "review":
        return "검토";
      case "reminder":
        return "리마인더";
      case "followup":
        return "팔로우업";
      default:
        return "일반";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">커뮤니케이션 센터</h1>
            <p className="text-sm text-muted-foreground mt-1">
              메시지 템플릿을 관리하고 일괄 메시지를 전송합니다
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">전체 템플릿</div>
          <div className="text-2xl font-bold">{templates.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">확인 템플릿</div>
          <div className="text-2xl font-bold text-blue-600">
            {templates.filter((t) => t.category === "confirmation").length}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">리마인더 템플릿</div>
          <div className="text-2xl font-bold text-purple-600">
            {templates.filter((t) => t.category === "reminder").length}
          </div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">팔로우업 템플릿</div>
          <div className="text-2xl font-bold text-green-600">
            {templates.filter((t) => t.category === "followup").length}
          </div>
        </div>
      </div>

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates">템플릿 관리</TabsTrigger>
          <TabsTrigger value="bulk">일괄 메시지 전송</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  새 템플릿
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>새 메시지 템플릿</DialogTitle>
                  <DialogDescription>
                    재사용 가능한 메시지 템플릿을 생성합니다
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateTemplate} className="space-y-4">
                  <div>
                    <Label htmlFor="title">템플릿 제목</Label>
                    <Input id="title" name="title" required />
                  </div>
                  <div>
                    <Label htmlFor="category">카테고리</Label>
                    <Select name="category" required>
                      <SelectTrigger>
                        <SelectValue placeholder="카테고리 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmation">확인</SelectItem>
                        <SelectItem value="review">검토</SelectItem>
                        <SelectItem value="reminder">리마인더</SelectItem>
                        <SelectItem value="followup">팔로우업</SelectItem>
                        <SelectItem value="general">일반</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="subject">제목</Label>
                    <Input id="subject" name="subject" required />
                  </div>
                  <div>
                    <Label htmlFor="content">내용</Label>
                    <Textarea
                      id="content"
                      name="content"
                      rows={8}
                      placeholder="{{변수명}}을 사용하여 동적 콘텐츠를 삽입할 수 있습니다"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="variables">변수 (쉼표로 구분)</Label>
                    <Input
                      id="variables"
                      name="variables"
                      placeholder="예: applicantName, sessionDate, consultantName"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      템플릿 내용에서 사용할 변수를 입력하세요
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      취소
                    </Button>
                    <Button type="submit">생성</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg border p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">{template.title}</h3>
                      <Badge
                        variant="secondary"
                        className={getCategoryBadgeColor(template.category)}
                      >
                        {getCategoryLabel(template.category)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      <strong>제목:</strong> {template.subject}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.content}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPreviewTemplate(template);
                      }}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicateTemplate(template)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {template.variables.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">사용 변수:</span>
                    {template.variables.map((variable, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Bulk Send Tab */}
        <TabsContent value="bulk" className="space-y-4">
          <div className="bg-white rounded-lg border p-6">
            <div className="mb-6">
              <h3 className="font-semibold mb-2">신청 선택</h3>
              <p className="text-sm text-muted-foreground mb-4">
                메시지를 보낼 신청을 선택하세요
              </p>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {applications
                  .filter((app) => app.status !== "cancelled" && app.status !== "completed")
                  .map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <Checkbox
                        checked={selectedApplicationIds.includes(app.id)}
                        onCheckedChange={() => toggleApplicationSelection(app.id)}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{app.officeHourTitle}</div>
                        <div className="text-xs text-muted-foreground">
                          {app.consultant} · {app.agenda}
                        </div>
                      </div>
                      <Badge variant="outline">{app.status}</Badge>
                    </div>
                  ))}
              </div>

              {selectedApplicationIds.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-900">
                    {selectedApplicationIds.length}개의 신청이 선택되었습니다
                  </p>
                </div>
              )}
            </div>

            <div className="mb-6">
              <h3 className="font-semibold mb-2">템플릿 선택</h3>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="사용할 템플릿을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title} ({getCategoryLabel(template.category)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTemplateId && (
                <div className="mt-3 p-4 border rounded-lg bg-gray-50">
                  {(() => {
                    const template = templates.find((t) => t.id === selectedTemplateId);
                    return template ? (
                      <div>
                        <p className="text-sm font-medium mb-1">미리보기:</p>
                        <p className="text-sm text-muted-foreground mb-2">
                          <strong>제목:</strong> {template.subject}
                        </p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {template.content}
                        </p>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            <Button
              onClick={handleBulkSend}
              disabled={selectedApplicationIds.length === 0 || !selectedTemplateId}
              className="w-full"
            >
              <Send className="w-4 h-4 mr-2" />
              선택한 {selectedApplicationIds.length}건에 메시지 전송
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Template Dialog */}
      {selectedTemplate && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>템플릿 수정</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateTemplate} className="space-y-4">
              <div>
                <Label htmlFor="edit-title">템플릿 제목</Label>
                <Input
                  id="edit-title"
                  name="title"
                  defaultValue={selectedTemplate.title}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-category">카테고리</Label>
                <Select name="category" defaultValue={selectedTemplate.category}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmation">확인</SelectItem>
                    <SelectItem value="review">검토</SelectItem>
                    <SelectItem value="reminder">리마인더</SelectItem>
                    <SelectItem value="followup">팔로우업</SelectItem>
                    <SelectItem value="general">일반</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-subject">제목</Label>
                <Input
                  id="edit-subject"
                  name="subject"
                  defaultValue={selectedTemplate.subject}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-content">내용</Label>
                <Textarea
                  id="edit-content"
                  name="content"
                  rows={8}
                  defaultValue={selectedTemplate.content}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-variables">변수 (쉼표로 구분)</Label>
                <Input
                  id="edit-variables"
                  name="variables"
                  defaultValue={selectedTemplate.variables.join(", ")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit">저장</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{previewTemplate.title}</DialogTitle>
              <DialogDescription>
                <Badge className={getCategoryBadgeColor(previewTemplate.category)}>
                  {getCategoryLabel(previewTemplate.category)}
                </Badge>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>제목</Label>
                <p className="text-sm mt-1">{previewTemplate.subject}</p>
              </div>
              <div>
                <Label>내용</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap">{previewTemplate.content}</p>
              </div>
              {previewTemplate.variables.length > 0 && (
                <div>
                  <Label>사용 변수</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {previewTemplate.variables.map((variable, idx) => (
                      <Badge key={idx} variant="outline">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
