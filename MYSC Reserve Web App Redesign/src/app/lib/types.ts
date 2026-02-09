export type ApplicationStatus =
  | "pending"
  | "review"
  | "confirmed"
  | "cancelled"
  | "completed";

export type OfficeHourType = "regular" | "irregular";

export type SessionFormat = "online" | "offline";

export type UserRole = "user" | "admin" | "consultant" | "staff";

export interface Program {
  id: string;
  name: string;
  description: string;
  color: string;
  targetHours: number;
  completedHours: number;
  maxApplications: number;
  usedApplications: number;
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
  programName: string; // deprecated - use programs instead
  programs: string[]; // Program IDs that this user belongs to
  role: UserRole;
  permissions?: {
    canViewAllApplications?: boolean;
    canManageConsultants?: boolean;
    canManagePrograms?: boolean;
  };
  status?: string;
  createdAt?: string | Date;
  lastLoginAt?: string | Date;
}

export interface Agenda {
  id: string;
  name: string;
  category: string;
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
  month: string;
  availableDates: string[];
  description: string;
}

export interface Application {
  id: string;
  type: OfficeHourType;
  status: ApplicationStatus;
  officeHourId?: string;
  officeHourTitle: string;
  consultant: string;
  consultantId?: string; // 컨설턴트 ID 추가
  sessionFormat: SessionFormat;
  agenda: string;
  requestContent: string;
  attachments: string[];
  scheduledDate?: string;
  scheduledTime?: string;
  periodFrom?: string;
  periodTo?: string;
  projectName?: string;
  isInternal?: boolean;
  programId?: string; // 어느 사업에 속하는지
  duration?: number; // 세션 시간 (시간 단위)
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date; // 완료 시점
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
}

export interface Consultant {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  expertise: string[];
  bio: string;
  detailedBio: string;
  education: string[];
  certifications: string[];
  publications: string[];
  linkedIn?: string;
  status: "active" | "inactive";
  sessionsCompleted: number;
  satisfaction: number; // 만족도 (changed from rating)
  joinedDate: Date;
  availability: ConsultantAvailability[];
}

export interface ConsultantAvailability {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  slots: {
    start: string; // "09:00"
    end: string;   // "10:00"
    available: boolean;
  }[];
}

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
  status: "active" | "inactive";
  createdAt: Date | string;
  lastLoginAt?: Date | string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  category: string;
  subject: string;
  content: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OfficeHourReport {
  id: string;
  applicationId: string;
  consultantId: string;
  consultantName: string;
  date: string;
  location: string;
  topic: string;
  participants: string[];
  content: string;
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
  dueDate: string;
  assignees: string[];
  tags: string[];
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  comments?: GoalComment[];
}

export interface TeamMember {
  id: string;
  email: string;
  companyName: string;
  programName: string;
  programs: string[];
  role: UserRole;
  position: string;
  department: string;
  joinedAt: Date;
  isActive: boolean;
  permissions: {
    canApplyRegular: boolean;
    canApplyIrregular: boolean;
    canViewAll: boolean;
    managedPrograms?: string[];
  };
  createdAt: Date;
  lastLoginAt?: Date;
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