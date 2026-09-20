-- 009: website promo videos + source tracking.
--
-- kind='website' jobs render a promo from a live URL: the agent
-- screenshots the site's pages and scrapes its text as storyboard
-- material. `source_url` records the URL the job was created from
-- (blog_post_id carries a 'url:<id>' sentinel for the UNIQUE index).
ALTER TABLE video_jobs ADD COLUMN source_url TEXT;
