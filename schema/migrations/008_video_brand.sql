-- 008: AI Video Post — brand kit columns + business video jobs.
--
-- The video agent composes every clip from a per-project brand kit
-- (the frame.md idea): accent colour, tagline, address, phone. Brand
-- DNA (project_brands) supplies tone/audience/themes; these columns
-- carry the physical brand tokens the composition template renders.
--
-- video_jobs.kind: 'post' (per blog post, the existing flow) or
-- 'business' (one promo video per project, no blog post behind it —
-- blog_post_id carries a 'project:<id>' sentinel so the UNIQUE index
-- still holds without a table rebuild).
ALTER TABLE projects ADD COLUMN video_tagline TEXT;
ALTER TABLE projects ADD COLUMN brand_accent TEXT;
ALTER TABLE projects ADD COLUMN address TEXT;
ALTER TABLE projects ADD COLUMN phone TEXT;
ALTER TABLE video_jobs ADD COLUMN kind TEXT NOT NULL DEFAULT 'post';  -- post | business
