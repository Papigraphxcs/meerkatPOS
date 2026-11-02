# Main website and fresh Google demo

This package restores the original main website and creates only `demo.meerkatpos.me`, with fictional company Meerkatpos Demo, three products and 25 units of each. It does not contain customer data or restore Oracle databases. The demo cashier is `demo@meerkatpos.me`; its password is generated privately on the deployment host. The Administrator password stays separate.

## Proposed host and cost

The user approved reusing `meerkatpos-prep` in `us-central1-a`, resizing to e2-small (2 GB RAM), retaining its existing 30 GB standard disk and attaching a static public IPv4. On-demand compute at $0.016752855/hour is about $12.23/month. IPv4 at $0.005/hour adds about $3.65/month. Baseline is approximately $15.88/month, before tax and outbound traffic, assuming the standard disk remains within the billing account's free allowance. Budget alerts do not impose a hard spending cap. Desktop installer downloads add outbound traffic.

Allow public TCP 80/443 only for this VM. Keep SSH restricted to Google IAP (35.235.240.0/20); add an explicit higher-priority deny for other SSH sources if the network has a broad default allow-ssh rule. Keep OS Login and block-project-ssh-keys enabled. Do not attach a broadly privileged VM service account.

## Prepare and start

Install Docker Engine and its Compose plugin using the [official Ubuntu repository instructions](https://docs.docker.com/engine/install/ubuntu/). Transfer the tested image using `docker save`, gzip and IAP SCP. Load it with `docker load` on the VM. The 2 GB demo VM runs the prebuilt image rather than building frontend assets. Configure a 2 GB local swap file for temporary memory spikes. `compose.small.yaml` sets per-service memory limits and a small MariaDB buffer pool. This configuration is for light demo use; scheduled and background jobs remain disabled.

Copy this deployment directory to `/opt/meerkatpos/deployment`. Keep it owned by the deployment administrator; run Docker commands with sudo rather than granting additional users Docker access. Generate secrets on that VM, not in Git or a cloud metadata field:

```bash
cd /opt/meerkatpos/deployment
sudo env DEMO_DEPLOY_APPROVED=yes bash start-demo.sh
curl --fail -H 'Host: demo.meerkatpos.me' http://127.0.0.1:8081/login >/dev/null
```

The creation script refuses to modify an existing site without its fresh-demo marker. Email and the scheduler are disabled. Application workers remain opt-in; background exports and scheduled tasks are outside this initial demo. Use the demo only for fictional data. Before any later reseed or update, back up its database and site files.

The original desktop installers are excluded from Git. Copy them separately to `website/downloads/`, retaining these names and SHA-256 values:

| File | SHA-256 |
| --- | --- |
| meerkatPOS-1.0.9.AppImage | 522575614b46cfc9cfe211deeaca85b48ab00c32a159dcf9308f5b84d30f6e8d |
| meerkatPOS-1.0.9-win-x64-portable.zip | 93f42525a44f21eaaf067e3d13a01931e88742fe080fd59f7efec31414a32c84 |

## DNS and HTTPS cutover

Namecheap records inspected on 2026-11-02: wildcard `*` and apex `@` A records both point to 92.4.135.71; `www` is a CNAME to meerkatpos.me. Mail CNAMEs `rsend` and `send`, `_dmarc` and `resend._domainkey` TXT records, and email-forwarding SPF must be preserved. Expand and recheck the record list immediately before editing.

After the approved upgrade, firewall configuration and HTTP checks, change only `@` to the Google static IP and add an explicit `demo` A record to that IP. Keep `www` as its existing apex CNAME. Preserve the wildcard pointing to Oracle so SAHH keeps its current destination. Do not change nameservers, mail records, or add SAHH to the Google proxy.

```bash
sudo docker compose -f compose.yaml -f compose.demo.yaml -f compose.small.yaml --profile application --profile public up -d
```

Caddy obtains and renews HTTPS certificates for the apex, www and demo, with certificate data persisted in Docker volumes. Verify all three public HTTPS hostnames, demo login, product prices/stock and installer downloads after DNS propagation. To roll back routing, restore `@` to 92.4.135.71 and remove the newly added demo record; this restores the previous DNS destination but cannot make the terminated Oracle instance available.

Keep changes on `codex/google-preparation`. Pushing `develop` may trigger the old Oracle deployment workflow.
