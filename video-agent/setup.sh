#!/usr/bin/env bash
# One-time setup for the pages-seo video agent on a fresh Ubuntu 22.04 VPS.
# Installs system deps, the TTS engine, and scaffolds a 0600 .env.
#
#   bash setup.sh
#
# Then edit /root/video-agent/.env (BASE_URL, ADMIN_TOKEN, and at least one
# of NINEROUTER_API_KEY / GUROUTER_API_KEY) and run:
#   node render-video.mjs --slug <slug>
set -euo pipefail
cd "$(dirname "$0")"

echo "▸ System packages (node was provisioned separately if missing)"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
DEBIAN_FRONTEND=noninteractive apt-get install -y ffmpeg unzip fonts-liberation fonts-noto-core \
  libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libatspi2.0-0 libxrandr2 libgbm1 \
  libxkbcommon0 libasound2 libcups2 libnss3 libnspr4 >/dev/null
command -v edge-tts >/dev/null 2>&1 || { apt-get install -y python3-pip >/dev/null; pip3 install edge-tts >/dev/null; }

if [[ ! -f .env ]]; then
  umask 077
  cat > .env <<'EOF'
BASE_URL=https://gu-seo.pages.dev
ADMIN_TOKEN=paste-admin-token-here
# Model providers, tried in this order. 9Router is the operator's own
# OpenAI-compatible gateway and answers first; GuRouter is the fallback, so
# one gateway being down does not cost the video. Leave either blank to skip
# it — the ladder keeps whoever has a key.
NINEROUTER_API_KEY=paste-9router-key-here
NINEROUTER_BASE_URL=https://aifree.gulagi.com/v1
NINEROUTER_TEXT_MODEL=guguseo
GUROUTER_API_KEY=paste-gurouter-key-here
VIDEO_VOICE=vi-VN-NamMinhNeural
# VIDEO_PROJECT_ID=proj_gulagi_001
# ACCENT=#1677ff
EOF
  chmod 600 .env
  echo "▸ Wrote video-agent/.env (0600) — fill in ADMIN_TOKEN + at least one model key."
else
  echo "▸ .env already exists — left untouched."
fi
echo "✓ Setup done. Next: node render-video.mjs --slug <slug>"
