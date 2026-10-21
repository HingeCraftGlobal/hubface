// Nightly online backup of the HubFace accounts DB (run by /etc/cron.d/hubface-accounts-backup as user hubface). Keeps the newest 7.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
const SRC = process.env.HUBFACE_DB || '/var/lib/hubface/accounts.db';
const DIR = process.env.HUBFACE_DB_BACKUPS || '/var/lib/hubface/backups';
const KEEP = 7;
process.umask(0o077);
fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const dest = path.join(DIR, `accounts-${stamp}.db`);
const db = new Database(SRC, { readonly: true, fileMustExist: true });
await db.backup(dest); db.close(); fs.chmodSync(dest, 0o600);
const chk = new Database(dest, { readonly: true }); const ok = chk.pragma('integrity_check', { simple: true }); chk.close();
if (ok !== 'ok') { console.error('backup integrity check failed', ok); process.exit(1); }
const files = fs.readdirSync(DIR).filter((f) => /^accounts-\d{8}-\d{6}\.db$/.test(f)).sort();
for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(DIR, f));
console.log(`backup ok ${dest} (kept ${Math.min(files.length, KEEP)})`);
