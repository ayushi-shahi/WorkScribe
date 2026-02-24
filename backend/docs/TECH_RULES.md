# Tech Rules
## Technology Stack & Engineering Guidelines
**Version:** 1.0.0 | **Status:** Approved | **Last Updated:** February 2026

> This is the single source of truth for every technology decision.
> No new library may be added without updating this file.

---

## 1. Stack at a Glance

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 19.x |
| Build Tool | Vite | 5.x |
| Frontend Language | TypeScript | 5.x (`strict: true`) |
| Server State | TanStack Query (React Query) | 5.x |
| Client State | Zustand | 4.x |
| Routing | React Router | 6.x |
| Rich Text Editor | Tiptap | 2.x |
| HTTP Client | Axios | 1.x |
| Drag and Drop | @dnd-kit/core + @dnd-kit/sortable | 6.x |
| API Framework | FastAPI | 0.115.x |
| Backend Language | Python | 3.12.x |
| ORM | SQLAlchemy | 2.0.x (async) |
| DB Driver | asyncpg | 0.29.x |
| Migrations | Alembic | 1.13.x |
| Validation | Pydantic | v2.x |
| Database | PostgreSQL | 16.x |
| Cache + Broker | Redis | 7.x |
| Task Queue | Celery | 5.x |
| Email | Resend | — |
| Auth | python-jose + passlib[bcrypt] | — |
| Containers | Docker + docker-compose | — |
| CI | GitHub Actions | — |

---

## 2. Backend Rules

### 2.1 Directory Structure

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, middleware, routers
│   ├── core/
│   │   ├── config.py            # pydantic-settings BaseSettings
│   │   ├── security.py          # JWT encode/decode, password hash
│   │   ├── dependencies.py      # get_current_user, get_db, get_redis
│   │   └── database.py          # async engine + session factory
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── base.py              # Base + TimestampMixin
│   │   ├── organization.py
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── task.py
│   │   └── page.py
│   ├── schemas/                 # Pydantic v2 request/response schemas
│   │   ├── auth.py
│   │   ├── organization.py
│   │   ├── task.py
│   │   └── page.py
│   ├── routers/                 # FastAPI APIRouter — one per domain
│   │   ├── auth.py
│   │   ├── organizations.py
│   │   ├── projects.py
│   │   ├── tasks.py
│   │   ├── sprints.py
│   │   ├── pages.py
│   │   ├── search.py
│   │   ├── notifications.py
│   │   └── websocket.py
│   ├── services/                # Business logic — never in routers
│   │   ├── auth_service.py
│   │   ├── task_service.py
│   │   ├── page_service.py
│   │   └── notification_service.py
│   └── workers/
│       ├── celery_app.py        # Celery instance + Redis broker config
│       ├── email_tasks.py       # send_invitation_email, send_reset_email
│       └── notification_tasks.py # create_and_dispatch_notification
├── alembic/
│   ├── env.py                   # async env config
│   └── versions/
├── tests/
│   ├── conftest.py              # async test client, test DB session
│   ├── test_auth.py
│   ├── test_tasks.py
│   └── test_isolation.py        # CRITICAL: cross-tenant security tests
├── alembic.ini
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── pyproject.toml
```

### 2.2 Non-Negotiable Rules

**Rule 1 — Always async route handlers:**
```python
# ✅ CORRECT
@router.get("/tasks/{task_id}")
async def get_task(task_id: UUID, db: AsyncSession = Depends(get_db)):
    ...

# ❌ WRONG — blocks the event loop
@router.get("/tasks/{task_id}")
def get_task(task_id: UUID):
    ...
```

**Rule 2 — Business logic in services only, never in routers:**
```python
# ✅ CORRECT
@router.post("/tasks")
async def create_task(body: TaskCreate, service: TaskService = Depends()):
    return await service.create(body, current_user)

# ❌ WRONG — logic in router
@router.post("/tasks")
async def create_task(body: TaskCreate, db: AsyncSession = Depends(get_db)):
    task = Task(**body.model_dump())  # business logic in router
    db.add(task)
    ...
```

**Rule 3 — Every query must be scoped by org_id:**
```python
# ✅ CORRECT
stmt = select(Task).where(
    Task.org_id == current_user.org_id,
    Task.id == task_id
)

# ❌ WRONG — unscoped query, security hole
stmt = select(Task).where(Task.id == task_id)
```

**Rule 4 — Pydantic v2 syntax only:**
```python
# ✅ CORRECT
class TaskCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    title: str
    project_id: UUID

# ❌ WRONG — v1 syntax
class TaskCreate(BaseModel):
    class Config:
        orm_mode = True
```

**Rule 5 — Settings via pydantic-settings only:**
```python
# ✅ CORRECT
from app.core.config import settings
url = settings.DATABASE_URL

# ❌ WRONG
import os
url = os.environ.get("DATABASE_URL")
```

**Rule 6 — asyncpg only, never psycopg2:**
```python
# ✅ CORRECT — in database.py
engine = create_async_engine(
    settings.DATABASE_URL,  # postgresql+asyncpg://...
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
```

### 2.3 Authentication Pattern

```python
# core/dependencies.py
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> User:
    # 1. Check Redis blacklist: GET blacklist:{jti}
    # 2. Decode JWT, extract user_id + jti
    # 3. Load User from DB, verify active
    # 4. Return user

# Use in any protected route:
@router.get("/projects")
async def list_projects(current_user: User = Depends(get_current_user)):
    ...
```

**JWT config:**
- Access token TTL: 15 minutes
- Refresh token: 30 days, stored in Redis as `refresh:{user_id}:{jti}`
- Algorithm: HS256
- Blacklist key on logout: `blacklist:{jti}` with remaining TTL as expiry

### 2.4 Database Session Pattern

```python
# core/database.py
async_engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### 2.5 Base Model Pattern

```python
# models/base.py
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

# Every model must have org_id:
class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    org_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), index=True, nullable=False)
    # ... fields
```

### 2.6 Celery Pattern

```python
# workers/celery_app.py
celery_app = Celery(
    "worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
celery_app.conf.task_routes = {
    "app.workers.email_tasks.*": {"queue": "email"},
    "app.workers.notification_tasks.*": {"queue": "notifications"},
}

# workers/email_tasks.py
@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_invitation_email(self, to_email: str, org_name: str, token: str):
    try:
        resend.Emails.send({ ... })
    except Exception as exc:
        raise self.retry(exc=exc)
```

### 2.7 WebSocket Pattern

```python
# In-memory connection manager — single server only (MVP)
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}  # user_id -> websocket

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)

    async def send_to_user(self, user_id: str, data: dict):
        if ws := self.active.get(user_id):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

manager = ConnectionManager()  # module-level singleton
```

### 2.8 Error Handling Pattern

```python
# Always raise HTTPException with structured detail dict
raise HTTPException(
    status_code=404,
    detail={"code": "TASK_NOT_FOUND", "message": "Task not found"}
)

# Never let raw exceptions propagate — catch in service layer
# Global 500 handler in main.py returns {"detail": {"code": "INTERNAL_ERROR"}}
```

### 2.9 Code Quality

| Tool | Purpose | Config |
|------|---------|--------|
| `ruff` | Lint + format (replaces black + isort) | `line-length = 100` |
| `mypy` | Type checking | `strict = true` |
| `pytest` + `pytest-asyncio` | Testing | `asyncio_mode = "auto"` |
| `pre-commit` | Gate commits | ruff + mypy on staged files |

Minimum test coverage: 70% overall · 80% for service layer

---

## 3. Frontend Rules

### 3.1 Directory Structure

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                  # React Router setup
│   ├── components/
│   │   ├── ui/                  # Base: Button, Input, Modal, Avatar, Toast
│   │   ├── task/                # TaskCard, TaskPanel, CreateTaskModal
│   │   ├── board/               # BoardColumn, BoardView
│   │   ├── sprint/              # BacklogView, SprintSection
│   │   └── wiki/                # PageTree, PageEditor, WikiLayout
│   ├── hooks/                   # useWebSocket, useCommandPalette, useOptimistic
│   ├── stores/                  # Zustand — UI state only
│   │   ├── uiStore.ts           # panel open/close, active task id
│   │   └── authStore.ts         # access token, current user
│   ├── api/                     # Axios client + TanStack Query hooks
│   │   ├── client.ts            # Axios instance, interceptors
│   │   ├── hooks/
│   │   │   ├── useTasks.ts
│   │   │   ├── useProjects.ts
│   │   │   └── usePages.ts
│   │   └── endpoints/           # Raw fetch functions (no React)
│   ├── types/                   # TypeScript interfaces (mirror Pydantic schemas)
│   ├── lib/                     # helpers, constants, formatters
│   └── styles/
│       ├── globals.css
│       └── tokens.css           # All CSS variables from DESIGN.md
├── public/
├── index.html
├── vite.config.ts
└── tsconfig.json
```

### 3.2 Non-Negotiable Rules

**Rule 1 — TanStack Query for ALL server state:**
```tsx
// ✅ CORRECT
const { data: tasks, isLoading } = useQuery({
  queryKey: ['tasks', projectId],
  queryFn: () => fetchTasks(projectId),
})

// ❌ WRONG — useState + useEffect for API data
const [tasks, setTasks] = useState([])
useEffect(() => { fetchTasks(projectId).then(setTasks) }, [projectId])
```

**Rule 2 — Zustand for UI state only, never API data:**
```tsx
// ✅ CORRECT Zustand usage
interface UIStore {
  isTaskPanelOpen: boolean
  activePanelTaskId: string | null
  openTaskPanel: (id: string) => void
  closeTaskPanel: () => void
}

// ❌ WRONG — server data in Zustand
interface BadStore {
  tasks: Task[]       // NO — belongs in TanStack Query
  setTasks: (t: Task[]) => void
}
```

**Rule 3 — Optimistic updates on board mutations:**
```tsx
const moveTaskMutation = useMutation({
  mutationFn: ({ taskId, statusId }: MovePayload) =>
    updateTaskStatus(taskId, statusId),
  onMutate: async ({ taskId, statusId }) => {
    await queryClient.cancelQueries({ queryKey: ['board', projectId] })
    const snapshot = queryClient.getQueryData(['board', projectId])
    queryClient.setQueryData(['board', projectId], applyOptimisticMove)
    return { snapshot }
  },
  onError: (_err, _vars, ctx) => {
    queryClient.setQueryData(['board', projectId], ctx?.snapshot)
    toast.error('Failed to update task status')
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['board', projectId] })
  },
})
```

**Rule 4 — TypeScript strict, no `any`:**
```tsx
// ❌ WRONG
const data: any = response.data
const result = (something as any).field

// ✅ CORRECT — use proper types or type guards
const data: Task = response.data as Task  // OK with comment explaining why
```

**Rule 5 — Max 200 lines per component file. Split if longer.**

### 3.3 Routing

```tsx
// App.tsx — React Router v6 data router
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/invitations/:token', element: <AcceptInvitePage /> },
  {
    path: '/org/:slug',
    element: <ProtectedRoute><OrgLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="dashboard" /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'projects/:key/board', element: <BoardPage /> },
      { path: 'projects/:key/backlog', element: <BacklogPage /> },
      { path: 'projects/:key/settings', element: <ProjectSettingsPage /> },
      { path: 'wiki', element: <WikiHomePage /> },
      { path: 'wiki/:spaceKey', element: <SpacePage /> },
      { path: 'wiki/:spaceKey/:pageId', element: <PageEditorPage /> },
      { path: 'settings', element: <OrgSettingsPage /> },
      { path: 'settings/members', element: <MembersPage /> },
    ],
  },
])
```

**Task panel state via URL query param:** `?task=WEB-42` — so links work and browser back works.

### 3.4 API Client

```typescript
// api/client.ts
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

// Attach JWT on every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 — refresh token, retry request, or logout
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status !== 401) return Promise.reject(error)
    // Queue concurrent requests, refresh once, replay all
    // On refresh failure → clearAuth() + redirect to /login
  }
)
```

### 3.5 Styling Rules

- **Approach:** CSS Modules for component styles + global design tokens from `tokens.css`
- **No Tailwind** — use CSS variables defined in `tokens.css`
- **No inline styles** except for truly dynamic values (drag position, dynamic colors from API)
- **No `!important`** — ever
- All spacing uses token variables: `var(--space-4)`, `var(--space-8)`

### 3.6 Code Quality

| Tool | Config |
|------|--------|
| ESLint | `@typescript-eslint/recommended` + `eslint-plugin-react-hooks` |
| Prettier | `semi: false` · `singleQuote: true` · `printWidth: 100` |
| Husky + lint-staged | Run ESLint + Prettier on staged files before commit |
| TypeScript | `strict: true` in tsconfig.json |

---

## 4. Database Rules

### 4.1 Naming Conventions

| Object | Convention | Example |
|--------|-----------|---------|
| Tables | `snake_case`, plural | `task_labels` |
| Columns | `snake_case` | `created_at`, `org_id` |
| Indexes | `idx_{table}_{column}` | `idx_tasks_org_id` |
| FK constraints | `{table}_{col}_fkey` | `tasks_org_id_fkey` |

### 4.2 Required Columns on Every Table

```sql
id         UUID         PRIMARY KEY DEFAULT gen_random_uuid()
org_id     UUID         NOT NULL REFERENCES organizations(id)
created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
```

### 4.3 Required Indexes — Minimum Per Table

```sql
CREATE INDEX idx_{table}_org_id    ON {table}(org_id);
CREATE INDEX idx_{table}_created_at ON {table}(created_at DESC);
```

Task-specific indexes:
```sql
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status_id);
CREATE INDEX idx_tasks_assignee       ON tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_sprint         ON tasks(sprint_id) WHERE sprint_id IS NOT NULL;
```

### 4.4 Task Number Sequencing

```sql
-- Per-project sequence (safe under concurrency — never SELECT MAX+1)
CREATE SEQUENCE task_number_seq_{project_id};

-- Or: use a dedicated project_task_counters table with SELECT ... FOR UPDATE
CREATE TABLE project_task_counters (
  project_id UUID PRIMARY KEY REFERENCES projects(id),
  last_number INT NOT NULL DEFAULT 0
);
-- ALWAYS use SELECT ... FOR UPDATE when incrementing
```

### 4.5 Position Ordering (Board + Page Tree)

Use integer gap strategy — never floats:
```sql
position INTEGER NOT NULL DEFAULT 0
```
Default gap: 1000 between items (1000, 2000, 3000...)
Rebalance by setting all positions to multiples of 1000 when a gap < 10 is detected.

### 4.6 Migrations

- One Alembic migration per feature/PR
- Always write `downgrade()` — tested before merge
- Never edit a committed migration — create a new one
- Migration naming: `{version}_{short_description}.py` e.g. `005_create_tasks_table.py`

---

## 5. API Contract

### 5.1 URL Patterns

```
GET    /api/v1/projects/{id}/tasks          # list
POST   /api/v1/projects/{id}/tasks          # create
GET    /api/v1/tasks/{id}                   # detail
PATCH  /api/v1/tasks/{id}                   # partial update (always PATCH not PUT)
DELETE /api/v1/tasks/{id}                   # delete
```

Base prefix: `/api/v1`
All routes require `Authorization: Bearer {token}` except `/auth/*`

### 5.2 Response Shape

```json
// List
{ "data": [...], "meta": { "total": 145, "skip": 0, "limit": 25 } }

// Single item
{ "data": { "id": "...", ... } }

// Error
{ "detail": { "code": "TASK_NOT_FOUND", "message": "Task not found" } }
```

### 5.3 Pagination

All list endpoints accept `?skip=0&limit=25`. Default limit: 25. Max limit: 100.

---

## 6. Environment Variables

```python
# core/config.py — all vars typed via pydantic-settings
class Settings(BaseSettings):
    DATABASE_URL: str          # postgresql+asyncpg://user:pass@host/db
    REDIS_URL: str             # redis://localhost:6379/0
    JWT_SECRET_KEY: str        # min 32 chars, random
    JWT_ALGORITHM: str = "HS256"
    RESEND_API_KEY: str
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)
```

**Never hardcode secrets. Never commit `.env` files.**

---

## 7. Docker / Local Dev

```yaml
# docker-compose.yml
services:
  api:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db/workflow
      REDIS_URL: redis://redis:6379/0
    depends_on: [db, redis]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  worker:
    build: ./backend
    command: celery -A app.workers.celery_app worker --loglevel=info
    depends_on: [redis]

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    command: npm run dev -- --host

  db:
    image: postgres:16-alpine
    environment: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: workflow }
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]

volumes:
  pgdata:
  redisdata:
```

`docker compose up` → everything running at `http://localhost:5173`

---

## 8. Prohibited Technologies

| Technology | Reason | Use Instead |
|------------|--------|-------------|
| `psycopg2` | Sync driver, blocks event loop | `asyncpg` |
| `requests` in async code | Sync HTTP, blocks event loop | `httpx` (async) |
| `FastAPI.BackgroundTasks` for emails | Dies with process, no retry | Celery tasks |
| Raw f-string SQL | SQL injection risk | SQLAlchemy ORM always |
| `os.environ.get()` directly | No type safety | `pydantic-settings` |
| `any` type in TypeScript | Defeats type safety | Proper types |
| `useState` for server data | Bypasses caching layer | TanStack Query |
| Redux | Overkill | TanStack Query + Zustand |
| Tailwind CSS | Not chosen for this project | CSS Modules + tokens |
| Float for position ordering | Precision issues over time | Integer gap strategy |
| `SELECT MAX(number)+1` for task IDs | Race condition under concurrency | DB sequence or `FOR UPDATE` |
