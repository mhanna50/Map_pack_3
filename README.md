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
- **Backend**: FastAPI service (`backend/`) exposing REST endpoints, pydantic-settings for configuration, Postgres planned for persistence.  
- **Worker**: Celery worker (`worker/`) for async automations, integrated with Redis broker/result backend.  
- **Infra**: Docker Compose for Redis today; extends to Postgres/other services later.  
- **Shared Tooling**: Repo-level `.venv` houses both backend and worker dependencies so IDEs resolve FastAPI, Celery, dotenv, etc. without juggling multiple interpreters.

---

## Local Development

### Prerequisites

- Python 3.11+ (repo was bootstrapped with 3.13)  
- Docker (for Redis and future services)

### Setup

1. Copy `.env.example` → `.env` and fill in provider keys.  
2. Start Redis:
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
3. Install dependencies into the shared virtualenv:
   ```bash
   ./scripts/bootstrap.sh
   source .venv/bin/activate          # PowerShell: .\.venv\Scripts\Activate.ps1
   ```
   The VS Code workspace already points to `.venv`, so once it exists import errors disappear.

### Run Services

```bash
# Backend API
cd backend
uvicorn app.main:app --reload --port 8000

# Celery worker (separate terminal)
cd worker
celery -A app.tasks worker --loglevel=info
```

Frontend commands (e.g., `npm install`, `npm run dev`) can run with the Python virtualenv still active; they’re isolated.

---

## Roadmap

- Connect to Google My Business, Twilio, and SendGrid/Postmark APIs.  
- Build the automation rules engine + approval workflows.  
- Ship dashboards for rank tracking, competitor monitoring, and media management.  
- Harden multi-tenant auth/authorization for agencies vs. clients.  
- Expand integration tests covering backend + worker automation scenarios.
