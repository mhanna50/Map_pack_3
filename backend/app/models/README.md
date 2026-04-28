# Backend Model Groups

- `automation/`: actions, approval requests, automation rules, and automation settings.
- `billing/`: subscription and billing persistence.
- `content/`: content templates, planning, signals, and content performance.
- `google_business/`: Google Business Profile accounts, locations, audits, settings, and Q&A.
- `identity/`: users, organizations, memberships, invites, and impersonation sessions.
- `media/`: media assets, albums, uploads, and photo requests.
- `operations/`: alerts, audit logs, dashboard snapshots, jobs, and rate limits.
- `posts/`: Google post records, candidates, attempts, variants, metrics, and scheduling stats.
- `rank_tracking/`: competitors, grid scans, rankings, visibility, and keyword campaigns.
- `reviews/`: reviews, replies, contacts, and review requests.

Shared model utilities stay at the package root: `enums.py` and `mixins.py`.
