# Google preparation for Meerkatpos

The user requires ongoing $0 hosting, with no reliance on trial credits. This package therefore separates a small private preparation VM from the full application stack. Nothing here changes DNS, restores customer data, publishes a site or launches a Google resource automatically.

## Selected code and recovered versions

| Component | Selected version |
| --- | --- |
| Meerkatpos | v1.1.2, commit `da85b22d2752c175c63486ac1f89d7cf2f0edfc9` |
| Frappe | v16.32.0, commit `5cba016e86b54b57f34a3864282b92300ef20fb0` |
| ERPNext | v16.33.0, commit `b24c9eba551905e256e336ff170a91a92d197a2f` |
| Python / Node / Bench | 3.14 / 24.21.0 / 5.31.0 |
| Architecture | linux/amd64; rebuild from source, do not copy ARM containers |

The runtime resources come from official frappe_docker commit `3d0a0e53d8ab03903f6c3f125976a37d7a0f9875`, the most recent official commit before the recovered deployment. This is a reconstruction, not the recovered Oracle filesystem. `provenance.json` records evidence and file hashes. Base OS packages and transitive build tools are not fully locked.

MariaDB 11.8 and Redis 8.6-alpine are staging choices from that official reference. Their actual Oracle server versions remain unknown. Verify those versions before restoring data. Restore SQL dumps into a compatible database; do not mount Oracle's ARM database data directory directly into a new database version.

## Strict $0 constraint

[Google's Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features) currently includes eligible e2-micro VM hours in us-central1, us-east1 or us-west1, 30 GB-months of standard persistent disk and limited outbound transfer. Usage is shared across the billing account. Johannesburg is not an eligible free VM region. Do not choose pd-balanced/SSD, snapshots, extra disks, Cloud SQL, paid NAT, or a load balancer under this budget.

[Public IPv4 addresses are charged](https://cloud.google.com/vpc/network-pricing#ipaddress), including ephemeral addresses. The proposed preparation VM has no external address and no NAT. It cannot clone GitHub or pull Docker images over the public internet. IAP/private administrative connectivity and transfer permissions must be verified separately. Google budgets send alerts, not hard spending caps; no configuration here guarantees the billing account's total invoice will be zero.

An e2-micro has 1 GB RAM. It can hold configuration and serve the preparation status page, but is not a dependable production host for MariaDB, Redis, Frappe, websocket and workers together. `stage.sh` refuses to start the full stack on a host below approximately 4 GB RAM. No larger paid VM is authorized.

## Read-only Google preflight

Run `bash plan-private-vm.sh meerkatpos` in an authenticated Google Cloud Shell. It checks the project, billing linkage, current instances, disks and networks, then prints the candidate VM command. It creates nothing. Review billing-account-wide Free Tier consumption and the subnet/IAP configuration before using that command. `startup-private.sh` creates only an offline localhost status page and its systemd service.

After that review, `FREE_TIER_REVIEWED=yes bash provision-private-vm.sh` provisions the fixed private preparation shape and embeds only the committed deployment files in VM metadata. It creates no firewall or IAM rules, public IP, NAT, snapshot schedule or service account. The VM unpacks the files under `/opt/meerkatpos/deployment` without internet access. This is a preparation host, not a running Meerkatpos application. A failed startup does not delete the VM automatically; inspect its serial logs and retain its disk until reviewed.

## Build and validate locally

On a Linux/WSL Docker host with sufficient RAM and disk:

```bash
cd deploy/google
bash build.sh
bash stage.sh
docker compose --profile application ps
docker compose exec backend cat versions.lock
```

The build fetches release tags and checks each Git commit before building the assets. The image is tagged `meerkatpos-app:google-da85b22`. `stage.sh` creates a random database password only if absent, under ignored `.secrets/`, and starts the application profile. No site is created automatically. Frontend access is localhost-only on port 8081. The Redis and database ports are not published. Workers and scheduler require the separate `live` profile and must remain stopped until recovery and cutover are reviewed.

For smoke testing, create an explicitly disposable `staging.localhost` site using a private Administrator password, install erpnext and xpos, set `mute_emails` and disable its scheduler. Do not create either customer's production hostname as a replacement empty site.

## Before customer cutover

Recover both tenants' SQL dumps, public/private files and site_config.json (including encryption keys) from Oracle. Keep secrets and customer data out of Git. Verify installed apps, framework and database versions; restore to a separate test site; disable emails, scheduler and integrations while testing. Verify customer counts, stock, balances, sales and attachments. Select a supported host size and a funding plan before enabling workers, public HTTPS and DNS. The current ongoing $0 restriction does not authorize those paid changes.

Pushing to the existing `develop` branch can trigger the old Oracle deployment workflow. Work stays on `codex/google-preparation` until a Google-specific deployment workflow is reviewed.
