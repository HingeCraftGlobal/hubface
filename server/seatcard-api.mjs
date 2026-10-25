// seatcard-api-20261023a (Dan approved Oct 23, 3:43 PM ET): GET/PUT /api/account/seatcard, per-account seat card.
//   GET -> 200 {ok, card|null} | 401      PUT {card} -> 200 {ok} | 400 | 401 | 403 | 413 | 429
// Keyed server-side by the signed-in account's email (sha256(lower(email)) as filename in /var/lib/hubface/seatcards).
// The email is read only here (read-only accounts.db), never returned and never stored inside the card. Only whitelisted non-contact fields kept.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import Database from 'better-sqlite3';
export const SEATCARD_BUILD = 'seatcard-api-20261023a';
const ROOT = process.env.HUBFACE_DATA || '/var/lib/hubface', DIR = path.join(ROOT, 'seatcards');
const DB = process.env.HUBFACE_DB || path.join(ROOT, 'accounts.db');
let emailQ = null; try { emailQ = new Database(DB, { readonly: true, fileMustExist: true }).prepare('SELECT email FROM users WHERE id = ?'); } catch { emailQ = null; }
const KEEP = ['kind','nameMode','realName','avatarName','role','owner','limits','age','nationality','gender','icon','avatarIcon','color'];
function clean(c){const o={};for(const k of KEEP){const v=c?.[k];if(v==null||v==='')continue;o[k]=(k==='icon'||k==='avatarIcon')?String(v).slice(0,400000):String(v).slice(0,200);}
  if(o.kind!=='bot'&&o.kind!=='human')delete o.kind;if(o.gender&&!['Male','Female','Other'].includes(o.gender))delete o.gender;
  if(o.nameMode!=='avatar')o.nameMode='real';if(o.icon&&!/^(data:image\/|\/|https:\/\/)/.test(o.icon))delete o.icon;if(o.avatarIcon&&!/^(data:image\/|\/|https:\/\/)/.test(o.avatarIcon))delete o.avatarIcon;
  for(const k of Object.keys(o))if(k!=='icon'&&k!=='avatarIcon'&&/@[^\s]+\.[a-z]{2,}/i.test(o[k]))delete o[k];return o;}
const hits=new Map();function limited(k,max){const n=Date.now(),a=(hits.get(k)||[]).filter(t=>n-t<60e3);if(a.length>=max){hits.set(k,a);return true;}a.push(n);hits.set(k,a);return false;}
export function isSeatcardPath(p){return p==='/api/account/seatcard';}
export async function seatcardRoute(q,r,p,{who,readBody,json,ip}){
  if(!isSeatcardPath(p))return false;r.setHeader('Cache-Control','no-store');
  const u=who(q);if(!u||!u.id)return json(r,401,{error:'sign in'}),true;
  let email=null;try{email=emailQ&&emailQ.get(u.id)?.email;}catch{}if(!email)return json(r,401,{error:'sign in'}),true;
  const f=path.join(DIR,crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex')+'.json');email=null;
  const key=u.id+'|'+(ip?ip(q):'');
  if(q.method==='GET'){if(limited('g'+key,120))return json(r,429,{error:'slow down'}),true;let card=null;try{card=clean(JSON.parse(fs.readFileSync(f,'utf8')));}catch{}return json(r,200,{ok:true,card}),true;}
  if(q.method==='PUT'){if(limited('p'+key,40))return json(r,429,{error:'slow down'}),true;
    const o=q.headers.origin||'';if(o&&o!=='https://hubface.org')return json(r,403,{error:'origin'}),true;
    let b;try{b=await readBody(q);}catch{return json(r,413,{error:'too big'}),true;}if(b.length>900000)return json(r,413,{error:'too big'}),true;
    let j;try{j=JSON.parse(b.toString('utf8')||'{}');}catch{return json(r,400,{error:'bad json'}),true;}
    fs.mkdirSync(DIR,{recursive:true,mode:0o700});const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(clean(j.card)),{mode:0o600});fs.renameSync(tmp,f);return json(r,200,{ok:true}),true;}
  return json(r,405,{error:'method'}),true;}
