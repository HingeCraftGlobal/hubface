// Passport CVV helpers. The CVV is never stored in plaintext: only a salted scrypt hash.
// Reveal links seal the CVV with AES-256-GCM under a key derived from the link token; the server keeps only sha256(token).
import crypto from 'node:crypto';
export const newCvv = () => String(crypto.randomInt(0, 1000)).padStart(3, '0');
export const newSecret = (n = 32) => crypto.randomBytes(n).toString('hex');
export function hashSecret(v) { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(String(v), salt, 32).toString('hex') }; }
export function verifySecret(v, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const a = crypto.scryptSync(String(v), rec.salt, 32), b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const tokId = t => crypto.createHash('sha256').update('id:' + t).digest('hex');
const tokKey = t => crypto.createHash('sha256').update('key:' + t).digest();
export function seal(token, plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', tokKey(token), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return { id: tokId(token), iv: iv.toString('hex'), ct: ct.toString('hex'), tag: c.getAuthTag().toString('hex') };
}
export function unseal(token, r) {
  const d = crypto.createDecipheriv('aes-256-gcm', tokKey(token), Buffer.from(r.iv, 'hex')); d.setAuthTag(Buffer.from(r.tag, 'hex'));
  return Buffer.concat([d.update(Buffer.from(r.ct, 'hex')), d.final()]).toString('utf8');
}
export const findByToken = (list, token) => list.find(r => r.id === tokId(token));
