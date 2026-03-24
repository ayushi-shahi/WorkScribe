<div align="center">
# WorkScribe

### Project Management & Team Wiki, Unified

WorkScribe is a full-stack project management platform that brings task tracking and team documentation into a single workspace — think Jira and Confluence, but unified.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-work--scribe.vercel.app-5E6AD2?style=for-the-badge)](https://work-scribe.vercel.app/)
[![Backend](https://img.shields.io/badge/API-workscribe--api.onrender.com-10B981?style=for-the-badge)](https://workscribe-api.onrender.com/)
[![License](https://img.shields.io/badge/License-MIT-gray?style=for-the-badge)](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#license)

</div>
---


---

## Table of Contents

* [Overview](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#overview)
* [Features](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#features)
* [Tech Stack](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#tech-stack)
* [Architecture](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#architecture)
* [Getting Started](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#getting-started)
* [Environment Variables](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#environment-variables)
* [API Reference](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#api-reference)
* [Project Structure](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#project-structure)
* [Key Design Decisions](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#key-design-decisions)
* [License](https://claude.ai/chat/fb1ad488-be53-4557-84ab-46342a89b4bf#license)

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
* WikiEditor (Tiptap) lazy loaded — page shell renders before editor bundle
* Redis caching — board (30s TTL) and page tree (60s TTL)
* TanStack Query with tuned staleTime/gcTime per query type
* React.memo on high-frequency list rows

### Security

* Rate limiting — 100 req/min per IP (Redis sliding window, 429 + Retry-After)
* JWT blacklisting on logout (JTI stored in Redis)
* Cross-tenant isolation — all queries scoped by org_id
* CORS — no wildcards, production origins via env var
* SQL injection audit — zero raw string interpolation

---

## Tech Stack

| Layer            | Technology                                           |
| ---------------- | ---------------------------------------------------- |
| Backend          | Python 3.12, FastAPI                                 |
| Database         | PostgreSQL (Supabase), async SQLAlchemy 2.0, Alembic |
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
│    Supabase     │    │    Upstash       │
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
* Node.js 18+
* Docker & Docker Compose
* PostgreSQL and Redis (local via Docker, or use Supabase + Upstash)

### 1. Clone the repository

```bash
git clone https://github.com/ayushi-shahi/WorkScribe.git
cd WorkScribe
```

### 2. Backend setup

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env

# Start local database and Redis (skip if using Supabase + Upstash)
docker compose up -d db redis

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8001
```

API available at `http://localhost:8001`

Interactive docs at `http://localhost:8001/docs`

### 3. Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend available at `http://localhost:5173`

---

## Environment Variables

### Backend (`.env`)

| Variable                 | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL`         | PostgreSQL connection string (`postgresql+asyncpg://...`)              |
| `REDIS_URL`            | Redis connection string                                                  |
| `JWT_SECRET_KEY`       | Min 32 chars, used for signing access + refresh tokens                   |
| `FRONTEND_URL`         | e.g.`https://work-scribe.vercel.app`                                   |
| `BREVO_API_KEY`        | Brevo API key for transactional email                                    |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                                                   |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                                               |
| `CORS_ORIGINS`         | JSON array of allowed origins e.g.`["https://work-scribe.vercel.app"]` |
| `PORT`                 | API port (set to `8000`on Render)                                      |

---

## API Reference

Interactive API documentation is available at:

**[workscribe-api.onrender.com/docs](https://workscribe-api.onrender.com/docs)**

Built with FastAPI — all endpoints are fully documented with request/response schemas, authentication requirements, and live testing support.

---

## Project Structure

```
WorkScribe/
├── app/
│   ├── core/
│   │   ├── config.py              # Pydantic settings, all env vars
│   │   ├── database.py            # Async SQLAlchemy engine + session
│   │   ├── dependencies.py        # get_current_user, get_org_member, require_role
│   │   ├── rate_limit.py          # Redis sliding window rate limiter
│   │   ├── security.py            # bcrypt, JWT encode/decode
│   │   └── websocket.py           # ConnectionManager singleton
│   ├── models/                    # SQLAlchemy ORM models
│   ├── routers/                   # FastAPI route handlers (thin layer)
│   ├── schemas/                   # Pydantic request/response schemas
│   ├── services/                  # All business logic lives here
│   └── workers/
│       ├── email_tasks.py         # Invitation + password reset emails
│       └── notification_tasks.py  # WebSocket notification dispatch
├── alembic/                       # 18 migration files
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
│   │   │   └── wiki/              # PageTree, WikiEditor (Tiptap)
│   │   ├── hooks/                 # useBoardDnd, useWebSocket, useClickOutside
│   │   ├── pages/                 # All page components (React.lazy)
│   │   ├── stores/                # authStore, uiStore (Zustand)
│   │   ├── styles/                # CSS design tokens, no Tailwind
│   │   └── types/                 # TypeScript type definitions
│   └── public/                    # Favicons, web manifest
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
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

## License

MIT © 2026 Ayushi Shahi
