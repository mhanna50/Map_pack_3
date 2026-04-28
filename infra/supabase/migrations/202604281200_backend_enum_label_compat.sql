-- Add backend-used enum labels missing from older Supabase schemas.

alter type public.action_type add value if not exists 'run_keyword_campaign';
alter type public.action_type add value if not exists 'run_keyword_followup_scan';

alter type public.post_job_status add value if not exists 'running';
alter type public.post_job_status add value if not exists 'skipped';
alter type public.post_job_status add value if not exists 'succeeded';
alter type public.post_job_status add value if not exists 'rate_limited';
alter type public.post_job_status add value if not exists 'needs_client_input';
