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
# Usage: bash scripts/optimize-hero-images.sh [--dry-run] [--repair] [quality]
#   --dry-run   download + convert + report the saving, write nothing
#   --repair    rows already point at a .webp key; re-derive each object
#               from the sibling original still in the bucket and rewrite
#               it. The rows are left alone. Use when a run published the
#               wrong bytes under the .webp key.
#   --card-size N  write a list-sized copy of every hero under a 'card/'
#               prefix, at N px wide. The hero itself stays 1200px because
#               it is the LCP element and has to hold up on a 2x display;
#               list slots are ~640px, so they take the smaller copy and
#               fall back to the full object when one has not been made.
#   --logo-size N  resize the project logo objects to an NxN square, in
#               place. The header renders the logo at 28px, so a 1046px
#               source is paying for pixels nobody sees.
#   --crop      re-encode the current .webp object in place, cropping to
#               the 1200x630 box the hero actually renders in. Use after a
#               conversion run: the generated heroes are 1024x1024 and the
#               browser discards ~47% of every one at paint time. Bump
#               IMAGE_VERSION in functions/_lib/util.js afterwards, or the
#               edge keeps serving the uncropped bytes.
#   quality     WebP quality, default 82
#
# Measured on the live bucket at q82: ~6.5x smaller across 255 heroes
# (154468KB -> 23828KB). A post page pulls three of these plus a logo, so
# this is the bulk of the page weight.
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=""
REPAIR=""
CROP=""
CARD_SIZE=""
LOGO_SIZE=""
QUALITY=82
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN="--dry-run" ;;
    --repair) REPAIR="--repair" ;;
    --crop) CROP="--crop" ;;
    --logo-size) LOGO_SIZE="${2:-}"; shift ;;
    --card-size) CARD_SIZE="${2:-}"; shift ;;
    *) QUALITY="$1" ;;
  esac
  shift
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

if [[ -n "$CARD_SIZE" ]]; then
  # Card mode writes a second object per hero; the source is the full .webp
  # and the destination is a new key, so nothing is overwritten in place.
  HERO_WHERE="hero_image_key LIKE '%.webp'"
  LOGO_WHERE="logo_url LIKE '%.card-mode-excluded'"
  echo "▸ Card mode: writing ${CARD_SIZE}px list copies under card/ in $DB"
elif [[ -n "$LOGO_SIZE" ]]; then
  # Logo mode re-encodes the .webp object in place, at a square size.
  HERO_WHERE="hero_image_key LIKE '%.logo-mode-excluded'"
  LOGO_WHERE="logo_url LIKE '%.webp'"
  echo "▸ Logo mode: resizing logo objects to ${LOGO_SIZE}x${LOGO_SIZE} in $DB"
elif [[ -n "$CROP" ]]; then
  # Crop re-encodes the object in place, so the source *is* the .webp key.
  # Logos are excluded: the 1200x630 window is a hero layout decision, and
  # cropping a square logo to 1.9:1 would cut the mark in half.
  HERO_WHERE="hero_image_key LIKE '%.webp'"
  LOGO_WHERE="logo_url LIKE '%.crop-excluded'"
  echo "▸ Crop mode: re-encoding .webp objects at 1200x630 in $DB"
elif [[ -n "$REPAIR" ]]; then
  HERO_WHERE="hero_image_key LIKE '%.webp'"
  LOGO_WHERE="logo_url LIKE '%.webp'"
  echo "▸ Repair mode: re-deriving .webp objects from their originals in $DB"
else
  HERO_WHERE="hero_image_key LIKE '%.jpg' OR hero_image_key LIKE '%.jpeg' OR hero_image_key LIKE '%.png'"
  LOGO_WHERE="logo_url LIKE '/image/%' AND logo_url NOT LIKE '%.webp'"
  echo "▸ Listing hero images in $DB"
fi

$WRANGLER d1 execute "$DB" --remote --json \
  --command "SELECT id, hero_image_key FROM blog_posts WHERE $HERO_WHERE" \
  > "$WORK/rows.json"

# Project logos are a separate table: projects.logo_url holds an
# '/image/<key>' path, not a bare key. The header logo renders on every
# public page, so one oversized upload is charged on every page view.
echo "▸ Listing project logos in $DB"
$WRANGLER d1 execute "$DB" --remote --json \
  --command "SELECT slug, logo_url FROM projects WHERE $LOGO_WHERE" \
  > "$WORK/logos.json"

python3 - "$WORK" "$BUCKET" "$DB" "$QUALITY" "$DRY_RUN" "$WRANGLER" "$REPAIR" "$CROP" "$LOGO_SIZE" "$CARD_SIZE" <<'EOF'
import json, subprocess, os, sys
work, bucket, db, q, dry = sys.argv[1:6]
WRANGLER = sys.argv[6].split()
repair = bool(sys.argv[7])
crop = bool(sys.argv[8])
logo_size = int(sys.argv[9]) if sys.argv[9] else 0
card_size = int(sys.argv[10]) if len(sys.argv) > 10 and sys.argv[10] else 0
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

# The hero is rendered inside a box that declares aspect-ratio 1200/630, and
# page_render.js writes the same 1200x630 into the JSON-LD ImageObject. The
# generated heroes are 1024x1024, so the browser crops ~47% of every one at
# paint time. Cropping to that same window before encoding ships the visible
# region only, and makes the JSON-LD width/height claim true.
HERO_ASPECT = 1200 / 630
HERO_OUT_W, HERO_OUT_H = 1200, 630

def px(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
                         capture_output=True, text=True).stdout
    w = [l.split(":")[1].strip() for l in out.splitlines() if "pixelWidth" in l]
    h = [l.split(":")[1].strip() for l in out.splitlines() if "pixelHeight" in l]
    if not (w and h):
        return None
    return int(w[0]), int(h[0])

def crop_args(src):
    """cwebp crop window matching the rendered 1200x630 box, or None when
    the source is already at or below that aspect and needs no crop."""
    size = px(src)
    if not size:
        return None
    w, h = size
    if h <= 0 or w / h >= HERO_ASPECT:
        return None
    ch = int(w / HERO_ASPECT)
    return ["-crop", "0", str((h - ch) // 2), str(w), str(ch), "-resize", str(HERO_OUT_W), str(HERO_OUT_H)]

def convert(source_key, dest_key, tag):
    """Fetch `source_key` from R2, recompress it, and return
    (converted_path, in_bytes, out_bytes) or None when the object is not
    worth converting.

    A single unreadable object must not abort a run over hundreds of them,
    so failures are reported and skipped rather than raised. SVG is skipped
    outright: cwebp cannot rasterise it, and a vector logo is already tiny.

    The first return value is the *recompressed* file. Publishing the
    fetched original instead is the mistake that stores JPEG/PNG bytes
    under a .webp key — the right content-type for the wrong bytes, saving
    nothing — so the two paths are named apart on purpose.
    """
    ext = os.path.splitext(source_key)[1].lower()
    # SKIP_EXT guards the *source* format. The in-place modes re-encode an
    # object that is already .webp, so they have to be let through; the
    # plain run cannot reach here with a .webp because its query only
    # selects jpg/jpeg/png.
    if ext in SKIP_EXT and not (crop or logo_size or card_size):
        print(f"  {tag} {source_key}: skipped ({ext} not convertible)")
        return None
    src = f"{work}/{tag}{ext}"
    dst = f"{work}/{tag}_out.webp"
    got = subprocess.run(WRANGLER + ["r2", "object", "get", f"{bucket}/{source_key}", f"--file={src}", "--remote"],
                         capture_output=True, text=True)
    if got.returncode != 0 or not os.path.exists(src):
        print(f"  {tag} {source_key}: SKIPPED — could not read from R2 ({got.stderr.strip().splitlines()[-1] if got.stderr.strip() else 'not found'})")
        return None
    # Crop mode recompresses the object's own .webp key, so src and dst
    # are both derived here rather than assumed to be distinct files.
    # Resizing down is the point; resizing up would invent detail and can
    # make a small logo larger than it started. -resize needs explicit
    # dimensions, so the aspect-preserving fit is computed here.
    geometry = []
    if card_size:
        size = px(src)
        if not size or size[0] <= card_size:
            print(f"  {tag} {source_key}: already {size[0] if size else '?'}px wide — no card copy needed")
            return None
        # Only the width is bounded; the aspect rides along.
        geometry = ["-resize", str(card_size), "0"]
    elif logo_size:
        size = px(src)
        if not size or max(size) > logo_size:
            fit = logo_size / max(size)
            geometry = ["-resize", str(max(1, round(size[0] * fit))), str(max(1, round(size[1] * fit)))]
        else:
            print(f"  {tag} {source_key}: already {size[0]}x{size[1]}, within {logo_size} — recompressing only")
    else:
        geometry = crop_args(src) or []
    args = ["cwebp", "-quiet", "-q", str(q)] + geometry + [src, "-o", dst]
    made = subprocess.run(args, capture_output=True, text=True)
    if made.returncode != 0 or not os.path.exists(dst):
        print(f"  {tag} {source_key}: SKIPPED — cwebp could not read it ({made.stderr.strip().splitlines()[-1] if made.stderr.strip() else 'unknown'})")
        return None
    return dst, os.path.getsize(src), os.path.getsize(dst)

def put_object(converted, r2key):
    """Store the recompressed WebP under its bare R2 key. The R2 key and
    the value stored in the row are not always the same string (projects
    .logo_url keeps an '/image/' prefix), so callers pass the key.

    Every wrangler call here is a fresh `npx wrangler` process, and over a
    few hundred objects that is enough to hit a transient API failure. One
    blip must not strand the rest of the run, so a failure is reported and
    the object is left for a re-run; returning False lets the caller say so.
    """
    put = subprocess.run(WRANGLER + ["r2", "object", "put", f"{bucket}/{r2key}", f"--file={converted}",
                    "--content-type=image/webp",
                    "--cache-control=public, max-age=31536000, immutable", "--remote"],
                    capture_output=True, text=True)
    if put.returncode != 0:
        detail = (put.stderr or put.stdout).strip().splitlines()
        print(f"    PUT FAILED {r2key}: {detail[-1] if detail else 'unknown error'}")
        return False
    return True

def update_row(table, column, match_col, match_val, value):
    run = subprocess.run(WRANGLER + ["d1", "execute", db, "--remote", "--command",
                    f"UPDATE {table} SET {column}='{value}' WHERE {match_col}='{match_val}'"],
                    capture_output=True, text=True)
    if run.returncode != 0:
        detail = (run.stderr or run.stdout).strip().splitlines()
        print(f"    UPDATE FAILED {table}.{column} WHERE {match_col}={match_val}: "
              f"{detail[-1] if detail else 'unknown error'}")

def publish(converted, r2key, table, column, match_col, match_val, value):
    # Only repoint the row once the object is actually there, or a failed
    # upload leaves the site pointing at a key that was never written.
    if put_object(converted, r2key):
        update_row(table, column, match_col, match_val, value)

in_total = out_total = done = 0
for r in rows:
    key = r["hero_image_key"]
    if repair:
        # Re-derive an already-pointed-at-.webp row from the sibling
        # original still sitting in the bucket. Used to repair objects that
        # were published with the wrong bytes.
        if not key.lower().endswith(".webp"):
            continue
        stem = os.path.splitext(key)[0]
        source = next((stem + e for e in (".jpg", ".jpeg", ".png")
                       if os.path.exists(f"{work}/probe{e}")), None)
        if source is None:
            # No local probe; fetch the first sibling that exists.
            for e in (".jpg", ".jpeg", ".png"):
                got = subprocess.run(WRANGLER + ["r2", "object", "get", f"{bucket}/{stem}{e}",
                                                 f"--file={work}/probe{e}", "--remote"],
                                     capture_output=True)
                if got.returncode == 0 and os.path.exists(f"{work}/probe{e}"):
                    source = stem + e
                    break
        if source is None:
            print(f"  hero {key}: SKIPPED — no sibling original in the bucket to re-derive from")
            continue
        got = convert(source, key, "hero")
    elif card_size:
        got = convert(key, f"card/{key}", "hero")
    else:
        got = convert(key, key, "hero")
    if not got:
        continue
    converted, a, b = got
    in_total += a
    out_total += b
    done += 1
    print(f"  {key}: {a//1024}KB -> {b//1024}KB  ({a/b:.1f}x)  {dimensions(converted)}")

    if card_size and not dry:
        put_object(converted, f"card/{key}")
        continue

    if not dry:
        # Repair mode rewrites only the object; the row already points at
        # this .webp key. A normal run writes the object *and* repoints the
        # row, so the object is never the optional half.
        if repair or crop:
            put_object(converted, key)
        else:
            publish(converted, key, "blog_posts", "hero_image_key", "id", r["id"], key)

# Project logos. Same conversion, but the row to update is projects.logo_url
# and the value keeps its '/image/' prefix — the public renderers and the
# cover SVG builder both resolve it from there.
logo_in = logo_out = logos_done = 0
for r in logos:
    if crop:
        break
    key = r["logo_url"].split("/image/", 1)[-1]
    if not key:
        continue
    # A row already on .webp is only interesting when this run is here to
    # rewrite the existing object (--repair, --logo-size); a plain run has
    # already done it and must not redo the whole corpus.
    if key.lower().endswith(".webp") and not (repair or logo_size):
        continue
    stem = os.path.splitext(key)[0]
    source = key
    if key.lower().endswith(".webp") and repair:
        source = None
        for e in (".jpg", ".jpeg", ".png"):
            got = subprocess.run(WRANGLER + ["r2", "object", "get", f"{bucket}/{stem}{e}",
                                             f"--file={work}/lprobe{e}", "--remote"],
                                 capture_output=True)
            if got.returncode == 0 and os.path.exists(f"{work}/lprobe{e}"):
                source = stem + e
                break
        if source is None:
            print(f"  logo {r['slug']}: SKIPPED — no sibling original to re-derive from")
            continue
    got = convert(source, stem + ".webp", "logo")
    if not got:
        continue
    converted, a, b = got
    logo_in += a
    logo_out += b
    logos_done += 1
    print(f"  logo {r['slug']}: {a//1024}KB -> {b//1024}KB  ({a/b:.1f}x)  {dimensions(converted)}")

    if not dry:
        # logo_url keeps its '/image/' prefix — the public renderers and the
        # cover SVG builder both resolve the stored value from there. In
        # repair/logo mode the row already holds it, so only the object is
        # rewritten.
        if repair or logo_size:
            put_object(converted, stem + ".webp")
        else:
            publish(converted, stem + ".webp", "projects", "logo_url", "slug", r["slug"], "/image/" + stem + ".webp")

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
