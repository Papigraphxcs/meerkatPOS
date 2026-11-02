#!/usr/bin/env bash
# Run only after reviewing the billing account's shared Free Tier consumption.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ ${FREE_TIER_REVIEWED:-} != yes ]]; then
  echo 'Run the read-only preflight and review shared Free Tier usage first.' >&2
  echo 'Set FREE_TIER_REVIEWED=yes only after that review. Nothing was created.' >&2
  exit 1
fi
gcloud compute instances describe meerkatpos-prep --project=meerkatpos --zone=us-central1-a \
  --format='value(name)' 2>/dev/null && {
    echo 'Existing preparation VM found; refusing to create a duplicate.' >&2
    exit 1
  }
# Bundle only Git-tracked deployment files. Secrets and local build output are excluded.
bundle_file=$(mktemp)
trap 'rm -f -- "$bundle_file"' EXIT
git archive --format=tar HEAD:deploy/google | gzip -n | base64 -w0 > "$bundle_file"
gcloud compute instances create meerkatpos-prep \
  --project=meerkatpos --zone=us-central1-a --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --subnet=default --no-address --no-service-account --no-scopes \
  --metadata=enable-oslogin=TRUE,block-project-ssh-keys=TRUE \
  --metadata-from-file="startup-script=startup-private.sh,deployment-package=$bundle_file" \
  --labels=app=meerkatpos,purpose=preparation
# Read actual resources to verify the requested shape, disk and lack of public IP.
gcloud compute instances describe meerkatpos-prep --project=meerkatpos --zone=us-central1-a \
  --format='yaml(name,status,machineType,networkInterfaces,disks,serviceAccounts)'
gcloud compute disks describe meerkatpos-prep --project=meerkatpos --zone=us-central1-a \
  --format='yaml(name,sizeGb,type,resourcePolicies)'
