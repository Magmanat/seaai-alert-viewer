# Full Viewer

Production-oriented SEAAI alert viewer.

It reuses the shared viewing UI from `../components/` and adds production
concerns around it:

- JWT cookie login
- SQLite-backed users, settings, and alerts
- filesystem-backed snapshot image storage
- admin-only user management
- admin-only upstream websocket configuration
- persisted alert history with lazy scrolling
- automatic retention cleanup for alerts older than 90 days by default

## Default Admin

The first startup creates an admin user if one does not already exist.

```text
username: admin
password: admin
```

Set `ADMIN_PASSWORD` or pass `--admin-password` before first startup to choose a
different initial password. Passwords are stored as salted PBKDF2 hashes and
cannot be decrypted.

## Run

```bash
python3 full-viewer/main.py
```

Then open `http://127.0.0.1:8766`.

Runtime data is stored under `full-viewer/data/` and is intentionally ignored by
Git.

## Notes

- Regular users can view alerts, images, tracks, and backend websocket status.
- Admin users can create/delete regular users and change the upstream websocket URL.
- `Push demo alert` and `Clear alerts` are disabled in full-viewer mode.
- Snapshot image blobs are stored on disk under `full-viewer/data/media/`.
- `RETENTION_DAYS` controls automatic alert/media cleanup, defaulting to `90`.
