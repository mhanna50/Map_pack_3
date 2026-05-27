# Admin Monitoring Dashboard

The admin monitoring layer uses service-role-only Next route handlers under `/api/admin/monitoring/*`. Every handler calls `requireAdminUser()` before querying cross-tenant data.

## Reusable Pattern

Core helpers live in `frontend-admin/src/features/admin/adminDb.ts`:

- `getAdminOverviewStats(filters)`
- `getAdminModuleHealth(filters)`
- `getAdminClientStats(tenantId, filters)`
- `getAdminLeadRecoveryStats(filters)`
- `getAdminModuleStats(moduleId, filters)`
- `getAdminClientNotes(tenantId)`

Reusable UI components live in `frontend-admin/src/features/admin/components/monitoring`.

## Filters

Monitoring endpoints accept:

- `tenant_id` or `tenant_ids`
- `range`: `today`, `7d`, `30d`, `90d`
- `from` / `to`
- `module`
- `status`
- `q`

All pages default to all clients and 30 days.

## Impersonation

Admin impersonation endpoints are still guarded by `ALLOW_ADMIN_IMPERSONATION=true`. Start, stop, and deep-link actions write to `admin_impersonation_audit` when the table is present.

Deep links record the target client tab and return the client dashboard path. The admin UI opens that path using `NEXT_PUBLIC_CLIENT_APP_URL` or `http://localhost:3000`.

## Activity Model

The durable v1 activity tables are:

- `client_activity_events`
- `admin_client_notes`
- `admin_impersonation_audit`

Existing module data is read through adapters first. New module events can be written to `client_activity_events` over time without changing the dashboard shape.
