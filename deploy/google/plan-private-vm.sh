#!/usr/bin/env bash
# Read-only preflight. This script prints a proposed create command; never executes it.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
project_id=${1:-meerkatpos}
gcloud projects describe "$project_id" --format='yaml(projectId,projectNumber,lifecycleState)'
gcloud billing projects describe "$project_id" --format='yaml(billingEnabled,billingAccountName)'
gcloud compute instances list --project "$project_id" --format='table(name,zone.basename(),machineType.basename(),status)'
gcloud compute disks list --project "$project_id" --format='table(name,zone.basename(),type.basename(),sizeGb)'
gcloud compute networks list --project "$project_id" --format='table(name,autoCreateSubnetworks)'
cat <<'PLAN'

PROPOSED PRIVATE PREPARATION VM — NOT CREATED:
  Project: meerkatpos (verify actual project ID)
  Zone: us-central1-a
  Machine: e2-micro (1 GB RAM; preparation-only)
  OS: Ubuntu 22.04 LTS, x86_64
  Disk: 30 GB pd-standard, no automatic snapshot schedule
  External IP: none; no NAT, public load balancer or paid managed database
  Public HTTP/HTTPS: none
  Customer data and production jobs: none

Free Tier applies across the billing account, not just this project.
Confirm other projects' eligible VM hours and disk usage before provisioning.
This is not a hard spending cap or a guarantee of a zero invoice.

Candidate command, requiring a verified existing subnet and budget review:
  gcloud compute instances create meerkatpos-prep \
    --project=meerkatpos --zone=us-central1-a --machine-type=e2-micro \
    --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-standard \
    --no-address --no-service-account --no-scopes \
    --subnet=VERIFIED_SUBNET \
    --metadata-from-file=startup-script=startup-private.sh \
    --labels=app=meerkatpos,purpose=preparation

Administrative access needs an existing private route or reviewed IAP SSH access.
No firewall rules, IAM grants or service-account keys are created by this script.
The preparation VM has no internet route for cloning GitHub or downloading images.
Build locally and plan a reviewed private transfer; do not add a paid NAT/IP silently.
PLAN
