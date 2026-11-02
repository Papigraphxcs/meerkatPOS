#!/usr/bin/env bash
# Docker's restart policies resume the deployed containers after a reboot.
# Do not unpack the obsolete preparation bundle over the live configuration.
set -euo pipefail
systemctl enable --now docker
