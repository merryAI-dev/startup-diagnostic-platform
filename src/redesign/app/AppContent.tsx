import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth as useAppAuth } from "../../context/AuthContext";
import { signOutUser } from "../../firebase/auth";
import { AdminDashboard } from "../../components/dashboard/AdminDashboard";
import { CompanyDashboard } from "../../components/dashboard/CompanyDashboard";
import { ProtectedRoute } from "./components/auth/protected-route";
import { Topbar } from "./components/layout/topbar";
import { SidebarNav } from "./components/layout/sidebar-nav";
import { DashboardCalendar } from "./components/pages/dashboard-calendar";
import { RegularOfficeHoursCalendar } from "./components/pages/regular-office-hours-calendar";
import { RegularOfficeHourDetail } from "./components/pages/regular-office-hour-detail";
import { RegularApplicationWizard, ApplicationFormData } from "./components/pages/regular-application-wizard";
import { IrregularOfficeHoursCalendar } from "./components/pages/irregular-office-hours-calendar";
import { IrregularApplicationWizard, IrregularApplicationFormData } from "./components/pages/irregular-application-wizard";
import { ApplicationHistoryCalendar } from "./components/pages/application-history-calendar";
import { ApplicationDetail } from "./components/pages/application-detail";
import { Settings } from "./components/pages/settings";
import { AdminDashboardInteractive } from "./components/pages/admin-dashboard-interactive";
import { AdminApplications } from "./components/pages/admin-applications";
import { AdminConsultants } from "./components/pages/admin-consultants";
import { AdminUsers } from "./components/pages/admin-users";
import { AdminCommunication } from "./components/pages/admin-communication";
import { AdminPrograms } from "./components/pages/admin-programs";
import { ConsultantsDirectory } from "./components/pages/consultants-directory";
import { PendingReportsDashboard } from "./components/pages/pending-reports-dashboard";
import { OfficeHourReportForm } from "./components/report/office-hour-report-form";
import { CompanyMetricsPage } from "./components/pages/company-metrics-page";
import { CompanyNewsletter } from "./components/pages/company-newsletter";
import { MessagesPage } from "./components/pages/messages-page";
import { NotificationCenter } from "./components/notifications/notification-center";
import { AIRecommendations } from "./components/ai/ai-recommendations";
import { UnifiedCalendar } from "./components/pages/unified-calendar";
import { GoalsKanban } from "./components/pages/goals-kanban";
import { TeamCollaboration } from "./components/pages/team-collaboration";
import { Application, Message, RegularOfficeHour, FileItem, ApplicationStatus, Consultant, MessageTemplate, UserWithPermissions, Program, OfficeHourReport, Notification, ChatRoom, ChatMessage, ChatAttachment, AIRecommendation, Goal, TeamMember, User, UserRole } from "./lib/types";
import { regularOfficeHours, initialApplications, initialMessages, agendas, initialConsultants, initialMessageTemplates, initialUsers, programs } from "./lib/data";
import { mockNotifications, mockChatRooms, mockChatMessages, mockAIRecommendations, mockGoals, mockTeamMembers } from "./lib/advanced-mock-data";

type AppPage = 
  | "dashboard" 
  | "consultants"
  | "regular" 
  | "irregular" 
  | "history" 
  | "settings"
  | "regular-detail"
  | "regular-wizard"
  | "irregular-wizard"
  | "application"
  | "admin-dashboard"
  | "admin-applications"
  | "admin-consultants"
  | "admin-users"
  | "admin-communication"
  | "admin-programs"
  | "pending-reports"
  | "company-metrics"
  | "company-newsletter"
  | "messages" // 새로 추가
  | "notifications" // 새로 추가
  | "ai-recommendations" // 새로 추가
  | "unified-calendar" // 새로 추가
  | "goals-kanban" // 새로 추가
  | "team-collaboration" // 새로 추가
  | "startup-diagnostic"
  | "company-info";

export function AppContent({ roleOverride }: { roleOverride?: UserRole }) {
  const { user: firebaseUser, profile, loading } = useAppAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const resolvedRole: UserRole =
    roleOverride ?? (profile?.role === "admin" ? "admin" : "user");
  const fallbackUser =
    initialUsers.find((u) => u.role === resolvedRole) ?? initialUsers[0]!;
  const user: User = useMemo(() => {
    return {
      ...fallbackUser,
      id: firebaseUser?.uid ?? fallbackUser.id,
      email: firebaseUser?.email ?? fallbackUser.email,
      companyName: profile?.companyId
        ? `회사 ${profile.companyId}`
        : fallbackUser.companyName,
      role: resolvedRole,
      programName: fallbackUser.programName ?? "MYSC",
      programs: fallbackUser.programs ?? [],
    };
  }, [fallbackUser, firebaseUser?.email, firebaseUser?.uid, profile?.companyId, resolvedRole]);

  const adminPages = useMemo<Set<AppPage>>(
    () =>
      new Set([
        "admin-dashboard",
        "admin-applications",
        "admin-programs",
        "admin-consultants",
        "admin-users",
        "admin-communication",
        "pending-reports",
        "startup-diagnostic",
      ]),
    []
  );
  const userPages = useMemo<Set<AppPage>>(
    () =>
      new Set([
        "dashboard",
        "notifications",
        "messages",
        "unified-calendar",
        "goals-kanban",
        "ai-recommendations",
        "team-collaboration",
        "consultants",
        "regular",
        "irregular",
        "history",
        "company-metrics",
        "company-newsletter",
        "settings",
        "company-info",
      ]),
    []
  );

  const basePath = roleOverride === "admin" ? "/admin" : "/company";
  const initialPage: AppPage =
    resolvedRole === "admin" ? "admin-dashboard" : "dashboard";
  const companyRecordId = profile?.companyId ?? firebaseUser?.uid ?? null;
  const [currentPage, setCurrentPage] = useState<AppPage>(initialPage);
  const [applications, setApplications] = useState<Application[]>(initialApplications);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selectedOfficeHourId, setSelectedOfficeHourId] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [consultants, setConsultants] = useState<Consultant[]>(initialConsultants);
  const [users, setUsers] = useState<UserWithPermissions[]>(initialUsers);
  const [templates, setTemplates] = useState<MessageTemplate[]>(initialMessageTemplates);
  const [programList, setProgramList] = useState<Program[]>(programs);
  
  const [reports, setReports] = useState<OfficeHourReport[]>([]);
  const [reportFormOpen, setReportFormOpen] = useState(false);
  const [reportFormApplication, setReportFormApplication] = useState<Application | null>(null);

  // 새로운 기능을 위한 상태
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>(mockChatRooms);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(mockChatMessages);
  const [aiRecommendations, setAIRecommendations] = useState<AIRecommendation[]>(mockAIRecommendations);
  const [goals, setGoals] = useState<Goal[]>(mockGoals);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(mockTeamMembers);
  
  // Set initial page based on role
  const disabledPages = useMemo(() => {
    const set = new Set<AppPage>();
    if (!firebaseUser) {
      set.add("startup-diagnostic");
    }
    return set;
  }, [firebaseUser]);

  useEffect(() => {
    const segment = location.pathname.split("/")[2] ?? "";
    const requestedPage = segment as AppPage;
    const allowedPages = resolvedRole === "admin" ? adminPages : userPages;
    const nextPage = allowedPages.has(requestedPage)
      ? requestedPage
      : initialPage;
    if (disabledPages.has(nextPage)) {
      setCurrentPage(initialPage);
      if (segment) {
        navigate(`${basePath}/${initialPage}`, { replace: true });
      }
      return;
    }
    setCurrentPage(nextPage);
    if (!segment) {
      navigate(`${basePath}/${nextPage}`, { replace: true });
    }
  }, [
    basePath,
    adminPages,
    userPages,
    disabledPages,
    initialPage,
    location.pathname,
    navigate,
    resolvedRole,
  ]);

  // 세션 완료 후 보고서 작성 팝업
  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "consultant" && user.role !== "staff")) {
      return;
    }

    const completedApps = applications.filter(
      (app) => app.status === "completed" && app.scheduledDate && app.scheduledTime
    );

    const reportedAppIds = new Set(reports.map((r) => r.applicationId));

    for (const app of completedApps) {
      if (reportedAppIds.has(app.id)) continue;

      const sessionDateTime = new Date(`${app.scheduledDate}T${app.scheduledTime}`);
      const sessionEndTime = new Date(sessionDateTime.getTime() + (app.duration || 2) * 60 * 60 * 1000);
      const now = new Date();

      if (now >= sessionEndTime) {
        setReportFormApplication(app);
        setReportFormOpen(true);
        break;
      }
    }
  }, [user, applications, reports]);

  const handleNavigate = (page: AppPage, id?: string) => {
    if (disabledPages.has(page)) {
      return;
    }
    setCurrentPage(page);
    navigate(`${basePath}/${page}`);
    if (id) {
      if (page === "regular-detail") {
        setSelectedOfficeHourId(id);
      } else if (page === "application") {
        setSelectedApplicationId(id);
      }
    }
  };
  const handleNavigateLoose = (page: string, id?: string) =>
    handleNavigate(page as AppPage, id);

  const handleSelectOfficeHour = (id: string) => {
    setSelectedOfficeHourId(id);
    setCurrentPage("regular-detail");
  };

  const handleStartRegularApplication = () => {
    setCurrentPage("regular-wizard");
  };

  const handleSubmitRegularApplication = (data: ApplicationFormData) => {
    const officeHour = regularOfficeHours.find((oh) => oh.id === data.officeHourId);
    if (!officeHour) return;

    const agenda = agendas.find((a) => a.id === data.agendaId);
    
    const newApplication: Application = {
      id: `app${Date.now()}`,
      type: "regular",
      status: "pending",
      officeHourId: data.officeHourId,
      officeHourTitle: officeHour.title,
      consultant: officeHour.consultant,
      sessionFormat: data.sessionFormat,
      agenda: agenda?.name || "",
      requestContent: data.requestContent,
      attachments: data.files.map((f) => f.name),
      scheduledDate: data.date.toISOString().split("T")[0],
      scheduledTime: data.time,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setApplications([...applications, newApplication]);
    toast.success("신청이 제출되었습니다", {
      description: "검토 후 일���이 확정되면 알림을 보내드립니다.",
    });
    setCurrentPage("dashboard");
  };

  const handleStartIrregularApplication = () => {
    setCurrentPage("irregular-wizard");
  };

  const handleSubmitIrregularApplication = (data: IrregularApplicationFormData) => {
    const agenda = agendas.find((a) => a.id === data.agendaId);
    
    const newApplication: Application = {
      id: `app${Date.now()}`,
      type: "irregular",
      status: "review",
      officeHourTitle: `비정기 오피스아워 - ${agenda?.name || ""}`,
      consultant: "담당자 배정 중",
      sessionFormat: data.sessionFormat,
      agenda: agenda?.name || "",
      requestContent: data.requestContent,
      attachments: data.files.map((f) => f.name),
      periodFrom: data.periodFrom.toISOString().split("T")[0],
      periodTo: data.periodTo.toISOString().split("T")[0],
      projectName: data.projectName,
      isInternal: data.isInternal,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setApplications([...applications, newApplication]);
    toast.success("신청이 제출되었습니다", {
      description: "담당 컨설턴트 배정 후 일정을 조율하겠습니다.",
    });
    setCurrentPage("irregular");
  };

  const handleViewApplication = (id: string) => {
    setSelectedApplicationId(id);
    setCurrentPage("application");
  };

  const handleSendMessage = (applicationId: string, content: string, files: FileItem[]) => {
    const newMessage: Message = {
      id: `msg${Date.now()}`,
      applicationId,
      content,
      sender: "user",
      timestamp: new Date(),
      attachments: files.map((f) => f.name),
    };

    setMessages([...messages, newMessage]);
    toast.success("메시지가 전송되었습니다");
  };

  const handleCancelApplication = (id: string) => {
    setApplications(
      applications.map((app) =>
        app.id === id ? { ...app, status: "cancelled" as const, updatedAt: new Date() } : app
      )
    );
    toast.success("신청이 취소되었습니다");
    setCurrentPage("dashboard");
  };

  const handleUpdateApplicationStatus = (id: string, status: ApplicationStatus) => {
    setApplications(
      applications.map((app) =>
        app.id === id ? { ...app, status, updatedAt: new Date() } : app
      )
    );
  };

  const handleUpdateApplication = (id: string, data: Partial<Application>) => {
    setApplications(
      applications.map((app) =>
        app.id === id ? { ...app, ...data, updatedAt: new Date() } : app
      )
    );
  };

  const handleUpdateConsultant = (id: string, data: Partial<Consultant>) => {
    setConsultants(
      consultants.map((c) => (c.id === id ? { ...c, ...data } : c))
    );
    toast.success("컨설턴트 정보가 업데이트되었습니다");
  };

  const handleAddConsultant = (data: Omit<Consultant, "id">) => {
    const newConsultant: Consultant = {
      ...data,
      id: `c${Date.now()}`,
    };
    setConsultants([...consultants, newConsultant]);
    toast.success("컨설턴트가 추가되었습니다");
  };

  const handleUpdateUser = (id: string, data: Partial<UserWithPermissions>) => {
    setUsers(
      users.map((u) => (u.id === id ? { ...u, ...data } : u))
    );
    toast.success("사용자 정보가 업데이트되었습니다");
  };

  const handleAddUser = (data: Omit<UserWithPermissions, "id" | "createdAt">) => {
    const newUser: UserWithPermissions = {
      ...data,
      id: `u${Date.now()}`,
      createdAt: new Date(),
    };
    setUsers([...users, newUser]);
    toast.success("사용자가 추가되었습니다");
  };

  const handleAddTemplate = (data: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">) => {
    const newTemplate: MessageTemplate = {
      ...data,
      id: `t${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setTemplates([...templates, newTemplate]);
  };

  const handleUpdateTemplate = (id: string, data: Partial<MessageTemplate>) => {
    setTemplates(
      templates.map((t) =>
        t.id === id ? { ...t, ...data, updatedAt: new Date() } : t
      )
    );
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter((t) => t.id !== id));
  };

  const handleSendBulkMessage = (applicationIds: string[], templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    applicationIds.forEach((appId) => {
      const newMessage: Message = {
        id: `msg${Date.now()}_${appId}`,
        applicationId: appId,
        content: template.content,
        sender: "consultant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, newMessage]);
    });
  };

  const selectedOfficeHour = regularOfficeHours.find(
    (oh) => oh.id === selectedOfficeHourId
  );

  const selectedApplication = applications.find(
    (app) => app.id === selectedApplicationId
  );

  const applicationMessages = messages.filter(
    (msg) => msg.applicationId === selectedApplicationId
  );

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <Topbar
        user={user}
        onNavigate={handleNavigateLoose}
        disabledPages={disabledPages}
        onLogout={async () => {
          await signOutUser();
          toast.success("로그아웃되었습니다");
        }}
      />
      <div className="flex-1 flex overflow-hidden">
        <SidebarNav
          currentPage={currentPage}
          onNavigate={handleNavigateLoose}
          userRole={user.role}
          disabledPages={disabledPages}
        />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {currentPage === "dashboard" && (
            <DashboardCalendar
              applications={applications}
              user={user}
              programs={programList}
              onNavigate={handleNavigateLoose}
            />
          )}

          {currentPage === "regular" && (
            <RegularOfficeHoursCalendar
              officeHours={regularOfficeHours}
              onSelectOfficeHour={handleSelectOfficeHour}
            />
          )}

          {currentPage === "regular-detail" && selectedOfficeHour && (
            <RegularOfficeHourDetail
              officeHour={selectedOfficeHour}
              applications={applications}
              onBack={() => setCurrentPage("regular")}
              onStartApplication={handleStartRegularApplication}
              onViewApplication={handleViewApplication}
            />
          )}

          {currentPage === "regular-wizard" && selectedOfficeHour && (
            <RegularApplicationWizard
              officeHour={selectedOfficeHour}
              onBack={() => setCurrentPage("regular-detail")}
              onSubmit={handleSubmitRegularApplication}
            />
          )}

          {currentPage === "irregular" && (
            <IrregularOfficeHoursCalendar
              onNavigate={(page) => {
                if (page === "irregular-wizard") {
                  handleStartIrregularApplication();
                } else {
                  handleNavigateLoose(page);
                }
              }}
            />
          )}

          {currentPage === "irregular-wizard" && (
            <IrregularApplicationWizard
              onBack={() => setCurrentPage("irregular")}
              onSubmit={handleSubmitIrregularApplication}
            />
          )}

          {currentPage === "history" && (
            <ApplicationHistoryCalendar
              applications={applications}
              onNavigate={handleNavigateLoose}
            />
          )}

          {currentPage === "application" && selectedApplication && (
            <ApplicationDetail
              application={selectedApplication}
              messages={applicationMessages}
              onBack={() => setCurrentPage("dashboard")}
              onSendMessage={(content, files) =>
                handleSendMessage(selectedApplication.id, content, files)
              }
              onCancelApplication={() =>
                handleCancelApplication(selectedApplication.id)
              }
            />
          )}

          {currentPage === "settings" && (
            <Settings user={user} />
          )}

          {currentPage === "company-info" && firebaseUser && companyRecordId && (
            <CompanyDashboard
              onLogout={async () => {
                await signOutUser();
                toast.success("로그아웃되었습니다");
              }}
              companyId={companyRecordId}
              user={firebaseUser}
            />
          )}

          {currentPage === "consultants" && (
            <ConsultantsDirectory consultants={consultants} />
          )}

          {currentPage === "company-metrics" && (
            <CompanyMetricsPage currentUser={user} />
          )}

          {currentPage === "company-newsletter" && (
            <CompanyNewsletter currentUser={user} />
          )}

          {currentPage === "messages" && (
            <MessagesPage
              currentUser={user}
              chatRooms={chatRooms}
              messages={chatMessages}
              onSendMessage={(roomId, content, attachments) => {
                const newMessage: ChatMessage = {
                  id: `msg_${Date.now()}`,
                  chatRoomId: roomId,
                  senderId: user.id,
                  senderName: user.companyName,
                  content,
                  attachments,
                  isRead: true,
                  createdAt: new Date(),
                };
                setChatMessages([...chatMessages, newMessage]);
                
                // Update chat room's last message
                setChatRooms(chatRooms.map(room =>
                  room.id === roomId
                    ? { ...room, lastMessage: newMessage, updatedAt: new Date() }
                    : room
                ));
                
                toast.success("메시지가 전송되었습니다");
              }}
            />
          )}

          {currentPage === "notifications" && (
            <NotificationCenter
              notifications={notifications}
              onMarkAsRead={(id) => {
                setNotifications(notifications.map(n =>
                  n.id === id ? { ...n, isRead: true } : n
                ));
              }}
              onMarkAllAsRead={() => {
                setNotifications(notifications.map(n => ({ ...n, isRead: true })));
                toast.success("모든 알림을 읽음으로 표시했습니다");
              }}
              onDelete={(id) => {
                setNotifications(notifications.filter(n => n.id !== id));
                toast.success("알림이 삭제되었습니다");
              }}
              onNavigate={(link) => {
                // Parse link and navigate to appropriate page
                if (link) {
                  window.location.hash = link;
                }
              }}
            />
          )}

          {currentPage === "ai-recommendations" && (
            <AIRecommendations
              currentUser={user}
              recommendations={aiRecommendations}
              consultants={consultants}
              onApply={(id) => {
                setAIRecommendations(aiRecommendations.map(r =>
                  r.id === id ? { ...r, isApplied: true } : r
                ));
                toast.success("추천이 적용되었습니다");
              }}
              onDismiss={(id) => {
                setAIRecommendations(aiRecommendations.filter(r => r.id !== id));
                toast.success("추천이 무시되었습니다");
              }}
            />
          )}

          {currentPage === "unified-calendar" && (
            <UnifiedCalendar
              currentUser={user}
              applications={applications}
              programs={programList}
              onNavigateToApplication={(id) => {
                setSelectedApplicationId(id);
                setCurrentPage("application");
              }}
            />
          )}

          {currentPage === "goals-kanban" && (
            <GoalsKanban
              currentUser={user}
              goals={goals}
              onCreateGoal={(data) => {
                const newGoal: Goal = {
                  ...data,
                  id: `goal_${Date.now()}`,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
                setGoals([...goals, newGoal]);
                toast.success("목표가 생성되었습니다");
              }}
              onUpdateGoal={(id, updates) => {
                setGoals(goals.map(g =>
                  g.id === id ? { ...g, ...updates, updatedAt: new Date() } : g
                ));
                toast.success("목표가 업데이트되었습니다");
              }}
              onDeleteGoal={(id) => {
                setGoals(goals.filter(g => g.id !== id));
                toast.success("목표가 삭제되었습니다");
              }}
            />
          )}

          {currentPage === "team-collaboration" && (
            <TeamCollaboration
              currentUser={user}
              teamMembers={teamMembers}
              onInviteMember={(email, role) => {
                const companyName = email.split("@")[0] ?? email;
                const newMember: TeamMember = {
                  id: `tm_${Date.now()}`,
                  email,
                  companyName,
                  programName: user.programName ?? "MYSC",
                  programs: user.programs ?? [],
                  role: role as any,
                  position: "팀원",
                  department: "일반",
                  joinedAt: new Date(),
                  isActive: true,
                  permissions: {
                    canApplyRegular: true,
                    canApplyIrregular: false,
                    canViewAll: false,
                  },
                  createdAt: new Date(),
                  status: "active",
                };
                setTeamMembers([...teamMembers, newMember]);
                toast.success(`${email}로 초대장이 전송되었습니다`);
              }}
              onUpdateMember={(id, updates) => {
                setTeamMembers(teamMembers.map(m =>
                  m.id === id ? { ...m, ...updates } : m
                ));
                toast.success("팀원 정보가 업데이트되었습니다");
              }}
              onRemoveMember={(id) => {
                setTeamMembers(teamMembers.filter(m => m.id !== id));
                toast.success("팀원이 제거되었습니다");
              }}
            />
          )}

          {/* Admin Pages with Protection */}
          {currentPage === "startup-diagnostic" && firebaseUser && (
            <AdminDashboard
              user={firebaseUser}
              onLogout={async () => {
                await signOutUser();
                toast.success("로그아웃되었습니다");
              }}
            />
          )}

          {currentPage === "admin-dashboard" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <AdminDashboardInteractive
                applications={applications}
                programs={programList}
                currentUser={user}
                onNavigate={handleNavigateLoose}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-applications" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <AdminApplications
                applications={applications}
                onUpdateStatus={handleUpdateApplicationStatus}
                onUpdateApplication={handleUpdateApplication}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-consultants" && (
            <ProtectedRoute requiredRole="admin">
              <AdminConsultants
                consultants={consultants}
                onUpdateConsultant={handleUpdateConsultant}
                onAddConsultant={handleAddConsultant}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-users" && (
            <ProtectedRoute requiredRole="admin">
              <AdminUsers
                users={users}
                onUpdateUser={handleUpdateUser}
                onAddUser={handleAddUser}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-communication" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <AdminCommunication
                templates={templates}
                applications={applications}
                onAddTemplate={handleAddTemplate}
                onUpdateTemplate={handleUpdateTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onSendBulkMessage={handleSendBulkMessage}
              />
            </ProtectedRoute>
          )}

          {currentPage === "admin-programs" && (
            <ProtectedRoute requiredRole="admin">
              <AdminPrograms
                programs={programList}
                applications={applications}
                onUpdateProgram={(id, data) => {
                  setProgramList(programList.map((p) => (p.id === id ? { ...p, ...data } : p)));
                  toast.success("프로그램이 업데이트되었습니다");
                }}
              />
            </ProtectedRoute>
          )}

          {currentPage === "pending-reports" && (
            <ProtectedRoute allowedRoles={["admin", "consultant", "staff"]}>
              <PendingReportsDashboard
                applications={applications}
                reports={reports}
                programs={programList}
                currentUser={user}
                onCreateReport={(applicationId) => {
                  const app = applications.find((a) => a.id === applicationId);
                  if (app) {
                    setReportFormApplication(app);
                    setReportFormOpen(true);
                  }
                }}
              />
            </ProtectedRoute>
          )}

          {reportFormOpen && reportFormApplication && (
            <OfficeHourReportForm
              application={reportFormApplication}
              open={reportFormOpen}
              onClose={() => setReportFormOpen(false)}
              onSubmit={(reportData) => {
                const newReport: OfficeHourReport = {
                  ...reportData,
                  id: `rep${Date.now()}`,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  completedAt: new Date(),
                };
                setReports([...reports, newReport]);
                
                setApplications(
                  applications.map((app) =>
                    app.id === reportFormApplication.id
                      ? { ...app, updatedAt: new Date() }
                      : app
                  )
                );
                
                setReportFormOpen(false);
                toast.success("보고서가 제출되었습니다");
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
