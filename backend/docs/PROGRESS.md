# WorkScribe — Backend Progress

**Last Updated:** 2026-03-05
**Latest Commit:** `feat: gaps 1-5 — pagination, backlog, wiki guards, sprint task assignment`
**Alembic Head:** `d4e5f6a1b2c3` (create_notifications_table)
**API:** `http://localhost:8001`

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
| 6.3   | Celery dispatch + WebSocket | ✅ Complete & Tested |
| 6.5   | Search                      | ✅ Complete & Tested |
| 7.1   | Dashboard                   | ✅ Complete & Tested |
| 7.2   | Security Audit              | ✅ Complete & Tested |
| 8.1   | Google OAuth                | ✅ Complete & Tested |
| —    | API Hardening — Gaps 1–5  | ✅ Complete & Tested |

**Backend: 100% complete. Next phase: Frontend.**

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
* `docker-compose.yml` — api, worker, db (PostgreSQL), redis
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
* `app/workers/celery_app.py` — Celery instance with Redis broker
* `app/workers/email_tasks.py` — password reset + invitation email tasks
* `app/core/dependencies.py` — `get_current_user`, `get_org_member`, `require_role`

### Endpoints Tested ✅

| Method | Path                                        | Description                          |
| ------ | ------------------------------------------- | ------------------------------------ |
| POST   | `/api/v1/auth/register`                   | Register user, return JWT            |
| POST   | `/api/v1/auth/login`                      | Login, issue access + refresh tokens |
| POST   | `/api/v1/auth/refresh`                    | Refresh access token                 |
| POST   | `/api/v1/auth/logout`                     | Blacklist JTI, delete refresh token  |
| POST   | `/api/v1/auth/forgot-password`            | Queue reset email (always 204)       |
| POST   | `/api/v1/auth/reset-password`             | Validate token, update password      |
| GET    | `/api/v1/auth/me`                         | Get current user profile             |
| POST   | `/api/v1/auth/invitations/{token}/accept` | Accept org invitation                |

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

---

## Phase 5.2 — Performance (Redis Caching) ✅

### Overview

Redis caching added to the two most expensive read endpoints.

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

## Phase 6.3 — Celery Dispatch + WebSocket ✅

### Files

* `app/core/websocket.py` — `ConnectionManager` singleton
* `app/workers/notification_tasks.py` — `dispatch_notification` Celery task
* `app/routers/websocket.py` — `WS /api/v1/ws?token={jwt}` endpoint

### Notification Triggers

| Event                         | Recipient | Condition                                             |
| ----------------------------- | --------- | ----------------------------------------------------- |
| Task created with assignee    | Assignee  | `assignee_id != reporter_id`                        |
| Task updated to Done status   | Reporter  | `new_status.category == done AND reporter != actor` |
| @mention in comment body_json | Mentioned | Parsed from Tiptap mention nodes, skips self          |

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
* Returns `BacklogListResponse` — same shape as `TaskListResponse`
* No cache — always hits DB

### Gap 3 — Wiki Space Delete Guard ✅

`DELETE /api/v1/wiki/spaces/{space_id}` now returns:

* `409 SPACE_NOT_EMPTY` if space has any non-deleted pages
* Message includes page count: `"Space contains X page(s). Delete all pages first."`
* No force flag — user must delete pages manually

### Gap 4 — Page Delete Child Guard ✅

`DELETE /api/v1/wiki/pages/{page_id}` now:

* Returns `409 PAGE_HAS_CHILDREN` if page has children and `?force=true` not set
* Message: `"Page has X child page(s). Use ?force=true to delete with all children."`
* `?force=true` → cascade soft-deletes page + all descendants
* Leaf pages (no children) delete normally without `?force=true`

### Gap 5 — Sprint Task Assignment Endpoints ✅

Replaced the `PATCH /tasks/{id}` workaround with proper dedicated endpoints.

| Method | Path                                     | Description            |
| ------ | ---------------------------------------- | ---------------------- |
| POST   | `/api/v1/sprints/{id}/tasks`           | Assign task to sprint  |
| DELETE | `/api/v1/sprints/{id}/tasks/{task_id}` | Remove task → backlog |

* `409 TASK_ALREADY_IN_SPRINT` on duplicate assignment
* `400 TASK_NOT_IN_SPRINT` on remove when not assigned
* Validates task belongs to same project as sprint
* Invalidates board cache on both operations

### Modified Files (Gaps 1–5)

| File                               | Changes                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/schemas/task.py`            | Added `BacklogListResponse`; added `skip`,`limit`to `CommentListResponse`,`ActivityListResponse`                                                       |
| `app/schemas/wiki.py`            | Added `skip`,`limit`to `WikiSpaceListResponse`                                                                                                             |
| `app/services/task_service.py`   | Added `list_backlog`; updated `list_comments`,`list_activity`with pagination                                                                               |
| `app/services/wiki_service.py`   | Updated `list_spaces`with pagination; added page count guard to `delete_space`; added `_get_child_count`helper; updated `delete_page`with `force`param |
| `app/services/sprint_service.py` | Added `add_task_to_sprint`,`remove_task_from_sprint`,`_get_task_in_sprint_project`; added `_board_cache_key`,`_invalidate_board_cache`module helpers   |
| `app/routers/tasks.py`           | Added backlog endpoint; added `skip/limit`Query params to comments + activity endpoints; imported `BacklogListResponse`                                      |
| `app/routers/pages.py`           | Added `skip/limit`Query params to `list_spaces`; added `force: bool = Query(default=False)`to `delete_page`                                              |
| `app/routers/sprints.py`         | Added `SprintTaskRequest`body schema; added `POST /sprints/{id}/tasks`; added `DELETE /sprints/{id}/tasks/{task_id}`                                       |

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
* Slug-less endpoints use `get_current_user` + membership lookup in service
* Slug endpoints use `get_org_member` or `require_role` dependency
* `get_org_member` returns `tuple[Organization, OrgMember]` — unpack as `org, member = org_member`
* Soft delete: projects (`is_archived`), pages (`is_deleted`)
* All errors: `{"code": "ERROR_CODE", "message": "..."}`
* Celery tasks: always `asyncio.new_event_loop()` — never `asyncio.run()`
* Rate limiting: 100 req/min per IP, exempt: `/health`
* `app.state.redis` — shared Redis connection from lifespan
* OAuth users: `password_hash=NULL`
* Redis cache errors fail silently — never break requests
* Filtered task requests always bypass cache
* Cache keys: `board:{org_id}:{project_id}` (TTL 30s), `page_tree:{org_id}:{space_id}` (TTL 60s)
* Cache serialization: `.model_dump_json()` / `.model_validate_json()`
* Pagination: default `limit=50` for list endpoints, max `limit=100`, enforced via `Query(ge=1, le=100)`
* Backlog endpoint never cached — always hits DB
* Sprint task assignment: dedicated endpoints, not PATCH /tasks/{id}
* Testing: PowerShell `Invoke-RestMethod` against `http://localhost:8001`

---

## Test Users (local dev)

| Email              | Password    | Role               | Notes                         |
| ------------------ | ----------- | ------------------ | ----------------------------- |
| test@example.com   | password123 | Owner of test-org  | Google identity linked in 8.1 |
| member@example.com | password123 | Member of test-org |                               |
| brandnew@gmail.com | —          | No org             | OAuth-only, created in 8.1    |
| inactive@gmail.com | —          | No org             | is_active=False, OAuth only   |
| noorg@example.com  | password123 | No org             | Created during gap testing    |

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

# Frontend Progress

**Last Updated:** 2026-03-07
**Backend:** 100% complete
**Frontend location:** `/frontend`
**Dev server:** `http://localhost:5173`
**Backend API:** `http://localhost:8001/api/v1`

---

## Frontend Status

| Phase  | Task                                                              | Status  |
| ------ | ----------------------------------------------------------------- | ------- |
| A1     | Vite + React 19 + TypeScript setup                                | ✅ Done |
| A2     | CSS design tokens (tokens.css + globals.css)                      | ✅ Done |
| A3     | Axios client (src/api/client.ts)                                  | ✅ Done |
| A4     | Auth Zustand store (src/stores/authStore.ts)                      | ✅ Done |
| A5     | React Router shell — all routes stubbed                          | ✅ Done |
| A6     | ProtectedRoute + redirect logic                                   | ✅ Done |
| B1     | /login page                                                       | ✅ Done |
| B2     | /register page                                                    | ✅ Done |
| B3     | /forgot-password + /reset-password                                | ✅ Done |
| B4     | Token refresh interceptor (full)                                  | ✅ Done |
| B5     | Org creation wizard                                               | ✅ Done |
| B6     | Invitation accept page                                            | ✅ Done |
| C1     | OrgLayout — topbar + sidebar + main                              | ✅ Done |
| C2     | Sidebar (projects, wiki spaces, nav)                              | ✅ Done |
| C3     | Topbar (logo, org switcher, search, notif bell, avatar)           | ✅ Done |
| D1     | BoardPage — fetch tasks grouped by status                        | ✅ Done |
| D2     | BoardColumn component                                             | ✅ Done |
| D3     | TaskCard component                                                | ✅ Done |
| D4     | Drag within column (reorder)                                      | ✅ Done |
| D5     | Drag between columns (move + optimistic update + rollback)        | ✅ Done |
| D6     | Board filter toolbar                                              | ⬜ Next |
| D7     | CreateTaskModal                                                   | ⬜      |
| D8     | Quick-add inline                                                  | ⬜      |
| E1     | TaskPanel slide-in shell + URL param sync                         | ✅ Done |
| E2     | Inline-editable fields (dropdowns for status, priority, assignee) | ⬜ Next |
| E3     | Tiptap description editor + localStorage autosave                 | ⬜      |
| E4     | Comments + @mention                                               | ⬜      |
| E5     | Activity log                                                      | ⬜      |
| E6     | Linked docs                                                       | ⬜      |
| E7     | Subtasks                                                          | ⬜      |
| F1     | BacklogPage                                                       | ⬜ Next |
| F2     | Task row component                                                | ⬜      |
| F3     | Drag backlog ↔ sprint                                            | ⬜      |
| F4     | Create Sprint modal                                               | ⬜      |
| F5     | Start/Complete Sprint                                             | ⬜      |
| G1     | WikiLayout                                                        | ⬜      |
| G2     | PageTree                                                          | ⬜      |
| G3     | PageEditorPage shell                                              | ⬜      |
| G4     | Tiptap editor full                                                | ⬜      |
| G5     | Autosave + Save button                                            | ⬜      |
| G6     | New Space + New Page                                              | ⬜      |
| H1     | useWebSocket hook                                                 | ⬜      |
| H2     | Notification bell + panel                                         | ⬜      |
| H3     | CommandPalette (Cmd+K)                                            | ⬜      |
| I1     | DashboardPage                                                     | ⬜      |
| J1–J5 | Polish + Deploy                                                   | ⬜      |

---

## Key Frontend Files

```
frontend/src/
├── api/
│   ├── client.ts                  ✅ Axios + silent refresh interceptor
│   └── endpoints/
│       ├── auth.ts                ✅ login, register, logout, refresh, forgot, reset, invite
│       ├── organizations.ts       ✅ createOrg, getOrg, checkSlug, inviteMember, getMembers
│       ├── projects.ts            ✅ getProjects, getProject, createProject, getStatuses
│       ├── tasks.ts               ✅ getTasksApi, getTaskApi, createTaskApi, updateTaskApi,
│       │                             deleteTaskApi, moveTaskApi, bulkUpdatePositionsApi,
│       │                             getSprintsApi, getLabelsApi
│       ├── comments.ts            ✅ getCommentsApi, createCommentApi, deleteCommentApi
│       └── wiki.ts                ✅ getWikiSpacesApi, createWikiSpaceApi, getPageTreeApi,
│                                     getPageApi, createPageApi, updatePageApi, deletePageApi
├── stores/
│   ├── authStore.ts               ✅ Zustand: accessToken, user, setAuth, clearAuth
│   └── uiStore.ts                 ✅ Zustand: task panel, command palette, notifications
├── hooks/
│   └── useBoardDnd.ts             ✅ dnd-kit drag/drop hook with optimistic updates
├── lib/
│   └── taskHelpers.ts             ✅ groupTasksByStatus, priorityColor, statusColor, getInitials
├── styles/
│   ├── tokens.css                 ✅ Full dark theme CSS variables
│   ├── globals.css                ✅ Reset + base styles
│   ├── auth.css                   ✅ Shared auth page styles
│   ├── wizard.css                 ✅ Org creation wizard styles
│   ├── layout.css                 ✅ App shell, topbar, sidebar, dropdown styles
│   ├── board.css                  ✅ Board page, columns, task cards, skeleton
│   └── taskPanel.css              ✅ Slide-over panel styles
├── types/
│   └── index.ts                   ✅ All TypeScript interfaces
├── pages/
│   ├── LoginPage.tsx              ✅
│   ├── RegisterPage.tsx           ✅
│   ├── ForgotPasswordPage.tsx     ✅
│   ├── ResetPasswordPage.tsx      ✅
│   ├── OrgCreatePage.tsx          ✅
│   ├── AcceptInvitePage.tsx       ✅
│   ├── DashboardPage.tsx          ⬜ stub
│   ├── BoardPage.tsx              ✅ Full with DnD + sprint filter
│   ├── BacklogPage.tsx            ⬜ stub
│   ├── WikiHomePage.tsx           ⬜ stub
│   ├── PageEditorPage.tsx         ⬜ stub
│   ├── OrgSettingsPage.tsx        ⬜ stub
│   ├── MembersPage.tsx            ⬜ stub
│   └── NotFoundPage.tsx           ✅
├── layouts/
│   └── OrgLayout.tsx              ✅ Full layout with TaskPanel mounted
├── components/
│   ├── ProtectedRoute.tsx         ✅
│   ├── layout/
│   │   ├── Sidebar.tsx            ✅ Projects, wiki spaces, nav items
│   │   └── Topbar.tsx             ✅ Logo, org switcher, search, bell, avatar dropdown
│   ├── board/
│   │   ├── TaskCard.tsx           ✅
│   │   ├── SortableTaskCard.tsx   ✅
│   │   └── BoardColumn.tsx        ✅ With useDroppable + SortableContext
│   └── panel/
│       └── TaskPanel.tsx          ✅ Slide-over: title edit, status/priority cycle, comments
└── App.tsx                        ✅ Full router + QueryClient + Toaster
```

---

## Key Decisions

* Dark theme only — CSS variables in `src/styles/tokens.css`, no Tailwind
* Refresh token stored in `sessionStorage` key `"refresh_token"`
* Token refresh: silent via Axios interceptor, concurrent 401s queued
* `sprintId` string (not object) in React Query board cache key
* `useResolveTaskId` searches all `['board', slug]` query cache entries to map `APP-1` → uuid
* Task panel reads `?task=APP-1` URL param and resolves to UUID via cache
* `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` removed from tsconfig (too aggressive)
* Optimistic updates on board DnD with rollback on error

---

## Test Credentials (local dev)

| Email              | Password    | Role               |
| ------------------ | ----------- | ------------------ |
| test@example.com   | password123 | Owner of test-org  |
| member@example.com | password123 | Member of test-org |

* Org slug: `test-org`
* Project key: `APP`
* Dark theme only — CSS variables from tokens.css, no Tailwind
* Refresh token stored in sessionStorage (not localStorage)
* Token refresh: silent via Axios interceptor, concurrent 401s queued
* setTokenGetter pattern dropped — useAuthStore imported directly in client.ts
* noUncheckedIndexedAccess + exactOptionalPropertyTypes removed from tsconfig (too aggressive with third-party types)
* Slug availability check hits GET /organizations/{slug} — 404 = available

### Test Credentials (local dev)

| Email               | Password    | Notes              |
| ------------------- | ----------- | ------------------ |
| [test@example.com]()   | password123 | Owner of test-org  |
| [member@example.com]() | password123 | Member of test-org |
