# WorkScribe

### Project Management & Team Wiki, Unified

WorkScribe is a full-stack project management platform that brings task tracking and team documentation into a single workspace — think Jira and Confluence, but unified.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-work--scribe.vercel.app-5E6AD2?style=for-the-badge)](https://work-scribe.vercel.app/)
[![Backend](https://img.shields.io/badge/API-workscribe--api.onrender.com-10B981?style=for-the-badge)](https://workscribe-api.onrender.com/)
[![CI](https://github.com/ayushi-shahi/WorkScribe/actions/workflows/ci.yml/badge.svg)](https://github.com/ayushi-shahi/WorkScribe/actions/workflows/ci.yml)

---

## Table of Contents

* Overview
* Features
* Try It Out
* Tech Stack
* Architecture
* Getting Started
* Environment Variables
* API Reference
* Project Structure
* Key Design Decisions
* Deployment & Recovery
* License

---

## Overview

WorkScribe is a production-deployed, full-stack SaaS application built to demonstrate end-to-end software engineering — from database design and REST API development to a polished, performant React frontend.

It supports multi-tenant organizations, role-based access control, real-time WebSocket notifications, rich text documentation, and sprint-based project management — all in one unified workspace.

---

## Features

### Project Management

* Kanban boards with drag-and-drop reordering across columns
* Sprint planning — create, start, and complete sprints
* Backlog management with drag-and-drop to/from sprints
* Task panel with inline editing — status, priority, assignee, labels, due dates
* Subtasks, comments (rich text), and activity log per task
* Task to Wiki page linking
* Board filters — assignee, priority, label (multi-select)
* Quick-add inline task creation per column

### Team Wiki

* Hierarchical page tree with drag-and-drop reordering
* Rich text editor — headings, bold, italic, code, tables, blockquotes, slash commands
* Autosave (1500ms debounce) + manual save + unsaved indicator
* Page move (reparent in tree), soft delete with child guard

### Real-time Collaboration

* WebSocket notifications — task assigned, task done, @mention
* Notification bell with unread badge, mark single/all read
* @mention in comments triggers notification to mentioned user

### Auth & Access Control

* Email/password registration and login with JWT (access + refresh tokens)
* Google OAuth 2.0 — sign in or link to existing account
* Silent refresh token rotation via Axios interceptor
* Role-based access control — Owner, Admin, Member
* Password reset via email
* Org invitation flow with email delivery

### Search & Navigation

* Global command palette (Cmd+K) — tasks and pages, keyboard navigable
* Full-text search across tasks and wiki pages within an org
* Org switcher for multi-workspace support
* My Work page — all tasks assigned to the current user, filterable

### Performance

* Route-level code splitting — all pages lazy loaded
* Redis caching — board (30s TTL) and page tree (60s TTL)
* TanStack Query with tuned staleTime/gcTime per query type
* React.memo on high-frequency list rows

### Security

* Rate limiting — 100 req/min per IP globally, plus far tighter per-endpoint
  budgets on auth (10 login attempts / 5 min) so the global limit can't be used
  as a password-guessing allowance
* Per-account login throttling, to catch credential stuffing spread across IPs
* JWT blacklisting on logout (JTI stored in Redis)
* Graceful degradation — a Redis outage disables rate limiting and revocation
  rather than taking authentication down with it
* Cross-tenant isolation — all queries scoped by org_id
* CORS — no wildcards, production origins via env var
* SQL injection audit — zero raw string interpolation

---

## Try It Out

Live at **[work-scribe.vercel.app](https://work-scribe.vercel.app/)** with a fully seeded workspace.

### Sign in

**Three** accounts are available, all with the password `String@12345`:

| Email                           | Signs you in as | Use it to see                          |
| ------------------------------- | --------------- | -------------------------------------- |
| `ayushishahi14072004@gmail.com` | Ayushi Shahi    | An owner running the flagship workspace |
| `ayushi14072004@gmail.com`      | Riya Malhotra   | A different person's assigned work      |
| `23cse062@jssaten.ac.in`        | Karan Mehta     | A member with reduced permissions       |

They are real, separate users — not one account with a switcher. Open two in
different browsers to watch a task assignment arrive live over WebSocket.

### What's inside

| Organization    | Type                  | Ayushi's role | Contents                                            |
| --------------- | --------------------- | ------------- | --------------------------------------------------- |
| **Nexus Labs**  | Product company       | Owner         | 2 projects (scrum + kanban), 3 sprints, 2 wiki spaces |
| **Craft Coffee Co.** | Small business   | Member        | Kanban storefront project, playbook wiki             |
| **JSS Capstone** | University project   | Admin         | Scrum research portal + written-submission board     |

Roles differ **per organization on purpose** — Ayushi owns one workspace, is an
admin in another and only a member in the third, so permission differences are
visible just by switching workspaces in the top-left dropdown.

Across all three: **59 tasks**, 6 sprints (completed / active / planned), 16 wiki
pages in nested trees, plus labels, comments, activity history, task↔doc links
and unread notifications. Timestamps are spread over ~110 days so the activity
feed reads like a real project.

### A 5-minute tour

1. **Board** (Nexus Labs → Mobile Banking App) — drag a card between columns
2. **Backlog** — a completed, an active and a planned sprint; drag an item into the sprint
3. **Open MBA-6** — subtasks, a comment thread, activity history, and a linked wiki page
4. **Wiki → Engineering** — nested page tree with headings, lists and code blocks
5. **Workspace switcher** — hop to Craft Coffee, where the same user has fewer rights

> **Heads-up:** the API is on a free tier and sleeps after ~15 minutes idle, so
> the very first request can take up to a minute while it wakes. Everything is
> fast after that.

> Demo data is shared. Feel free to create and edit things; please don't delete
> the seeded organizations. It can be rebuilt with
> `python seeds/seed_portfolio_demo.py`.

---

## Tech Stack

| Layer            | Technology                                           |
| ---------------- | ---------------------------------------------------- |
| Backend          | Python 3.12, FastAPI                                 |
| Database         | PostgreSQL 17 (Neon), async SQLAlchemy 2.0, Alembic  |
| Cache            | Redis (Upstash)                                      |
| Auth             | JWT, Google OAuth 2.0, bcrypt                        |
| Email            | Brevo HTTP API                                       |
| Real-time        | FastAPI WebSockets                                   |
| Frontend         | React 19, TypeScript, Vite                           |
| State Management | TanStack Query, Zustand                              |
| Rich Text Editor | Tiptap                                               |
| Drag & Drop      | dnd-kit                                              |
| HTTP Client      | Axios                                                |
| Deployment       | Render (backend, Docker), Vercel (frontend)          |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Vercel (CDN)                      │
│              React 19 + TypeScript SPA               │
│         TanStack Query · Zustand · dnd-kit           │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS / WSS
┌────────────────────▼────────────────────────────────┐
│                 Render (Docker)                      │
│              FastAPI + Uvicorn                       │
│     Routers → Services → SQLAlchemy ORM             │
│       BackgroundTasks (email, notifications)         │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────┐    ┌──────────▼──────┐
│      Neon       │    │    Upstash       │
│   PostgreSQL    │    │     Redis        │
│  (primary DB)   │    │ (cache + rate    │
│                 │    │  limit + JWT     │
│                 │    │  blacklist)      │
└─────────────────┘    └─────────────────┘
```

**Key architectural decisions:**

* Business logic lives exclusively in the service layer — routers are thin
* All queries scoped by `org_id` — full cross-tenant isolation
* Celery replaced with FastAPI `BackgroundTasks` — no worker process needed
* Redis cache fails silently — never breaks a request
* Filtered board requests always bypass cache
* Soft delete for projects (`is_archived`) and wiki pages (`is_deleted`)

---

## Getting Started

### Prerequisites

* Python 3.12+
* Node.js 20+ (CI builds on 22)
* Docker & Docker Compose
* PostgreSQL and Redis (local via Docker, or hosted on Neon + Upstash)

### 1. Clone the repository

```bash
git clone https://github.com/ayushi-shahi/WorkScribe.git
cd WorkScribe
```

### 2. Backend setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env

# Start local database and Redis (skip if using hosted Neon + Upstash)
docker compose up -d db redis

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8001
```

API available at `http://localhost:8001`

Interactive docs at `http://localhost:8001/api/docs` (requires `DEBUG=true`)

Dependency health at `http://localhost:8001/health/ready`

### 3. Frontend setup

```bash
cd frontend

# Point the app at your API
cp .env.example .env

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend available at `http://localhost:5173`

---

## Environment Variables

### Backend (`.env`)

See `backend/.env.example` for the fully annotated list.

| Variable                 | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL`         | Must use the async driver: `postgresql+asyncpg://...`. On Neon, append `?ssl=require` and remove `sslmode`/`channel_binding` — asyncpg rejects both |
| `REDIS_URL`            | Use `rediss://` (TLS) for hosted Redis such as Upstash                    |
| `JWT_SECRET_KEY`       | Min 32 chars. Changing it invalidates every session                       |
| `CORS_ORIGINS`         | Single origin, comma-separated list, or JSON array. **No trailing slash** |
| `FRONTEND_URL`         | Used to build invitation and password-reset links                         |
| `BREVO_API_KEY`        | Transactional email. Without it, emails are skipped and logged            |
| `EMAIL_FROM`           | Must be a **verified sender** in Brevo or sends are rejected              |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                                                    |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                                                |
| `ENVIRONMENT`          | `development` \| `staging` \| `production`                                |
| `DEBUG`                | `false` in production — `true` exposes stack traces and API docs          |
| `LOG_LEVEL`            | Defaults to `INFO`                                                        |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | Keep small (5/5) — free-tier Postgres caps connections         |
| `DB_USE_PGBOUNCER`     | `true` only behind a transaction-mode pooler (Supabase `:6543`, PgBouncer) |
| `RATE_LIMIT_PER_MINUTE`| Global per-IP budget. Auth endpoints have their own tighter limits         |
| `PORT`                 | Optional — the container binds `$PORT` and falls back to 8000             |

### Frontend (`frontend/.env`)

| Variable                   | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `VITE_API_URL`             | API base URL **including** `/api/v1`, no trailing slash. e.g. `http://localhost:8001/api/v1` |
| `VITE_EVENTPULSE_API_KEY`  | Optional analytics key                                          |
| `VITE_EVENTPULSE_ENDPOINT` | Optional analytics endpoint                                     |

> Vite inlines `VITE_*` values **at build time**. Changing one on Vercel has no
> effect until you redeploy.

---

## API Reference

Built with FastAPI, so every endpoint is self-documenting with request/response
schemas, auth requirements and live testing. Run locally with `DEBUG=true` and
open **`http://localhost:8001/api/docs`** (Swagger UI) or
**`/api/redoc`**.

> Docs are disabled in production — `docs_url` is only registered when `DEBUG`
> is true, so the schema is not exposed publicly.

### Endpoint groups

| Prefix                        | Covers                                                 |
| ----------------------------- | ------------------------------------------------------ |
| `/api/v1/auth`                | register, login, refresh, logout, password reset, Google OAuth, invitations |
| `/api/v1/organizations`       | orgs, members, roles, invitations                      |
| `/api/v1/.../projects`        | projects, task statuses, labels                        |
| `/api/v1/.../tasks`           | tasks, subtasks, comments, activity, labels, positions |
| `/api/v1/sprints`             | create, start, complete, add/remove tasks              |
| `/api/v1/wiki`                | spaces, pages, move, soft delete                       |
| `/api/v1/tasks/{id}/links`    | task ↔ wiki page links                                 |
| `/api/v1/notifications`       | list, mark read, unread count                          |
| `/api/v1/search`              | cross-entity search within an org                      |
| `/api/v1/ws`                  | WebSocket, authenticated by `?token=`                  |

### Health endpoints

| Endpoint         | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `/health`        | Liveness. Never touches the DB, so a dependency outage can't cause a restart loop |
| `/health/ready`  | Readiness. Checks Postgres and Redis and returns 503 naming the failing component |

`/health/ready` is the first thing to hit when something is wrong — see the
[recovery runbook](backend/docs/DEPLOYMENT.md).

---

## Testing

```bash
# Smoke tests — drive the ASGI app in-process, no server required
cd backend && pytest tests/test_smoke.py -q

# Cross-tenant isolation tests — need a running server, so run them in Docker
docker compose exec api pytest tests/ -q
```

CI runs on every push and pull request:

* **Backend** — ruff, migrations against a real Postgres, a downgrade/upgrade
  round trip proving migrations are reversible, and the smoke suite
* **Frontend** — typecheck, production build, and a guard asserting the SPA
  rewrite still excludes `/assets/` so stale code-split chunks can't be served
  as HTML

---

## Project Structure

```
WorkScribe/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py              # Pydantic settings, all env vars
│   │   │   ├── database.py            # Async engine, pool tuning, check_db()
│   │   │   ├── dependencies.py        # get_current_user, get_org_member, require_role
│   │   │   ├── logging.py             # stdout log handler
│   │   │   ├── rate_limit.py          # Global + per-endpoint Redis rate limiting
│   │   │   ├── redis_client.py        # Shared Redis client, timeouts, check_redis()
│   │   │   ├── security.py            # bcrypt, JWT encode/decode
│   │   │   └── websocket.py           # ConnectionManager singleton
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   ├── routers/                   # FastAPI route handlers (thin layer)
│   │   ├── schemas/                   # Pydantic request/response schemas
│   │   ├── services/                  # All business logic lives here
│   │   ├── workers/
│   │   │   ├── email_tasks.py         # Invitation + password reset emails
│   │   │   └── notification_tasks.py  # WebSocket notification dispatch
│   │   └── main.py                    # App factory, middleware order, health probes
│   ├── alembic/versions/              # 18 migration files
│   ├── docs/DEPLOYMENT.md             # Recovery runbook
│   ├── tests/
│   │   ├── test_smoke.py              # In-process, no server needed (runs in CI)
│   │   └── test_isolation.py          # Cross-tenant checks, needs a live server
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.ts          # Axios instance + silent refresh interceptor
│   │   │   └── endpoints/         # auth, organizations, projects, tasks, wiki...
│   │   ├── components/
│   │   │   ├── board/             # TaskCard, BoardColumn, CreateTaskModal
│   │   │   ├── backlog/           # BacklogTaskRow, sprint modals
│   │   │   ├── layout/            # Topbar, Sidebar, NotificationsPanel
│   │   │   ├── panel/             # TaskPanel slide-over
│   │   │   ├── wiki/              # PageTree, WikiEditor (Tiptap)
│   │   │   ├── AuthBootstrap.tsx  # Restores the session on page load
│   │   │   └── ErrorBoundary.tsx  # Logs and surfaces render errors
│   │   ├── hooks/                 # useBoardDnd, useWebSocket
│   │   ├── lib/                   # session storage, lazyWithRetry, task helpers
│   │   ├── pages/                 # All page components (lazy loaded)
│   │   ├── stores/                # authStore, uiStore (Zustand)
│   │   ├── styles/                # CSS design tokens, no Tailwind
│   │   └── types/                 # TypeScript type definitions
│   └── public/                    # Favicons, web manifest
├── seeds/                         # Demo data generators (gitignored)
├── .github/workflows/ci.yml       # Lint, migrations, tests, build
├── render.yaml                    # Backend deploy blueprint
└── vercel.json                    # Frontend build + SPA rewrite rules
```

---

## Key Design Decisions

* **Service layer pattern** — all business logic in `services/`, routers are thin controllers
* **Async throughout** — FastAPI + async SQLAlchemy 2.0 + asyncpg for non-blocking I/O
* **BackgroundTasks over Celery** — no worker process needed; email and notifications dispatched in-process
* **Redis cache fails silently** — a cache miss never surfaces as an error to the user
* **Optimistic updates** — board DnD, backlog DnD, comments, and subtask toggles update the UI instantly before the server confirms
* **Dark theme only** — CSS custom properties in `tokens.css`, zero Tailwind dependency
* **Route-level code splitting** — every page is `React.lazy()`, keeping the initial bundle small
* **Cross-tenant isolation** — every query is scoped by `org_id`, enforced at the service layer

---

## Deployment & Recovery

The backend deploys to Render from `backend/Dockerfile`; `render.yaml` documents
the service configuration. Migrations run automatically on boot via the
pre-deploy command, so a recreated database rebuilds its own schema. The
frontend deploys to Vercel from `vercel.json`.

**When something breaks, start here:**

```bash
curl https://workscribe-api.onrender.com/health/ready
```

It reports which dependency is at fault instead of leaving you to read logs.
A CORS error in the browser console is almost always a 500 in disguise — check
readiness before touching any CORS setting.

Full symptom → cause → fix guide, including free-tier resource expiry, provider
connection-string quirks and email delivery: **[backend/docs/DEPLOYMENT.md](backend/docs/DEPLOYMENT.md)**.

---

## License

MIT © 2026 Ayushi Shahi
