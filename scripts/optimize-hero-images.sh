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

python3 - "$WORK" "$BUCKET" "$DB" "$QUALITY" "$DRY_RUN" "$WRANGLER" <<'EOF'
import json, subprocess, os, sys
work, bucket, db, q, dry = sys.argv[1:6]
WRANGLER = sys.argv[6].split()
rows = json.load(open(f"{work}/rows.json"))[0]["results"]
print(f"{len(rows)} images to optimize{'' if dry else ''}{' (DRY RUN — nothing is written)' if dry else ''}")

def dimensions(path):
    try:
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                             capture_output=True, text=True).stdout
        w = [l.split(":")[1].strip() for l in out.splitlines() if "pixelWidth" in l]
        h = [l.split(":")[1].strip() for l in out.splitlines() if "pixelHeight" in l]
        return f"{w[0]}x{h[0]}" if w and h else "?"
    except Exception:
        return "?"

in_total = out_total = done = 0
for r in rows:
    key = r["hero_image_key"]
    # Idempotent: a row already pointing at WebP is left alone.
    if key.lower().endswith(".webp"):
        continue
    stem, _ = os.path.splitext(key)
    newkey = stem + ".webp"
    src = f"{work}/in{os.path.splitext(key)[1] or '.png'}"
    dst = f"{work}/out.webp"

    subprocess.run(WRANGLER + ["r2", "object", "get", f"{bucket}/{key}", f"--file={src}", "--remote"],
                   check=True, capture_output=True)
    subprocess.run(["cwebp", "-quiet", "-q", str(q), src, "-o", dst], check=True)

    a, b = os.path.getsize(src), os.path.getsize(dst)
    in_total += a
    out_total += b
    done += 1
    print(f"  {key}: {a//1024}KB -> {b//1024}KB  ({a/b:.1f}x)  {dimensions(src)}")

    if not dry:
        subprocess.run(WRANGLER + ["r2", "object", "put", f"{bucket}/{newkey}", f"--file={dst}",
                        "--content-type=image/webp",
                        "--cache-control=public, max-age=31536000, immutable", "--remote"],
                       check=True, capture_output=True)
        subprocess.run(WRANGLER + ["d1", "execute", db, "--remote", "--command",
                        f"UPDATE blog_posts SET hero_image_key='{newkey}' WHERE id='{r['id']}'"],
                       check=True, capture_output=True)

print()
if done:
    print(f"{done} images: {in_total//1024}KB -> {out_total//1024}KB "
          f"({in_total/max(out_total,1):.1f}x smaller, {(1-out_total/max(in_total,1))*100:.0f}% saved)")
if dry:
    print("dry run — rerun without --dry-run to apply")
else:
    print("done")
EOF
