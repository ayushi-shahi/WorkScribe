# todo.md
## Development Task Breakdown
**Source docs:** PRD.md v1.0 · DESIGN.md v1.0 · TECH_RULES.md v1.0
**Timeline:** 12 weeks solo

---

### How to use this file with Claude

**The golden rule:** One task at a time. Never say "build the tasks module."

Instead, copy the exact task description to Claude like:
> "Do this task from my todo.md: [paste task]. Follow TECH_RULES.md. Reference PRD.md section X."

Mark tasks: `[ ]` not started · `[~]` in progress · `[x]` done

Every backend task = migration OR model OR schema OR service OR router OR test. Never combined.
Every task must pass CI before marking `[x]`.

---

## PHASE 1 — Foundation (Weeks 1–2)

### 1.1 Project Setup

- [ ] Initialize Python 3.12 project with `pyproject.toml` — configure ruff, mypy, pytest-asyncio
- [ ] Create `backend/` directory structure per TECH_RULES.md §2.1 — empty files with docstrings
- [ ] Install all backend dependencies into `requirements.txt`
- [ ] Create `app/core/config.py` — pydantic-settings `Settings` class with all env vars typed
- [ ] Create `app/core/database.py` — async engine, `AsyncSessionLocal`, `get_db()` dependency
- [ ] Create `app/models/base.py` — `Base`, `TimestampMixin` (created_at, updated_at)
- [ ] Initialize Alembic — configure `alembic/env.py` for async engine
- [ ] Create `app/main.py` — FastAPI app, CORS middleware, health check `GET /health`
- [ ] Write `Dockerfile` — multi-stage, non-root user, health check
- [ ] Write `docker-compose.yml` — api, worker, frontend, db (postgres:16), redis
- [ ] Verify `docker compose up` boots cleanly with `GET /health` returning 200
- [ ] Initialize Vite + React 19 + TypeScript project in `frontend/`
- [ ] Configure `tsconfig.json` — `strict: true`, path alias `@/` → `src/`
- [ ] Install all frontend dependencies
- [ ] Configure ESLint + Prettier + Husky + lint-staged
- [ ] Create `src/styles/tokens.css` — all CSS variables from DESIGN.md §2
- [ ] Create `src/api/client.ts` — Axios instance, base URL from env, empty interceptor stubs
- [ ] Create `src/stores/authStore.ts` — Zustand: `accessToken`, `user`, `setAuth`, `clearAuth`
- [ ] Create React Router shell in `App.tsx` — all routes stubbed with placeholder pages
- [ ] Verify frontend boots at `localhost:5173` with zero TypeScript errors
- [ ] Create `.github/workflows/ci.yml` — runs ruff, mypy, pytest, eslint, tsc on every PR

---

### 1.2 Auth — Database

- [ ] **Migration 001** — Create `organizations` table: `id, name, slug (UNIQUE), created_at, updated_at`
- [ ] **Migration 002** — Create `users` table: `id, email (UNIQUE), password_hash, display_name, avatar_url, is_active, created_at, updated_at`
- [ ] **Migration 003** — Create `org_members` table: `id, org_id (FK), user_id (FK), role (enum: owner/admin/member), joined_at` — UNIQUE(org_id, user_id)
- [ ] **Migration 004** — Create `invitations` table: `id, org_id, email, role, token (UNIQUE), expires_at, accepted_at, created_by, created_at`
- [ ] Write SQLAlchemy ORM models for all 4 tables in `app/models/`
- [ ] Add all required indexes per TECH_RULES.md §4.3

---

### 1.3 Auth — Backend API

- [ ] Create `app/schemas/auth.py` — `RegisterRequest`, `LoginRequest`, `TokenResponse`, `RefreshRequest`
- [ ] Create `app/core/security.py` — `hash_password`, `verify_password`, `create_access_token`, `create_refresh_token`, `decode_token`
- [ ] Create `app/workers/celery_app.py` — Celery instance with Redis broker
- [ ] Create `app/workers/email_tasks.py` — `send_password_reset_email` task (Resend), retry 3x
- [ ] Create `app/core/dependencies.py` — `get_current_user` (JWT decode + Redis blacklist check + DB load)
- [ ] **POST /api/v1/auth/register** — create user, return 201. Test: success, duplicate email 409, weak password 422
- [ ] **POST /api/v1/auth/login** — verify password, issue tokens, store refresh in Redis. Test: success, wrong password 401
- [ ] **POST /api/v1/auth/refresh** — validate refresh token, issue new access token. Test: success, expired 401, blacklisted 401
- [ ] **POST /api/v1/auth/logout** — blacklist jti in Redis, delete refresh token. Test: success, subsequent refresh fails
- [ ] **POST /api/v1/auth/forgot-password** — queue email task, always return 204. Test: known + unknown email both return 204
- [ ] **POST /api/v1/auth/reset-password** — validate Redis token, update password hash. Test: success, expired 400

---

### 1.4 Org & Members — Backend API

- [ ] Create `app/schemas/organization.py` — `OrgCreate`, `OrgRead`, `MemberRead`, `InviteRequest`
- [ ] Create `app/services/auth_service.py` — `register`, `login`, `refresh`, `logout`
- [ ] **POST /api/v1/organizations** — create org + add creator as Owner + create default wiki space. Test: success, duplicate slug 409
- [ ] **GET /api/v1/organizations/{slug}** — return org detail. Test: member 200, non-member 403
- [ ] **PATCH /api/v1/organizations/{slug}** — update name/slug (Owner/Admin only). Test: permission levels
- [ ] **GET /api/v1/organizations/{slug}/members** — list members with roles. Test: non-member 403
- [ ] **POST /api/v1/organizations/{slug}/invite** — create invitation + queue email task. Test: success, already member 409, non-admin 403
- [ ] **POST /api/v1/auth/invitations/{token}/accept** — validate token, create/login user, add to org. Test: success, expired 400, already accepted 400
- [ ] **DELETE /api/v1/organizations/{slug}/invitations/{id}** — revoke pending invite (Owner/Admin). Test: permissions
- [ ] **PATCH /api/v1/organizations/{slug}/members/{user_id}** — change role. Test: owner can change any, cannot demote last owner
- [ ] **DELETE /api/v1/organizations/{slug}/members/{user_id}** — remove member. Test: cannot remove last owner
- [ ] Write `app/workers/email_tasks.py` — add `send_invitation_email` task
- [ ] Write cross-tenant isolation test in `tests/test_isolation.py` — user A cannot read user B's org

---

### 1.5 Auth & Org — Frontend

- [ ] Build `/register` page — form with display name, email, password, confirm password. Client validation before submit. Field-level API errors.
- [ ] Build `/login` page — email, password, "Forgot password?" link. On success → `/org/{slug}/dashboard`
- [ ] Build `/forgot-password` page — email input + success message shown after submit
- [ ] Build `/reset-password?token=...` page — new password + confirm
- [ ] Build org creation wizard — Step 1: org name + slug (real-time availability check, debounced 500ms). Step 2: optional invite. On complete → dashboard
- [ ] Build `/invitations/:token` accept page — shows org name, inviter, one-click accept or register form
- [ ] Implement `useAuth` hook wrapping auth Zustand store
- [ ] Implement token refresh in Axios response interceptor — queue concurrent 401s, refresh once, replay all. On failure → logout
- [ ] Implement `ProtectedRoute` — redirect to `/login` preserving intended URL in router state
- [ ] Build `OrgLayout` — topbar + sidebar + main content shell. Wire nav items.
- [ ] Build sidebar with projects list, wiki spaces list, nav items from DESIGN.md §3.2
- [ ] Build topbar with logo, org switcher, search bar (opens command palette), notif bell, avatar

---

## PHASE 2 — Task Management (Weeks 3–5)

### 2.1 Tasks — Database

- [ ] **Migration 005** — Create `projects` table: `id, org_id, name, key (UNIQUE per org), description, type (enum: kanban/scrum), archived_at, created_at, updated_at`
- [ ] **Migration 006** — Create `task_statuses` table: `id, org_id, project_id, name, category (enum: todo/in_progress/done), position (int), color (hex)`
- [ ] **Migration 007** — Create `labels` table + `task_labels` junction table
- [ ] **Migration 008** — Create `project_task_counters` table: `project_id (PK), last_number INT DEFAULT 0`
- [ ] **Migration 009** — Create `tasks` table: `id, org_id, project_id, number (int), title, description_json (jsonb), status_id (FK), assignee_id (FK nullable), reporter_id (FK), priority (enum), type (enum), parent_task_id (self-ref nullable), position (int), due_date (date nullable), created_at, updated_at`
- [ ] **Migration 010** — Seed default statuses function (called per project on creation): To Do (todo), In Progress (in_progress), In Review (in_progress), Done (done)
- [ ] **Migration 011** — Create `comments` table: `id, org_id, task_id (FK), author_id (FK), content_json (jsonb), created_at, updated_at`
- [ ] **Migration 012** — Create `activity_log` table: `id, org_id, task_id (FK), actor_id (FK), action (text), field_name (text nullable), old_value (text nullable), new_value (text nullable), created_at`
- [ ] Write ORM models for all tables
- [ ] Add all required indexes per TECH_RULES.md §4.3 + task-specific indexes §4.3

---

### 2.2 Projects — Backend API

- [ ] Create `app/schemas/project.py` — `ProjectCreate`, `ProjectRead`, `StatusRead`
- [ ] Create `app/services/project_service.py`
- [ ] **GET /api/v1/organizations/{slug}/projects** — list org projects. Test: non-member 403
- [ ] **POST /api/v1/organizations/{slug}/projects** — create project + seed default statuses + create task counter. Test: success, duplicate key 409, non-admin 403
- [ ] **GET /api/v1/projects/{project_id}** — project detail with statuses list. Test: cross-org 403
- [ ] **PATCH /api/v1/projects/{project_id}** — update name, description. Test: non-admin 403
- [ ] **DELETE /api/v1/projects/{project_id}** — soft delete (set archived_at). Test: non-owner 403
- [ ] **GET /api/v1/projects/{project_id}/statuses** — list statuses ordered by position

---

### 2.3 Tasks — Backend API

- [ ] Create `app/schemas/task.py` — `TaskCreate`, `TaskRead`, `TaskUpdate`, `TaskListItem`
- [ ] Create `app/services/task_service.py`
- [ ] **GET /api/v1/projects/{project_id}/tasks** — list with filters (status, assignee, priority, type, label, sprint, search title ILIKE). Paginated. Test: filters work, cross-org 403
- [ ] **POST /api/v1/projects/{project_id}/tasks** — create task. Use `SELECT ... FOR UPDATE` on `project_task_counters` to increment number. Log TASK_CREATED to activity. Test: success, task number increments correctly under concurrency (2 concurrent creates = different numbers)
- [ ] **GET /api/v1/tasks/{task_id}** — task detail with status, assignee, labels, subtasks count, linked docs count. Test: cross-org 403
- [ ] **PATCH /api/v1/tasks/{task_id}** — partial update any field. Log every changed field to activity_log (old_value → new_value). Test: each field update logs correctly
- [ ] **DELETE /api/v1/tasks/{task_id}** — delete task (admin) or own task (member). Test: permissions
- [ ] **PATCH /api/v1/tasks/{task_id}/move** — update status_id + position in one call (board drag target). Test: optimistic rollback scenario
- [ ] **PATCH /api/v1/tasks/bulk-positions** — batch update positions after reorder within column. Body: `[{task_id, position}]`. Single transaction.
- [ ] **GET /api/v1/tasks/{task_id}/comments** — list comments
- [ ] **POST /api/v1/tasks/{task_id}/comments** — add comment, parse @mentions (extract user_ids from JSON), queue notification task for each mention. Test: @mention triggers notification
- [ ] **PATCH /api/v1/tasks/{task_id}/comments/{comment_id}** — edit own comment. Test: cannot edit others' 403
- [ ] **DELETE /api/v1/tasks/{task_id}/comments/{comment_id}** — delete own or admin
- [ ] **GET /api/v1/tasks/{task_id}/activity** — activity log for task, reverse chronological

---

### 2.4 Sprints — Database + Backend

- [ ] **Migration 013** — Create `sprints` table: `id, org_id, project_id, name, goal (text nullable), status (enum: planned/active/completed), start_date, end_date, created_at, updated_at`
- [ ] **Migration 014** — Add `sprint_id (FK nullable)` column to `tasks` table
- [ ] Write ORM model updates
- [ ] Create `app/schemas/sprint.py` — `SprintCreate`, `SprintRead`
- [ ] Create `app/services/sprint_service.py`
- [ ] **GET /api/v1/projects/{project_id}/sprints** — list sprints with task counts
- [ ] **POST /api/v1/projects/{project_id}/sprints** — create sprint (non-admin 403). Test: success
- [ ] **PATCH /api/v1/sprints/{sprint_id}** — update name, goal, dates
- [ ] **POST /api/v1/sprints/{sprint_id}/start** — set status=active. Enforce: only one active sprint per project. Test: starting second sprint 409
- [ ] **POST /api/v1/sprints/{sprint_id}/complete** — set status=completed. Body: `{incomplete_action: "backlog"|"sprint", target_sprint_id?}`. Move incomplete tasks. Return summary. Test: tasks moved correctly
- [ ] **GET /api/v1/projects/{project_id}/backlog** — tasks with `sprint_id IS NULL`, paginated. Test: sprint tasks not included

---

### 2.5 Task Management — Frontend

#### Board
- [ ] Build `BoardPage` — fetch board data (tasks grouped by status) with `useQuery`
- [ ] Build `BoardColumn` component — column header (dot + name + count) + task list + add button. Per DESIGN.md §4.1
- [ ] Build `TaskCard` component — per DESIGN.md §4.1 spec. Priority dot, ID, title, label chips, avatar
- [ ] Implement drag-and-drop with `@dnd-kit/core` + `@dnd-kit/sortable`
  - [ ] Drag within column → reorder (bulk-positions endpoint)
  - [ ] Drag between columns → move task (move endpoint) with optimistic update per TECH_RULES.md §3.2
  - [ ] Drag ghost card styling (rotate + scale)
  - [ ] Drop target column highlight (dashed border)
  - [ ] Rollback on API error with error toast
- [ ] Build board filter toolbar — Assignee, Priority, Label, Type as multi-select pill filters
- [ ] Build `CreateTaskModal` — full form (all fields). Validation: title required
- [ ] Build quick-add inline at bottom of column (title only)
- [ ] Wire sprint filter: default to active sprint, "All tasks" toggle

#### Task Panel
- [ ] Build `TaskPanel` component — right slide-in 600px per DESIGN.md §4.2
- [ ] Open via URL query param `?task=WEB-42` — update URL without navigation
- [ ] Slide animation: `translateX(600px → 0)` 250ms ease-out + overlay
- [ ] Implement all inline-editable fields: Status (dropdown), Assignee (user picker), Priority (dropdown), Sprint (dropdown), Due Date (date picker), Labels (multi-select)
- [ ] Tiptap description editor — inline in panel, auto-save draft to localStorage 30s
- [ ] Comments section — list + add comment form. @mention: type `@` → org members dropdown
- [ ] Activity log timeline — reverse chronological
- [ ] Linked docs section — placeholder "Link document" button (wired in Phase 4)
- [ ] Subtasks section — inline create + list

#### Backlog
- [ ] Build `BacklogPage` — three collapsible sections per DESIGN.md §4.3
- [ ] Sprint section header with progress bar, task count, action button
- [ ] Task row component — checkbox, ID (mono), title, label chip, priority dot, avatar
- [ ] Drag tasks between backlog ↔ sprint sections
- [ ] "Create Sprint" modal — name, goal, date range
- [ ] "Start Sprint" button with confirmation
- [ ] "Complete Sprint" modal — shows incomplete count, choose destination (backlog / next sprint dropdown)

---

## PHASE 3 — Documentation (Weeks 6–8)

### 3.1 Docs — Database

- [ ] **Migration 015** — Create `doc_spaces` table: `id, org_id, name, description, icon_emoji, created_at, updated_at`
- [ ] **Migration 016** — Create `pages` table: `id, org_id, space_id (FK), parent_page_id (self-ref nullable), title, content_json (jsonb default '{}'), author_id (FK), last_edited_by (FK), position (int default 1000), created_at, updated_at`
- [ ] Add index on `pages(space_id, parent_page_id)` for tree queries
- [ ] Write ORM models for both tables

---

### 3.2 Docs — Backend API

- [ ] Create `app/schemas/page.py` — `SpaceCreate`, `SpaceRead`, `PageCreate`, `PageRead`, `PageUpdate`, `PageTreeNode`
- [ ] Create `app/services/page_service.py`
- [ ] **GET /api/v1/organizations/{slug}/spaces** — list spaces for org
- [ ] **POST /api/v1/organizations/{slug}/spaces** — create space. Auto-create welcome page.
- [ ] **PATCH /api/v1/spaces/{space_id}** — update name, emoji, description
- [ ] **DELETE /api/v1/spaces/{space_id}** — only if no pages (else 409 with page count)
- [ ] **GET /api/v1/spaces/{space_id}/tree** — full page tree as nested JSON using recursive CTE query. Returns: `[{id, title, position, children: [...]}]`
- [ ] **POST /api/v1/spaces/{space_id}/pages** — create page with optional `parent_page_id`. Auto-set position = max sibling position + 1000. Test: tree nesting correct
- [ ] **GET /api/v1/pages/{page_id}** — page detail with full content_json. Test: cross-org 403
- [ ] **PATCH /api/v1/pages/{page_id}** — update title + content_json. Test: cross-org 403
- [ ] **DELETE /api/v1/pages/{page_id}** — delete. If has children: return 409 with `{child_count}`. Accept `?force=true` to cascade delete children.
- [ ] **PATCH /api/v1/pages/{page_id}/move** — update `parent_page_id` + `position`. Test: cannot move to child of itself
- [ ] Tests for all endpoints including tree structure verification

---

### 3.3 Docs — Frontend

- [ ] Build `WikiLayout` — three-column layout per DESIGN.md §4.4 (page tree 220px + editor flex + linked tasks 200px)
- [ ] Build `PageTree` component — recursive tree rendering. Collapse/expand per node (state in localStorage). Hover reveals `[···]` menu. Active page highlighted.
- [ ] Build wiki space sidebar section (in main left sidebar) — list spaces, click to load tree
- [ ] Build `PageEditorPage` — breadcrumb + title input (26px, weight 800) + meta bar + toolbar + editor + linked tasks panel
- [ ] Integrate Tiptap editor with extensions:
  - [ ] StarterKit (headings, bold, italic, lists, code, blockquote, history)
  - [ ] Table + TableRow + TableHeader + TableCell (with column resize)
  - [ ] Placeholder extension
  - [ ] Mention extension — `@` triggers org members dropdown, stores as JSON node
  - [ ] Custom `SlashCommands` extension — `/` opens block menu: heading1, heading2, codeblock, table, callout, divider
  - [ ] Custom `Callout` node extension — info/warning/danger/success variants per DESIGN.md §4.4
  - [ ] Custom `TaskReference` inline extension — detect `WEB-42` pattern → render as linked chip
- [ ] Wire auto-save: `setInterval` every 30s → save content to `localStorage` keyed by `page:{pageId}`
- [ ] Wire explicit Save button → PATCH API → clear localStorage draft → show "Saved" confirmation
- [ ] "Unsaved changes" dot indicator in header when localStorage draft differs from last API save
- [ ] Build "New Space" modal — name, emoji picker, description
- [ ] Build "New Page" button — inline title input in tree, then navigate to new page
- [ ] Page tree drag to reorder — calls move endpoint

---

## PHASE 4 — Integration & Notifications (Weeks 9–10)

### 4.1 Task ↔ Doc Linking

- [ ] **Migration 017** — Create `task_page_links` table: `id, org_id, task_id (FK), page_id (FK), created_by (FK), created_at` — UNIQUE(task_id, page_id)
- [ ] Write ORM model
- [ ] **POST /api/v1/tasks/{task_id}/links** — link page to task. Validate same org. Log to activity_log. Test: success, cross-org 403, duplicate 409
- [ ] **DELETE /api/v1/tasks/{task_id}/links/{page_id}** — unlink
- [ ] **GET /api/v1/tasks/{task_id}/links** — list linked pages (title, space name, updated_at)
- [ ] **GET /api/v1/pages/{page_id}/tasks** — list linked tasks (id, title, status, assignee)
- [ ] Update `GET /api/v1/tasks/{task_id}` — include linked pages preview (max 5)
- [ ] Wire "Link document" button in TaskPanel — searchable page picker modal, calls link endpoint, refreshes linked docs section
- [ ] Wire "Linked Tasks" panel in wiki editor — shows linked tasks with status chips, "Link task" button opens task picker modal, calls link endpoint
- [ ] Show inline task reference chips in Tiptap as actual links (click → opens task panel)

---

### 4.2 Notifications — Database + Backend

- [ ] **Migration 018** — Create `notifications` table: `id, org_id, user_id (FK), type (enum), title, body, entity_type, entity_id, is_read (bool default false), created_at`
- [ ] Write ORM model
- [ ] Create `app/services/notification_service.py` — `create_and_dispatch(user_id, type, title, body, entity_type, entity_id, org_id)`
- [ ] Create `app/workers/notification_tasks.py` — Celery task that calls `notification_service.create_and_dispatch`, then calls `manager.send_to_user`
- [ ] Create `app/routers/websocket.py` — `WS /api/v1/ws?token={jwt}`. Auth on connect. Register in `ConnectionManager`. On disconnect: unregister.
- [ ] Wire notification dispatch into task service:
  - [ ] On task assigned → notify assignee (type: `TASK_ASSIGNED`)
  - [ ] On @mention in comment → notify mentioned users (type: `MENTION`)
  - [ ] On task moved to Done → notify reporter (type: `TASK_DONE`)
- [ ] **GET /api/v1/notifications** — list user's notifications, `?unread=true` filter, paginated
- [ ] **PATCH /api/v1/notifications/{id}/read** — mark single read
- [ ] **POST /api/v1/notifications/mark-all-read** — mark all read for user

---

### 4.3 Notifications + Search — Frontend

- [ ] Build `useWebSocket` hook — connect on auth, reconnect on disconnect (exponential backoff), dispatch to TanStack Query cache on message received
- [ ] Build notification bell with unread count badge (red dot) in topbar
- [ ] Build `NotificationsPanel` dropdown per DESIGN.md §4.7 — unread highlighted, click to navigate
- [ ] "Mark all read" clears badge + calls API
- [ ] Build `CommandPalette` component per DESIGN.md §4.6
  - [ ] Open: `Cmd/Ctrl + K` global keyboard shortcut registered in `App.tsx`
  - [ ] Input debounced 300ms → calls `/api/v1/organizations/{slug}/search?q=...`
  - [ ] Results grouped: Recent (from localStorage) / Tasks / Docs
  - [ ] Keyboard: arrows navigate, Enter selects, Esc closes
  - [ ] Task result → set `?task=WEB-42` URL param (opens panel)
  - [ ] Doc result → navigate to page URL
  - [ ] Recent items: save last 10 visited to `localStorage` on open

---

### 4.4 Search — Backend

- [ ] **GET /api/v1/organizations/{slug}/search** — query param `q` (required), optional `type` filter
  - Search tasks: `ILIKE '%q%'` on `title`, scoped to `org_id`
  - Search pages: `ILIKE '%q%'` on `title`, scoped to `org_id`
  - Merge results, sort: exact match first, then by `updated_at DESC`
  - Return: `[{type: "task"|"page", id, title, subtitle, url, updated_at}]`
  - Test: results only from user's org, both types returned, empty `q` returns 422

---

## PHASE 5 — Polish & Deploy (Weeks 11–12)

### 5.1 Dashboard

- [ ] Build `DashboardPage` — 3-column grid per DESIGN.md §4.5
- [ ] Sprint summary cards — fetch active sprints across all user's projects
- [ ] My Tasks list — fetch tasks assigned to current user, grouped by project
- [ ] Recent Activity feed — `GET /api/v1/organizations/{slug}/activity` endpoint (last 20 activity_log entries for org)
- [ ] Quick actions panel — create task, new page, view backlog
- [ ] **GET /api/v1/organizations/{slug}/activity** — paginated org-level activity feed

### 5.2 Performance

- [ ] Add Redis cache to board endpoint (TTL: 30s). Invalidate cache key on any task update in that project.
- [ ] Add Redis cache to page tree endpoint (TTL: 60s). Invalidate on any page create/move/delete.
- [ ] Frontend: lazy-load all page-level components with `React.lazy` + `Suspense`
- [ ] Verify all list endpoints are paginated — none return unbounded results

### 5.3 Security Hardening

- [ ] Audit every API endpoint — confirm `get_current_user` dependency on all non-auth routes
- [ ] Grep codebase for any raw SQL with string interpolation — fix any found
- [ ] Verify cross-tenant isolation test covers: tasks, pages, projects, org members
- [ ] Add rate limiting middleware — Redis counter, 100 req/min per IP. Return 429.
- [ ] Review all CORS origins — ensure only `VITE_API_URL` origins allowed in production

### 5.4 UX Polish

- [ ] Empty states on all list views — board columns, backlog, wiki, search results
- [ ] Loading skeletons (not spinners) on board, backlog, wiki page tree, dashboard
- [ ] Error boundaries on all pages — catch render errors, show "Something went wrong" with retry
- [ ] Toast for all async action outcomes (success + error) — create task, save page, link doc
- [ ] `<title>` tag updates per page using `react-helmet-async`
- [ ] 404 page for unknown routes
- [ ] Keyboard shortcut `C` on board page → opens CreateTaskModal

### 5.5 Deploy Prep

- [ ] Write production `Dockerfile` (no `--reload`, proper workers: `--workers 4`)
- [ ] Write production `docker-compose.prod.yml` — no source mounts, proper env vars
- [ ] Set up PostgreSQL on Railway / Render / Fly.io
- [ ] Set up Redis on Railway / Render / Upstash
- [ ] Configure all production environment variables
- [ ] Run `alembic upgrade head` on production DB
- [ ] Deploy frontend to Vercel / Netlify (set `VITE_API_URL` env var)
- [ ] Verify WebSocket connection works through production proxy
- [ ] Smoke test full flow in production: register → create org → invite member → create task → create doc → link them → get real-time notification

### 5.6 Portfolio Cleanup

- [ ] Write `README.md` — what it is, how to run locally, tech stack, architecture diagram, screenshots
- [ ] Add demo credentials to README (pre-seeded demo org with sample data)
- [ ] Write seed script `scripts/seed_demo.py` — creates demo org, 3 users, 2 projects, 20 tasks, 5 pages
- [ ] Record a 2-minute demo video showing: board drag-drop, task panel with linked doc, wiki editor, real-time notification
- [ ] Add architecture diagram to README (can use Mermaid or draw.io)

---

## Progress Tracker

| Phase | Status | Target |
|-------|--------|--------|
| 1 — Foundation | Not started | Week 2 |
| 2 — Task Management | Not started | Week 5 |
| 3 — Documentation | Not started | Week 8 |
| 4 — Integration & Notifications | Not started | Week 10 |
| 5 — Polish & Deploy | Not started | Week 12 |

---

## Future Scope (Post-MVP Reference)

- File attachments on tasks (S3 presigned URL flow)
- Image uploads inside Tiptap editor
- Page version history + restore
- Page templates gallery
- Sprint velocity charts
- Full-text search (tsvector + GIN indexes + Meilisearch)
- Row-Level Security (PostgreSQL RLS)
- GitHub integration (OAuth + webhooks + auto-link PRs by task ID)
- Real-time collaborative editing (Yjs + Tiptap CollaborationExtension)
- Email notifications with user preferences
- Billing / Stripe
- Mobile apps
