# Product Requirements Document (PRD)
## Multi-Tenant Work Management Platform
**Version:** 1.0.0 — MVP | **Status:** Approved | **Last Updated:** February 2026

---

## 1. Executive Summary

### 1.1 Product Vision
A unified work management platform for small development teams that replaces separate task tools and documentation tools. Tasks and docs live in one place, deeply linked, with real-time notifications keeping the team in sync.

### 1.2 Problem Statement
Development teams context-switch constantly between task tools (Jira) and documentation tools (Confluence). The spec lives in Confluence, the task lives in Jira, and the connection between them is always a manual copy-paste. This platform eliminates that gap with native task ↔ doc linking.

### 1.3 Target Users
Small development teams of 3–20 people:
- **Product Managers** — create tasks, manage sprints, write product specs
- **Developers** — work assigned tasks, read linked architecture docs without tool-switching
- **Tech Leads** — sprint planning, architecture documentation, team oversight
- **Org Admins** — manage members, roles, billing

### 1.4 Goals (Portfolio)
- Demonstrate multi-tenant SaaS architecture
- Show real-time features (WebSocket notifications)
- Implement a rich text editor (Tiptap)
- Build drag-and-drop Kanban with optimistic UI
- Integrate task queue (Celery) for background jobs
- Deploy a full-stack application end-to-end

---

## 2. User Roles & Permissions

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| Create / delete projects | ✅ | ✅ | ❌ |
| Create / edit tasks | ✅ | ✅ | ✅ |
| Delete others' tasks | ✅ | ✅ | ❌ |
| Create / edit pages | ✅ | ✅ | ✅ |
| Invite members | ✅ | ✅ | ❌ |
| Change member roles | ✅ | Limited | ❌ |
| Manage sprints | ✅ | ✅ | ❌ |
| Delete organization | ✅ | ❌ | ❌ |

---

## 3. Feature Specifications

### 3.1 Authentication

**Registration**
- Fields: display name, email, password (min 8 chars + 1 number)
- Unique email enforced globally
- On success → org creation wizard

**Login / Logout**
- Issues JWT access token (15-min TTL) + refresh token (30-day TTL)
- Refresh token stored in Redis: `refresh:{user_id}:{jti}`
- Logout blacklists `jti` in Redis
- Axios interceptor silently refreshes access token; queues concurrent requests during refresh

**Password Reset**
- Request → Celery task sends email via Resend
- Reset token in Redis with 1-hour TTL
- Always returns 204 (no user enumeration)

---

### 3.2 Organizations & Multi-Tenancy

**Organization Creation**
- Name + slug (3–30 chars, lowercase alphanumeric + hyphens, globally unique)
- Real-time slug availability check (debounced 500ms)
- Creator auto-assigned Owner role
- Default wiki space created automatically on org creation

**Member Invitations**
- Admin/Owner invites by email + role (Admin / Member)
- Celery task sends invitation email via Resend
- Token TTL: 48 hours; admin can revoke
- Invitee accepts → registers or logs in → auto-joins org

**Tenant Isolation**
- Every table has `org_id` column
- Every service method filters by `org_id` — no exceptions
- Automated cross-tenant isolation test in CI: user A cannot read user B's org data

---

### 3.3 Projects

- Fields: name, key (2–5 uppercase chars e.g. `WEB`), description, type (Kanban / Scrum)
- Key unique within org; used to generate task IDs (`WEB-42`)
- Default statuses auto-created on project creation: **To Do**, **In Progress**, **In Review**, **Done**
- Each status has a category: `todo` | `in_progress` | `done` (used for reporting)
- Soft-delete (archive) projects

---

### 3.4 Tasks

**Fields**
- Required: title, project
- Optional: description (rich text JSON), assignee, priority, type, labels, due date, parent task, sprint

**Auto-generated**
- Task ID: `[PROJECT_KEY]-[NUMBER]` using a DB sequence per project
- Reporter: auto-set to creator

**Task Types:** Story, Bug, Task, Subtask

**Priority Levels:** Urgent, High, Medium, Low, None

**Task Detail (right slide-in panel, 600px)**
- All fields inline-editable on click — no modals for field editing
- Tiptap rich text description
- Comments thread with @mention
- Activity log (all changes, actor + timestamp)
- Linked documents section
- Subtasks list (create inline)

**Subtasks**
- `parent_task_id` FK on same tasks table
- Shown nested on task detail; appear as independent cards on board

---

### 3.5 Kanban Board

- One column per project status
- Task cards: ID chip, title, priority dot, label chips, assignee avatar
- Drag-and-drop between columns → updates `status_id` + `position`
- **Optimistic UI**: update board immediately on drag; rollback on API error with toast
- Filter bar: Assignee, Priority, Label, Type (multi-select chips)
- Quick-add at bottom of each column (title only; opens full form on expand)
- Default: filter to active sprint. Toggle available for "All tasks"

---

### 3.6 Sprint Planning (Scrum)

**Backlog View — Three Sections**
1. Active Sprint (if any) — with progress bar + Complete Sprint button
2. Planned Sprints — with Start Sprint button
3. Backlog — all unassigned tasks

All sections collapsible. Tasks draggable between backlog and sprint sections.

**Sprint Lifecycle**
- Create: name, goal (optional), start date, end date
- One active sprint per project at a time (enforced at API level)
- Start → board filters to this sprint
- Complete → modal: choose to move incomplete tasks to backlog or a specific planned sprint
- Status: `planned` → `active` → `completed`

---

### 3.7 Comments & Activity

**Task Comments**
- Basic rich text: bold, italic, inline code, links
- @mention: type `@` → org member dropdown → creates notification
- Edit own comment; delete own or admin-delete any

**Activity Log**
- Append-only per task
- Records: created, field changed (field name + old → new), comment added, doc linked, assignee changed
- Displayed reverse-chronologically in task detail panel

---

### 3.8 Documentation

**Wiki Spaces**
- Org has multiple spaces (e.g. "Engineering", "Product", "Design")
- Default space created with org
- Fields: name, emoji icon, description

**Pages**
- Live inside a space; optional parent-child nesting (max 5 levels)
- Left sidebar shows full page tree (collapsible, drag to reorder within level)
- Content stored as **Tiptap/ProseMirror JSON** — never raw HTML

**Rich Text Editor**
- Headings H1–H4
- Bold, Italic, Underline, Strikethrough
- Ordered + unordered lists
- Code blocks (syntax highlighted, 15+ languages)
- Tables (resizable)
- Callout blocks: Info (blue), Warning (amber), Danger (red), Success (green)
- Horizontal dividers
- @mention users
- `/` slash command menu for all block types
- Inline task reference: type `WEB-42` → renders as linked chip

**Saving**
- Auto-save draft to `localStorage` every 30 seconds (no API call, no version created)
- Explicit "Save" → PATCH API, overwrites current content
- "Unsaved changes" indicator in header

> No version history in MVP. Future scope.

---

### 3.9 Task ↔ Doc Linking

- From task: "Link Document" → search pages by title → create link
- From doc: "Linked Tasks" sidebar → "Link task" → search tasks by ID or title
- Same underlying `task_page_links` record; unique constraint on `(task_id, page_id)`
- Both sides show linked items with navigate arrow
- Remove link: any org member
- Link creation logged in task activity

---

### 3.10 Search (Command Palette)

- Open: `Cmd/Ctrl + K` from anywhere
- Searches task titles + page titles via ILIKE
- Results strictly scoped to user's org
- Grouped: Recent (last 10, from localStorage) / Tasks / Docs
- Debounced at 300ms
- Keyboard navigation: arrows + Enter + Esc

---

### 3.11 Real-Time Notifications (WebSocket)

**Triggers**
- Task assigned to you
- @mention in task comment
- Task you reported moved to Done

**Architecture**
- FastAPI WebSocket endpoint: `WS /api/v1/ws`
- Auth via JWT in query param: `?token=...`
- In-memory `ConnectionManager` — dict of `user_id → WebSocket`
- Celery task: insert notification to DB → dispatch via `ConnectionManager`
- Graceful fallback: if user offline, notification sits in DB, delivered on next poll

**Notification Bell**
- Unread count badge (red dot)
- Dropdown: list with unread highlighted in brand-light background
- Click → navigate to entity
- Mark all read

---

## 4. Explicitly Out of Scope — MVP

| Feature | Phase |
|---------|-------|
| File attachments (S3 presigned URL) | 2 |
| Image uploads in Tiptap editor | 2 |
| Page version history + restore | 2 |
| Page templates gallery | 2 |
| Page comments (inline or thread) | 2 |
| Sprint velocity charts / analytics | 2 |
| Full-text search (tsvector + GIN) | 2 |
| Row-Level Security (PostgreSQL RLS) | 2 |
| Email notifications (user preferences) | 2 |
| GitHub integration (OAuth, webhooks) | 3 |
| Real-time collaborative editing (Yjs) | 3 |
| Billing / Stripe | 3 |
| Mobile apps | 3 |
| Custom status reordering UI | 2 |
| Epics task type | 2 |
| Bulk task operations | 2 |
| SSO / SAML | 4 |

---

## 5. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | API reads P95 < 500ms; writes P95 < 1s |
| Performance | SPA route transitions < 500ms |
| Security | Zero cross-tenant data leakage — CI-enforced |
| Security | HTTPS everywhere; JWT short TTL; bcrypt cost 12 |
| Reliability | All API errors return structured JSON, never raw 500s |
| Validation | All inputs validated via Pydantic v2 before hitting DB |
| DX | Single `docker compose up` boots entire local stack |
| Accessibility | Keyboard navigable core flows; visible focus rings |
