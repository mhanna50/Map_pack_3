# Map Pack 3

Automation platform for agencies that need to manage and grow multiple Google Business Profiles (GBP) from one dashboard. The goal is to combine AI-assisted content, automated workflows, and human-in-the-loop approvals so local businesses keep ranking without manual busywork.

---

## Product Pillars

1. **Automated Google Business Profile Posting**  
   - Scheduled offers, updates, announcements  
   - AI-generated captions tuned for local SEO  
   - Rotates services, locations, and keywords

2. **Automated Review Replies**  
   - Detects new reviews in real time  
   - Generates context-aware replies  
   - Auto-posts positive responses  
   - Flags negative reviews for approval + dashboard notification

3. **Automated Q&A Creation**  
   - Generates common customer questions  
   - Posts optimized answers to boost conversions  
   - Improves keyword relevance

4. **Review Request Automation**  
   - Sends SMS/email requests after jobs  
   - Dashboard lets clients monitor + approve responses to bad reviews  
   - Notifies clients when new negative reviews arrive, when photos are needed, or when rankings shift  
   - Follows up automatically until a review is left

5. **Local Rank & Visibility Tracking**  
   - Tracks keyword rankings in Google Maps  
   - Detects rank increases/drops  
   - Monitors competitor visibility trends

6. **Service & Attribute Optimization**  
   - Automatically adds missing GBP services  
   - Updates attributes based on category + competitor data  
   - Keeps listings complete and optimized

7. **Photo & Media Management**  
   - Requests photos from the business through client dashboards  
   - Clients drag & drop images; we store them and schedule strategic posts (fallback to normal cadence if empty)  
   - Auto-generates captions and posting schedules

8. **Competitor Monitoring**  
   - Tracks competitor review volume  
   - Compares posting frequency  
   - Surfaces content gaps to exploit

9. **Automation Rules Engine**  
   - “If X happens, do Y” workflow builder (e.g., if no posts in 7 days → publish one)  
   - Triggers based on rankings, reviews, or inactivity

10. **Approval & Safety Controls**  
    - Manual approval for sensitive actions (negative review replies, questionable content)  
    - Auto-approval for safe templates  
    - Full action history with rollback

11. **Performance Dashboard**  
    - Rankings, review velocity, post engagement, visibility scores  
    - Surfaces insights + alerts for agency operators and clients

12. **Multi-Client / Multi-Location Support**  
    - One dashboard per agency with tenant isolation  
    - Role-based access for internal teams and client stakeholders  
    - Scales from single shops to large networks

13. **Setup & Onboarding Automation**  
    - Guided intake wizard  
    - Brand voice + tone configuration  
    - Auto-configured posting schedules and starter automations

---

## Architecture Snapshot

- **Frontend**: Next.js app (WIP) for dashboards, approvals, and client uploads.  
- **Backend**: FastAPI service (`backend/`) exposing REST endpoints, backed by Postgres + SQLAlchemy models for orgs/locations/memberships/actions/audits/posts/media assets.  
- **Worker**: Celery worker (`worker/`) for async automations, integrated with Redis broker/result backend and running a cron-style dispatcher for scheduled jobs + GBP publish actions.  
- **Infra**: Docker Compose for Redis today; Postgres can run locally (brew/Docker/Supabase).  
- **Shared Tooling**: Repo-level `.venv` houses both backend and worker dependencies so IDEs resolve FastAPI, Celery, dotenv, etc. without juggling multiple interpreters.

---

## Local Development

### Prerequisites

- Python 3.11+ (repo was bootstrapped with 3.13)  
- Docker (for Redis and future services)

### Setup

1. Copy `.env.example` → `.env` and fill in provider keys. At minimum you need `DATABASE_URL`, `REDIS_URL`, `CELERY_*`, `ENCRYPTION_KEY` (generate via `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`), and Google OAuth credentials before auth/token storage will work.  
2. Start the full local stack (marketing + client + admin frontends, backend API, worker, scheduler, Postgres, Redis):
   ```bash
   docker compose -f infra/docker-compose.yml up --build
   ```
   By default Docker uses the local Postgres container. To point at Supabase instead, set `DATABASE_URL` in your shell before running the compose command.
   Local URLs:
   - Marketing site: `http://localhost:3001`
   - Client dashboard: `http://localhost:3000/app`
   - Admin dashboard: `http://localhost:3002`
3. Install dependencies into the shared virtualenv:
   ```bash
   ./scripts/bootstrap.sh
   source .venv/bin/activate          # PowerShell: .\.venv\Scripts\Activate.ps1
   ```
   The VS Code workspace already points to `.venv`, so once it exists import errors disappear.
4. (First run) create the Postgres schema after your DB is reachable:
   ```bash
   python -m backend.app.db.create_db
   ```

### Run migrations

Schema changes ship as lightweight scripts under `backend/app/db/migrations`. Run the latest ones after pulling:

```bash
python -m backend.app.db.migrations.0004_competitors
python -m backend.app.db.migrations.0005_automation_rules
python -m backend.app.db.migrations.0006_approval_requests
python -m backend.app.db.migrations.0007_dashboard_and_plan
# or run them sequentially
python scripts/run_migrations.py
```

### Run Services (manual, optional)

If you prefer to run services outside Docker, you can still use the commands below:

```bash
# Backend API
uvicorn backend.app.main:app --reload --port 8000

# Celery worker (separate terminal)
celery -A worker.app worker --loglevel=info

# Scheduler (Celery beat) (third terminal)
celery -A scheduler.app:app beat --loglevel=info
```

Frontend commands (e.g., `npm install`, `npm run dev`) can run with the Python virtualenv still active; they’re isolated.
Frontend directories:
- `frontend/` (client dashboard)
- `frontend-marketing/` (marketing site)
- `frontend-admin/` (admin dashboard)

Plan tiers and usage limits can be updated via:

```bash
python scripts/set_plan_tier.py <organization_id> pro 60 10
```

---

## Stripe Billing + Automatic Login Email

When a client completes a Stripe Checkout payment, the backend provisions their org + membership and emails a dashboard access message (login URL + onboarding link). This flow is handled by `/api/billing/webhook`.

### 1) Stripe setup

1. Create a Product + Price in Stripe and copy the price ID.
2. Set these environment variables (see `.env.example`):
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID` (or per-plan: `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_AGENCY`)
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_SUCCESS_URL`
   - `STRIPE_CANCEL_URL`
3. Create a webhook endpoint in Stripe that points to:
   - `https://<your-backend-domain>/api/billing/webhook`
4. Subscribe the webhook to:
   - `checkout.session.completed`
   - `invoice.paid` (if you later add subscriptions)

Local testing tip (optional): use the Stripe CLI to forward webhooks to your local API.

### 2) Supabase Auth email

Onboarding emails are sent through Supabase Auth invites. Set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

Make sure your Supabase Auth settings allow redirects to your `CLIENT_APP_URL` onboarding link.

### 3) Client app URL

Set `CLIENT_APP_URL` so the onboarding + sign-in links in the email point to your client dashboard (e.g., `https://app.yourdomain.com`).
Set `NEXT_PUBLIC_CLIENT_APP_URL` for the admin UI so dashboard links point to the client app.

---

## Supabase Auth (Client + Admin Login)

This repo now uses Supabase Auth for login (email + password). Configure Supabase and then set the env vars in `.env.example`.

### 1) Supabase project
1. Create a Supabase project.
2. Enable Email/Password auth in the Supabase Auth settings.
3. Add your frontend URL to allowed redirect URLs (for password resets).

### 2) Environment variables
Set these in `.env`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`

### 3) Admin access
Your admin user needs `is_staff=true` in the backend `users` table. After signing up, run:

```bash
python scripts/set_staff_user.py you@yourdomain.com true
```

---

## Phase 1 – Platform Foundation

Core primitives (multi-tenant orgs/locations, action queue, Google OAuth, audit logging) are complete so every new automation builds on the same infrastructure.

## Phase 2 – Automated GBP Posting

- **Post + media models**  
  `posts`, `post_variants`, `media_assets`, `post_media_attachments`, and `post_rotation_memory` tables capture the scheduler, AI variants, and media usage history.
- **Posting API & services**  
  `/api/posts` lets you create/schedule posts, view variants, and attach media. `PostService` handles caption generation stubs, rotation, auto media selection, and queues publish actions.
- **AI caption scaffolding**  
  `CaptionGenerator` produces 3–5 variants per request using brand voice, services, keywords, and city rotation data with lightweight compliance checks.
- **Rotation engine**  
  Per-location cooldown memory ensures services/keywords/cities rotate before repeating.
- **Media selection**  
  `MediaSelector` surfaces the freshest asset per location/theme and tracks `last_used_at` so the same image doesn’t repeat too quickly.
- **Worker integration**  
  Celery publish actions now transition posts through `QUEUED → PUBLISHED` (stubbed provider call) while still logging via the action/audit pipeline.

## Phase 3 – Automated Review Replies + Requests

- **Review ingestion & replies**  
  Reviews capture sentiment/topics/urgency, auto reply to positive ratings, and queue approval workflows for negative feedback.
- **Review request automation**  
  Contacts, jobs, and review_requests tables drive SMS/email campaigns with reminder caps and link tracking, all dispatched via the action queue.
- **Client inbox prep**  
  Review statuses (new, auto_replied, needs_approval, flagged) plus reply metadata lay the foundation for SLA timers, tagging, and notes in the dashboard.

## Phase 4 – Automated Q&A Creation

- **Q&A generator**  
  Category-based template library inserts services, cities, and competitor cues to keep questions natural and locally relevant.
- **Schedule + dedupe**  
  `qna_entries` tracks question/answer lifecycle with quarterly refresh checks and duplicates prevented per location.
- **Worker publishing**  
  New `publish_qna` actions reuse the Celery pipeline so Q&A posts rotate alongside standard GBP content.

## Phase 5 – Local Rank & Visibility Tracking

- **Keyword + geo grid system**  
  `location_keywords` store per-location keywords with importance weights, while `geo_grid_points` define the surrounding service area grid for checks.
- **Rank collection**  
  Scheduled `check_rankings` actions capture `rank_snapshots` per keyword/grid point with pack presence and competitor notes.
- **Visibility scoring & alerts**  
  `visibility_scores` aggregate weighted rank trends, ready for charting and alerting when ranks drop or improve beyond thresholds.

## Phase 6 – Service & Attribute Optimization

- **Listing audit**  
  `listing_audits` capture GBP completeness (services, attributes, description, photos) and compare against templates per category/competitor benchmarks.
- **Safe auto-apply + pending changes**  
  `service_templates` and `attribute_templates` flag safe optimizations that can auto-apply, while risky updates become `pending_changes` awaiting approval.
- **API + workflow**  
  `/api/optimization/audit` runs audits, auto-applies safe fixes, and queues approvals—ready for a UI “pending change” inbox with rollbacks.

## Phase 7 – Photo & Media Management

- **Client upload portal scaffolding**  
  Media albums accept drag/drop uploads with job-type, season, and before/after tagging. Auto-generated captions keep reviews human-friendly until a manager approves the asset.
- **Request tracking + reminders**  
  Each location is monitored for stale libraries. If no uploads land within the configured window (default 14 days), a `REQUEST_MEDIA_UPLOAD` action fires and timestamps the notification.
- **Approval + audit loop**  
  Uploads tied to a request automatically close it once approved, so operators know which requests are satisfied and which still need client attention.
- **Rotation guardrails**  
  The media selector tracks `last_used_at` and enforces freshness windows so GBP posts rotate through assets without repeating the same image too frequently.

## Phase 8 – Competitor Monitoring

- **Location-level competitor sets**  
  Operators can add manual rivals or auto-discover the top local competitors, keeping the roster between 3–10 businesses per location.
- **Monitoring loops & metrics**  
  Scheduled jobs capture review volume, rating trends, posting cadence, and photo freshness for every tracked competitor, storing snapshots for historical comparisons.
- **Gap detection**  
  Each snapshot flags actionable gaps (offers, reviews, posts, media) so the dashboard can highlight where the client is falling behind competitors.
- **API + automation**  
  `/api/competitors/...` endpoints manage competitor lists, discovery, monitoring schedules, and expose snapshot data while the Celery worker runs `monitor_competitors` actions in the background.

## Phase 9 – Automation Rules Engine

- **Rule builder**  
  `/api/automation/rules` accepts “If X → do Y” definitions for inactivity, rank drops, negative reviews, missing services, or stale media, with per-location scopes, priorities, and weights to resolve conflicts.
- **Simulation + dry runs**  
  A `simulate` endpoint previews how many actions would have triggered across the last N days before activating a rule.
- **Automated execution**  
  Celery now handles `RUN_AUTOMATION_RULES` actions, evaluating enabled rules and scheduling downstream GBP posts, review requests, or media upload prompts through the existing action queue. Add a Celery beat entry (or any cron job) that periodically calls the `/api/automation/rules/run` endpoint or enqueues the action so rules fire automatically.

## Phase 10 – Approval & Safety Controls

- **Approval queue**  
  `approval_requests` store pending review replies, risky GBP edits, or AI-generated content that needs a human. `/api/approvals` lets operators list, approve, reject, or roll back with reasons and a full audit trail.
- **Rollback metadata**  
  Requests can capture a `before_state` so approved/rejected actions have the context needed to revert. The rollback endpoint marks the request as `rolled_back` and surfaces the stored state/instructions so teams can undo changes quickly.

## Phase 11 – Performance Dashboard & Multi-Client Scaling

- **Dashboard KPI layer**  
  `DashboardService` aggregates posts frequency/engagement, review velocity + reply time, and visibility scores + rank trends. `/api/dashboard/overview` powers the UI and records `dashboard_snapshots` for historical comparisons.
- **Tasks requiring attention**  
  Pending approvals, stale media, and near-term actions are surfaced as “Attention” items so operators can clear the queue before metrics slip.
- **Multi-client / role-aware views**  
  Users only see organizations they’re members of, can jump between locations quickly, and every overview call returns plan tier, usage vs. limits, and available orgs/locations for fast switching—laying the groundwork for billing entitlements.
- **Automation scheduler**  
  Celery beat runs `actions.schedule_automation_rules` every 15 minutes to enqueue `RUN_AUTOMATION_RULES` actions so the rules engine fires automatically without manual intervention.
- **Plan & usage tooling**  
  Organizations can be assigned tiers/limits via `python scripts/set_plan_tier.py <org_id> <plan> [posts_per_month] [locations]`, keeping dashboards and enforcement logic in sync with billing entitlements.

---

## Roadmap

- Wire the posting/Q&A executors to the live Google Business Profile APIs and surface publish results in the UI.  
- Build the automation rules engine + approval workflows (human-in-the-loop for high-risk posts + review approvals).  
- Ship dashboards for calendar/list views, media library management, and review/Q&A inboxes.  
- Harden multi-tenant auth/authorization for agencies vs. clients.  
- Expand integration tests covering backend + worker automation scenarios.
