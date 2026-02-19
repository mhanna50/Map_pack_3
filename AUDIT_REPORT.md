# GBP Automation Audit (2026-02-17)

Status legend: **PASS** = meets requirement, **PARTIAL** = present but incomplete, **FAIL** = missing.

## A) Purpose & Feature Set
- **PARTIAL** – Auto posts, reviews, Q&A flows exist via `backend/app/services/posts.py`, `reviews.py`, `qna.py`; rotation/cadence logic via `post_candidates.py`, `scheduling.py`. Seasonal hints present. Client uploads supported via `media_management.py` and new `client_uploads` table. Seasonal update cadence still basic.

## B) Architecture Separation (Planner / Selector / Executor)
- **PARTIAL** – Planner pipeline (`services/content_planner.py`) builds rolling plans; selector via `post_composition.py` plus semantic dedupe; executor via Celery actions + `post_jobs.py` + `gbp_publishing.py`. Interface boundaries exist but selector constraints could expand.

## C) Job Schedulers & Workers
- **PASS** – Celery beat/worker (`worker/app/celery_app.py`, `worker/app/tasks.py`) dispatches actions, automation rules, content planning, connection health. Post jobs execute via `ActionType.EXECUTE_POST_JOB` with idempotent dedupe keys, needs-client-input + rate-limited states, and backoff handled in `ActionService`/`post_jobs.py`.

## D) Content System
- **PARTIAL** – Content pools via `PostCandidate`, `ContentTemplate`, `ContentItem`, `ContentPlan`. Lifecycle enums present. Semantic dedupe via fingerprints + similarity checks; business-hour aware scheduling added. Topic-level cooldowns still coarse; content_mix weights partially enforced; needs per-topic richness.

## E) Smart Photo Request Logic
- **PARTIAL** – `PhotoRequest` + `PhotoRequestService` trigger on stale media (configurable cadence); `post_jobs.py` marks jobs `needs_client_input` and raises alerts when photos are required. Still lacks last-posted-photo heuristic.

## F) Rate Limit & Quota Governor
- **PASS** – `RateLimitState` + `RateLimitService` enforce per-org/location quotas; surfaced via alerts and observability metrics; proactive cooldowns added.

## G) Per-Tenant & Per-Location Settings
- **PASS** – Hierarchical settings via `OrgSettings` + `LocationSettings.settings_json` merged in `services/settings.py`; supports tone_of_voice, content_mix, business_hours, cooldowns, banned_phrases, CTA style, photo cadence; applied in composition, captioning, scheduling, and safety checks.

## H) Content Generation Safety
- **PARTIAL** – Caption generator bans profanity/banned phrases; fingerprints stored on candidates/posts; similarity checks before composition. Still no external LLM guardrails or embedding-based semantic dedupe.

## I) Data Model & Security
- **PARTIAL** – Multi-tenant keys on core tables. Added tables: `content_items`, `content_plans`, `post_jobs`, `post_attempts`, `rate_limit_state`, `client_uploads`, `photo_requests` (migration `0010_gbp_autonomy_core.py`) plus hierarchical settings/fingerprints (migration `0011_hier_settings_and_dedupe.py`). RLS still not enforced.

## J) Observability & Operations
- **PASS** – Observability now reports rate-limit scopes, post-job states, and existing job/publish metrics. Connection-health cron schedules token refresh; alerts fire on token failures, disconnections, rate limits, and photo needs.

## K) Dry Run & Shadow Mode
- **PARTIAL** – Config flags `DRY_RUN_MODE`, `SHADOW_MODE`; `GbpPublishingService` skips external calls when enabled and logs audit. Shadow mode does not yet stream full audit for selector decisions.

## L) Deliverables
- Migrations: `backend/app/db/migrations/0010_gbp_autonomy_core.py`, `0011_hier_settings_and_dedupe.py`.
- Planner/selector/executor modules: `services/content_planner.py`, `post_jobs.py`, `photo_requests.py`, `rate_limits.py`, updated `actions.py`, Celery beat tasks `plan_content`, `connection_health`.
- Settings inheritance: `models/org_settings.py`, `services/settings.py`.
- Safety/dedupe: fingerprints on posts/candidates; profanity/banned-phrase filter in `captions.py`; similarity guard in `post_composition.py`; business-hour scheduling in `post_scheduler.py`.
- Tests added: `tests/test_rate_limits.py`, `tests/test_post_jobs.py` (deps currently not installed; pytest not run).

## Gaps / Next Steps
- Enforce content_mix weights and per-topic cooldowns in selector; add embedding-based semantic dedupe.
- Add RLS/tenant isolation at DB level and surface new settings/alerts in dashboards.
- Improve business-hours handling per weekday and seasonality; extend dry-run/shadow audit surfaces.
- Add automated tests for settings merge, profanity filter, business-hour scheduling, and connection-health actions once dependencies installed.
