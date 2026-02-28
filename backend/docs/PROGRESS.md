# WorkScribe — Backend Progress

**Last Updated:** 2026-02-28
**Latest Commit:** `feat: add search endpoint for tasks and pages (Phase 6.5)`
**Alembic Head:** `d4e5f6a1b2c3` (create_notifications_table)
**API:** `http://localhost:8001`

---

## Overall Status

| Phase | Feature                     | Status               | Commit      |
| ----- | --------------------------- | -------------------- | ----------- |
| 1     | Foundation & Infrastructure | ✅ Complete          | —          |
| 2.1   | Auth                        | ✅ Complete & Tested | —          |
| 2.2   | Organizations & Members     | ✅ Complete & Tested | —          |
| 2.3   | Projects + Tasks            | ✅ Complete & Tested | —          |
| 2.4   | Sprints                     | ✅ Complete & Tested | `47c2c7e` |
| 5     | Wiki / Pages                | ✅ Complete & Tested | `a5cd8ab` |
| 6.1   | Task ↔ Doc Linking         | ✅ Complete & Tested | committed   |
| 6.2   | Notifications DB + REST API | ✅ Complete & Tested | committed   |
| 6.3   | Celery dispatch + WebSocket | ✅ Complete & Tested | committed   |
| 6.5   | Search                      | ✅ Complete & Tested | committed   |
| 7.1   | Dashboard                   | 🔜 Not Started       | —          |
| 7.2   | Security Audit              | 🔜 Not Started       | —          |

---

## Phase 1 — Foundation & Infrastructure ✅

### Project Setup

* Python 3.12 project with `pyproject.toml`
* `backend/` directory structure per TECH_RULES.md
* All backend dependencies in `requirements.txt`
* `app/core/config.py` — pydantic-settings with all env vars
* `app/core/database.py` — async engine, session, `get_db()`
* `app/models/base.py` — Base, TimestampMixin, UUIDMixin
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

* `app/schemas/project.py`
* `app/schemas/task.py`
* `app/services/project_service.py`
* `app/services/task_service.py`
* `app/routers/projects.py`
* `app/routers/tasks.py`

### Project Endpoints Tested ✅

| Method | Path                                           | Description                    |
| ------ | ---------------------------------------------- | ------------------------------ |
| GET    | `/api/v1/organizations/{slug}/projects`      | List projects                  |
| POST   | `/api/v1/organizations/{slug}/projects`      | Create project + seed statuses |
| GET    | `/api/v1/organizations/{slug}/projects/{id}` | Get project detail             |
| PATCH  | `/api/v1/organizations/{slug}/projects/{id}` | Update project                 |
| DELETE | `/api/v1/organizations/{slug}/projects/{id}` | Archive (soft delete)          |

### Task Endpoints Tested ✅

| Method | Path                                                 | Description                      |
| ------ | ---------------------------------------------------- | -------------------------------- |
| POST   | `/api/v1/organizations/{slug}/projects/{id}/tasks` | Create task (auto-ID)            |
| GET    | `/api/v1/organizations/{slug}/projects/{id}/tasks` | List tasks (filtered, paginated) |
| GET    | `/api/v1/tasks/{id}`                               | Get task detail                  |
| PATCH  | `/api/v1/tasks/{id}`                               | Update task + activity log       |
| DELETE | `/api/v1/tasks/{id}`                               | Delete task                      |
| PATCH  | `/api/v1/tasks/{id}/move`                          | Move task status/position        |
| PATCH  | `/api/v1/tasks/bulk-positions`                     | Batch update positions           |
| GET    | `/api/v1/tasks/{id}/comments`                      | List comments                    |
| POST   | `/api/v1/tasks/{id}/comments`                      | Add comment                      |

---

## Phase 2.4 — Sprints ✅

**Commit:** `47c2c7e`

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

| Method | Path                                                   | Description                      |
| ------ | ------------------------------------------------------ | -------------------------------- |
| POST   | `/api/v1/organizations/{slug}/projects/{id}/sprints` | Create sprint                    |
| GET    | `/api/v1/organizations/{slug}/projects/{id}/sprints` | List sprints                     |
| GET    | `/api/v1/sprints/{id}`                               | Get sprint detail                |
| PATCH  | `/api/v1/sprints/{id}`                               | Update sprint                    |
| POST   | `/api/v1/sprints/{id}/start`                         | Start sprint (sets dates/status) |
| POST   | `/api/v1/sprints/{id}/complete`                      | Complete sprint                  |
| DELETE | `/api/v1/sprints/{id}`                               | Delete sprint                    |
| POST   | `/api/v1/sprints/{id}/tasks`                         | Add task to sprint               |
| DELETE | `/api/v1/sprints/{id}/tasks/{task_id}`               | Remove task from sprint          |

---

## Phase 5 — Wiki / Pages ✅

**Commit:** `a5cd8ab`

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

| Method | Path                                              | Description          |
| ------ | ------------------------------------------------- | -------------------- |
| POST   | `/api/v1/organizations/{slug}/wiki/spaces`      | Create wiki space    |
| GET    | `/api/v1/organizations/{slug}/wiki/spaces`      | List spaces          |
| GET    | `/api/v1/organizations/{slug}/wiki/spaces/{id}` | Get space detail     |
| POST   | `/api/v1/wiki/spaces/{id}/pages`                | Create page          |
| GET    | `/api/v1/wiki/spaces/{id}/pages`                | List pages in space  |
| GET    | `/api/v1/wiki/pages/{id}`                       | Get page detail      |
| PATCH  | `/api/v1/wiki/pages/{id}`                       | Update page          |
| DELETE | `/api/v1/wiki/pages/{id}`                       | Soft delete page     |
| GET    | `/api/v1/wiki/pages/{id}/history`               | Page version history |

---

## Phase 6.1 — Task ↔ Page Linking ✅

**Commit:** committed

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

### Error Cases Verified

* 409 `LINK_ALREADY_EXISTS` on duplicate link
* 404 `LINK_NOT_FOUND` on delete non-existent
* 404 `PAGE_NOT_FOUND` on cross-org page reference
* 403 `FORBIDDEN` on cross-org GET

---

## Phase 6.2 — Notifications Database + REST API ✅

**Commit:** committed

### Migrations

| #   | Revision         | Description                |
| --- | ---------------- | -------------------------- |
| 018 | `d4e5f6a1b2c3` | Create notifications table |

### Files

* `app/models/notification.py` — Notification model, NotificationType enum
* `app/models/user.py` — added `notifications` relationship
* `app/schemas/notification.py` — NotificationResponse, NotificationListResponse, NotificationCreate
* `app/services/notification_service.py` — create, list, mark_read, mark_all_read
* `app/routers/notifications.py`

### Endpoints Tested ✅

| Method | Path                                    | Description                                                    |
| ------ | --------------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/v1/notifications`               | List notifications (paginated, filterable by `?unread=true`) |
| PATCH  | `/api/v1/notifications/{id}/read`     | Mark single notification as read                               |
| POST   | `/api/v1/notifications/mark-all-read` | Mark all notifications as read                                 |

### Error Cases Verified

* Cross-user isolation: users only see their own notifications
* `unread_count` always reflects current state regardless of filter
* 404 `NOTIFICATION_NOT_FOUND` on mark-read for wrong user

---

## Phase 6.3 — Celery Dispatch + WebSocket ✅

**Commit:** committed

### Files

* `app/core/websocket.py` — `ConnectionManager` singleton (in-memory, single-server MVP)
* `app/workers/notification_tasks.py` — `dispatch_notification` Celery task
* `app/routers/websocket.py` — `WS /api/v1/ws?token={jwt}` endpoint
* `app/services/task_service.py` — wired notification dispatch into 3 triggers

### Notification Triggers

| Event                            | Recipient      | Condition                                                |
| -------------------------------- | -------------- | -------------------------------------------------------- |
| Task created with assignee       | Assignee       | `assignee_id != reporter_id`                           |
| Task/move updated to Done status | Reporter       | `new_status.category == done`AND `reporter != actor` |
| @mention in comment body_json    | Mentioned user | Parsed from Tiptap mention nodes, skips self-mention     |

### WebSocket Protocol

* Connect: `WS /api/v1/ws?token={access_token}`
* Auth: JWT decoded before `accept()` — invalid token → close code 4001
* On connect: server sends `{"type": "connected", "user_id": "..."}`
* On notification: server pushes JSON payload immediately if user online
* Offline users: notification persists in DB, delivered on next `GET /notifications` poll

### Known Fix Applied

* `asyncio.run()` in Celery forked workers causes "Future attached to different loop" error
* Fix: always create `asyncio.new_event_loop()` + `asyncio.set_event_loop()` per task execution
* `async_engine.sync_engine.dispose()` called BEFORE loop creation to avoid inherited closed loop

---

## Phase 6.5 — Search ✅

**Commit:** committed

### Files

* `app/services/search_service.py` — ILIKE search across tasks and pages scoped by org_id
* `app/routers/search.py` — search router
* `app/main.py` — search router registered

### Endpoint Tested ✅

| Method | Path                                             | Description                       |
| ------ | ------------------------------------------------ | --------------------------------- |
| GET    | `/api/v1/organizations/{slug}/search?q=&type=` | Search tasks and pages within org |

### Behavior

* `q` required, min 1 char, max 200 chars — empty q returns 422
* `type` optional — `task` or `page` only, invalid value returns 422
* No `type` returns both tasks and pages mixed
* Tasks: searches `title` ILIKE, excludes archived projects, returns `project_key`, `task_number`, `status`
* Pages: searches `title` ILIKE, excludes soft-deleted pages, returns `space_name`
* Results sorted: exact title matches first, then by `updated_at` desc
* Scoped by `org_id` — cross-org access blocked by `get_org_member` dependency
* Unauthenticated → 401, non-existent org → 404

### Important Note on `get_org_member`

`get_org_member` returns `tuple[Organization, OrgMember]` — always unpack as `org, member = org_member` in router. Do NOT type hint as `OrgMember` directly.

---

## Remaining Work

### Phase 7.1 — Dashboard

* `GET /api/v1/organizations/{slug}/activity` — org-level activity feed (last 50 entries)
* `GET /api/v1/organizations/{slug}/dashboard` — summary stats (open tasks count, active sprints, recent pages, unread notifications count)

### Phase 7.2 — Security Audit

* Audit all endpoints for `get_current_user` dependency
* Grep for raw SQL string interpolation
* Verify cross-tenant isolation
* Rate limiting middleware (Redis counter)
* CORS origin review

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
* Slug-less endpoints (`/tasks/{id}`, `/sprints/{id}`, `/wiki/pages/{id}`) use `get_current_user` + membership lookup in service
* Slug endpoints (`/organizations/{slug}/...`) use `get_org_member` or `require_role` dependency
* `get_org_member` returns `tuple[Organization, OrgMember]` — unpack as `org, member = org_member`
* Soft delete pattern used for: projects (is_archived), pages (is_deleted)
* All errors return structured JSON: `{"code": "ERROR_CODE", "message": "..."}`
* Celery tasks always create `asyncio.new_event_loop()` — never use `asyncio.run()` in forked workers
* Testing: PowerShell `Invoke-RestMethod` against `http://localhost:8001`

---

## Test Users (local dev)

| Email              | Password    | Role               |
| ------------------ | ----------- | ------------------ |
| test@example.com   | password123 | Owner of test-org  |
| member@example.com | password123 | Member of test-org |

## Key IDs (local dev)

| Resource                 | ID                                       |
| ------------------------ | ---------------------------------------- |
| Org (test-org)           | `2ef91448-8d65-4830-ac79-b612dd52a251` |
| Project (WEB, archived)  | `37cbe6ba-e4ec-440e-a0e7-4b20cfebff97` |
| Project (APP, active)    | `f2e0986e-f09c-4cb8-8b84-45ef711c8133` |
| Status WEB: To Do        | `7b527734-ac36-427d-8b46-8dfae0a8b4af` |
| Status WEB: In Progress  | `bb6698d1-bef9-45b1-a910-1f2c7bac6b8f` |
| Status WEB: Done         | `1cef3657-8c33-4a26-89c0-6ec19b227941` |
| Status APP: To Do        | `4b5c2923-1392-406a-a9b5-b7ca8ca821d9` |
| Status APP: In Progress  | `88da0495-ffe0-49bd-ba74-ba2a7aefa77d` |
| Status APP: Done         | `b4fa2b9c-f42b-4530-a5fc-24d1e0dcbe77` |
| User: test@example.com   | `5343fc4f-1621-408d-9b5a-758b43236cdf` |
| User: member@example.com | `b84c9a6b-d13a-48b4-920f-3c2c44870d7b` |
