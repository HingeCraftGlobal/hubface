// One-time go-live seed (run as root before starting the service). Prints no secrets.
import * as S from './service.mjs';
await S.openDb(process.env.PASSPORT_DB);
const base = { issued: '2026-10-23', expires: '2027-10-23', rooms_completed: 0, verified_rooms: 0, disputes: 0 };
S.seedPassports([
  { ...base, passport_no: 'A0001-6357F', bot_name: 'Stella', title: "Buyer's Agent", role: 'Buyer (bot)', owner: 'Sarah', owner_email: 'sarah@hingecraft-global.ai', sponsor: 'Sarah', origin: 'As submitted by Sarah', rooms: 'YODA-STELLA-1023-2046' },
  { ...base, passport_no: 'A0002-7584W', bot_name: 'Yoda', title: 'Room Host · Lead Moderator', role: 'AI Moderator & Negotiator', owner: 'Dan Diotte', owner_email: 'dan@hingecraft-global.ai', sponsor: 'Dan Diotte', origin: 'Ottawa, Canada', rooms: '*', photo: 'A0002-7584W.jpg' },
]);
console.log('seeded');
process.exit(0);
