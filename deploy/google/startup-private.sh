#!/usr/bin/env bash
# Offline, preparation-only startup: no installs, cloud API calls or customer data.
set -euo pipefail
install -d -m 0755 /opt/meerkatpos/status
# A small reviewed source bundle can be supplied in metadata, avoiding public IP/NAT.
install -d -m 0755 /opt/meerkatpos/deployment
python3 - <<'PY'
import base64
import io
import tarfile
import urllib.error
import urllib.request
url = 'http://metadata.google.internal/computeMetadata/v1/instance/attributes/deployment-package'
request = urllib.request.Request(url, headers={'Metadata-Flavor': 'Google'})
try:
    bundle = base64.b64decode(urllib.request.urlopen(request, timeout=15).read(), validate=True)
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
else:
    with tarfile.open(fileobj=io.BytesIO(bundle), mode='r:gz') as archive:
        for member in archive.getmembers():
            if member.isdir():
                continue
            if member.name.startswith('/') or '..' in member.name.split('/') or not member.isfile():
                raise ValueError('Unexpected deployment archive member')
            data = archive.extractfile(member).read()
            from pathlib import Path
            path = Path('/opt/meerkatpos/deployment') / member.name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
PY
cat >/opt/meerkatpos/status/index.html <<'HTML'
<!doctype html><html lang="en"><meta charset="utf-8">
<title>Meerkatpos staging</title><h1>Meerkatpos preparation host</h1>
<p>Application source: GitHub v1.1.2 (da85b22).</p>
<p>Customer database and uploads are awaiting Oracle recovery.</p>
<p>No live customer sites, sales, workers or scheduled jobs are running.</p></html>
HTML
command -v python3 >/dev/null
cat >/etc/systemd/system/meerkatpos-preparation.service <<'UNIT'
[Unit]
Description=Private Meerkatpos preparation status
After=network.target
[Service]
User=nobody
Group=nogroup
WorkingDirectory=/opt/meerkatpos/status
ExecStart=/usr/bin/python3 -m http.server 8080 --bind 127.0.0.1
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now meerkatpos-preparation.service
echo 'MEERKATPOS_PREPARATION_READY: private status service active; deployment files staged; no customer sites running.'
