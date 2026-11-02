#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
docker build --platform linux/amd64 --file Containerfile --tag meerkatpos-app:google-da85b22 .
docker run --rm --entrypoint cat meerkatpos-app:google-da85b22 versions.lock
