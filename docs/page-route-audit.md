# Page Route Audit

Last updated: 2026-03-13

## Purpose

This document maps `currentPage` values in `src/redesign/app/AppContent.tsx` to:

- the actual rendered component
- whether that component is legacy or redesign
- the primary data source
- whether the route is exposed in the current sidebar

The goal is to reduce confusion where the visible menu and the underlying implementation do not match.

## Admin Routes

| `currentPage` | Sidebar label | Component | Layer | Primary data source | Notes |
| --- | --- | --- | --- | --- | --- |
| `admin-dashboard` | 관리자 대시보드 | `AdminDashboardInteractive` | redesign | `applications`, `programs`, `currentUser` from `AppContent` | Current visible admin dashboard |
| `admin-dashboard-deprecated` | none | `AdminDashboardInteractive` | redesign | same as `admin-dashboard` | Duplicate alias. Currently renders the same component and looks unused |
| `admin-applications` | 신청 관리 | `AdminApplications` | redesign | `scopedApplications`, `agendaList`, consultant context | Shared by admin / consultant / staff |
| `admin-program-list` | 사업 관리 | `AdminPrograms` with `viewMode="management"` | redesign | `programList`, `resolvedApplications`, `agendaList`, filtered `companyDirectory` | Current visible program management route |
| `admin-programs` | none | `AdminPrograms` with `viewMode="list"` | redesign | same as `admin-program-list` | Hidden alias. Not in sidebar but still rendered |
| `startup-diagnostic` | 기업 관리 | `src/components/dashboard/AdminDashboard` | legacy | direct Firestore reads to `profiles`, `companies`, `programs`, subcollections | This was the source of the “27 companies” issue |
| `admin-agendas` | 아젠다 관리 | `AdminAgendas` | redesign | `agendaList`, `consultants` | Visible route |
| `admin-consultants` | 컨설턴트 관리 | `AdminConsultants` | redesign | `consultants`, `agendaList` | Visible route |
| `admin-users` | 사용자 관리 | `AdminUsers` | redesign | `profiles` -> `users`, `consultants`, pending approvals | Visible route |
| `pending-reports` | 미작성 보고서 | `PendingReportsDashboard` | redesign | `scopedApplications`, `reports`, `programs`, `consultants` | Shared by admin / consultant / staff |
| `admin-communication` | none | `AdminCommunication` | redesign | `templates`, `applications` | Explicitly filtered out of sidebar |

## Consultant Routes

| `currentPage` | Sidebar label | Component | Layer | Primary data source | Notes |
| --- | --- | --- | --- | --- | --- |
| `consultant-calendar` | 내 일정 캘린더 | `UnifiedCalendar` | redesign | `scopedApplications`, `reports`, `programs`, `agendas`, current consultant context | Main consultant working screen |
| `consultant-profile` | 내 정보 입력 | `ConsultantProfilePage` | redesign | `currentConsultant`, `agendaList` | Saves consultant profile/schedule |
| `admin-applications` | 신청 관리 | `AdminApplications` | redesign | same as admin route | Reused for consultant queue |
| `pending-reports` | 오피스아워 일지 | `PendingReportsDashboard` | redesign | same as admin route | Reused route |

## Company Routes

| `currentPage` | Sidebar label | Component | Layer | Primary data source | Notes |
| --- | --- | --- | --- | --- | --- |
| `dashboard` | 대시보드 | `DashboardCalendar` | redesign | `scopedApplications`, `user`, `programs`, `agendas` | Main company dashboard |
| `regular` | 정기 오피스아워 | `RegularOfficeHoursCalendar` | redesign | `scopedRegularOfficeHourList` | Entry to regular application flow |
| `regular-detail` | none | `RegularOfficeHourDetail` | redesign | selected office hour + applications | Hidden detail route |
| `regular-wizard` | none | `RegularApplicationWizard` | redesign | office hours, applications, consultants, agendas, tickets | Hidden wizard route |
| `irregular` | 비정기 오피스아워 | `IrregularOfficeHoursCalendar` | redesign | local navigation only | Visible route |
| `irregular-wizard` | none | `IrregularApplicationWizard` | redesign | `agendaList`, tickets | Hidden wizard route |
| `history` | 전체 내역 | `ApplicationHistoryCalendar` | redesign | `scopedApplications` | Visible route |
| `application` | none | `ApplicationDetail` | redesign | selected application + messages | Shared detail route |
| `company-info` | 기업 정보 입력 | `src/components/dashboard/CompanyDashboard` | legacy | direct company document + subcollections | Legacy screen still used in production flow |
| `consultants` | 컨설턴트 | `ConsultantsDirectory` | redesign | `consultants` | Visible route |
| `company-metrics` | 실적 관리 | `CompanyMetricsPage` | redesign | mock/company name driven | Feature appears mostly local-data based |
| `company-newsletter` | 기업 리포트 | `CompanyNewsletter` | redesign | mock/company name driven | Feature appears mostly local-data based |
| `messages` | 메시지 | `MessagesPage` | redesign | local state mock data | Not backed by Firestore in current path |
| `notifications` | 알림 | `NotificationCenter` | redesign | local state mock data | Not backed by Firestore in current path |
| `unified-calendar` | 통합 캘린더 | `UnifiedCalendar` | redesign | `resolvedApplications`, `programList`, `agendaList` | Company-side read/write view |
| `goals-kanban` | 목표 관리 | `GoalsKanban` | redesign | local state mock data | Not backed by Firestore in current path |
| `ai-recommendations` | AI 추천 | `AIRecommendations` | redesign | local state mock data | Not backed by Firestore in current path |
| `team-collaboration` | 팀 협업 | `TeamCollaboration` | redesign | local state mock data | Not backed by Firestore in current path |
| `settings` | 설정 | `Settings` | redesign | current user only | Visible route |

## Immediate Findings

1. `startup-diagnostic` is still a legacy screen.
   It does direct Firestore reads internally and was not using the same data shaping as the redesign admin screens.

2. `company-info` is also still a legacy screen.
   Company users are not fully on the redesign page system.

3. `admin-dashboard-deprecated` is a duplicate route.
   It currently renders the same component as `admin-dashboard`.

4. `admin-programs` is a hidden alias.
   The visible sidebar route is `admin-program-list`, but both routes are still active.

5. Several company features are still local/mock driven.
   `messages`, `notifications`, `goals-kanban`, `ai-recommendations`, and `team-collaboration` are not part of the core Firestore-backed workflow today.

6. The codebase currently mixes two patterns:
   - `AppContent` as the central orchestrator for redesign pages
   - self-loading legacy screens that query Firestore on their own

7. There are two sidebar implementations.
   - Active in the current app shell: `src/redesign/app/components/layout/sidebar-nav.tsx`
   - Older parallel implementation: `src/redesign/layout/SidebarNav.tsx`
   The older file still contains different labels and route ids such as `admin-programs` / `스타트업 진단시트`.

## Parallel Layouts

| File | Status | Notes |
| --- | --- | --- |
| `src/redesign/app/components/layout/sidebar-nav.tsx` | active | Used by `src/redesign/app/AppContent.tsx` |
| `src/redesign/layout/SidebarNav.tsx` | likely legacy | Used by `src/redesign/layout/AppShell.tsx`, with a different nav model |

## Recommended Cleanup Order

1. Freeze the route map.
   Treat this document as the source of truth for which routes are actually live.

2. Remove duplicate or hidden aliases only after confirming no internal navigation depends on them.
   First candidates:
   - `admin-dashboard-deprecated`
   - `admin-programs`
   - `admin-communication` if truly unused

3. Migrate legacy live screens into redesign ownership.
   Highest-value targets:
   - `startup-diagnostic`
   - `company-info`

4. Mark mock/local-only features explicitly.
   If they are not part of launch scope, hide them behind config or remove them from visible navigation.

5. After the route surface is simplified, delete unreachable imports/components.
   Do not start by deleting files blindly. Remove by confirmed route usage only.

## Current Safe Assumption

If a bug appears in:

- `기업 관리`, inspect `src/components/dashboard/AdminDashboard.tsx`
- `기업 정보 입력`, inspect `src/components/dashboard/CompanyDashboard.tsx`
- most other admin/company/consultant flows, inspect `src/redesign/app/AppContent.tsx` and the matching redesign page component
