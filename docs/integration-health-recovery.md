# Integration Health & Recovery

Integration Health & Recovery records sanitized health checks, incidents, recovery attempts, and client reconnect prompts for external services.

## How Checks Run

- Celery beat runs `integrations.health_check` every 15 minutes.
- The job validates required platform config, checks background job backlog/failures, and checks active tenant Google Business Profile connection state.
- Admins can also view the data in `/admin/integration-health`.

## Incidents

- Repeated failures for the same tenant, integration, module, and category update the existing open incident instead of creating alert spam.
- Recovery attempts are appended to the incident timeline.
- Incidents are marked `recovered` only when a successful health check or integration operation calls `mark_integration_recovered`.

## Google Reconnect

- Expired Google access tokens are refreshed once using the stored refresh token.
- If refresh succeeds, tokens are updated securely, recovery is logged, prompts are resolved, and paused GBP automation can resume.
- If refresh fails or the connection is revoked, affected GBP automation is paused, an admin incident is opened, and the client sees a reconnect banner.
- The client CTA starts the existing Google OAuth flow used during onboarding.

## Failure Ownership

- Self-healed: expired Google access token with valid refresh token, transient provider failures with retry windows.
- Client action: Google/GBP revoked auth or token refresh failure.
- Admin action: missing/invalid secrets, webhook signing failures, Stripe/Twilio/OpenAI platform credential failures.

## Security

- `safe_details` must only contain sanitized details.
- Tokens, API keys, refresh tokens, auth headers, webhook signatures, and service role keys are redacted by `sanitize_error`.
- Admin-only incident tables are service-role/backend only. Client users can read only their tenant prompts and client-safe health statuses.

## Local Testing

Run focused backend tests:

```bash
.venv/bin/python -m pytest tests/test_integration_health.py
```

Run broader checks:

```bash
.venv/bin/python -m pytest
cd frontend-admin && npm run type-check && npm run build
cd ../frontend-client && npm run type-check && npm run test && npm run build
```
