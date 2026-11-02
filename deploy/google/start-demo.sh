#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${DEMO_DEPLOY_APPROVED:-}" != yes ]]; then
  echo 'Set DEMO_DEPLOY_APPROVED=yes only after the paid demo deployment is approved.' >&2
  exit 1
fi
memory_kib=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
if (( memory_kib < 1800000 )); then
  echo 'The light demo requires a host with at least approximately 2 GB RAM.' >&2
  exit 1
fi
docker image inspect "${APP_IMAGE:-meerkatpos-app:google-da85b22}" >/dev/null
python3 init_demo_secrets.py
compose=(docker compose -f compose.yaml -f compose.demo.yaml -f compose.small.yaml --profile application)
"${compose[@]}" config --quiet
"${compose[@]}" up -d
"${compose[@]}" exec -T --user root backend env/bin/python /opt/meerkatpos/create_demo.py
echo 'Fresh demo is ready for a localhost HTTP check on port 8081.'
echo 'To publish after DNS and firewall approval, run:'
echo 'docker compose -f compose.yaml -f compose.demo.yaml -f compose.small.yaml --profile application --profile public up -d'
