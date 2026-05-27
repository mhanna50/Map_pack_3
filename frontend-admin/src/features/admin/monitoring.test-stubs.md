# Admin Monitoring Test Stubs

The admin app currently has no frontend test runner. These are the route-level cases to promote into automated tests when a Next route-handler test setup is added:

- Non-admin user cannot access `/api/admin/monitoring/*`.
- Admin can fetch overview stats across tenants.
- Admin can filter stats by one tenant or multiple tenants.
- Admin can view Lead Recovery stats and one lead detail.
- Admin notes are scoped to one tenant.
- Impersonation start, stop, and deep-link calls write audit rows.
- Module health returns a consistent row shape for Lead Recovery, GBP Posting, GBP Audits, Reviews, Citations, Visibility, Images, Q&A, and Website Audits.
- Client monitor returns only admin-visible cross-tenant data through admin-only endpoints.
