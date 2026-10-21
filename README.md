# HubFace snapshot from VPS (2026-10-20, unmodified)

Read-only copy of `/opt/hubface` on the HubFace VPS, for code review. No code was changed.

Included: `server/`, `dashboard/`, `client/`, `pwa-app/`, `tools/`.

Excluded: `/etc/hubface`, `/etc/hingehub`, env/.env/.conf files, keys/pem, tokens, secret/credential files, email-config.json, databases (*.db, *.sqlite), `data/` dirs, logs, recordings, audio/video (mp4/webm/mov/mp3/wav/ogg/m4a), user uploads (`dashboard/media-lib/files`), files >5 MB, `/opt/hubface/backups`, `/root/hubface-backups`, node_modules, dist/build output, *.bak* files, and `/opt/hingehub` (separate HingeHub app; prototype already in HingeCraftGlobal/hingehub-deal-rooms-prototype).
Run `npm install` in `server/` to restore dependencies.
