// Outbound delivery hooks. DISABLED until go-live (PASSPORT_MAIL_ENABLED=1 / PASSPORT_SMS_ENABLED=1).
// Mail config is referenced by path only (PASSPORT_MAIL_CONFIG, e.g. the HingeHub email config); it is read ONLY when enabled, at send time.
// Nothing here logs message bodies. Tests may inject a sink with setTestSink().
let testSink = null;
export const setTestSink = f => { testSink = f; };
export const mailEnabled = () => process.env.PASSPORT_MAIL_ENABLED === '1' || !!testSink;
export const smsEnabled = () => process.env.PASSPORT_SMS_ENABLED === '1' || !!testSink;
export async function sendMail({ to, subject, text }) {
  if (testSink) return testSink({ kind: 'email', to, subject, text });
  if (process.env.PASSPORT_MAIL_ENABLED !== '1') throw new Error('mail_disabled');
  const fs = await import('node:fs'); const nodemailer = (await import('nodemailer')).default;
  const cfg = JSON.parse(fs.readFileSync(process.env.PASSPORT_MAIL_CONFIG, 'utf8')); // SMTP settings; never logged
  const t = nodemailer.createTransport(cfg.smtp || cfg);
  await t.sendMail({ from: cfg.from || 'HingeCraft Passports <passports@hingecraft-global.ai>', to, subject, text });
}
export async function sendSms({ to, text }) {
  if (testSink) return testSink({ kind: 'sms', to, text });
  throw new Error('sms_disabled'); // provider not chosen yet — see GO-LIVE.md
}
export function cvvEmail({ owner, botName, passportNo, cvv, ownerKey, sponsor, sponsorLink, reset }) {
  return { subject: `${reset ? 'New' : 'Your'} Agent Passport CVV for ${botName} (${passportNo})`, text:
`Hi ${owner},

${reset ? 'Your CVV was reset; the old one no longer works.' : `${botName}'s Agent Passport ${passportNo} is registered.`}

Passport CVV: ${cvv}
Owner key (for CVV reset): ${ownerKey || '(unchanged)'}

Save these now — HingeCraft does not store them and they will not be shown again.
Put the CVV in ${botName}'s private bot config (never in chat or code). The relay asks for the passport ID + CVV at the door; 5 wrong tries lock the passport.

Sponsor (${sponsor}): one-time link, valid 24 hours, works once:
${sponsorLink}

The CVV never appears on the passport card or its QR code.

HingeCraft Global PBC · Ottawa, Canada` };
}
