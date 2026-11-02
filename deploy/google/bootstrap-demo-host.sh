#!/usr/bin/env bash
# Run only on the approved Ubuntu demo VM; no cloud resources are created here.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
[[ "${DEMO_DEPLOY_APPROVED:-}" == yes ]] || { echo 'Demo deployment approval required.' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$(dpkg --print-architecture)" == amd64 ]] || exit 1
if ! command -v docker >/dev/null; then
  apt-get update -qq
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
if ! swapon --noheadings --show=NAME | grep -Fxq /swapfile; then
  if [[ ! -e /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  [[ "$(stat -c %a /swapfile)" == 600 ]] || { echo 'Existing swap file has unexpected permissions.' >&2; exit 1; }
  swapon /swapfile
fi
grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
systemctl enable --now docker
docker compose version
free -m
