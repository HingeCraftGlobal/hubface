// latency-20261026: Bot Room latency summary. usage: node /opt/hubface/server/brlat.mjs [ROOM]
import fs from 'node:fs';
const room=(process.argv[2]||'').toUpperCase(); let rows=[];
try{rows=fs.readFileSync('/var/lib/hubface/brchat-latency.jsonl','utf8').trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(x=>x&&(!room||x.room===room));}catch{console.log('no data yet');process.exit(0);}
const et=t=>new Date(t).toLocaleTimeString('en-US',{timeZone:'America/New_York'});
const R=rows.filter(x=>x.k==='reply'&&x.lat_ms!=null),pc=(a,p)=>{if(!a.length)return'-';const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))]+'ms'};
for(const k of ['fast','routine']){const v=R.filter(x=>x.route===k).map(x=>x.lat_ms);console.log(`${k.padEnd(8)} n=${v.length} p50=${pc(v,.5)} p90=${pc(v,.9)} max=${v.length?Math.max(...v)+'ms':'-'}`);}
console.log('\nlast 20 (ET):');for(const x of rows.slice(-20))console.log(x.at?et(x.at):'        ',x.room,x.k,x.id,x.route||x.via||'',x.k==='reply'?`reply_to ${x.reply_to} lat ${x.lat_ms}ms`:x.k==='owner'?`upload ${x.upload_ms}ms`:x.k==='fastlane'?`${x.answered?'answered':'-> routine'} ${x.ms}ms`:'');
