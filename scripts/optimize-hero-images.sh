#!/usr/bin/env bash
# Recompress AI-generated hero images in R2 to WebP and repoint
# blog_posts at the new keys. Old objects are left in place so any
# cached HTML keeps working.
#
# The original version of this script matched only `hero_image_key LIKE
# '%.png'`. Every hero actually generated is a `.jpg` (Workers AI returns
# 1024x1024 JPEG), so the tool silently did nothing on real data — it
# found 3 rows out of 255. Both extensions are matched now, and WebP
# input is skipped so a second run is a no-op.
#
# Requirements: wrangler (authenticated), cwebp (brew install webp),
# python3, sips (macOS, only for reporting dimensions). Run from the repo
# root. Reads the bucket + database names from wrangler.toml.
#
# Usage: bash scripts/optimize-hero-images.sh [--dry-run] [quality]
#   --dry-run   download + convert + report the saving, write nothing
#   quality     WebP quality, default 82
#
# Measured on the live bucket at q82: ~8x smaller (2235KB -> 274KB over
# four 1024x1024 heroes). A post page pulls three of these plus a logo,
# so this is the bulk of the page weight.
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=""
QUALITY=82
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="--dry-run" ;;
    *) QUALITY="$arg" ;;
  esac
done

BUCKET=$(awk -F\" '/^bucket_name *=/{print $2; exit}' wrangler.toml)
DB=$(awk -F\" '/^database_name *=/{print $2; exit}' wrangler.toml)
[[ -n "$BUCKET" && -n "$DB" ]] || { echo "could not read bucket/database from wrangler.toml" >&2; exit 1; }
command -v cwebp >/dev/null || { echo "cwebp not found — brew install webp" >&2; exit 1; }

# Same fallback deploy.sh uses: prefer a global wrangler, fall back to npx
# so this runs on a machine that only has the npm package.
WRANGLER="${WRANGLER:-$(command -v wrangler || echo "npx --yes wrangler")}"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "▸ Listing hero images in $DB"
$WRANGLER d1 execute "$DB" --remote --json \
  --command "SELECT id, hero_image_key FROM blog_posts WHERE hero_image_key LIKE '%.jpg' OR hero_image_key LIKE '%.jpeg' OR hero_image_key LIKE '%.png'" \
  > "$WORK/rows.json"

# Project logos are a separate table: projects.logo_url holds an
# '/image/<key>' path, not a bare key. The header logo renders on every
# public page, so one oversized upload is charged on every page view.
echo "▸ Listing project logos in $DB"
$WRANGLER d1 execute "$DB" --remote --json \
  --command "SELECT slug, logo_url FROM projects WHERE logo_url LIKE '/image/%' AND logo_url NOT LIKE '%.webp'" \
  > "$WORK/logos.json"

python3 - "$WORK" "$BUCKET" "$DB" "$QUALITY" "$DRY_RUN" "$WRANGLER" <<'EOF'
import json, subprocess, os, sys
work, bucket, db, q, dry = sys.argv[1:6]
WRANGLER = sys.argv[6].split()
rows = json.load(open(f"{work}/rows.json"))[0]["results"]
logos = json.load(open(f"{work}/logos.json"))[0]["results"]
if dry:
    print(f"{len(rows)} hero images + {len(logos)} project logos — DRY RUN, nothing is written")
else:
    print(f"{len(rows)} hero images + {len(logos)} project logos")

def dimensions(path):
    try:
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                             capture_output=True, text=True).stdout
        w = [l.split(":")[1].strip() for l in out.splitlines() if "pixelWidth" in l]
        h = [l.split(":")[1].strip() for l in out.splitlines() if "pixelHeight" in l]
        return f"{w[0]}x{h[0]}" if w and h else "?"
    except Exception:
        return "?"

SKIP_EXT = {".webp", ".svg", ".gif", ".ico", ".avif"}

def convert(key, tag):
    """Fetch + recompress one R2 object. Returns (src, newkey, in_bytes,
    out_bytes) or None when the object is not worth converting.

    A single unreadable object must not abort a run over hundreds of them,
    so failures are reported and skipped rather than raised. SVG is skipped
    outright: cwebp cannot rasterise it, and a vector logo is already tiny.
    """
    ext = os.path.splitext(key)[1].lower()
    if ext in SKIP_EXT:
        print(f"  {tag} {key}: skipped ({ext} not convertible)")
        return None
    stem = os.path.splitext(key)[0]
    newkey = stem + ".webp"
    src = f"{work}/{tag}{ext}"
    dst = f"{work}/{tag}_out.webp"
    got = subprocess.run(WRANGLER + ["r2", "object", "get", f"{bucket}/{key}", f"--file={src}", "--remote"],
                         capture_output=True, text=True)
    if got.returncode != 0 or not os.path.exists(src):
        print(f"  {tag} {key}: SKIPPED — could not read from R2 ({got.stderr.strip().splitlines()[-1] if got.stderr.strip() else 'not found'})")
        return None
    made = subprocess.run(["cwebp", "-quiet", "-q", str(q), src, "-o", dst], capture_output=True, text=True)
    if made.returncode != 0 or not os.path.exists(dst):
        print(f"  {tag} {key}: SKIPPED — cwebp could not read it ({made.stderr.strip().splitlines()[-1] if made.stderr.strip() else 'unknown'})")
        return None
    return src, newkey, os.path.getsize(src), os.path.getsize(dst)

def publish(src, r2key, table, column, match_col, match_val, value):
    """Store the WebP under its bare R2 key, then repoint the row. The
    stored value and the R2 key are not always the same string: projects
    .logo_url keeps an '/image/' prefix, so they are passed separately."""
    subprocess.run(WRANGLER + ["r2", "object", "put", f"{bucket}/{r2key}", f"--file={src}",
                    "--content-type=image/webp",
                    "--cache-control=public, max-age=31536000, immutable", "--remote"],
                   check=True, capture_output=True)
    subprocess.run(WRANGLER + ["d1", "execute", db, "--remote", "--command",
                    f"UPDATE {table} SET {column}='{value}' WHERE {match_col}='{match_val}'"],
                   check=True, capture_output=True)

in_total = out_total = done = 0
for r in rows:
    key = r["hero_image_key"]
    got = convert(key, "hero")
    if not got:
        continue
    src, newkey, a, b = got
    in_total += a
    out_total += b
    done += 1
    print(f"  {key}: {a//1024}KB -> {b//1024}KB  ({a/b:.1f}x)  {dimensions(src)}")

    if not dry:
        publish(src, newkey, "blog_posts", "hero_image_key", "id", r["id"], newkey)

# Project logos. Same conversion, but the row to update is projects.logo_url
# and the value keeps its '/image/' prefix — the public renderers and the
# cover SVG builder both resolve it from there.
logo_in = logo_out = logos_done = 0
for r in logos:
    key = r["logo_url"].split("/image/", 1)[-1]
    if not key:
        continue
    got = convert(key, "logo")
    if not got:
        continue
    src, newkey, a, b = got
    logo_in += a
    logo_out += b
    logos_done += 1
    print(f"  logo {r['slug']}: {a//1024}KB -> {b//1024}KB  ({a/b:.1f}x)  {dimensions(src)}")

    if not dry:
        # logo_url keeps its '/image/' prefix — the public renderers and the
        # cover SVG builder both resolve the stored value from there.
        publish(src, newkey, "projects", "logo_url", "slug", r["slug"], "/image/" + newkey)

print()
if done:
    print(f"{done} heroes: {in_total//1024}KB -> {out_total//1024}KB "
          f"({in_total/max(out_total,1):.1f}x smaller, {(1-out_total/max(in_total,1))*100:.0f}% saved)")
if logos_done:
    print(f"{logos_done} logos: {logo_in//1024}KB -> {logo_out//1024}KB "
          f"({logo_in/max(logo_out,1):.1f}x smaller, {(1-logo_out/max(logo_in,1))*100:.0f}% saved)")
if dry:
    print("dry run — rerun without --dry-run to apply")
else:
    print("done")
EOF
