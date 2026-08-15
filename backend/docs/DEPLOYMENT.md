# WorkScribe — Recovery Runbook

What to do when the site is broken. Written to be followed months from now,
when none of this is fresh.

## Where everything lives

| Piece | Provider | Identifier |
|---|---|---|
| Frontend | Vercel | `work-scribe.vercel.app` |
| API | Render (Docker, Singapore) | `workscribe-api.onrender.com` |
| Database | Neon (Postgres 17, Singapore) | project `Workscribe` |
| Redis | Upstash (Singapore) | `settling-dolphin-84181` |
| Email | Brevo | account `ayushishahi14072004@gmail.com` |
| Google sign-in | Google Cloud | project `inbound-hawk-439105-p1` |

---

# STEP 0 — Always start here

```bash
curl https://workscribe-api.onrender.com/health/ready
```

Give it up to 60 seconds; a sleeping free-tier service has to boot first.

| Response | Meaning | Go to |
|---|---|---|
| `{"status":"ready", ...}` | Backend and both dependencies are fine — the problem is in the frontend | **§A** |
| `"database":{"ok":false}` | Database unreachable | **§B** |
| `"redis":{"ok":false}` | Redis unreachable | **§C** |
| Nothing / connection refused | The API service itself is down | **§D** |

Do not skip this. It replaces guessing, and it tells you which of the five
services is actually at fault.

## About "CORS" errors

**A CORS error in the browser console is almost never a CORS problem.** When
the API returns a 500, the browser reports the missing header rather than the
real error. Run Step 0 first. Only if the API is healthy *and* you still get a
CORS error is it genuinely CORS — see §G.

---

# §A — API is healthy, but the site misbehaves

### A1. Sidebar renders, but the page area says "This page ran into a problem"

**Hard refresh: `Ctrl+Shift+R`.**

Cause: page components are code-split, and each deploy produces new hashed
filenames. A tab holding the old `index.html` requests a chunk that no longer
exists.

This now self-heals (the app reloads once automatically) and missing chunks
return a real 404 instead of HTML. If it still happens, open DevTools →
Console and read the `[ErrorBoundary]` line — the real error is logged there
and under "Technical details" on the page itself.

### A2. Blank page or stale-looking UI

Hard refresh. Then check Vercel → Deployments: is the newest one **Ready**, or
did the build fail?

### A3. Changed an environment variable in Vercel and nothing happened

Vite bakes `VITE_*` values in **at build time**. Saving the variable is not
enough — you must **redeploy** Vercel.

---

# §B — Database is unreachable

Neon suspends compute when idle and **wakes automatically**, so first just
retry once after ~30 seconds.

If it stays down, the project was deleted:

1. Create a new project at **neon.com** — Postgres **17**, region Singapore,
   **Neon Auth OFF**.
2. Copy the **Direct connection** string (no `-pooler` in the hostname).
3. Rewrite it — all three edits are required:
   - `postgresql://` → `postgresql+asyncpg://`
   - delete `?sslmode=require`
   - delete `&channel_binding=require`
   - append `?ssl=require`

   Final shape:
   ```
   postgresql+asyncpg://USER:PASS@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?ssl=require
   ```
   `sslmode` and `channel_binding` are libpq options. asyncpg rejects both, and
   leaving either in place crashes the app on boot.
4. Render → Environment → set `DATABASE_URL` → save (this redeploys).
5. Migrations run automatically on boot via the pre-deploy command. Confirm
   Render → Settings → **Pre-Deploy Command** is `alembic upgrade head`.
6. The new database is **empty** — repopulate it (see §F).

> If you ever point `DATABASE_URL` at a transaction-mode pooler (Supabase port
> 6543, PgBouncer), you must also set `DB_USE_PGBOUNCER=true`, or you get
> random `InvalidSQLStatementName` errors under load. Neon's direct endpoint
> does not need it.

---

# §C — Redis is unreachable

**The site still works without Redis.** Login, refresh and normal use all
continue; you lose rate limiting, server-side logout, and refresh-token
revocation. Fix it, but do not panic.

1. Create a database at **console.upstash.com** (regional, Singapore).
2. Copy the **TCP** connection URL. It must start with **`rediss://`** — two
   s's. Upstash shows `redis-cli --tls -u redis://...`; that `--tls` flag only
   applies to `redis-cli`. Your app derives TLS from the scheme alone, so
   `redis://` will be refused.
3. Render → Environment → set `REDIS_URL` → save.

---

# §D — The API itself is down

1. Render dashboard → `workscribe-api`. Is it **suspended**, **failed**, or
   mid-deploy?
2. Read the deploy logs. Startup now prints exactly what is wrong:
   ```
   Database connection OK
   Redis UNREACHABLE at startup: ...
   BREVO_API_KEY is not set — ... emails will NOT be delivered
   ```
3. Free instances sleep after ~15 minutes idle. The first request then takes
   30–60s. That is not an outage — see §H.
4. If a deploy failed, check whether `requirements.txt` or the Dockerfile
   changed. Manual Deploy → **Deploy latest commit** to retry.

---

# §E — Emails are not arriving

Password reset always reports success (to prevent account enumeration), so
email failure is invisible in the UI. **Check the Render logs** — a failed send
now logs `EMAIL NOT SENT` with Brevo's own response text.

Three separate things must all be true:

1. **IP allowlist off.** app.brevo.com/security/authorised_ips → the
   `API keys` row must read **Deactivated**. If it is Activated, Brevo blocks
   calls from Render's IPs and you get
   `unrecognised IP address`. This is the most common cause.
2. **Key valid.** app.brevo.com/settings/keys/api → regenerate, then update
   `BREVO_API_KEY` in Render.
3. **Sender verified.** app.brevo.com/senders/list must contain the address in
   `EMAIL_FROM` (default `workscribe.noreply@gmail.com`). Brevo rejects sends
   from unverified senders even with a perfect key.

Free tier is 300 emails/day.

---

# §F — Data is gone / need demo data

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://...?ssl=require" \
  python ../seeds/seed_portfolio_demo.py
```

Rebuilds 3 accounts, 3 orgs, 4 projects, 4 sprints, 44 tasks, 12 wiki pages.
Safe to re-run — it wipes and recreates only those demo orgs and users, and
keeps `project_task_counters` in sync so new tasks created through the UI do
not collide with seeded numbers.

---

# §G — Genuine CORS errors

Only after Step 0 shows the API is healthy.

- `CORS_ORIGINS` must match the browser origin **exactly**, with **no trailing
  slash**: `https://work-scribe.vercel.app`
- It accepts a single origin, a comma-separated list, or a JSON array.
- If you moved to a custom domain, add it here **and** to Google's authorised
  JavaScript origins (§I).

---

# §H — First load takes ~50 seconds

Normal for Render's free tier: the container sleeps after ~15 minutes idle and
must boot. The frontend timeout is 60s specifically to survive this.

To avoid it before a demo, hit the site once a few minutes beforehand. To avoid
it permanently, point an uptime monitor (UptimeRobot, Better Stack,
cron-job.org) at:

```
https://workscribe-api.onrender.com/health
```

every 10 minutes. Use `/health`, **not** `/health/ready` — otherwise a Redis
blip will page you at 3am.

---

# §I — Google sign-in fails

console.cloud.google.com → project `inbound-hawk-439105-p1` → APIs & Services →
Credentials → OAuth client **WorkScribe** → **Authorised JavaScript origins**
must contain:

```
https://work-scribe.vercel.app
http://localhost:5173
```

Origins only — scheme and host, no trailing slash, no path. The "Authorised
redirect URIs" section is irrelevant: this app uses the ID-token flow, so
`GOOGLE_REDIRECT_URI` is unused. Email/password login is unaffected either way.

---

# Environment variables

**Render** (backend):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | must be `postgresql+asyncpg://` and end `?ssl=require` |
| `REDIS_URL` | must be `rediss://` |
| `JWT_SECRET_KEY` | min 32 chars. Changing it signs everyone out |
| `CORS_ORIGINS` | exact origin, no trailing slash |
| `FRONTEND_URL` | used in invite and password-reset links |
| `BREVO_API_KEY` | without it, emails are skipped and logged |
| `EMAIL_FROM` | must be verified in Brevo |
| `DEBUG` | `false` in production — `true` leaks stack traces |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | keep at 5/5 |
| `DB_USE_PGBOUNCER` | `true` only behind a transaction pooler |

**Vercel** (frontend): `VITE_API_URL` =
`https://workscribe-api.onrender.com/api/v1` — requires a **redeploy** to take
effect.

---

# Local development

```bash
cd backend
docker compose up -d
docker compose exec api alembic upgrade head
curl http://localhost:8001/health/ready

cd ../frontend
npm install && npm run dev        # :5173
```

Integration tests target the compose network hostname, so run them inside the
container:

```bash
docker compose exec api pytest tests/ -q
```

---

# Yearly maintenance

Free tiers rot. Once or twice a year:

- Log into Neon, Upstash, Render, Brevo and Vercel so nothing is reaped for
  inactivity.
- Confirm `curl .../health/ready` returns `ready`.
- Rotate `JWT_SECRET_KEY` and the Brevo key if they have ever been shared.
