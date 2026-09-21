// Single owner of the video_jobs reference + carousel-slide policy.
//
// The queue stores one row per video job. `blog_post_id` is normally a real
// blog_posts.id, but non-post jobs satisfy the UNIQUE(blog_post_id) index with
// a sentinel ref ("carousel:<post_id>", "project:<id>", "url:<id>"). A carousel
// stores its slides under a "carousel/<slug>" prefix as "<prefix>-<n>.png".
//
// Both conventions used to be re-encoded in every reader (claim, list, delete,
// social_queue, facebook, carousel-deliver). They live here now so a change to
// either convention lands in one place.

export const CAROUSEL_KIND = 'carousel';
export const CAROUSEL_REF_PREFIX = 'carousel:';
export const CAROUSEL_KEY_PREFIX = 'carousel/';
export const CAROUSEL_SLIDE_COUNT = 5;

// A per-post video kind that is not the post's own job: the article video
// already holds UNIQUE(blog_post_id), so each extra kind satisfies it with
// its own sentinel. Adding a kind means adding its prefix here and nothing
// else — the three ref helpers below all read this list.
export const EXPLAINER_KIND = 'explainer';
export const EXPLAINER_REF_PREFIX = 'explainer:';

// Sentinels that still point at a blog post (as opposed to project:/url:,
// which have no post behind them). Order matters only for readability.
export const POST_BACKED_PREFIXES = [CAROUSEL_REF_PREFIX, EXPLAINER_REF_PREFIX];

// ── refs (video_jobs.blog_post_id) ────────────────────────────────────

export function carouselRef(postId) {
  return `${CAROUSEL_REF_PREFIX}${postId}`;
}

export function isCarouselRef(ref) {
  return typeof ref === 'string' && ref.startsWith(CAROUSEL_REF_PREFIX);
}

export function explainerRef(postId) {
  return `${EXPLAINER_REF_PREFIX}${postId}`;
}

// The blog post a ref points at, or null when the ref is not post-backed
// (the project:/url: sentinels have no post behind them).
export function postIdFromRef(ref) {
  const s = String(ref ?? '');
  for (const p of POST_BACKED_PREFIXES) if (s.startsWith(p)) return s.slice(p.length);
  if (/^(project|url):/.test(s)) return null;
  return s || null;
}

// SQL mirror of postIdFromRef for a column expression, so reader queries
// (list.js, social_queue.js) don't each re-encode the sentinel. Built from
// POST_BACKED_PREFIXES so a new kind cannot be handled in JS and forgotten
// in SQL — that mismatch silently joins to the wrong row.
export function postIdFromRefSql(col) {
  return POST_BACKED_PREFIXES.reduceRight(
    (acc, p) => `CASE WHEN ${col} LIKE '${p}%' THEN substr(${col}, ${p.length + 1}) ELSE ${acc} END`,
    col,
  );
}

// SQL: the exact video_jobs ref for a row — the sentinel when it carries one,
// otherwise the post id. Used to pick the right job's video_key.
export function videoJobRefSql(refCol, postCol) {
  return POST_BACKED_PREFIXES.reduceRight(
    (acc, p) => `CASE WHEN ${refCol} LIKE '${p}%' THEN ${refCol} ELSE ${acc} END`,
    postCol,
  );
}

// ── R2 slide keys (video_jobs.video_key) ──────────────────────────────

export function isCarouselKey(key) {
  return typeof key === 'string' && key.startsWith(CAROUSEL_KEY_PREFIX);
}

export function carouselPrefix(slug) {
  return `${CAROUSEL_KEY_PREFIX}${slug}`;
}

export function carouselSlideKey(prefix, n) {
  return `${prefix}-${n}.png`;
}

export function carouselSlideKeys(prefix) {
  return Array.from({ length: CAROUSEL_SLIDE_COUNT }, (_, i) => carouselSlideKey(prefix, i + 1));
}

// Matches only "<prefix>-<n>.png". A bare prefix list would also match a slug
// that is a prefix of this one (carousel/foo-X.png), so callers filter.
export function carouselSlideRegex(prefix) {
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}-\\d+\\.png$`);
}
