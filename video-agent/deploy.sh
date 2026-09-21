#!/usr/bin/env bash
# Deploy the render agent to its VPS.
#
# The agent runs on a host Cloudflare does not manage, so nothing ships it
# automatically — and that is exactly how a fixed music bed sat on main for
# hours while the VPS kept rendering the old, inaudible one. This script
# exists so that copy is one command, and it ends by comparing hashes on
# both sides: a deploy is confirmed by content, never by the copy exiting 0.
#
#   bash video-agent/deploy.sh
#   HOST=other-vps DEST=/srv/video-agent bash video-agent/deploy.sh
#
# The systemd timer re-reads render-video.mjs on every run, so a deploy
# needs no restart. The next tick picks the new code up.
set -euo pipefail
cd "$(dirname "$0")"

HOST="${HOST:-node2-prod}"
DEST="${DEST:-/root/video-agent}"
FILES=(render-video.mjs explainer.mjs package.json)

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "missing $f — run this from video-agent/" >&2; exit 1; }
done

echo "▸ Copying to ${HOST}:${DEST}"
scp -q "${FILES[@]}" "${HOST}:${DEST}/"

echo "▸ Verifying both sides"
fail=0
for f in "${FILES[@]}"; do
  local_sum=$(shasum -a 256 "$f" | awk '{print $1}')
  remote_sum=$(ssh "$HOST" "sha256sum '${DEST}/${f}' 2>/dev/null | awk '{print \$1}'" || true)
  if [ -n "$remote_sum" ] && [ "$local_sum" = "$remote_sum" ]; then
    echo "  ✓ ${f}  ${local_sum:0:12}"
  else
    echo "  ✗ ${f}  local=${local_sum:0:12} remote=${remote_sum:-<missing>}" >&2
    fail=1
  fi
done
[ "$fail" -eq 0 ] || { echo "✗ deploy verification FAILED — the VPS is not running this tree" >&2; exit 1; }

echo "✓ Done. The next timer tick renders with this code."
