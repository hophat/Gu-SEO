-- 006: custom-domain approval queue.
--
-- Saving a domain used to go live immediately (and before that, to only
-- touch D1 without ever attaching on Cloudflare). New flow: a tenant's
-- save creates a PENDING request, a super_admin approves it on the Duyệt
-- domain page, and only the approval attaches the hostname on Cloudflare
-- and flips the live `custom_domain`.
--
-- `custom_domain` stays the live value routing reads; pending values never
-- affect serving. `custom_domain_status` is pending | live | rejected, NULL
-- when the project never requested.

ALTER TABLE projects ADD COLUMN pending_custom_domain TEXT;
ALTER TABLE projects ADD COLUMN custom_domain_status TEXT;
ALTER TABLE projects ADD COLUMN pending_requested_at INTEGER;
