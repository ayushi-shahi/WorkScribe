# WorkScribe — Progress Doc

**Last Updated:** 2026-03-23
**Latest Commit:** `604754c fix: use verified workscribe.noreply@gmail.com as Brevo sender`
**Alembic Head:** `d4e5f6a1b2c3` (create_notifications_table)
**API (prod):** `https://workscribe-api.onrender.com`
**Frontend (prod):** `https://work-scribe.vercel.app`

---

## Overall Status

| Phase | Feature                     | Status               |
| ----- | --------------------------- | -------------------- |
| 1     | Foundation & Infrastructure | ✅ Complete          |
| 2.1   | Auth                        | ✅ Complete & Tested |
| 2.2   | Organizations & Members     | ✅ Complete & Tested |
| 2.3   | Projects + Tasks            | ✅ Complete & Tested |
| 2.4   | Sprints                     | ✅ Complete & Tested |
| 5     | Wiki / Pages                | ✅ Complete & Tested |
| 5.2   | Performance (Redis Caching) | ✅ Complete & Tested |
| 6.1   | Task ↔ Doc Linking         | ✅ Complete & Tested |
| 6.2   | Notifications DB + REST API | ✅ Complete & Tested |
| 6.3   | Celery → BackgroundTasks   | ✅ Complete & Tested |
| 6.5   | Search                      | ✅ Complete & Tested |
| 7.1   | Dashboard                   | ✅ Complete & Tested |
| 7.2   | Security Audit              | ✅ Complete & Tested |
| 8.1   | Google OAuth                | ✅ Complete & Tested |
| —    | API Hardening — Gaps 1–5  | ✅ Complete & Tested |
| —    | Labels API + UI             | ✅ Complete & Tested |
| J1    | My Work page + RBAC audit   | ✅ Complete & Tested |
| J2    | Empty states                | ✅ Complete & Tested |
| J3    | Error boundaries            | ✅ Complete & Tested |
| J4    | Loading skeletons audit     | ✅ Complete & Tested |
| J5    | Production build + deploy   | 🔄 In Progress       |
| J6    | Performance optimization    | ⬜                   |

**Backend: 100% complete.**
**Frontend: All features complete through J4. J5 deploy in progress — Vercel live, Render live, Brevo email suspended pending reactivation.**

---

## Phase 1 — Foundation & Infrastructure ✅

### Project Setup

* Python 3.12 project with `pyproject.toml`
* `backend/` directory structure per TECH_RULES.md
* All backend dependencies in `requirements.txt`
* `app/core/config.py` — pydantic-settings with all env vars
* `app/core/database.py` — async engine, session, `get_db()`
* `app/models/base.py` — `Base`, `TimestampMixin`, `UUIDMixin`
* Alembic configured with async engine
* `app/main.py` — FastAPI app, CORS, health check
* `Dockerfile` — multi-stage, non-root user (`appuser`)
* `docker-compose.yml` — api, db (PostgreSQL), redis (worker removed after Celery migration)
* Docker Compose verified working with health check

---

## Phase 2.1 — Authentication ✅

### Migrations

| #   | Revision | Description                                                          |
| --- | -------- | -------------------------------------------------------------------- |
| 001 | (auto)   | Create organizations table                                           |
| 002 | (auto)   | Create users table                                                   |
| 003 | (auto)   | Create org_members table + role enum                                 |
| 004 | (auto)   | Create invitations table                                             |
| 005 | (auto)   | Add OAuth fields to users (oauth_provider, oauth_id, email_verified) |

### ORM Models

* `app/models/organization.py` — Organization
* `app/models/user.py` — User (password_hash nullable for OAuth)
* `app/models/member.py` — OrgMember, OrgRole enum (owner/admin/member)
* `app/models/invitation.py` — Invitation

### Core Infrastructure

* `app/schemas/auth.py` — all auth request/response schemas
* `app/core/security.py` — bcrypt password hash, JWT encode/decode
* `app/workers/email_tasks.py` — plain functions: `send_invitation_email`, `send_password_reset_email` (Brevo HTTP API, no Celery)
* `app/core/dependencies.py` — `get_current_user`, `get_org_member`, `require_role`

### Endpoints Tested ✅

| Method | Path                                        | Description                           |
| ------ | ------------------------------------------- | ------------------------------------- |
| POST   | `/api/v1/auth/register`                   | Register user, return JWT             |
| POST   | `/api/v1/auth/login`                      | Login, issue access + refresh tokens  |
| POST   | `/api/v1/auth/refresh`                    | Refresh access token                  |
| POST   | `/api/v1/auth/logout`                     | Blacklist JTI, delete refresh token   |
| POST   | `/api/v1/auth/forgot-password`            | Queue reset email (always 204)        |
| POST   | `/api/v1/auth/reset-password`             | Validate token, update password       |
| GET    | `/api/v1/auth/me`                         | Get current user profile              |
| GET    | `/api/v1/auth/orgs`                       | List orgs the current user belongs to |
| GET    | `/api/v1/auth/invitations/{token}`        | Get invite details (org, role, email) |
| POST   | `/api/v1/auth/invitations/{token}/accept` | Accept org invitation + auto-login    |

---

## Phase 2.2 — Organizations & Members ✅

### Files

* `app/schemas/organization.py`
* `app/services/auth_service.py`
* `app/services/organization_service.py`
* `app/routers/organizations.py`

### Endpoints Tested ✅

| Method | Path                                               | Description                    |
| ------ | -------------------------------------------------- | ------------------------------ |
| POST   | `/api/v1/organizations`                          | Create org + auto-assign Owner |
| GET    | `/api/v1/organizations/{slug}`                   | Get org detail                 |
| PATCH  | `/api/v1/organizations/{slug}`                   | Update name/slug (Owner/Admin) |
| GET    | `/api/v1/organizations/{slug}/members`           | List members with roles        |
| POST   | `/api/v1/organizations/{slug}/invite`            | Invite member + send email     |
| DELETE | `/api/v1/organizations/{slug}/invitations/{id}`  | Revoke invite                  |
| PATCH  | `/api/v1/organizations/{slug}/members/{user_id}` | Change role                    |
| DELETE | `/api/v1/organizations/{slug}/members/{user_id}` | Remove member                  |

### Invite Flow Notes

* Re-invite: existing pending invite is auto-deleted and a fresh one created (no 409)
* Accept endpoint returns `TokenResponse` (auto-login after accept)
* New users: must supply `display_name` + `password` in accept body
* Existing users: just accepts, no extra fields needed
* Email delivery: Brevo HTTP API via `httpx.post` to `https://api.brevo.com/v3/smtp/email`
* Sender: `workscribe.noreply@gmail.com` (verified in Brevo)

---

## Phase 2.3 — Projects + Tasks ✅

### Migrations

| #    | Revision         | Description                          |
| ---- | ---------------- | ------------------------------------ |
| 006  | (auto)           | Create projects table                |
| 007  | (auto)           | Create task_statuses table           |
| 008  | (auto)           | Create labels + task_labels junction |
| 009  | (auto)           | Create project_task_counters table   |
| 010  | (auto)           | Create tasks table                   |
| 011  | (auto)           | Seed default task statuses trigger   |
| 012  | (auto)           | Create comments table                |
| 012b | `0648337901e5` | Create activity_log table            |

### ORM Models

* `app/models/project.py` — Project, ProjectType enum
* `app/models/task_status.py` — TaskStatus, StatusCategory enum
* `app/models/label.py` — Label, TaskLabel
* `app/models/task.py` — Task, TaskPriority, TaskType enums
* `app/models/comment.py` — Comment
* `app/models/activity_log.py` — ActivityLog

### Files

* `app/schemas/project.py` — includes `StatusRead` schema
* `app/schemas/task.py`
* `app/services/project_service.py`
* `app/services/task_service.py`
* `app/routers/projects.py`
* `app/routers/tasks.py`

### Project Endpoints Tested ✅

| Method | Path                                                    | Description                    |
| ------ | ------------------------------------------------------- | ------------------------------ |
| GET    | `/api/v1/organizations/{slug}/projects`               | List projects                  |
| POST   | `/api/v1/organizations/{slug}/projects`               | Create project + seed statuses |
| GET    | `/api/v1/organizations/{slug}/projects/{id}`          | Get project detail             |
| PATCH  | `/api/v1/organizations/{slug}/projects/{id}`          | Update project                 |
| DELETE | `/api/v1/organizations/{slug}/projects/{id}`          | Archive (soft delete)          |
| GET    | `/api/v1/organizations/{slug}/projects/{id}/statuses` | List project statuses          |

### Task Endpoints Tested ✅

| Method | Path                                                   | Description                            |
| ------ | ------------------------------------------------------ | -------------------------------------- |
| POST   | `/api/v1/organizations/{slug}/projects/{id}/tasks`   | Create task (auto-ID)                  |
| GET    | `/api/v1/organizations/{slug}/projects/{id}/tasks`   | List tasks (filtered, paginated)       |
| GET    | `/api/v1/organizations/{slug}/projects/{id}/backlog` | List backlog tasks (sprint_id IS NULL) |
| GET    | `/api/v1/organizations/{slug}/my-tasks`              | List tasks assigned to current user    |
| GET    | `/api/v1/tasks/{id}`                                 | Get task detail                        |
| PATCH  | `/api/v1/tasks/{id}`                                 | Update task + activity log             |
| DELETE | `/api/v1/tasks/{id}`                                 | Delete task                            |
| PATCH  | `/api/v1/tasks/{id}/move`                            | Move task status/position              |
| PATCH  | `/api/v1/tasks/bulk-positions`                       | Batch update positions                 |
| GET    | `/api/v1/tasks/{id}/comments`                        | List comments (paginated)              |
| POST   | `/api/v1/tasks/{id}/comments`                        | Add comment                            |
| PATCH  | `/api/v1/tasks/{id}/comments/{comment_id}`           | Edit comment                           |
| DELETE | `/api/v1/tasks/{id}/comments/{comment_id}`           | Delete comment                         |
| GET    | `/api/v1/tasks/{id}/activity`                        | Get task activity log (paginated)      |

---

## Phase 2.4 — Sprints ✅

### Migrations

| #   | Revision         | Description            |
| --- | ---------------- | ---------------------- |
| 013 | `b4fb5d09bb90` | Create sprints table   |
| 014 | `70e071b82b25` | Add sprint_id to tasks |

### Files

* `app/models/sprint.py` — Sprint, SprintStatus enum
* `app/schemas/sprint.py`
* `app/services/sprint_service.py`
* `app/routers/sprints.py`

### Endpoints Tested ✅

| Method | Path                                                   | Description                           |
| ------ | ------------------------------------------------------ | ------------------------------------- |
| POST   | `/api/v1/organizations/{slug}/projects/{id}/sprints` | Create sprint                         |
| GET    | `/api/v1/organizations/{slug}/projects/{id}/sprints` | List sprints                          |
| PATCH  | `/api/v1/sprints/{id}`                               | Update sprint                         |
| POST   | `/api/v1/sprints/{id}/start`                         | Start sprint (one active per project) |
| POST   | `/api/v1/sprints/{id}/complete`                      | Complete sprint                       |
| DELETE | `/api/v1/sprints/{id}`                               | Delete sprint                         |
| POST   | `/api/v1/sprints/{id}/tasks`                         | Assign task to sprint                 |
| DELETE | `/api/v1/sprints/{id}/tasks/{task_id}`               | Remove task from sprint (→ backlog)  |

---

## Phase 5 — Wiki / Pages ✅

### Migrations

| #   | Revision         | Description        |
| --- | ---------------- | ------------------ |
| 015 | `a1b2c3d4e5f6` | Create wiki_spaces |
| 016 | `b2c3d4e5f6a1` | Create pages       |

### ORM Models

* `app/models/wiki.py` — WikiSpace, Page

### Files

* `app/schemas/wiki.py`
* `app/services/wiki_service.py`
* `app/routers/pages.py`

### Endpoints Tested ✅

| Method | Path                                         | Description                                         |
| ------ | -------------------------------------------- | --------------------------------------------------- |
| POST   | `/api/v1/organizations/{slug}/wiki/spaces` | Create wiki space                                   |
| GET    | `/api/v1/organizations/{slug}/wiki/spaces` | List spaces (paginated)                             |
| PATCH  | `/api/v1/wiki/spaces/{id}`                 | Update space                                        |
| DELETE | `/api/v1/wiki/spaces/{id}`                 | Delete space (409 if pages exist)                   |
| POST   | `/api/v1/wiki/spaces/{id}/pages`           | Create page                                         |
| GET    | `/api/v1/wiki/spaces/{id}/pages`           | List pages (tree)                                   |
| GET    | `/api/v1/wiki/pages/{id}`                  | Get page detail                                     |
| PATCH  | `/api/v1/wiki/pages/{id}`                  | Update page                                         |
| DELETE | `/api/v1/wiki/pages/{id}`                  | Soft delete (409 if children, ?force=true cascades) |
| POST   | `/api/v1/wiki/pages/{id}/move`             | Move page in tree                                   |

### Search Bug Fix (2026-03-14)

* `_search_pages` was filtering `Page.is_deleted.is_(False)` — changed to `Page.is_deleted.isnot(True)` to match NULL rows
* Frontend `searchApi` was returning `res.data` (object) instead of `res.data.results` (array) — fixed in `src/api/endpoints/search.ts`

---

## Phase 5.2 — Performance (Redis Caching) ✅

### Caching Strategy

**Board (task list):**

* Cache key: `board:{org_id}:{project_id}` · TTL: 30s
* Cached only on unfiltered requests with default pagination (skip=0, limit=25)
* Invalidated by: `create_task`, `update_task`, `delete_task`, `move_task`, `bulk_update_positions`, `add_task_to_sprint`, `remove_task_from_sprint`

**Page tree:**

* Cache key: `page_tree:{org_id}:{space_id}` · TTL: 60s
* Always cached (no filter variants for tree endpoint)
* Invalidated by: `create_page`, `update_page`, `delete_page`, `move_page`

### Serialization

* `.model_dump_json()` → stored as string in Redis
* `.model_validate_json(cached)` on retrieval
* All cache errors fail silently with `logger.warning`

---

## Phase 6.1 — Task ↔ Page Linking ✅

### Migrations

| #   | Revision         | Description            |
| --- | ---------------- | ---------------------- |
| 017 | `c3d4e5f6a1b2` | Create task_page_links |

### Files

* `app/models/task_page_link.py` — TaskPageLink
* `app/schemas/task_page_link.py`
* `app/services/task_page_link_service.py`
* `app/routers/task_page_links.py`

### Endpoints Tested ✅

| Method | Path                                   | Description               |
| ------ | -------------------------------------- | ------------------------- |
| POST   | `/api/v1/tasks/{id}/links`           | Link page to task         |
| DELETE | `/api/v1/tasks/{id}/links/{page_id}` | Unlink page from task     |
| GET    | `/api/v1/tasks/{id}/links`           | List pages linked to task |
| GET    | `/api/v1/pages/{id}/tasks`           | List tasks linked to page |

---

## Phase 6.2 — Notifications Database + REST API ✅

### Migrations

| #   | Revision         | Description                |
| --- | ---------------- | -------------------------- |
| 018 | `d4e5f6a1b2c3` | Create notifications table |

### Files

* `app/models/notification.py` — Notification model, NotificationType enum
* `app/schemas/notification.py`
* `app/services/notification_service.py`
* `app/routers/notifications.py`

### Endpoints Tested ✅

| Method | Path                                    | Description                      |
| ------ | --------------------------------------- | -------------------------------- |
| GET    | `/api/v1/notifications`               | List notifications (paginated)   |
| PATCH  | `/api/v1/notifications/{id}/read`     | Mark single notification as read |
| POST   | `/api/v1/notifications/mark-all-read` | Mark all notifications as read   |

---

## Phase 6.3 — BackgroundTasks Dispatch + WebSocket ✅

**Migrated from Celery to FastAPI BackgroundTasks on 2026-03-14.**

### Files

* `app/core/websocket.py` — `ConnectionManager` singleton
* `app/workers/notification_tasks.py` — `dispatch_notification` plain async function (no Celery)
* `app/workers/email_tasks.py` — `send_invitation_email`, `send_password_reset_email` plain functions (Brevo HTTP API)
* `app/routers/websocket.py` — `WS /api/v1/ws?token={jwt}` endpoint

### Migration Notes

* `celery_app.py` deleted
* `workscribe-worker` container removed from `docker-compose.yml`
* All three routers (`auth`, `organizations`, `tasks`) inject `BackgroundTasks` as first dependency parameter (before `db` and `redis` — Python requires non-default params first)
* All three services (`AuthService`, `OrganizationService`, `TaskService`) accept `background_tasks: BackgroundTasks | None = None` in `__init__`
* `_queue_notification()` in `task_service.py` takes `background_tasks` as first arg; all call sites pass `self.background_tasks`
* Redis kept for caching + rate limiting only (not as Celery broker)
* Tradeoff: if API process crashes mid-task, background task is lost — acceptable for this use case

### Notification Triggers

| Event                         | Recipient | Condition                                             |
| ----------------------------- | --------- | ----------------------------------------------------- |
| Task created with assignee    | Assignee  | `assignee_id != reporter_id`                        |
| Task updated to Done status   | Reporter  | `new_status.category == done AND reporter != actor` |
| @mention in comment body_json | Mentioned | Parsed from Tiptap mention nodes, skips self          |

### Tested ✅

* `TASK_ASSIGNED` notification delivered to assignee on task create ✅
* `POST /auth/forgot-password` queues reset email via BackgroundTasks ✅
* `POST /organizations/{slug}/invite` queues invitation email via BackgroundTasks ✅

---

## Phase 6.5 — Search ✅

### Files

* `app/services/search_service.py`
* `app/routers/search.py`

### Endpoint Tested ✅

| Method | Path                                             | Description                       |
| ------ | ------------------------------------------------ | --------------------------------- |
| GET    | `/api/v1/organizations/{slug}/search?q=&type=` | Search tasks and pages within org |

---

## Phase 7.1 — Dashboard ✅

### Files

* `app/schemas/dashboard.py`
* `app/services/dashboard_service.py`
* `app/routers/dashboard.py`

### Endpoints Tested ✅

| Method | Path                                       | Description                 |
| ------ | ------------------------------------------ | --------------------------- |
| GET    | `/api/v1/organizations/{slug}/activity`  | Org-level activity feed     |
| GET    | `/api/v1/organizations/{slug}/dashboard` | Summary stats for dashboard |

---

## Phase 7.2 — Security Audit ✅

* Endpoint protection audit — all routes protected ✅
* SQL injection audit — zero raw interpolation ✅
* Cross-tenant isolation — 30/30 tests pass ✅
* Rate limiting — 100 req/min per IP, Redis sliding window, 429 + Retry-After ✅
* CORS — no wildcards, production origins via env var ✅

### New Files

* `app/core/rate_limit.py` — `RateLimitMiddleware`

---

## Phase 8.1 — Google OAuth ✅

### New Files

* `app/services/oauth_service.py`

### Modified Files

* `app/routers/auth.py` — added `POST /api/v1/auth/oauth/google`
* `requirements.txt` — added `google-auth>=2.28.0`

### Account Linking Strategy

1. Lookup by `(oauth_provider='google', oauth_id=sub)` → returning user
2. Lookup by `email` → link Google to existing password account
3. Neither → create new user with `password_hash=NULL`
4. `is_active=False` → 403 before token issued

---

## API Hardening — Gaps 1–5 ✅

**Commit:** `feat: gaps 1-5 — pagination, backlog, wiki guards, sprint task assignment`

### Gap 1 — Pagination on Unbounded List Endpoints ✅

Added `skip/limit` + `total` to three previously unbounded endpoints.
Default `limit=50`, max `limit=100`, enforced via `Query(ge=1, le=100)`.

| Endpoint                                  | Response shape                       |
| ----------------------------------------- | ------------------------------------ |
| `GET /organizations/{slug}/wiki/spaces` | `{spaces, total, skip, limit}`     |
| `GET /tasks/{id}/comments`              | `{comments, total, skip, limit}`   |
| `GET /tasks/{id}/activity`              | `{activities, total, skip, limit}` |

### Gap 2 — Backlog Endpoint ✅

`GET /api/v1/organizations/{slug}/projects/{id}/backlog`

* Returns tasks where `sprint_id IS NULL`
* Paginated (default limit=25, max=100)
* Same filters as board: status, assignee, priority, type, search
* No cache — always hits DB

### Gap 3 — Wiki Space Delete Guard ✅

* `409 SPACE_NOT_EMPTY` if space has any non-deleted pages
* Message includes page count

### Gap 4 — Page Delete Child Guard ✅

* `409 PAGE_HAS_CHILDREN` if page has children and `?force=true` not set
* `?force=true` → cascade soft-deletes page + all descendants

### Gap 5 — Sprint Task Assignment Endpoints ✅

| Method | Path                                     | Description            |
| ------ | ---------------------------------------- | ---------------------- |
| POST   | `/api/v1/sprints/{id}/tasks`           | Assign task to sprint  |
| DELETE | `/api/v1/sprints/{id}/tasks/{task_id}` | Remove task → backlog |

---

## Labels API + UI ✅

**Completed 2026-03-14.**

### New Files

* `app/routers/labels.py`
* `frontend/src/pages/ProjectSettingsPage.tsx`
* `frontend/src/styles/projectSettings.css`

### Backend Endpoints Tested ✅

| Method | Path                                                             | Description            |
| ------ | ---------------------------------------------------------------- | ---------------------- |
| GET    | `/api/v1/organizations/{slug}/projects/{id}/labels`            | List project labels    |
| POST   | `/api/v1/organizations/{slug}/projects/{id}/labels`            | Create label           |
| DELETE | `/api/v1/organizations/{slug}/projects/{id}/labels/{label_id}` | Delete label           |
| POST   | `/api/v1/tasks/{id}/labels/{label_id}`                         | Assign label to task   |
| DELETE | `/api/v1/tasks/{id}/labels/{label_id}`                         | Remove label from task |

### Frontend ✅

* Label chips on TaskCard — real data, colored correctly
* Label filter on board toolbar — filters board client-side
* Label multi-select in CreateTaskModal — works end-to-end
* ProjectSettingsPage — create labels with color picker (presets + hex), delete labels
* Sidebar gear icon links to project settings (owner/admin only)
* Route: `projects/:key/settings` → `ProjectSettingsPage`

### Notes

* FastAPI 204 endpoints: use `return Response(status_code=204)` from function body — `response_class=Response` on decorator does not work with this FastAPI version
* Labels included in task list responses — use `task.labels ?? []` as fallback

---

## J5 — Production Build + Deploy 🔄 In Progress

### Frontend — Vercel ✅ Live

* **URL:** `https://work-scribe.vercel.app`
* Build: `vite build` from `frontend/` directory
* SPA routing fixed via `vercel.json` at repo root with catch-all rewrite to `/index.html`
* Multiple iterations to get routing right (7 commits from `2e83755` to `f7147a6`)
* Final working config: `vercel.json` at repo root with explicit `buildCommand`, `outputDirectory`, and SPA rewrite rule
* `CreateProjectModal` fix: added required `type` field (`e2d2963`)
* Modal CSS fix: switched to `ctm-` modal classes to match design system (`1b321d4`)

### Backend — Render ✅ Live

* **Service:** `workscribe-api` on Render (Docker deploy)
* Port binding fix: added `PORT=8000` env var in Render dashboard — Render's port scanner now detects it correctly
* `Dockerfile` CMD: `["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]` (hardcoded port is fine since `PORT=8000` is set in Render env)

### Email — Brevo ⚠️ Suspended

* Switched from Gmail SMTP to Brevo HTTP API (`685b13d`)
* `email_tasks.py` now uses `httpx.post` to `https://api.brevo.com/v3/smtp/email`
* `config.py` updated: removed `GMAIL_USER` / `GMAIL_APP_PASSWORD`, added `BREVO_API_KEY`
* Sender verified: `workscribe.noreply@gmail.com` (`604754c`)
* Brevo account suspended immediately after signup (anti-spam false positive)
* Support ticket #5279384 submitted — awaiting reactivation from Brevo (Avni, CX team)
* Invite API returns 201 correctly; email send fails with `403 Forbidden` from Brevo until reactivated
* No code changes needed once reactivated — everything is wired correctly

### New Endpoint Added During J5

| Method | Path                  | Description                               |
| ------ | --------------------- | ----------------------------------------- |
| GET    | `/api/v1/auth/orgs` | List all orgs the current user belongs to |

* Added to fix login redirect — after login, frontend fetches user's orgs and redirects to first org (`39e796c`)
* Required because users can belong to multiple orgs and the frontend needed a way to determine where to redirect

### TypeScript Build Fixes (for Vercel deploy)

* `13a9d3a` — resolved all TypeScript build errors
* `925c3be` — fixed search type, unused vars, implicit any
* `f026fb1` — fixed ErrorBoundary FallbackProps, added untracked files
* `a0b411b` — fix in taskHelpers
* `c4dfe69` — scoped `lib/` gitignore to backend only, added untracked frontend files

### Environment Variables (Render — workscribe-api)

| Key                                           | Value / Notes                               |
| --------------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`                              | Render PostgreSQL internal URL              |
| `REDIS_URL`                                 | Render Redis internal URL                   |
| `JWT_SECRET_KEY`                            | min 32 chars                                |
| `FRONTEND_URL`                              | `https://work-scribe.vercel.app`          |
| `BREVO_API_KEY`                             | `xkeysib-...`(set, but account suspended) |
| `PORT`                                      | `8000`                                    |
| `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` | OAuth credentials                           |
| `CORS_ORIGINS`                              | `["https://work-scribe.vercel.app"]`      |
| `GMAIL_USER`/`GMAIL_APP_PASSWORD`         | **Deleted**— replaced by Brevo       |

---

## Database Migration Chain

```
001_create_organizations
  → 002_create_users
    → 003_create_org_members
      → 004_create_invitations
        → 005_add_oauth_fields_to_users
          → 006_create_projects
            → 007_create_task_statuses
              → 008_create_labels
                → 009_create_task_counters
                  → 010_create_tasks
                    → 011_seed_default_statuses
                      → 012_create_comments
                        → 0648337901e5_create_activity_log
                          → b4fb5d09bb90_create_sprints
                            → 70e071b82b25_add_sprint_id_to_tasks
                              → a1b2c3d4e5f6_create_wiki_spaces
                                → b2c3d4e5f6a1_create_pages
                                  → c3d4e5f6a1b2_create_task_page_links
                                    → d4e5f6a1b2c3_create_notifications  ← HEAD
```

---

## Key Conventions Established

* All queries scoped by `org_id` — no exceptions
* Business logic only in service layer
* Async SQLAlchemy 2.0 (`select()`, `await db.execute()`)
* Migrations use raw `op.execute()` SQL to avoid SQLAlchemy enum conflicts
* Slug endpoints use `get_org_member` or `require_role` dependency
* `get_org_member` returns `tuple[Organization, OrgMember]` — unpack as `org, member = org_member`
* Soft delete: projects (`is_archived`), pages (`is_deleted`)
* All errors: `{"code": "ERROR_CODE", "message": "..."}`
* BackgroundTasks: inject as first (non-default) parameter in dependency functions — before `db` and `redis`
* Services accept `background_tasks: BackgroundTasks | None = None` in `__init__`
* Rate limiting: 100 req/min per IP, exempt: `/health`
* `app.state.redis` — shared Redis connection from lifespan
* OAuth users: `password_hash=NULL`
* Redis cache errors fail silently — never break requests
* Filtered task requests always bypass cache
* Cache keys: `board:{org_id}:{project_id}` (TTL 30s), `page_tree:{org_id}:{space_id}` (TTL 60s)
* Cache serialization: `.model_dump_json()` / `.model_validate_json()`
* Pagination: default `limit=50`, max `limit=100`, enforced via `Query(ge=1, le=100)`
* Backlog endpoint never cached — always hits DB
* Sprint task assignment: dedicated endpoints, not PATCH /tasks/{id}
* Testing: PowerShell `Invoke-RestMethod` against `http://localhost:8001`
* Search response shape: `{ results: [], total: N, q: "" }` — frontend must use `res.data.results`
* Page is_deleted filter: use `isnot(True)` not `is_(False)` to handle NULL rows
* 204 endpoints: return `Response(status_code=204)` from function body — never use `response_class=Response` on decorator
* Email: Brevo HTTP API via httpx — `BREVO_API_KEY` env var, sender `workscribe.noreply@gmail.com`
* `GET /api/v1/auth/orgs` — used by frontend login redirect to determine which org to land on

---

## Test Users (local dev)

| Email                         | Password        | Role               | Notes                         |
| ----------------------------- | --------------- | ------------------ | ----------------------------- |
| test@example.com              | password123     | Owner of test-org  | Google identity linked in 8.1 |
| member@example.com            | password123     | Member of test-org |                               |
| brandnew@gmail.com            | —              | No org             | OAuth-only, created in 8.1    |
| inactive@gmail.com            | —              | No org             | is_active=False, OAuth only   |
| noorg@example.com             | password123     | No org             | Created during gap testing    |
| ayushishahi14072004@gmail.com | password123     | Member of test-org | Joined via invite 2026-03-13  |
| 23cse062@jssaten.ac.in        | (set at accept) | Member of test-org | Joined via invite 2026-03-13  |

---

## Key IDs (local dev)

| Resource                 | ID                                       |
| ------------------------ | ---------------------------------------- |
| Org (test-org)           | `2ef91448-8d65-4830-ac79-b612dd52a251` |
| Project (WEB, archived)  | `37cbe6ba-e4ec-440e-a0e7-4b20cfebff97` |
| Project (APP, active)    | `f2e0986e-f09c-4cb8-8b84-45ef711c8133` |
| Sprint 1                 | `749497fa-8fe6-4531-b09a-bf0a541a94c2` |
| Task 1 — in Sprint 1    | `261397be-cb04-4655-9fb8-990b9cb680d5` |
| Task 2 — backlog        | `b8bc627d-bc65-44d6-8635-2b256af68c3e` |
| Status WEB: To Do        | `7b527734-ac36-427d-8b46-8dfae0a8b4af` |
| Status WEB: In Progress  | `bb6698d1-bef9-45b1-a910-1f2c7bac6b8f` |
| Status WEB: Done         | `1cef3657-8c33-4a26-89c0-6ec19b227941` |
| Status APP: To Do        | `4b5c2923-1392-406a-a9b5-b7ca8ca821d9` |
| Status APP: In Progress  | `88da0495-ffe0-49bd-ba74-ba2a7aefa77d` |
| Status APP: Done         | `b4fa2b9c-f42b-4530-a5fc-24d1e0dcbe77` |
| User: test@example.com   | `5343fc4f-1621-408d-9b5a-758b43236cdf` |
| User: member@example.com | `b84c9a6b-d13a-48b4-920f-3c2c44870d7b` |
| User: brandnew@gmail.com | `d8c52138-34ff-406d-b45d-9b6742286413` |

---

# Frontend Progress

Last Updated: 2026-03-23
Backend: 100% complete
Frontend location: /frontend
Dev server: http://localhost:5173
Backend API (local): http://localhost:8001/api/v1
Backend API (prod): https://workscribe-api.onrender.com/api/v1

### Frontend Status

| Phase | Task                                                              | Status         |
| ----- | ----------------------------------------------------------------- | -------------- |
| A1    | Vite + React 19 + TypeScript setup                                | ✅ Done        |
| A2    | CSS design tokens (tokens.css + globals.css)                      | ✅ Done        |
| A3    | Axios client (src/api/client.ts)                                  | ✅ Done        |
| A4    | Auth Zustand store (src/stores/authStore.ts)                      | ✅ Done        |
| A5    | React Router shell — all routes stubbed                          | ✅ Done        |
| A6    | ProtectedRoute + redirect logic                                   | ✅ Done        |
| B1    | /login page                                                       | ✅ Done        |
| B2    | /register page                                                    | ✅ Done        |
| B3    | /forgot-password + /reset-password                                | ✅ Done        |
| B4    | Token refresh interceptor (full)                                  | ✅ Done        |
| B5    | Org creation wizard                                               | ✅ Done        |
| B6    | Invitation accept page                                            | ✅ Done        |
| C1    | OrgLayout — topbar + sidebar + main                              | ✅ Done        |
| C2    | Sidebar (projects, wiki spaces, nav)                              | ✅ Done        |
| C3    | Topbar (logo, org switcher, search, notif bell, avatar)           | ✅ Done        |
| D1    | BoardPage — fetch tasks grouped by status                        | ✅ Done        |
| D2    | BoardColumn component                                             | ✅ Done        |
| D3    | TaskCard component                                                | ✅ Done        |
| D4    | Drag within column (reorder)                                      | ✅ Done        |
| D5    | Drag between columns (move + optimistic update + rollback)        | ✅ Done        |
| D6    | Board filter toolbar (Assignee / Priority / Label multi-select)   | ✅ Done        |
| D7    | CreateTaskModal (full field set, invalidates board on success)    | ✅ Done        |
| D8    | Quick-add inline (per-column inline input, Enter/Escape)          | ✅ Done        |
| E1    | TaskPanel slide-in shell + URL param sync                         | ✅ Done        |
| E2    | Inline-editable fields (dropdowns for status, priority, assignee) | ✅ Done        |
| E3    | Tiptap description editor + localStorage autosave                 | ✅ Done        |
| E4    | Comments + delete own comment + optimistic add                    | ✅ Done        |
| E5    | Activity log timeline                                             | ✅ Done        |
| E6    | Linked docs                                                       | ✅ Done        |
| E7    | Subtasks                                                          | ✅ Done        |
| F1    | BacklogPage (sprint sections + backlog section + inline create)   | ✅ Done        |
| F2    | BacklogTaskRow component                                          | ✅ Done        |
| F3    | Drag backlog ↔ sprint                                            | ✅ Done        |
| F4    | Create Sprint modal                                               | ✅ Done        |
| F5    | Start/Complete Sprint modals                                      | ✅ Done        |
| G1    | WikiLayout (3-column shell, spaces list, NewSpaceModal)           | ✅ Done        |
| G2    | PageTree (recursive dnd-kit tree, options menu, inline create)    | ✅ Done        |
| G3    | PageEditorPage shell (breadcrumb, editable title, meta row)       | ✅ Done        |
| G4    | Tiptap editor full                                                | ✅ Done        |
| G5    | Autosave + Save button + unsaved indicator                        | ✅ Done        |
| G6    | New Space + New Page wired end-to-end                             | ✅ Done        |
| H1    | useWebSocket hook                                                 | ✅ Done        |
| H2    | Notification bell + panel                                         | ✅ Done        |
| H3    | CommandPalette (Cmd+K)                                            | ✅ Done        |
| I1    | DashboardPage                                                     | ✅ Done        |
| I2    | MembersPage                                                       | ✅ Done        |
| I3    | OrgSettingsPage                                                   | ✅ Done        |
| J1    | RBAC audit + fixes + My Work page                                 | ✅ Done        |
| —    | Labels API + frontend + ProjectSettingsPage                       | ✅ Done        |
| —    | Celery → BackgroundTasks migration                               | ✅ Done        |
| J2    | Empty states                                                      | ✅ Done        |
| J3    | Error boundaries                                                  | ✅ Done        |
| J4    | Loading skeletons audit                                           | ✅ Done        |
| J5    | Production build + deploy                                         | 🔄 In Progress |
| J6    | Performance optimization                                          | ⬜             |

---

### Completed Frontend Implementation Notes

#### D6 — Board Filter Toolbar

* FilterState type: { assignees: string[], priorities: string[], labels: string[] }
* FilterDropdown component: pill button, opens positioned menu, closes on outside click
* Active count badge + inline X to clear individual filters; "Clear all" button
* Filtering applied client-side against fetched tasks (no re-query)
* getOrgMembersApi returns { members: OrgMember[], total } — unwrapped with Array.isArray guard
* EMPTY_FILTERS constant for reset; "X of N tasks" summary when filters active

#### D7 — CreateTaskModal

* Props: { projectId, defaultStatusId?, onClose, onCreated? }
* Fields: title, status, priority, type, assignee, sprint, labels (multi-select)
* InlineSelect sub-component with keepOpenOnSelect prop for labels
* Local categoryColor() function — statusColor from taskHelpers not used here
* PriorityValue / TypeValue explicit union types (not as const — causes setState mismatch)
* On success: queryClient.invalidateQueries({ queryKey: ['board', slug] }) prefix invalidation
* `.ctm-modal { overflow: visible }` — required to prevent dropdown clipping
* Uses `ctm-` CSS class prefix throughout to match design system
* `type` field is required — must be included in form payload (`e2d2963`)
* Escape key + overlay click close modal

#### D8 — Quick-add Inline

* Self-contained QuickAddInput component inside BoardColumn.tsx
* Reads projectId from board query cache via queryClient.getQueryData(['projects', slug])
* Enter creates task, Escape/×-button cancels; "Add" button disabled when title empty
* Invalidates ['board', slug] prefix on success
* Each column manages its own showQuickAdd state independently

#### E1 — TaskPanel

* Slide-over triggered by ?task=APP-1 URL param
* useResolveTaskId hook searches all ['board', slug] cache entries to map APP-1 → UUID
* Closing panel removes ?task= param without pushing to history

#### E2 — Inline-editable Fields (Dropdowns)

* Replaced click-to-cycle status/priority with proper dropdowns
* StatusDropdown: colored dot + name, all project statuses, current item has checkmark
* PriorityDropdown: colored dot + name, all 5 options (urgent/high/medium/low/none)
* AssigneeDropdown: searchable member picker, lazy-fetches members only when opened, supports unassign (assignee_id: null)
* All three use useClickOutside hook, close on Escape
* Mutations: statusMutation, priorityMutation, assigneeMutation — each invalidates ['board'] and ['backlog', slug]

#### E3 — Tiptap Description Editor

* useEditor with StarterKit + Placeholder extension
* Draft autosaved to localStorage key task-desc-draft:{resolvedId} on every keystroke
* Debounced API save (1500ms) via updateTaskApi with description_json
* On task load: prefers localStorage draft over server content

#### E4 — Comments

* Optimistic add comment (appears instantly, rolls back on error)
* Delete own comment (optimistic remove, trash icon on hover)
* Cmd+Enter submit
* Backend expects `{ body_json: <TiptapJSON> }` not `{ content: string }`
* isOwn uses `c.author_id` (top-level field), not `c.author.id` (nested)
* Optimistic comment shape includes `author_id` at top level

#### E5 — Activity Log

* Backend action field is uppercase: `FIELD_UPDATED`, `TASK_CREATED`, `COMMENT_ADDED`, etc.
* `old_value` / `new_value` are objects keyed by field name — extracted via `Object.keys(nv)[0]`
* `formatActivity(entry, statuses, members)` resolves UUIDs to human-readable names

#### E6 — Linked Docs

* Backend returns `{ data: [], total: 0 }` for links — unwrapped as `res.data.data ?? []`
* LinkDocModal: page search (debounced 300ms), filters already-linked pages

#### E7 — Subtasks

* `getSubtasksApi` fetches with `type=subtask` filter, then client-side filters by `parent_task_id`
* `doneCount` checks both `task.status?.category === 'done'` AND `task.status_id === doneStatusId`
* Subtasks hidden from board and backlog via `.filter((t) => t.type !== 'subtask')`

#### F1–F5 — Backlog + Sprints ✅

* Three collapsible sections: Active Sprints → Planned Sprints → Backlog
* Drag-and-drop between sections via dnd-kit
* SprintSection: Active/Planned badge, date range, progress bar (active only)
* CompleteSprintModal: move incomplete tasks to backlog or specific planned sprint
* Backend returns 409 if another sprint already active — shown as error toast

#### G1–G6 — Wiki ✅

* 3-column shell: spaces list (200px), page tree (240px), editor (flex: 1)
* Recursive dnd-kit page tree with options menu (Rename / New child / Delete)
* Tiptap editor: H1–H3, bold, italic, underline, strike, code, lists, blockquote, link, table, slash commands
* Autosave (1500ms debounce) + manual Save button (amber when dirty) + Cmd/Ctrl+S
* localStorage draft: `page:{pageId}` — draft > server content on load
* Tab title: `• WorkScribe` when unsaved, resets on save
* Tiptap table extensions must use named imports `{ Table }` not default imports

#### H1–H3 — Real-time + Search ✅

* useWebSocket hook: auto-reconnects, dispatches to React Query + Zustand
* Notification bell with unread badge, slide-down panel, mark read
* CommandPalette (Cmd+K): tasks + pages search, keyboard nav, recent items from localStorage

#### I1–I3 — Dashboard / Members / Settings ✅

* DashboardPage: stats row, active sprints, quick actions, recent docs, activity feed
* MembersPage: member list, invite form (owner/admin only), remove member
* OrgSettingsPage: name/slug edit, delete org, access-denied screen for members

#### J1 — RBAC Audit + My Work Page ✅

Role check pattern:

```tsx
const members = Array.isArray(rawMembers) ? rawMembers : (rawMembers?.members ?? [])
const currentMember = members.find(m => m.user_id === currentUser?.id)
const canManage = currentMember?.role === 'owner' || currentMember?.role === 'admin'
```

| Component       | What's hidden from members                                 |
| --------------- | ---------------------------------------------------------- |
| Sidebar         | `+ New Project`,`+ New Wiki Space`,`Settings`link    |
| MembersPage     | Invite form, Remove (X) button                             |
| OrgSettingsPage | Entire page → "Access restricted" screen                  |
| WikiLayout      | `+ New Space`button                                      |
| BacklogPage     | `New Sprint`,`Start Sprint`,`Complete Sprint`buttons |

**My Work Page:**

* Route: `/org/:slug/my-work` → `MyWorkPage`
* Backend: `GET /organizations/{slug}/my-tasks` with `status_category`, `priority`, `skip`, `limit` filters
* Status tabs: All / To Do / In Progress / Done
* Priority filter dropdown
* Archived project resolution: missing projects fetched individually via `getProjectApi` using `useQueries`
* Task IDs formatted as `PROJECT_KEY-number` (e.g. `APP-6`, `WEB-21`)
* Shows `…` while archived projects are still loading
* Files: `MyWorkPage.tsx`, `src/styles/mywork.css`, `src/api/endpoints/tasks.ts` (`getMyTasksApi`)

#### J2 — Empty States ✅

| Page          | Empty state added                                                           |
| ------------- | --------------------------------------------------------------------------- |
| BoardPage     | "No tasks yet" + Create Task button (zero tasks)                            |
| BoardPage     | "No tasks match your filters" + Clear filters button (filters hide all)     |
| BacklogPage   | Polished with icon + better subtitle + New Sprint button (owner/admin only) |
| DashboardPage | Already had all empty states ✅                                             |
| WikiHomePage  | Already had full empty state ✅                                             |
| WikiLayout    | Already had sidebar + tree empty states ✅                                  |
| MyWorkPage    | Built with empty state from the start ✅                                    |

* CSS added to `board.css`: `.board-empty`, `.board-empty-icon`, `.board-empty-title`, `.board-empty-sub`, `.board-empty-action`
* CSS added to `backlog.css`: `.bl-empty-icon`, `.bl-empty-action` (polished existing rules)

#### J3 — Error Boundaries ✅

| File                                 | What was added                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `src/components/ErrorBoundary.tsx` | Reusable boundary using `react-error-boundary`with `app`and `page`levels |
| `src/main.tsx`                     | App-level boundary wraps entire app                                            |
| `src/layouts/OrgLayout.tsx`        | Page-level boundary wraps `<Outlet />`only                                   |

* Package: `react-error-boundary` (npm installed)
* App-level: full screen takeover, "Something went wrong", Reload + Go home buttons
* Page-level: sidebar/topbar stay intact, only content area shows error, Try again + Go home buttons
* Dev mode: actual error message shown in red `<pre>` block in both levels
* `Try again` button resets the boundary and re-renders the page
* `FallbackProps` import fixed during TypeScript build audit (`f026fb1`)

#### J4 — Loading Skeletons Audit ✅

| File                   | What was fixed/added                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `PageEditorPage.tsx` | Rich skeleton matching real layout — breadcrumb, title, meta row, content lines          |
| `WikiLayout.tsx`     | Page tree skeleton while `treeLoading`; empty/tree states gated behind `!treeLoading` |
| `OrgLayout.tsx`      | Full shell skeleton using `position: fixed`matching real topbar/sidebar layout          |

* OrgLayout skeleton uses `position: fixed` for topbar and sidebar (matching `.topbar` and `.sidebar` CSS) with `marginLeft` + `marginTop` on main content
* WikiLayout: `isLoading: treeLoading` destructured from page tree query; 5-row skeleton with alternating indent
* PageEditorPage: reuses existing wiki CSS classes (`wiki-page-shell`, `wiki-breadcrumb`, `wiki-page-title-wrap`, `wiki-page-meta`, `wiki-page-divider`) so skeleton matches real layout exactly

#### J5 — Production Deploy Fixes ✅ (ongoing)

* Login redirect fix: after login, `GET /api/v1/auth/orgs` fetches user's org list, redirects to first org slug (`39e796c`)
* All TypeScript strict errors resolved for Vercel build (`13a9d3a`, `925c3be`)
* `vercel.json` at repo root — final working SPA rewrite config after 7 iterations
* `CreateProjectModal` type field required bug fixed (`e2d2963`)
* Modal CSS standardised to `ctm-` prefix (`1b321d4`)

#### Labels + ProjectSettingsPage ✅

* `getLabelsApi` unwraps `res.data.labels` (backend returns `{ labels, total }`)
* `createLabelApi`, `deleteLabelApi`, `assignLabelToTaskApi`, `removeLabelFromTaskApi` in `tasks.ts`
* Label chips on TaskCard use `task.labels ?? []`
* ProjectSettingsPage: color picker with presets, live preview chip, create/delete labels
* Sidebar gear icon (owner/admin only) links to `/projects/:key/settings`

---

### Key Frontend Files

```
frontend/src/
├── api/
│   ├── client.ts
│   └── endpoints/
│       ├── auth.ts               ✅ getOrgsApi added (for login redirect)
│       ├── organizations.ts, projects.ts
│       ├── tasks.ts              ✅ labels API + getMyTasksApi added
│       ├── comments.ts, links.ts, activity.ts
│       ├── search.ts             ✅ res.data.results fix
│       └── wiki.ts
├── stores/
│   ├── authStore.ts, uiStore.ts
├── hooks/
│   └── useBoardDnd.ts
├── lib/
│   └── taskHelpers.ts            ✅ fix applied (a0b411b)
├── styles/
│   ├── tokens.css, globals.css, auth.css, wizard.css
│   ├── layout.css                ✅ sidebar project settings btn
│   ├── board.css                 ✅ board empty state rules added
│   ├── taskPanel.css
│   ├── backlog.css               ✅ backlog empty state polished
│   ├── wiki.css
│   ├── mywork.css                ✅ new — My Work page styles
│   ├── projectSettings.css       ✅ new
│   ├── members.css               ✅ new
│   └── settings.css              ✅ new
├── types/
│   └── index.ts
├── pages/
│   ├── LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage
│   ├── OrgCreatePage, AcceptInvitePage
│   ├── DashboardPage, BoardPage, BacklogPage
│   ├── WikiHomePage, PageEditorPage
│   ├── OrgSettingsPage, MembersPage
│   ├── MyWorkPage.tsx            ✅ new — cross-project task list
│   ├── ProjectSettingsPage       ✅ new — labels management
│   └── NotFoundPage
├── layouts/
│   ├── OrgLayout.tsx             ✅ ErrorBoundary + fixed skeleton
│   └── WikiLayout.tsx            ✅ page tree skeleton added
├── components/
│   ├── ProtectedRoute.tsx
│   ├── ErrorBoundary.tsx         ✅ new — app + page level boundaries
│   ├── layout/Sidebar.tsx        ✅ gear icon + My Work nav link
│   ├── layout/Topbar.tsx
│   ├── board/TaskCard, SortableTaskCard, BoardColumn, CreateTaskModal
│   ├── backlog/BacklogTaskRow, CreateSprintModal, StartSprintModal, CompleteSprintModal
│   ├── wiki/PageTree, WikiEditor
│   └── panel/TaskPanel
├── App.tsx                       ✅ ProjectSettingsPage + MyWorkPage routes added
vercel.json                       ✅ repo root — SPA rewrite for Vercel
```

---

### Key Decisions

* Dark theme only — CSS variables in src/styles/tokens.css, no Tailwind
* Refresh token stored in sessionStorage key "refresh_token"
* Token refresh: silent via Axios interceptor, concurrent 401s queued
* noUncheckedIndexedAccess + exactOptionalPropertyTypes removed from tsconfig
* Optimistic updates on board DnD, backlog DnD, comments, linked docs, subtask toggles
* getOrgMembersApi returns { members, total } — always unwrap with Array.isArray guard
* Board query cache prefix ['board', slug] used for invalidation
* task.status may be undefined on list responses — always use optional chain task.status?.category
* task.status_id is always present on list responses — use as fallback
* showAllTasks defaults to true on BoardPage so tasks without sprint are visible
* Backlog page uses two separate queries: all tasks (sprint grouping) + pure backlog tasks
* Assignee members fetched lazily — only when AssigneeDropdown opens
* Description autosave: localStorage draft keyed task-desc-draft:{resolvedId}, 1500ms debounce
* Comments use body_json (Tiptap JSON) — never plain content string
* isOwn for comments uses c.author_id (top-level) not c.author.id (nested)
* Activity log: action uppercase; old_value/new_value objects keyed by field name; UUIDs resolved to names
* Links API returns { data: [], total: 0 } — unwrap as res.data.data ?? []
* Subtask filtering: client-side by parent_task_id after fetching type=subtask
* WikiLayout passes context via useOutletContext — children receive { spaces, pageTree, activeSpace }
* Wiki custom events (wiki:new-space, wiki:new-page) fired on window for decoupled modal triggering
* Tiptap table extensions must use named imports { Table } not default imports
* Search API response: `{ results: [], total: N, q: "" }` — always use `res.data.results`
* RBAC pattern: fetch ['members', slug], find currentMember by user_id, derive canManage from role
* Members query shared/deduped across Sidebar, MembersPage, WikiLayout, BacklogPage
* getLabelsApi returns `res.data.labels` (unwrapped from `{ labels, total }`)
* task.labels may be undefined — always use `task.labels ?? []`
* Error boundaries: react-error-boundary package; app-level in main.tsx, page-level in OrgLayout wrapping Outlet
* OrgLayout skeleton uses position:fixed for topbar/sidebar to match real layout CSS
* CreateTaskModal uses `ctm-` CSS class prefix — do not mix with generic modal classes
* CreateTaskModal requires `type` field in payload — omitting it causes 422
* vercel.json must be at repo root (not frontend/) with explicit buildCommand + outputDirectory + SPA rewrite
* Login redirect uses GET /api/v1/auth/orgs to find the user's first org slug
* Email: Brevo HTTP API, sender workscribe.noreply@gmail.com, BREVO_API_KEY env var
* Render: PORT=8000 must be set as env var for port scanner to detect the service

---

### Test Credentials (local dev)

| Email                         | Password        | Role               |
| ----------------------------- | --------------- | ------------------ |
| test@example.com              | password123     | Owner of test-org  |
| member@example.com            | password123     | Member of test-org |
| ayushishahi14072004@gmail.com | (set at accept) | Member of test-org |
| 23cse062@jssaten.ac.in        | (set at accept) | Member of test-org |

* Org slug: `test-org`
* Project key: `APP`
* Project ID: f2e0986e-f09c-4cb8-8b84-45ef711c8133
* Refresh token stored in sessionStorage (not localStorage)
* Token refresh: silent via Axios interceptor, concurrent 401s queued
* setTokenGetter pattern dropped — useAuthStore imported directly in client.ts
* noUncheckedIndexedAccess + exactOptionalPropertyTypes removed from tsconfig
* Slug availability check hits GET /organizations/{slug} — 404 = available
