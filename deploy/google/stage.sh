#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
# e2-micro is only a preparation host. Do not start the full stack there.
memory_kib=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
if ((memory_kib < 3800000)); then
  echo 'Full-stack staging requires at least 4 GB RAM; this host remains preparation-only.' >&2
  exit 1
fi
umask 077
mkdir -p .secrets
if [[ ! -s .secrets/db-root ]]; then
  openssl rand -hex 32 > .secrets/db-root
fi
docker image inspect meerkatpos-app:google-da85b22 >/dev/null
docker compose --profile application up -d
echo 'Private application started on 127.0.0.1:8081. No site was created or restored.'
echo 'Workers and scheduler remain stopped. Customer data is still pending Oracle recovery.'
