"""Generate private credentials on the deployment host, preserving existing ones."""
import os
from pathlib import Path
import secrets

target = Path(__file__).resolve().parent / '.secrets'
target.mkdir(mode=0o700, exist_ok=True)
for name in ('db-root', 'demo-admin', 'demo-user'):
    try:
        fd = os.open(target / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        continue
    with os.fdopen(fd, 'w') as output:
        output.write(secrets.token_urlsafe(32) + '\n')
print('Demo secrets ready. Existing credentials preserved; values not displayed.')
