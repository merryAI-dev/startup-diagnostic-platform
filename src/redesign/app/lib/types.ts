export type ApplicationStatus =
  | "pending"
  | "review"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed";

export type OfficeHourType = "regular" | "irregular" | "mentoring" | "custom";

export type SessionFormat = "online" | "offline";

export type UserRole = "user" | "admin" | "consultant" | "staff";
export type ApprovalRole = "admin" | "company" | "consultant";

export type AgendaScope = "internal" | "external";

export type ProgramWeekday = "TUE" | "WED" | "THU";

export type ProgramKpiDefinition = {
  id: string;
  label: string;
  description: string;
  active?: boolean;
};

export interface Program {
  id: string;
  name: string;
  description: string;
  color: string;
  targetHours: number;
  completedHours: number;
  maxApplications: number;
  usedApplications: number;
  internalTicketLimit?: number;
  externalTicketLimit?: number;
  companyLimit?: number;
  companyIds?: string[];
  allowedAgendaIds?: string[];
  managerUid?: string | null;
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string; // YYYY-MM-DD
  weekdays?: ProgramWeekday[];
  kpiDefinitions?: ProgramKpiDefinition[];
}

export type CompanySource = "signup" | "consultant_manual" | "admin_manual" | "legacy_unknown";

export interface CompanyDirectoryItem {
  id: string;
  name: string;
  normalizedName?: string | null;
  aliases?: string[];
  source?: CompanySource | string | null;
  ownerUid?: string | null;
  active?: boolean;
  createdByUid?: string | null;
  createdByRole?: "consultant" | "admin" | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  deletedAt?: Date | string | null;
  deletedByUid?: string | null;
  programs?: string[];
}

// 스타트업 실적 데이터
export interface CompanyMetrics {
  id: string;
  companyName: string;
  year: number;
  data: MonthlyMetrics[];
  investments: Investment[];
  milestones: Milestone[];
}

export interface MonthlyMetrics {
  month: number; // 1-12
  year: number;
  revenue: number; // 매출 (원)
  employees: number; // 직원 수
  patents: number; // 누적 특허
  certifications: number; // 누적 인증
  customers: number; // 고객 수
  monthlyActiveUsers?: number; // MAU (옵션)
  otherMetrics?: Record<string, number>; // 기타 지표
}

export interface Investment {
  id: string;
  date: string; // YYYY-MM-DD
  round: string; // "Pre-Seed" | "Seed" | "Series A" | "Series B" | etc
  amount: number; // 투자 금액 (원)
  investor: string;
  valuation?: number; // 기업 가치 (원)
}

export interface Milestone {
  id: string;
  date: string;
  title: string;
  category: "patent" | "certification" | "award" | "partnership" | "product" | "other";
  description: string;
  achievement?: string; // 세부 성과
}

export interface User {
  id: string;
  email: string;
  companyName: string;
  programName?: string; // deprecated - use programs instead
  programs?: string[]; // Program IDs that this user belongs to
  role: UserRole;
  permissions?: {
    canViewAllApplications?: boolean;
    canManageConsultants?: boolean;
    canManagePrograms?: boolean;
  };
  status?: "active" | "inactive" | "suspended" | string;
  createdAt?: string | Date;
  lastLoginAt?: string | Date;
}

export interface PendingProfileApproval {
  id: string;
  email: string;
  role: ApprovalRole;
  requestedRole: ApprovalRole | null;
  active: boolean;
  companyId?: string | null;
  createdAt?: Date | string;
  activatedAt?: Date | string;
}

export interface Agenda {
  id: string;
  name: string;
  scope: AgendaScope;
  description?: string;
  active?: boolean;
  priorityConsultantIds?: string[];
  // Legacy UI compatibility
  category?: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  reason?: string;
}

export interface Message {
  id: string;
  applicationId: string;
  content: string;
  sender: "user" | "consultant";
  timestamp: Date;
  attachments?: string[];
}

export interface RegularOfficeHour {
  id: string;
  title: string;
  consultant: string;
  consultantId?: string;
  programId?: string;
  month: string;
  availableDates: string[];
  description: string;
  agendaIds?: string[];
  weekdays?: ProgramWeekday[];
  slots?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    consultantId?: string;
    consultantName?: string;
    agendaIds?: string[];
    status: "open" | "booked" | "closed";
  }[];
}

export interface Application {
  id: string;
  type: OfficeHourType;
  status: ApplicationStatus;
  officeHourId?: string;
  companyId?: string | null;
  officeHourTitle: string;
  agendaId?: string;
  companyName?: string;
  consultant: string;
  consultantId?: string; // 컨설턴트 ID 추가
  pendingConsultantIds?: string[];
  sessionFormat: SessionFormat;
  agenda: string;
  requestContent: string;
  rejectionReason?: string;
  cancellationReason?: string;
  attachments?: string[];
  attachmentUrls?: string[];
  applicantName?: string;
  applicantEmail?: string;
  details?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  periodFrom?: string;
  periodTo?: string;
  projectName?: string;
  isInternal?: boolean;
  createdByUid?: string;
  programId?: string; // 어느 사업에 속하는지
  duration?: number; // 세션 시간 (시간 단위)
  reportPrefill?: {
    topic?: string;
    managerName?: string;
    participants?: string[];
    location?: string;
  };
  calendarSource?: {
    type: "google-calendar";
    sessionId: string;
    rawTitle: string;
    attendeeLabels: string[];
    location?: string | null;
    matchWarnings?: string[];
  };
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt?: Date | string; // 완료 시점
}

export interface OfficeHourCalendarSession {
  id: string;
  source: "google-calendar";
  sessionType: "irregular";
  calendarId: string;
  eventId: string;
  sourceStatus: "active" | "cancelled";
  rawTitle: string;
  rawDescription?: string | null;
  rawLocation?: string | null;
  rawAttendeeEmails: string[];
  attendeeLabels: string[];
  sessionFormat?: SessionFormat;
  parsedProgramName?: string | null;
  parsedAgendaName?: string | null;
  parsedCompanyName?: string | null;
  programMatchStatus: "matched" | "unmatched" | "ambiguous";
  programMatchSource?: "title" | "none";
  agendaMatchStatus: "matched" | "unmatched" | "ambiguous";
  agendaMatchSource?: "title" | "none";
  companyMatchStatus: "matched" | "unmatched" | "ambiguous";
  companyMatchSource?: "title" | "attendee" | "none";
  programId?: string | null;
  programName?: string | null;
  agendaId?: string | null;
  agendaName?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  companyProfileUid?: string | null;
  consultantId?: string | null;
  consultantName?: string | null;
  consultantEmail?: string | null;
  managerUid?: string | null;
  managerName?: string | null;
  managerEmail?: string | null;
  scheduledDate: string;
  scheduledTime: string;
  scheduledStartAt: Date | string;
  scheduledEndAt: Date | string;
  duration: number;
  matchWarnings?: string[];
  manualReviewRequired?: boolean;
  sourceCreatedAt?: Date | string;
  sourceUpdatedAt?: Date | string;
  lastSyncedAt?: Date | string;
  deletedAt?: Date | string | null;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  file?: File;
}

export interface Consultant {
  id: string;
  name: string;
  title?: string;
  email: string;
  phone?: string;
  organization?: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
  slackUserId?: string;
  fixedMeetingLink?: string;
  expertise: string[];
  bio: string;
  detailedBio?: string;
  education?: string[];
  certifications?: string[];
  publications?: string[];
  linkedIn?: string;
  status: "active" | "inactive";
  sessionsCompleted?: number;
  satisfaction?: number; // 만족도 (changed from rating)
  rating?: number;
  avatarUrl?: string;
  joinedDate?: Date | string;
  scope?: AgendaScope;
  agendaIds?: string[]; // 관리자가 매칭한 아젠다 ID 목록
  availability: ConsultantAvailability[];
  monthlyAvailability?: ConsultantMonthlyAvailability;
  monthlyAvailabilityMeta?: ConsultantMonthlyAvailabilityMeta;
}

export interface ConsultantAvailability {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  dateKey?: string; // YYYY-MM-DD, canonical per-date monthly schedule entry
  slots: {
    start: string; // "09:00"
    end: string;   // "10:00"
    available: boolean;
  }[];
}

export type ConsultantMonthlyAvailability = Record<string, ConsultantAvailability[]>;

export type ConsultantMonthlyAvailabilityMeta = Record<
  string,
  {
    status: "submitted";
    submittedAt?: Date | string;
    submittedByUid?: string;
  }
>;

export interface UserWithPermissions {
  id: string;
  email: string;
  companyName: string;
  programName: string;
  programs?: string[];
  role: UserRole;
  permissions: {
    canApplyRegular: boolean;
    canApplyIrregular: boolean;
    canViewAll: boolean;
    canViewAllApplications?: boolean;
    canManageConsultants?: boolean;
    canManagePrograms?: boolean;
    managedPrograms?: string[];
  };
  status: "active" | "inactive" | "suspended";
  createdAt: Date | string;
  lastLoginAt?: Date | string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  category: string;
  channel?: "email" | "biztalk";
  templateCase?: string;
  subject: string;
  content: string;
  variables: string[];
  biztalkTemplateCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OfficeHourReport {
  id: string;
  applicationId: string;
  applicationType?: OfficeHourType;
  companyId?: string | null;
  companyName?: string | null;
  consultantId: string;
  consultantName: string;
  date: string;
  time?: string;
  location: string;
  topic: string;
  managerName?: string;
  participants: string[];
  content: string;
  meetingRawText?: string;
  followUp: string;
  photos: string[];
  duration: number;
  satisfaction: number;
  programId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  link?: string;
  isRead: boolean;
  createdAt: Date;
  userId: string;
  relatedId?: string;
  priority: "high" | "medium" | "low";
}

export interface ChatRoom {
  id: string;
  name: string;
  type: "direct" | "group" | "support";
  participants: string[];
  lastMessage: ChatMessage;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
  applicationId?: string;
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  content: string;
  attachments?: ChatAttachment[];
  isRead: boolean;
  createdAt: Date;
}

export interface ChatAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface AIRecommendation {
  id: string;
  type: "consultant" | "topic" | "timing" | "partnership";
  title: string;
  description: string;
  reason: string;
  confidence: number;
  relatedData?: Record<string, any>;
  createdAt: Date;
  isApplied: boolean;
}

export interface GoalComment {
  id: string;
  goalId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "todo" | "in_progress" | "review" | "completed";
  priority: "low" | "medium" | "high";
  dueDate: string | Date;
  assignees: string[];
  tags: string[];
  progress: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
  attachments?: string[];
  comments?: GoalComment[];
}

export interface TeamMember {
  id: string;
  email: string;
  companyName: string;
  programName: string;
  programs?: string[];
  role: UserRole;
  position: string;
  department: string;
  joinedAt: Date | string;
  isActive: boolean;
  permissions: {
    canApplyRegular: boolean;
    canApplyIrregular: boolean;
    canViewAll: boolean;
    managedPrograms?: string[];
  };
  createdAt: Date | string;
  lastLoginAt?: Date | string;
  status: "active" | "inactive";
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: "office_hour" | "meeting" | "deadline" | "milestone" | "other";
  start: Date;
  end: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  participants?: string[];
  userId: string;
  applicationId?: string;
  color?: string;
  recurrence?: string;
  status?: string;
}
