#!/usr/bin/env bash
# Run in the authorized Google Cloud Shell after uploading the tested artifacts.
set -euo pipefail
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$repo"
python3 - "$repo/deploy/google/transfer-manifest.json" <<'PY'
import hashlib, json, pathlib, shutil, sys
home = pathlib.Path.home()
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
for name, expected in manifest.items():
    path = home / name
    assert hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() == expected, name
win = home / 'meerkatPOS-1.0.9-win-x64-portable.zip'
assert hashlib.file_digest(win.open('rb'), 'sha256').hexdigest() == '93f42525a44f21eaaf067e3d13a01931e88742fe080fd59f7efec31414a32c84'
with (home / 'meerkatpos-app-upload.tar').open('wb') as output:
    for name in sorted(n for n in manifest if n.startswith('app-image.part-')):
        with (home / name).open('rb') as source:
            shutil.copyfileobj(source, output)
print('Uploaded image parts and both installers verified.')
PY
git archive --format=tar -o "$HOME/meerkatpos-deployment.tar" HEAD:deploy/google
python3 -c 'import numpy' 2>/dev/null || python3 -m pip install --user numpy
connection=(--project=meerkatpos --zone=us-central1-a --tunnel-through-iap --quiet)
gcloud compute scp "$HOME/meerkatpos-app-upload.tar" "$HOME/meerkatpos-deployment.tar" \
  "$HOME/linux-installer.part" "$HOME/meerkatPOS-1.0.9-win-x64-portable.zip" \
  meerkatpos-prep:~/ "${connection[@]}"
gcloud compute instances add-metadata meerkatpos-prep --project=meerkatpos --zone=us-central1-a \
  --metadata-from-file=startup-script=deploy/google/startup-demo.sh
gcloud compute ssh meerkatpos-prep "${connection[@]}" --command='bash -s' <<'REMOTE'
set -euo pipefail
target=/opt/meerkatpos/deployment
sudo tar -xf "$HOME/meerkatpos-deployment.tar" -C "$target"
sudo install -d -m 755 "$target/website/downloads"
sudo install -m 644 "$HOME/linux-installer.part" "$target/website/downloads/meerkatPOS-1.0.9.AppImage"
sudo install -m 644 "$HOME/meerkatPOS-1.0.9-win-x64-portable.zip" "$target/website/downloads/meerkatPOS-1.0.9-win-x64-portable.zip"
sudo docker load -i "$HOME/meerkatpos-app-upload.tar"
sudo docker run --rm --entrypoint cat meerkatpos-app:google-da85b22 versions.lock
sudo env DEMO_DEPLOY_APPROVED=yes bash "$target/start-demo.sh"
sudo python3 "$target/verify_demo.py"
if ! sudo docker container inspect meerkatpos-main-preview >/dev/null 2>&1; then
  sudo docker run -d --name meerkatpos-main-preview --publish 127.0.0.1:8082:8080 \
    --volume "$target/website:/srv/website:ro" caddy:2-alpine \
    caddy file-server --listen :8080 --root /srv/website
else
  sudo docker start meerkatpos-main-preview >/dev/null
fi
curl --retry 8 --retry-connrefused --retry-delay 2 --fail --silent http://127.0.0.1:8082/ >/dev/null
curl --fail --silent --head http://127.0.0.1:8082/downloads/meerkatPOS-1.0.9.AppImage | head -n 5
sudo docker stop meerkatpos-main-preview >/dev/null
echo MEERKATPOS_DEMO_AND_MAIN_READY_FOR_DNS
REMOTE
