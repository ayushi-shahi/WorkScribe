# Deployment & Recovery Runbook

Frontend: Vercel → `work-scribe.vercel.app`
Backend: Render → `workscribe-api.onrender.com`
Database: managed Postgres · Cache: managed Redis

---

## 1. Diagnose first — always

Start here. It answers "what is broken" in one request, without reading logs:

```bash
curl https://workscribe-api.onrender.com/health/ready
```

| Response | Meaning | Go to |
|---|---|---|
| `200 {"status":"ready"}` | API, database and Redis all healthy | §4 |
| `503` with `database.ok: false` | Database unreachable or expired | §2 |
| `503` with `redis.ok: false` | Redis unreachable or expired | §3 |
| Connection hangs ~50s then responds | Free-tier cold start, not a fault | §5 |
| No response at all | Service is down — check Render dashboard | — |

`/health` (liveness) only reports that the process is running. It deliberately
does **not** touch the database, so the platform does not restart-loop a healthy
process during a dependency outage. `/health/ready` is the one that tells you
the truth.

### About "CORS errors"

A CORS error in the browser console is **almost never a CORS problem**. When the
API returns a 500, the response now carries the correct
`Access-Control-Allow-Origin` header, so the browser shows the real error
message instead of hiding it behind a CORS complaint. If you still see a genuine
CORS error, check that `CORS_ORIGINS` exactly matches the site origin, with **no
trailing slash**.

Every 500 response includes an `error_id`. Search the Render logs for that id to
find the matching stack trace.

---

## 2. Database is gone

Symptom: `/health/ready` reports `database.ok: false`, logs show
`asyncpg ... ENOTFOUND` / `Name or service not known`.

Free-tier databases are deleted after a period of inactivity. Recovery:

1. Create a new Postgres instance (Supabase, Neon, or Render Postgres).
2. Copy the connection string and convert it to the async driver:
   `postgresql+asyncpg://USER:PASSWORD@HOST:PORT/DBNAME`
3. Render → Environment → set `DATABASE_URL`.
4. If the host is a **transaction-mode pooler** (Supabase port `6543`,
   PgBouncer), also set `DB_USE_PGBOUNCER=true`. Skipping this causes random
   `InvalidSQLStatementName` errors that appear only under concurrent load.
5. Manual Deploy → *Deploy latest commit*.

Migrations run automatically on boot via the start command
(`alembic upgrade head && uvicorn ...`), so a brand-new empty database gets its
schema without any manual step. Verify the start command is set on the service —
see `render.yaml`.

To run migrations by hand:

```bash
alembic upgrade head
```

---

## 3. Redis is gone

Symptom: `/health/ready` reports `redis.ok: false`, logs show
`redis.exceptions.ConnectionError ... upstash.io`.

The app **stays usable** without Redis: login, refresh and normal requests all
continue to work. What degrades is server-side token revocation, refresh-token
rotation checks, and rate limiting. Fix it promptly, but it is not an outage.

1. Create a new Redis instance (Upstash free tier).
2. Copy the full URL. **Managed Redis almost always requires TLS — use
   `rediss://`, not `redis://`.**
   `rediss://default:PASSWORD@HOST:6379`
3. Render → Environment → set `REDIS_URL`.
4. Manual Deploy → *Deploy latest commit*.

---

## 4. Everything reports healthy but the app misbehaves

- Confirm `VITE_API_URL` on Vercel points at the API **including `/api/v1`** and
  has no trailing slash. Changing it requires a Vercel redeploy — Vite inlines
  env vars at build time.
- Confirm `CORS_ORIGINS` on Render contains the exact Vercel origin.
- Check the Render logs for the `error_id` shown in the failing response.

---

## 5. Cold starts

Free Render services sleep after ~15 minutes idle. The next request pays the
container boot cost, commonly 30–60 seconds. The frontend HTTP timeout is 60s
specifically to absorb this — a shorter timeout aborts the request while the
backend is coming up fine, which reads as "the site is broken" on the first
visit after a quiet period.

To avoid the cold start entirely, ping `/health` every 10 minutes from an
external uptime monitor (UptimeRobot, Better Stack, Cron-job.org). Use `/health`
and not `/health/ready`, so a Redis blip does not page you.

---

## 6. Required environment variables

Backend (Render) — see `backend/.env.example` for the full annotated list:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | must use the `postgresql+asyncpg://` scheme |
| `REDIS_URL` | use `rediss://` for managed providers |
| `JWT_SECRET_KEY` | min 32 chars. Changing it invalidates every session |
| `CORS_ORIGINS` | single origin, comma-separated, or JSON array. No trailing slash |
| `FRONTEND_URL` | used to build links in invitation and password-reset emails |
| `BREVO_API_KEY` | transactional email; without it emails are logged and skipped |
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` in production — `true` leaks stack traces to clients |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | keep small (5/5); free-tier Postgres caps connections |
| `DB_USE_PGBOUNCER` | `true` only behind a transaction-mode pooler |

Frontend (Vercel) — see `frontend/.env.example`:

| Variable | Notes |
|---|---|
| `VITE_API_URL` | e.g. `https://workscribe-api.onrender.com/api/v1` |

---

## 7. Local development

```bash
cd backend
docker compose up -d              # Postgres :5433, Redis :6380, API :8001
docker compose exec api alembic upgrade head
curl http://localhost:8001/health/ready

cd ../frontend
npm install && npm run dev        # :5173
```

Integration tests run **inside** the compose network (they target the `api`
hostname), so run them through the container, not from the host:

```bash
docker compose exec api pytest tests/ -q
```
