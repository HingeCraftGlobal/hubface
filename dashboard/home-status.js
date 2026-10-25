/* homestatus-20261021b (Dan, Oct 21 2026): Home Status build-out. Page-side only.
   - Small Home Status box (data-float=home-status): honest summary tiles (Front door, Thermostat, Guest mode, Energy) + "Open floor plan".
   - Floor-plan panel (data-float=home-plan, glass, adopted by __float/__boxMin/__boxSize/__fog): floor tabs, draggable/renamable rooms,
     devices attached to rooms, side menu with controls, draggable camera/doorbell icons with live-feed panel, lock, thermostat, guest mode,
     energy tile, "Oura" wearables section (rings, collars for pets, children, robots).
   - NO real integrations exist. Every state is "Demo" (local only, nothing in your house changes) or "Not connected".
     Energy never invents numbers. Real integrations plug in via window.__homeStatus.registerAdapter({...}) (see ADAPTER below).
   - Layout persists in localStorage 'hf.homestatus.v1'. Roll back: remove the <script src="home-status.js"> tag. */
(function(){
'use strict';
if(window.__homeStatus)return;
var BUILD='floorplan-20261024b',KEY='hf.homestatus.v1';
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function uid(p){return (p||'i')+Math.random().toString(36).slice(2,8);}
/* ---------- device adapter ----------
   An adapter: {id,name,connected:()=>bool, getState(dev)->Promise<state|null>, command(dev,cmd,val)->Promise, stream(dev)->url|null, energyToday()->Promise<{kwh,watts}|null>}
   Only the built-in 'demo' adapter exists today; it never claims to read the real house. */
var ADAPTERS={demo:{id:'demo',name:'Demo (local only)',connected:function(){return false;},
  getState:function(){return Promise.resolve(null);},command:function(){return Promise.resolve({demo:true});},
  stream:function(d){return d.url||null;},energyToday:function(){return Promise.resolve(null);}}};
var TYPES={tv:['TV','📺',['power']],alexa:['Alexa','🔵',['power','volume']],stereo:['Stereo','🔊',['power','volume']],
  light:['Lights','💡',['power','dim']],fan:['Fan','🌀',['power','speed']],plug:['Smart plug','🔌',['power']],
  speaker:['Speaker','🎵',['power','volume']],blinds:['Blinds','🪟',['level']],
  ring:['Oura ring','💍',['wear']],collar:['Collar','🐾',['wear']]};
var OURA_TYPES=['ring','collar'];
function defState(){return {floors:[
  {id:'f1',name:'Main floor',rooms:[{id:uid('r'),name:'Living room',x:20,y:20,w:150,h:90},{id:uid('r'),name:'Dining room',x:190,y:20,w:120,h:90},{id:uid('r'),name:'Kitchen',x:20,y:130,w:130,h:80},{id:uid('r'),name:'Bathroom',x:170,y:130,w:90,h:70}],cams:[]},
  {id:'f2',name:'Upstairs',rooms:[{id:uid('r'),name:'Bedroom 1',x:20,y:20,w:130,h:90},{id:uid('r'),name:'Bedroom 2',x:170,y:20,w:130,h:90},{id:uid('r'),name:'Bathroom',x:20,y:130,w:90,h:70}],cams:[]},
  {id:'f3',name:'Basement',rooms:[],cams:[]}],cur:'f1',devices:[],wear:[],
  lock:{locked:null},thermo:{set:21,mode:'off',unit:'C'},guest:{on:false,devices:[]},meter:{adapter:null}};}
var S;try{S=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){S=null;}
if(!S||!S.floors)S=defState();S.wear=S.wear||[];S.tracked=S.tracked||[];
function saveLocalOnly(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
/* homeplan-20261024a: server copy per signed-in account (/api/account/home-plan). Server wins on load; local plan is uploaded if the server has none; saves PUT (debounced) only after the server copy was checked, so a fresh/blank browser can never overwrite it. */
var HP_LOCAL=!!localStorage.getItem(KEY),HP_READY=false,HP_T=null,HP_ACC=false;
function hpPut(force){if(!HP_READY||!HP_ACC)return;clearTimeout(HP_T);HP_T=setTimeout(function(){try{fetch('/api/account/home-plan',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:S,force:!!force})}).then(function(r){if(r.status===409)console.warn('[home-plan] server kept your populated plan instead of an empty one');}).catch(function(){});}catch(e){}},800);}
function save(){saveLocalOnly();hpPut(false);}
try{fetch('/api/account/home-plan',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
  if(!j||!j.authenticated){HP_READY=true;return;}HP_ACC=true;
  if(j.plan&&j.plan.floors){S=j.plan;S.wear=S.wear||[];S.tracked=S.tracked||[];saveLocalOnly();HP_READY=true;try{render();}catch(e){}}
  else{HP_READY=true;if(HP_LOCAL)hpPut(false);}
}).catch(function(){HP_READY=true;});}catch(e){HP_READY=true;}
function floor(){return S.floors.filter(function(f){return f.id===S.cur;})[0]||S.floors[0];}
function room(id){var r=null;S.floors.forEach(function(f){f.rooms.forEach(function(x){if(x.id===id)r=x;});});return r;}
function adapterOf(d){return ADAPTERS[(d&&d.adapter)||'demo']||ADAPTERS.demo;}
function badge(d){var a=adapterOf(d);return a.connected()?'<em class="hsb on">'+esc(a.name)+'</em>':'<em class="hsb">Demo · not connected</em>';}
/* ---------- css ---------- */
var css=document.createElement('style');css.id='homeStatusCss';css.textContent=
'#ui .hsbd .leaflet-container{background:#1b2230}#ui .hsmapw{isolation:isolate;z-index:0}#ui .hsbd,#ui .hsbd *,#ui .hsmini,#ui .hsmini *{pointer-events:auto!important}.hsg{background:rgba(255,255,255,var(--glass-a,.085));border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(var(--glass-b,14px)) saturate(1.15);-webkit-backdrop-filter:blur(var(--glass-b,14px)) saturate(1.15);border-radius:10px;color:#fff}'+
'#ui section[data-float=home-status] .hsmini{position:absolute;left:8px;right:8px;top:30px;bottom:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;overflow:hidden}'+
'.hsmini .t{padding:3px 5px;cursor:pointer;line-height:1.2;overflow:hidden}.hsmini .t b{display:block;font-size:9.5px;opacity:.8}.hsmini .t:hover{background:rgba(255,255,255,.16)}'+
'.hsmini .open{grid-column:1/3;text-align:center;font-weight:700}'+
'#ui section[data-float=home-plan]{min-width:520px;min-height:360px}'+
'.hsbd{position:absolute;left:8px;right:8px;top:30px;bottom:8px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:#fff;overflow:hidden}'+
'.hsbar{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.hsbar button,.hsbd button{all:unset;cursor:pointer;padding:3px 8px;border-radius:7px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);font-size:11.5px;white-space:nowrap}'+
'.hsbd button:hover{background:rgba(255,255,255,.24)}.hsbar button.on{background:rgba(120,180,255,.38)}.hsbd button.warn{background:rgba(255,120,90,.3)}'+
'.hsmain{flex:1;display:flex;gap:6px;min-height:0}.hscanvas{position:relative;flex:1;min-height:0;overflow:auto;border-radius:8px;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:20px 20px;border:1px dashed rgba(255,255,255,.2)}'+
'.hsroom{position:absolute;box-sizing:border-box;padding:4px 6px;border-radius:8px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);cursor:grab;touch-action:none;user-select:none;overflow:hidden;font-size:11.5px}'+
'.hsroom.sel{outline:2px solid #8cf}.hsroom b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hsroom .dv{font-size:13px;letter-spacing:1px}'+
'.hsroom .rz{position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize;border-right:2px solid #fff8;border-bottom:2px solid #fff8;z-index:2}'+'.hsroom .rh{position:absolute;z-index:1}.hsroom .rh[data-e=n]{top:0;left:10px;right:10px;height:6px;cursor:ns-resize}.hsroom .rh[data-e=s]{bottom:0;left:10px;right:10px;height:6px;cursor:ns-resize}'+'.hsroom .rh[data-e=w]{left:0;top:10px;bottom:10px;width:6px;cursor:ew-resize}.hsroom .rh[data-e=e]{right:0;top:10px;bottom:10px;width:6px;cursor:ew-resize}'+'.hsroom .rh[data-e=nw]{left:0;top:0;width:10px;height:10px;cursor:nwse-resize}.hsroom .rh[data-e=ne]{right:0;top:0;width:10px;height:10px;cursor:nesw-resize}.hsroom .rh[data-e=sw]{left:0;bottom:0;width:10px;height:10px;cursor:nesw-resize}'+'.hsbh{position:absolute;z-index:6;width:22px;height:22px;margin:-20px 0 0 -20px;cursor:nwse-resize;border-radius:5px;background:#123a8c;border:1px solid #cfe3ff;box-shadow:0 1px 4px rgba(0,0,0,.6);touch-action:none;background-image:linear-gradient(135deg,transparent 46%,#fff 46%,#fff 54%,transparent 54%),linear-gradient(135deg,transparent 71%,#fff 71%,#fff 79%,transparent 79%)}.hsroom.lk{cursor:move}'+
'.hsroom .rh:hover{background:rgba(140,204,255,.35)}.hsroom.lk{cursor:default}'+'.hsbar button.hsplk{font-size:13px;font-weight:600;padding:4px 10px;color:#fff;background:rgba(20,40,90,.55);border-color:rgba(160,200,255,.5)}.hsbar button.hsplk.on{background:#123a8c;border-color:#8cf}'+
'.hscam{position:absolute;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:16px;background:rgba(0,0,0,.45);border:1px solid #fff6;cursor:grab;touch-action:none;z-index:2}'+
'.hsside{width:220px;flex:none;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:6px}.hsside h4{margin:0;font-size:12.5px;display:flex;gap:6px;align-items:center}.hsside h4 span{flex:1}'+
'.hsrow{display:flex;align-items:center;gap:5px;padding:3px 0;border-top:1px solid rgba(255,255,255,.1)}.hsrow>span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hsrow input[type=range]{width:70px}'+
'.hsb{font-style:normal;font-size:9.5px;padding:1px 5px;border-radius:6px;background:rgba(255,200,80,.25);border:1px solid rgba(255,200,80,.5);white-space:nowrap}.hsb.on{background:rgba(80,220,120,.3)}'+
'.hstiles{display:flex;gap:6px}.hstiles .hst{flex:1;padding:5px 7px;cursor:pointer;min-width:0}.hstiles .hst b{display:block;font-size:10.5px;opacity:.8}'+
'.hspal{display:flex;gap:4px;align-items:center}.hspal .hscam{position:static}'+
'.hsdlg{position:absolute;inset:0;z-index:2000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:5}.hsdlg>div{width:min(380px,92%);max-height:96%;overflow:auto;box-sizing:border-box;padding:10px;display:flex;flex-direction:column;gap:8px;background:rgba(30,40,60,.85)}'+
'.hsdlg input,.hsdlg select,.hsside select,.hsside input[type=text]{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:3px 6px;font:inherit}.hsdlg option,.hsside option{color:#000}'+
'.hsfeed{aspect-ratio:16/9;max-height:150px;background:#000;border-radius:6px;display:grid;place-items:center;overflow:hidden;color:#bbb}.hsfeed video,.hsfeed img,.hsfeed iframe{width:100%;height:100%;object-fit:cover;border:0}';
(document.head||document.documentElement).appendChild(css);
/* ---------- small box ---------- */
function small(){return document.querySelector('#ui > section[data-float="home-status"]');}
function miniHtml(){var l=S.lock.locked,e='Connect a meter';
 return '<div class="t hsg" data-a="lock"><b>Front door</b>Not connected</div><div class="t hsg" data-a="thermo"><b>Thermostat</b>Not connected</div>'+
 '<div class="t hsg" data-a="guest"><b>Guest mode</b>'+(S.guest.on?'Armed (demo)':'Off')+'</div><div class="t hsg" data-a="energy"><b>Energy today</b>'+e+'</div>'+
 '<div class="t hsg open" data-a="plan">Open floor plan ›</div>';}
function syncSmall(){var b=small();if(!b)return;var old=b.querySelector(':scope > .rows.kv');if(old)old.remove();
 var sm=b.querySelector(':scope > header em.sample');if(sm&&sm.textContent!=='Demo'){sm.textContent='Demo';sm.title='No smart-home devices are connected. Everything here is demo / not connected.';}
 var m=b.querySelector(':scope > .hsmini');if(!m){m=document.createElement('div');m.className='hsmini';b.appendChild(m);
  m.addEventListener('pointerdown',function(e){e.stopPropagation();});
  m.addEventListener('click',function(e){var t=e.target.closest('[data-a]');if(!t)return;openPlan();var a=t.dataset.a;if(a==='lock')lockDlg();else if(a==='thermo')thermoDlg();else if(a==='guest')guestDlg();else if(a==='energy')energyDlg();});}
 /*widgetflash-fix-20261024: was m.innerHTML=miniHtml() every 1.5s, wiping the tray camresize adds -> tiles flashed; now rebuild only when content changes, keeping .hstray*/
 var mh=miniHtml();if(m._hsHtml===mh&&m.querySelector(':scope > .t'))return;m._hsHtml=mh;var tr=m.querySelector(':scope > .hstray');
 [].slice.call(m.children).forEach(function(c){if(c!==tr)c.remove();});m.insertAdjacentHTML('beforeend',mh);
 if(tr)m.insertBefore(tr,m.firstChild);
 try{[].forEach.call(m.querySelectorAll(':scope > .t[data-a=lock],:scope > .t[data-a=thermo],:scope > .t[data-a=guest],:scope > .t[data-a=energy]'),function(e){if(tr)e.style.display='none';});}catch(e){}}
/* ---------- big panel ---------- */
var P=null,sel=null,view='plan',MAP=null,MAPL=null;
var IC={fog:'<svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 18.5h10.5a4.2 4.2 0 0 0 .6-8.35A6.2 6.2 0 0 0 6.3 9.3 4.6 4.6 0 0 0 7 18.5z"/></svg>',
 exp:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/></svg>',
 min:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h5V4M9 9 3.5 3.5M20 9h-5V4M15 9l5.5-5.5M4 15h5v5M9 15l-5.5 5.5M20 15h-5v5M15 15l5.5 5.5"/></svg>',
 x:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'};
function openPlan(){var ui=document.getElementById('ui');if(!ui)return null;
 if(P&&P.isConnected){P.classList.remove('collapsed');P.style.display='';render();return P;}
 var UW=ui.offsetWidth||innerWidth,UH=ui.offsetHeight||innerHeight,W=Math.min(820,Math.max(560,Math.round(UW*.66))),H=Math.min(560,Math.max(380,Math.round(UH*.7)));
 var x=Math.max(10,Math.round((UW-W)/2)),y=Math.max(50,Math.round((UH-H)/2));
 P=document.createElement('section');P.className='box hsplan';P.setAttribute('data-float','home-plan');
 P.style.cssText='left:'+x+'px;top:'+y+'px;width:'+W+'px;height:'+H+'px';
 P.innerHTML='<header><b>HOME PLAN</b><em class="sample" title="No smart-home devices connected">Demo</em></header>'+
  '<span class="ctl fogbtn" role="button" title="Auto fog" aria-pressed="false" style="left:'+(W-81)+'px;top:10px">'+IC.fog+'</span><span class="ctl" style="left:'+(W-64)+'px;top:10px">'+IC.exp+'</span><span class="ctl" style="left:'+(W-47)+'px;top:10px">'+IC.min+'</span>'+
  '<span class="ctl x boxclose hsclose" role="button" title="Close floor plan" aria-label="Close floor plan" style="left:'+(W-29)+'px;top:6.5px">'+IC.x+'</span>'+
  '<div class="fogpop af" style="left:'+(W-151)+'px;top:30px"><b>FOG</b><em>AUTO</em><span class="pct">--</span><div class="trk"><div class="fill" style="width:0%"></div><div class="knob" style="left:0%"></div></div></div><i class="pin af" style="left:'+(W-77)+'px;top:26px"></i><div class="hsbd"></div>';
 ui.appendChild(P);
 try{window.__float.adopt(P);}catch(e){}try{window.__boxMin.adopt(P);}catch(e){}try{window.__boxSize.adopt(P);}catch(e){}try{window.__fog.adopt(P.querySelector('.fogbtn'));}catch(e){}
 P.querySelector('.hsclose').addEventListener('click',function(e){e.stopPropagation();P.style.display='none';},true);
 var bd=P.querySelector('.hsbd');bd.addEventListener('pointerdown',function(e){if(!e.target.closest('.hsroom,.hscam'))e.stopPropagation();});
 bd.addEventListener('click',onClick);bd.addEventListener('input',onInput);bd.addEventListener('change',onInput);
 render();return P;}
function bd(){return P&&P.querySelector('.hsbd');}
function render(){var b=bd();if(!b)return;var f=floor(),st=b.querySelector('.hsside');var sc=st?st.scrollTop:0;
 var h='<div class="hsbar">'+S.floors.map(function(x){return '<button data-a="floor" data-id="'+x.id+'" class="'+(x.id===f.id?'on':'')+'">'+esc(x.name)+'</button>';}).join('')+
  '<button data-a="addfloor" title="Add a floor">+ Floor</button><button data-a="renfloor" title="Rename this floor">✎</button><button data-a="delfloor" title="Remove this floor">🗑</button><button data-a="planlock" class="hsplk'+(S.planLock?' on':'')+'" title="'+(S.planLock?'Plan locked: rooms cannot move or resize. Click to unlock':'Lock rooms in place (devices can still move)')+'">'+(S.planLock?'🔒 Locked':'🔓 Unlocked')+'</button><button data-a="savefp" class="hssave" title="Save floor plan">💾 Save</button>'+
  '<span style="flex:1"></span><button data-a="tracked" class="'+(view==='tracked'?'on':'')+'">📍 Tracked</button><button data-a="addroom">+ Room</button><span class="hspal" title="Drag onto the plan"><span class="hscam" data-pal="camera">📷</span><span class="hscam" data-pal="doorbell">🔔</span></span></div>';
 if(view==='tracked'){h+=trackedHtml();b.innerHTML=h+tilesHtml();mountMap();syncSmall();return;}
 h+='<div class="hsmain"><div class="hscanvas">';
 f.rooms.forEach(function(r){var ds=S.devices.filter(function(d){return d.room===r.id;});
  h+='<div class="hsroom'+(sel===r.id?' sel':'')+(S.planLock?' lk':'')+'" data-room="'+r.id+'" style="left:'+r.x+'px;top:'+r.y+'px;width:'+r.w+'px;height:'+r.h+'px"><b title="Click to name this room" style="cursor:text">'+esc(r.name)+'</b><div class="dv">'+ds.map(function(d){return (TYPES[d.type]||['','•'])[1];}).join('')+'</div>'+(S.planLock?'':'<i class="rh" data-e="n"></i><i class="rh" data-e="s"></i><i class="rh" data-e="w"></i><i class="rh" data-e="e"></i><i class="rh" data-e="nw"></i><i class="rh" data-e="ne"></i><i class="rh" data-e="sw"></i><i class="rz" data-e="se"></i>')+'</div>';});
 if(S.planLock&&f.rooms.length){var bb=fpBox(f.rooms);h+='<div class="hsbh" title="Drag to scale the whole building" style="left:'+(bb.x+bb.w)+'px;top:'+(bb.y+bb.h)+'px"></div>';}
 (f.cams||[]).forEach(function(c){h+='<div class="hscam" data-cam="'+c.id+'" title="'+esc(c.name)+' — tap for live feed" style="left:'+c.x+'px;top:'+c.y+'px">'+(c.kind==='doorbell'?'🔔':'📷')+'</div>';});
 h+='</div><div class="hsside hsg">'+side()+'</div></div>';
 h+=tilesHtml();
 b.innerHTML=h;var st2=b.querySelector('.hsside');if(st2)st2.scrollTop=sc;wire();syncSmall();}
function tilesHtml(){var h='';h+='<div class="hstiles"><div class="hst hsg" data-a="lock"><b>Front door lock</b>'+'Not connected'+(S.lock.locked==null?'':' · '+(S.lock.locked?'locked':'unlocked')+' <em class="hsb">Demo</em>')+'</div>'+
  '<div class="hst hsg" data-a="thermo"><b>Thermostat</b>Not connected · set '+S.thermo.set+'°'+S.thermo.unit+' '+esc(S.thermo.mode)+' <em class="hsb">Demo</em></div>'+
  '<div class="hst hsg" data-a="guest"><b>Guest mode</b>'+(S.guest.on?'Armed <em class="hsb">Demo</em>':'Off')+'</div>'+
  '<div class="hst hsg" data-a="energy"><b>Energy today</b>Connect a meter</div></div>';return h;}
function side(){var r=sel&&room(sel);
 if(!r){return '<h4><span>Rooms</span></h4><div style="opacity:.8">Tap a room to see its devices and controls. Drag rooms to move, drag any edge or corner to resize (rooms snap flush and never overlap), click a room\'s name to name it. Use 🔓/🔒 to lock rooms in place.</div>'+
  '<div style="opacity:.75;font-size:11px">No smart-home devices are connected yet. Controls here are <b>demo only</b> — nothing in your house changes.</div>'+ouraHtml();}
 var ds=S.devices.filter(function(d){return d.room===r.id;});
 var h='<h4><span>'+esc(r.name)+'</span><button data-a="renroom">✎</button><button data-a="delroom" class="warn">🗑</button><button data-a="unsel">✕</button></h4>';
 if(!ds.length)h+='<div style="opacity:.75">No devices yet.</div>';
 ds.forEach(function(d){var t=TYPES[d.type]||['Device','•',['power']];
  h+='<div class="hsrow" data-dev="'+d.id+'"><span>'+t[1]+' '+esc(d.name)+'</span><button data-a="pow">'+(d.on?'On':'Off')+'</button><button data-a="deldev" title="Remove">✕</button></div>';
  if(t[2].indexOf('dim')>=0||t[2].indexOf('volume')>=0||t[2].indexOf('level')>=0||t[2].indexOf('speed')>=0)
   h+='<div class="hsrow" data-dev="'+d.id+'"><span style="opacity:.8">'+(t[2].indexOf('dim')>=0?'Dim':t[2].indexOf('volume')>=0?'Volume':t[2].indexOf('speed')>=0?'Speed':'Level')+'</span><input type="range" min="0" max="100" value="'+(d.lvl==null?50:d.lvl)+'" data-a="lvl"><span style="flex:none;width:28px">'+(d.lvl==null?50:d.lvl)+'</span></div>';
  h+='<div class="hsrow" data-dev="'+d.id+'" style="border:0;padding-top:0">'+badge(d)+'<label style="font-size:10px;opacity:.85"><input type="checkbox" data-a="garm" '+(S.guest.devices.indexOf(d.id)>=0?'checked':'')+'> in guest mode</label></div>';});
 h+='<div class="hsrow"><select data-a="newtype">'+Object.keys(TYPES).filter(function(k){return OURA_TYPES.indexOf(k)<0;}).map(function(k){return '<option value="'+k+'">'+TYPES[k][1]+' '+TYPES[k][0]+'</option>';}).join('')+'</select><button data-a="adddev">+ Attach device</button></div>';
 return h;}
function ouraHtml(){var h='<h4 style="margin-top:6px"><span>Oura</span><button data-a="addwear">+ Add</button></h4><div style="opacity:.75;font-size:11px">Wearables: rings, and collars for pets, children and robots.</div>';
 S.wear.forEach(function(w){h+='<div class="hsrow" data-wear="'+w.id+'"><span>'+(TYPES[w.type]||['','•'])[1]+' '+esc(w.name)+' <span style="opacity:.7">('+esc(w.who)+')</span></span><em class="hsb">Not connected</em><button data-a="delwear">✕</button></div>';});
 return h;}
function devById(id){return S.devices.filter(function(d){return d.id===id;})[0];}
function onClick(e){var t=e.target.closest('[data-a]');if(!t)return;var a=t.dataset.a,f=floor(),row=t.closest('[data-dev]'),d=row&&devById(row.dataset.dev);
 if(a==='tracked'){view=view==='tracked'?'plan':'tracked';}
 else if(a==='floor'){S.cur=t.dataset.id;sel=null;view='plan';}
 else if(a==='addtrk'){return trackDlg(t.dataset.k);}
 else if(a==='deltrk'){var tid=t.closest('[data-trk]').dataset.trk;S.tracked=S.tracked.filter(function(x){return x.id!==tid;});}
 else if(a==='refresh'){refreshTracked();return;}
 else if(a==='addfloor'){var n=prompt('Name the new floor','Floor '+(S.floors.length+1));if(!n)return;var nf={id:uid('f'),name:n.trim()||'Floor',rooms:[],cams:[]};S.floors.push(nf);S.cur=nf.id;sel=null;}
 else if(a==='renfloor'){var n2=prompt('Rename floor',f.name);if(!n2)return;f.name=n2.trim()||f.name;}
 else if(a==='delfloor'){if(S.floors.length<2)return alert('Keep at least one floor.');if(!confirm('Remove "'+f.name+'" and its rooms?'))return;var ids=f.rooms.map(function(r){return r.id;});S.devices=S.devices.filter(function(d){return ids.indexOf(d.room)<0;});S.floors=S.floors.filter(function(x){return x!==f;});S.cur=S.floors[0].id;sel=null;}
 else if(a==='planlock'){S.planLock=!S.planLock;}
 else if(a==='savefp'){save();t.textContent='Saved ✓';clearTimeout(t._st);t._st=setTimeout(function(){t.textContent='💾 Save';},1600);return;}
 else if(a==='addroom'){return roomPick(f);}
 else if(a==='renroom'){return nameDlg(room(sel));}
 else if(a==='delroom'){var rd=room(sel);if(!confirm('Remove "'+rd.name+'" and its devices?'))return;f.rooms=f.rooms.filter(function(x){return x.id!==sel;});S.devices=S.devices.filter(function(x){return x.room!==sel;});sel=null;}
 else if(a==='unsel')sel=null;
 else if(a==='adddev'){var ty=t.parentNode.querySelector('select').value,TT=TYPES[ty];var dn=prompt('Name this '+TT[0],TT[0]);if(dn==null)return;S.devices.push({id:uid('d'),type:ty,name:dn.trim()||TT[0],room:sel,on:false,lvl:50,adapter:'demo'});}
 else if(a==='pow'&&d){d.on=!d.on;adapterOf(d).command(d,'power',d.on);}
 else if(a==='deldev'&&d){S.devices=S.devices.filter(function(x){return x!==d;});}
 else if(a==='addwear'){wearDlg();return;}
 else if(a==='delwear'){var wid=t.closest('[data-wear]').dataset.wear;S.wear=S.wear.filter(function(w){return w.id!==wid;});}
 else if(a==='lock')return lockDlg();else if(a==='thermo')return thermoDlg();else if(a==='guest')return guestDlg();else if(a==='energy')return energyDlg();
 else return;save();render();}
function onInput(e){var t=e.target,a=t.dataset&&t.dataset.a,row=t.closest('[data-dev]'),d=row&&devById(row.dataset.dev);if(!d)return;
 if(a==='lvl'){d.lvl=+t.value;if(t.nextSibling)t.nextSibling.textContent=t.value;save();if(e.type==='change')adapterOf(d).command(d,'level',d.lvl);}
 else if(a==='garm'){var i=S.guest.devices.indexOf(d.id);if(t.checked&&i<0)S.guest.devices.push(d.id);if(!t.checked&&i>=0)S.guest.devices.splice(i,1);save();}}
/* floorplan-20261024a: rooms never overlap (per floor), snap flush edge-to-edge within FPT px, resize from any edge */
var FPT=12,FPMW=60,FPMH=40;
function fpOv(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;}
function fpHit(a,os){for(var i=0;i<os.length;i++)if(fpOv(a,os[i]))return os[i];return null;}
function fpNear(a1,a2,b1,b2){return a1<b2+FPT&&b1<a2+FPT;}
function fpSnapAxis(p,len,os,ax){var best=null,bd=FPT+1,L=ax==='x'?'w':'h',X=ax==='x'?'y':'x',XL=ax==='x'?'h':'w';
 os.forEach(function(o){var cs=[o[ax]+o[L],o[ax]-len,o[ax],o[ax]+o[L]-len];cs.forEach(function(c){var d=Math.abs(c-p);if(d<bd){bd=d;best=c;}});});return best==null?p:best;}
function fpMove(g,dx,dy,os){var q={x:Math.max(0,Math.round(g.x+dx)),y:Math.max(0,Math.round(g.y+dy)),w:g.w,h:g.h};
 var nx=os.filter(function(o){return fpNear(q.y,q.y+q.h,o.y,o.y+o.h);}),ny=os.filter(function(o){return fpNear(q.x,q.x+q.w,o.x,o.x+o.w);});
 q.x=Math.max(0,fpSnapAxis(q.x,q.w,nx,'x'));q.y=Math.max(0,fpSnapAxis(q.y,q.h,ny,'y'));
 for(var it=0;it<6;it++){var o=fpHit(q,os);if(!o)return q;   /* push out to nearest flush side */
  var c=[{x:o.x-q.w,y:q.y},{x:o.x+o.w,y:q.y},{x:q.x,y:o.y-q.h},{x:q.x,y:o.y+o.h}].filter(function(p){return p.x>=0&&p.y>=0;});
  c.sort(function(a,b){return (Math.abs(a.x-q.x)+Math.abs(a.y-q.y))-(Math.abs(b.x-q.x)+Math.abs(b.y-q.y));});
  var ok=null;for(var i=0;i<c.length;i++){var t={x:c[i].x,y:c[i].y,w:q.w,h:q.h};if(!fpHit(t,os)){ok=t;break;}}if(ok)return ok;if(!c.length)return null;q.x=c[0].x;q.y=c[0].y;}
 return fpHit(q,os)?null:q;}
function fpResize(g,ed,dx,dy,os){var l=g.x,t=g.y,r=g.x+g.w,b=g.y+g.h;
 if(ed.indexOf('w')>=0)l=Math.max(0,Math.min(r-FPMW,Math.round(g.x+dx)));if(ed.indexOf('e')>=0)r=Math.max(l+FPMW,Math.round(r+dx));
 if(ed.indexOf('n')>=0)t=Math.max(0,Math.min(b-FPMH,Math.round(g.y+dy)));if(ed.indexOf('s')>=0)b=Math.max(t+FPMH,Math.round(b+dy));
 function sn(v,os2,ax){var best=v,bd=FPT+1,L=ax==='x'?'w':'h';os2.forEach(function(o){[o[ax],o[ax]+o[L]].forEach(function(c){var d=Math.abs(c-v);if(d<bd){bd=d;best=c;}});});return best;}
 var vx=os.filter(function(o){return fpNear(t,b,o.y,o.y+o.h);}),vy=os.filter(function(o){return fpNear(l,r,o.x,o.x+o.w);});
 if(ed.indexOf('w')>=0){var nl=sn(l,vx,'x');if(nl<=r-FPMW)l=nl;}if(ed.indexOf('e')>=0){var nr=sn(r,vx,'x');if(nr>=l+FPMW)r=nr;}
 if(ed.indexOf('n')>=0){var nt=sn(t,vy,'y');if(nt<=b-FPMH)t=nt;}if(ed.indexOf('s')>=0){var nb=sn(b,vy,'y');if(nb>=t+FPMH)b=nb;}
 var q={x:l,y:t,w:r-l,h:b-t};
 for(var it=0;it<4;it++){var o=fpHit(q,os);if(!o)return q;   /* clamp the moving edge flush against the room it hit */
  if(ed.indexOf('e')>=0&&g.x+g.w<=o.x)r=o.x;else if(ed.indexOf('w')>=0&&g.x>=o.x+o.w)l=o.x+o.w;else if(ed.indexOf('s')>=0&&g.y+g.h<=o.y)b=o.y;else if(ed.indexOf('n')>=0&&g.y>=o.y+o.h)t=o.y+o.h;else return null;
  if(r-l<FPMW||b-t<FPMH)return null;q={x:l,y:t,w:r-l,h:b-t};}
 return fpHit(q,os)?null:q;}
/* floorplan-20261024b: whole-building move/scale (rooms + cams), anchored top-left, clamped to plan area */
function fpBox(rs){var l=1e9,t=1e9,r=-1e9,b=-1e9;rs.forEach(function(o){l=Math.min(l,o.x);t=Math.min(t,o.y);r=Math.max(r,o.x+o.w);b=Math.max(b,o.y+o.h);});return {x:l,y:t,w:r-l,h:b-t};}
function fpSnap(f){var c=cv();return {b:fpBox(f.rooms),rs:f.rooms.map(function(o){return {o:o,x:o.x,y:o.y,w:o.w,h:o.h};}),cs:(f.cams||[]).map(function(o){return {o:o,x:o.x,y:o.y};}),W:c?c.offsetWidth:1e4,H:c?c.offsetHeight:1e4};}
function fpXform(f,bx,dx,dy,s1){var B=bx.b,mw=1e9,mh=1e9;bx.rs.forEach(function(q){mw=Math.min(mw,q.w);mh=Math.min(mh,q.h);});
 var smin=Math.max(30/mw,20/mh,80/B.w,60/B.h),smax=Math.min(Math.max(1,(bx.W-B.x)/B.w),Math.max(1,(bx.H-B.y)/B.h));if(smin>1)smin=Math.min(smin,1);s1=Math.max(smin,Math.min(smax,s1));
 var ax=Math.max(0,Math.min(Math.max(0,bx.W-B.w*s1),B.x+dx)),ay=Math.max(0,Math.min(Math.max(0,bx.H-B.h*s1),B.y+dy));
 function X(v){return Math.round(ax+(v-B.x)*s1);}function Y(v){return Math.round(ay+(v-B.y)*s1);}
 bx.rs.forEach(function(q){var l=X(q.x),t=Y(q.y);q.o.x=l;q.o.y=t;q.o.w=X(q.x+q.w)-l;q.o.h=Y(q.y+q.h)-t;});   /* shared walls stay shared: edges map through the same function */
 bx.cs.forEach(function(q){q.o.x=Math.max(0,X(q.x));q.o.y=Math.max(0,Y(q.y));});}
function fpPaint(f){var c=cv();if(!c)return;f.rooms.forEach(function(o){var el=c.querySelector('.hsroom[data-room="'+o.id+'"]');if(el){el.style.left=o.x+'px';el.style.top=o.y+'px';el.style.width=o.w+'px';el.style.height=o.h+'px';}});
 (f.cams||[]).forEach(function(o){var el=c.querySelector('.hscam[data-cam="'+o.id+'"]');if(el){el.style.left=o.x+'px';el.style.top=o.y+'px';}});
 var h=c.querySelector('.hsbh');if(h&&f.rooms.length){var b=fpBox(f.rooms);h.style.left=(b.x+b.w)+'px';h.style.top=(b.y+b.h)+'px';}}
function fpFree(f,w,h){for(var y=20;y<2000;y+=10)for(var x=20;x<1200;x+=10){var q={x:x,y:y,w:w,h:h};if(!fpHit(q,f.rooms))return q;}return {x:20,y:20,w:w,h:h};}
/* drag rooms / cams / palette */
function sc(){var c=cv();return c&&c.offsetWidth?(c.getBoundingClientRect().width/c.offsetWidth)||1:1;}
function cv(){return bd()&&bd().querySelector('.hscanvas');}
function wire(){var c=cv();if(!c)return;
 [].forEach.call(c.querySelectorAll('.hsroom'),function(el){el.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.stopPropagation();e.preventDefault();var r=room(el.dataset.room),ed=(e.target.dataset&&e.target.dataset.e)||'';
   var nm=!!(e.target.closest&&e.target.closest('b'));if(S.planLock){ /* floorplan-20261024b: locked -> dragging any room moves the whole building */
     var f0=floor(),bx=fpSnap(f0),g0={sx:e.clientX,sy:e.clientY,m:false};try{el.setPointerCapture(e.pointerId);}catch(_){}
     function lm(ev){var k=sc(),dx=(ev.clientX-g0.sx)/k,dy=(ev.clientY-g0.sy)/k;if(!g0.m&&Math.abs(dx)<3&&Math.abs(dy)<3)return;g0.m=true;fpXform(f0,bx,dx,dy,1);fpPaint(f0);}
     function lu(){el.removeEventListener('pointermove',lm);el.removeEventListener('pointerup',lu);if(g0.m){save();render();}else{sel=r.id;render();if(nm)nameDlg(r);}}
     el.addEventListener('pointermove',lm);el.addEventListener('pointerup',lu);return;}
   var g={sx:e.clientX,sy:e.clientY,x:r.x,y:r.y,w:r.w,h:r.h,m:false,nm:nm},lv={x:r.x,y:r.y,w:r.w,h:r.h},oth=floor().rooms.filter(function(o){return o!==r;});try{el.setPointerCapture(e.pointerId);}catch(_){}
   function mv(ev){var k=sc(),dx=(ev.clientX-g.sx)/k,dy=(ev.clientY-g.sy)/k;if(!g.m&&Math.abs(dx)<3&&Math.abs(dy)<3)return;g.m=true;
    var q=ed?fpResize(g,ed,dx,dy,oth):fpMove(g,dx,dy,oth);if(q&&!fpHit(q,oth))lv=q;r.x=lv.x;r.y=lv.y;r.w=lv.w;r.h=lv.h;
    el.style.left=r.x+'px';el.style.top=r.y+'px';el.style.width=r.w+'px';el.style.height=r.h+'px';}
   function up(){el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);if(g.m)save();else{sel=r.id;render();if(g.nm)nameDlg(r);}}
   el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);});
  });
 var bh=c.querySelector('.hsbh');if(bh)bh.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.stopPropagation();e.preventDefault();var f0=floor(),bx=fpSnap(f0),sx=e.clientX,sy=e.clientY,m=false;try{bh.setPointerCapture(e.pointerId);}catch(_){}
   function hm(ev){var k=sc(),dx=(ev.clientX-sx)/k,dy=(ev.clientY-sy)/k;m=true;var s1=Math.max((bx.b.w+dx)/bx.b.w,(bx.b.h+dy)/bx.b.h);fpXform(f0,bx,0,0,s1);fpPaint(f0);}
   function hu(){bh.removeEventListener('pointermove',hm);bh.removeEventListener('pointerup',hu);if(m)save();render();}
   bh.addEventListener('pointermove',hm);bh.addEventListener('pointerup',hu);});
 [].forEach.call(c.querySelectorAll('.hscam[data-cam]'),function(el){el.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();var cm=(floor().cams||[]).filter(function(x){return x.id===el.dataset.cam;})[0];
   var g={sx:e.clientX,sy:e.clientY,x:cm.x,y:cm.y,m:false};try{el.setPointerCapture(e.pointerId);}catch(_){}
   function mv(ev){var k=sc(),dx=(ev.clientX-g.sx)/k,dy=(ev.clientY-g.sy)/k;if(!g.m&&Math.abs(dx)<3&&Math.abs(dy)<3)return;g.m=true;cm.x=Math.max(0,Math.round(g.x+dx));cm.y=Math.max(0,Math.round(g.y+dy));el.style.left=cm.x+'px';el.style.top=cm.y+'px';}
   function up(){el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);if(g.m)save();else feedDlg(cm);}
   el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);});});
 [].forEach.call(bd().querySelectorAll('.hspal .hscam'),function(el){el.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();var kind=el.dataset.pal;
   var ghost=el.cloneNode(true);ghost.style.cssText='position:fixed;z-index:99999;pointer-events:none;left:'+(e.clientX-15)+'px;top:'+(e.clientY-15)+'px';document.body.appendChild(ghost);
   function mv(ev){ghost.style.left=(ev.clientX-15)+'px';ghost.style.top=(ev.clientY-15)+'px';}
   function up(ev){document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);ghost.remove();var c2=cv(),R=c2.getBoundingClientRect();
    if(ev.clientX>=R.left&&ev.clientX<=R.right&&ev.clientY>=R.top&&ev.clientY<=R.bottom){var f=floor();f.cams=f.cams||[];var n=f.cams.filter(function(x){return x.kind===kind;}).length+1;
     f.cams.push({id:uid('c'),kind:kind,name:(kind==='doorbell'?'Doorbell ':'Camera ')+n,x:Math.round((ev.clientX-R.left)/sc()+c2.scrollLeft-15),y:Math.round((ev.clientY-R.top)/sc()+c2.scrollTop-15),url:'',adapter:'demo'});save();render();}}
   document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up);});});}
/* ---------- Tracked (vehicles, phones, pets, robots, Oura) ----------
   Locations come ONLY from a tracking adapter. Stubs below are not connected, so nothing gets a pin and no location is invented.
   Tracking adapter: {id,name,connected:()=>bool, locate(item)->Promise<{lat,lon,at(ms),status}|null>} */
var TRK={none:{id:'none',name:'No source',connected:function(){return false;},locate:function(){return Promise.resolve(null);}},
 tesla:{id:'tesla',name:'Tesla Fleet API',stub:true,connected:function(){return false;},locate:function(){return Promise.resolve(null);} /* needs OAuth + vehicle_data/location via a server proxy */},
 traccar:{id:'traccar',name:'Traccar',stub:true,connected:function(){return false;},locate:function(){return Promise.resolve(null);} /* needs server URL + token: GET /api/positions?deviceId= */},
 owntracks:{id:'owntracks',name:'OwnTracks',stub:true,connected:function(){return false;},locate:function(){return Promise.resolve(null);} /* needs an OwnTracks Recorder: /api/0/last?user=&device= */}};
var TSEC=[['vehicle','Vehicles','🚗'],['phone','Phones','📱'],['pet','Pets','🐾'],['robot','Robots','🤖']];
function fmtAgo(ms){if(!ms)return '—';var m=Math.round((Date.now()-ms)/60000);return m<1?'just now':m<60?m+' min ago':Math.round(m/60)+' h ago';}
function trkRow(it,icon){var A=TRK[it.adapter]||TRK.none,L=it.loc&&isFinite(it.loc.lat)&&isFinite(it.loc.lon)?it.loc:null,con=A.connected();
 return '<div class="hsrow" data-trk="'+it.id+'" style="flex-wrap:wrap"><span><b>'+icon+' '+esc(it.name)+'</b> <span style="opacity:.75">'+esc(it.kind||'')+'</span></span><em class="hsb'+(con?' on':'')+'">'+(con?esc(A.name):'Not connected')+'</em><button data-a="deltrk" title="Remove">✕</button>'+
  '<div style="flex-basis:100%;font-size:10.5px;opacity:.8">Status: '+esc(con&&it.status?it.status:'Not connected')+' · Last location: '+(L?L.lat.toFixed(4)+', '+L.lon.toFixed(4):'—')+' · Last seen: '+(L?fmtAgo(L.at):'—')+' · Source: '+esc(A.name)+(A.stub?' (stub)':'')+'</div></div>';}
function trackedHtml(){var h='<div class="hsmain"><div class="hscanvas hsmapw" style="background:none;padding:0"><div id="hsMap" style="position:absolute;inset:0;border-radius:8px"></div><div class="hsmapnote" style="position:absolute;left:8px;bottom:8px;z-index:500;font-size:11px;padding:3px 7px;border-radius:6px;background:rgba(0,0,0,.55)"></div></div><div class="hsside hsg">';
 h+='<h4><span>Tracked</span><button data-a="refresh" title="Ask connected sources for locations">⟳</button></h4><div style="opacity:.75;font-size:11px">Pins appear only for items with real location data from a connected source. Nothing is connected yet.</div>';
 TSEC.forEach(function(sx){var its=S.tracked.filter(function(x){return x.type===sx[0];});h+='<h4 style="margin-top:4px"><span>'+sx[1]+'</span><button data-a="addtrk" data-k="'+sx[0]+'">+ Add</button></h4>';
  if(!its.length)h+='<div style="opacity:.6;font-size:11px">None yet.</div>';its.forEach(function(it){h+=trkRow(it,sx[2]);});});
 h+=ouraHtml();return h+'</div></div>';}
function loadLeaflet(cb){if(window.L&&window.L.map)return cb();if(!document.getElementById('hsLeafCss')){var l=document.createElement('link');l.id='hsLeafCss';l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(l);}
 var sc=document.getElementById('hsLeafJs');if(!sc){sc=document.createElement('script');sc.id='hsLeafJs';sc.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';document.head.appendChild(sc);}sc.addEventListener('load',cb);sc.addEventListener('error',function(){var n=bd()&&bd().querySelector('.hsmapnote');if(n)n.textContent='Map could not load (offline?)';});}
function mountMap(){var el=document.getElementById('hsMap');if(!el)return;loadLeaflet(function(){el=document.getElementById('hsMap');if(!el)return;try{if(MAP)MAP.remove();}catch(e){}
  MAP=L.map(el,{zoomControl:true,attributionControl:true}).setView([45.42,-75.69],10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(MAP);
  MAPL=L.layerGroup().addTo(MAP);var pts=[];
  S.tracked.forEach(function(it){var A=TRK[it.adapter]||TRK.none,Lc=it.loc;if(!A.connected()||!Lc||!isFinite(Lc.lat)||!isFinite(Lc.lon))return;pts.push([Lc.lat,Lc.lon]);L.marker([Lc.lat,Lc.lon]).bindPopup(esc(it.name)+'<br>'+fmtAgo(Lc.at)).addTo(MAPL);});
  if(pts.length)MAP.fitBounds(pts,{maxZoom:14,padding:[30,30]});
  var n=bd().querySelector('.hsmapnote');if(n)n.textContent=pts.length?pts.length+' live pin(s)':'No pins — no connected tracking source';
  setTimeout(function(){try{MAP.invalidateSize();}catch(e){}},250);});}
function refreshTracked(){var ps=S.tracked.map(function(it){var A=TRK[it.adapter]||TRK.none;if(!A.connected()){it.loc=null;it.status=null;return Promise.resolve();}
  return A.locate(it).then(function(r){if(r&&isFinite(r.lat)&&isFinite(r.lon)){it.loc={lat:+r.lat,lon:+r.lon,at:r.at||Date.now()};it.status=r.status||'Online';}}).catch(function(){});});
 Promise.all(ps).then(function(){save();render();});}
function trackDlg(k){var sx=TSEC.filter(function(x){return x[0]===k;})[0]||TSEC[0];var ex={vehicle:'Tesla Model Y — rideshare',phone:'My phone',pet:'Dog',robot:'Robot vacuum'}[k];
 dlg('<b>Add to '+sx[1]+'</b><label>Name <input type="text" class="nm" value="'+esc(ex)+'"></label><label>Type <input type="text" class="kd" placeholder="e.g. Tesla, iPhone, GPS collar" value="'+(k==='vehicle'?'Tesla':'')+'"></label>'+
  '<label>Location source <select class="ad">'+Object.keys(TRK).map(function(a){return '<option value="'+a+'"'+((k==='vehicle'&&a==='tesla')?' selected':'')+'>'+esc(TRK[a].name)+(TRK[a].stub?' (not set up yet)':'')+'</option>';}).join('')+'</select></label>'+
  '<div style="font-size:11px;opacity:.8">Shows "Not connected" with no pin until this source is actually connected.</div><div class="hsbar"><button class="sv">Add</button><button data-x>Cancel</button></div>',
  function(o){o.querySelector('.sv').onclick=function(){S.tracked.push({id:uid('t'),type:k,name:o.querySelector('.nm').value.trim()||sx[1],kind:o.querySelector('.kd').value.trim(),adapter:o.querySelector('.ad').value,loc:null,status:null});save();o.remove();render();};});}
/* dialogs */
/* floorplan-20261021c: in-page room-type picker + naming box (type stays as base label, name appended after a comma); no prompt() */
var RTYPES=['Bedroom','Master bedroom','Bathroom','Master bathroom','Half bath','Kitchen','Living room','Dining room','Family room','Office','Laundry','Garage','Hallway','Closet','Pantry','Basement','Attic','Wine cellar','Atrium','Gym','Mudroom','Guest room','Nursery','Patio'];
function rtype(r){return r.type||String(r.name||'Room').split(',')[0].trim()||'Room';}
function roomPick(f){dlg('<b>Add a room</b><div class="hspick" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">'+RTYPES.map(function(t){return '<button type="button" data-rt="'+esc(t)+'">'+esc(t)+'</button>';}).join('')+'</div><div><button type="button" data-x>Cancel</button></div>',function(o){
 o.querySelector('.hspick').addEventListener('click',function(e){var b=e.target.closest('[data-rt]');if(!b)return;e.stopPropagation();var t=b.getAttribute('data-rt');
  var fq=fpFree(f,120,80),r={id:uid('r'),type:t,sfx:'',name:t,x:fq.x,y:fq.y,w:120,h:80};f.rooms.push(r);sel=r.id;o.remove();save();render();});});}
function nameDlg(r){if(!r)return;var t=rtype(r),cur=r.sfx!=null?r.sfx:String(r.name||'').split(',').slice(1).join(',').trim();
 var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 dlg('<b>Name this '+esc(t)+'</b><div style="display:flex;gap:5px;align-items:center"><span style="white-space:nowrap">'+esc(t)+',</span><input type="text" class="nm" maxlength="60" placeholder="Name (e.g. Mark\'s)" value="'+esc(cur)+'" style="flex:1">'+(SR?'<button type="button" class="mic" title="Say the name">🎤</button>':'')+'</div><div class="mst" style="opacity:.75;font-size:11px"></div><div><button type="button" class="go">Save</button> <button type="button" data-x>Cancel</button></div>',function(o){
  var i=o.querySelector('.nm'),st=o.querySelector('.mst');
  function go(){var v=(i.value||'').replace(/^[\s,]+|[\s,.]+$/g,'');r.type=t;r.sfx=v;r.name=v?t+', '+v:t;o.remove();save();render();}
  o.querySelector('.go').addEventListener('click',go);
  i.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter')go();else if(e.key==='Escape')o.remove();});
  var m=o.querySelector('.mic');if(m)m.addEventListener('click',function(e){e.stopPropagation();try{var rec=new SR();rec.lang=navigator.language||'en-US';rec.interimResults=false;rec.continuous=false;rec.maxAlternatives=1;
   rec.onresult=function(ev){var x=ev.results&&ev.results[0]&&ev.results[0][0]?ev.results[0][0].transcript:'';i.value=String(x).replace(/[.!?]+$/,'').trim();st.textContent='Heard: '+i.value;};
   rec.onerror=function(ev){st.textContent='Mic: '+(ev.error||'error');};rec.onend=function(){m.style.opacity='';};m.style.opacity='.5';st.textContent='Listening\u2026';rec.start();}catch(err){st.textContent='Mic unavailable: '+(err&&err.message||err);}});
  setTimeout(function(){i.focus();},0);});}
function dlg(html,onwire){var b=bd();if(!b)return null;var o=document.createElement('div');o.className='hsdlg';o.innerHTML='<div class="hsg">'+html+'</div>';b.appendChild(o);
 o.addEventListener('click',function(e){if(e.target===o||e.target.closest('[data-x]'))o.remove();});o.addEventListener('pointerdown',function(e){e.stopPropagation();});if(onwire)onwire(o);return o;}
function feedDlg(cm){if(cm&&/^sys-/.test(cm.kind||'')){var SD={lock:lockDlg,thermo:thermoDlg,guest:guestDlg,energy:energyDlg}[cm.kind.slice(4)];if(SD){SD();var ds=bd()&&bd().querySelectorAll('.hsdlg'),o=ds&&ds[ds.length-1];   /* sysdev-20261021a: placed lock/thermostat/guest/energy open their own dialog */
   if(o){var hb=o.querySelector('.hsbar');var rb=document.createElement('button');rb.className='warn';rb.textContent='Remove from plan';rb.onclick=function(){if(!confirm('Remove '+cm.name+' from the plan?'))return;S.floors.forEach(function(f){f.cams=(f.cams||[]).filter(function(c){return c.id!==cm.id;});});save();o.remove();render();};(hb||o.firstElementChild).appendChild(rb);}return;}}var url=adapterOf(cm).stream(cm);
 var feed=!url?'<div class="hsfeed">Not connected</div>':/\.(jpe?g|png|gif|mjpe?g)(\?|$)|mjpeg|snapshot/i.test(url)?'<div class="hsfeed"><img src="'+esc(url)+'" alt="feed"></div>':/\.(mp4|webm|m3u8)(\?|$)/i.test(url)?'<div class="hsfeed"><video src="'+esc(url)+'" autoplay muted playsinline controls></video></div>':'<div class="hsfeed"><iframe src="'+esc(url)+'" allow="autoplay"></iframe></div>';
 dlg('<b>'+esc(cm.name)+' · live feed</b>'+feed+'<label>Name <input type="text" class="cn" value="'+esc(cm.name)+'"></label><label>Stream URL <input type="url" class="cu" placeholder="https://… (MJPEG, HLS .m3u8, MP4 or snapshot)" value="'+esc(cm.url||'')+'" style="width:100%"></label>'+
  '<div style="font-size:11px;opacity:.8">'+(url?'Showing the URL you entered. Not linked to Ring/Nest/etc. yet.':'No stream URL set, so this camera is not connected.')+'</div><div class="hsbar"><button class="sv">Save</button><button class="rm warn">Remove</button><button data-x>Close</button></div>',
  function(o){o.querySelector('.sv').onclick=function(){cm.name=o.querySelector('.cn').value.trim()||cm.name;cm.url=o.querySelector('.cu').value.trim();save();o.remove();render();feedDlg(cm);};
   o.querySelector('.rm').onclick=function(){if(!confirm('Remove '+cm.name+'?'))return;var f=floor();f.cams=f.cams.filter(function(x){return x!==cm;});save();o.remove();render();};});}
function lockDlg(){var L=S.lock.locked;
 dlg('<b>Front door lock</b><div>Status: <b>Not connected</b> <em class="hsb">Demo</em></div><div style="font-size:11px;opacity:.8">No smart lock is linked. These buttons only change the demo state on this screen; your real door is not affected.</div>'+
  '<div>Demo state: '+(L==null?'unknown':L?'Locked':'Unlocked')+'</div><div class="hsbar"><button class="lk">Lock</button><button class="ul warn">Unlock</button><button data-x>Close</button></div>',
  function(o){o.querySelector('.lk').onclick=function(){if(!confirm('Lock the front door? (demo — no real lock connected)'))return;S.lock.locked=true;save();o.remove();render();};
   o.querySelector('.ul').onclick=function(){if(!confirm('Unlock the front door? (demo — no real lock connected)'))return;S.lock.locked=false;save();o.remove();render();};});}
function thermoDlg(){var T=S.thermo;
 dlg('<b>Climate control</b><div>Thermostat: <b>Not connected</b> <em class="hsb">Demo</em></div><div style="font-size:11px;opacity:.8">No current temperature is shown because no thermostat is linked. Set point and mode are saved here only.</div>'+
  '<label>Set point <button class="dn">−</button> <b class="sp">'+T.set+'</b>°<select class="un"><option'+(T.unit==='C'?' selected':'')+'>C</option><option'+(T.unit==='F'?' selected':'')+'>F</option></select> <button class="upb">+</button></label>'+
  '<label>Mode <select class="md">'+['off','heat','cool','auto','fan'].map(function(m){return '<option'+(T.mode===m?' selected':'')+'>'+m+'</option>';}).join('')+'</select></label><div class="hsbar"><button class="sv">Save</button><button data-x>Close</button></div>',
  function(o){var sp=o.querySelector('.sp');o.querySelector('.dn').onclick=function(){sp.textContent=+sp.textContent-1;};o.querySelector('.upb').onclick=function(){sp.textContent=+sp.textContent+1;};
   o.querySelector('.sv').onclick=function(){T.set=+sp.textContent;T.mode=o.querySelector('.md').value;T.unit=o.querySelector('.un').value;save();o.remove();render();};});}
function guestDlg(){var cams=0;S.floors.forEach(function(f){cams+=(f.cams||[]).length;});var chosen=S.devices.filter(function(d){return S.guest.devices.indexOf(d.id)>=0;});
 dlg('<b>Guest mode</b><div>Currently: <b>'+(S.guest.on?'Armed (demo)':'Off')+'</b></div><div style="font-size:11px">Arming will: lock the front door, arm '+cams+' camera/doorbell icon(s), and switch off '+chosen.length+' chosen device(s)'+(chosen.length?' ('+chosen.map(function(d){return esc(d.name);}).join(', ')+')':' — tick "in guest mode" on a device to include it')+'.</div>'+
  '<div style="font-size:11px;opacity:.8">Demo only: nothing real is connected, so no real lock, camera or device changes.</div><div class="hsbar">'+(S.guest.on?'<button class="off">Disarm</button>':'<button class="arm warn">Arm everything</button>')+'<button data-x>Cancel</button></div>',
  function(o){var a=o.querySelector('.arm'),f=o.querySelector('.off');
   if(a)a.onclick=function(){if(!confirm('Arm guest mode? Locks, cameras and chosen devices (demo).'))return;S.guest.on=true;S.lock.locked=true;S.floors.forEach(function(fl){(fl.cams||[]).forEach(function(c){c.armed=true;});});chosen.forEach(function(d){d.on=false;adapterOf(d).command(d,'guest',true);});save();o.remove();render();};
   if(f)f.onclick=function(){S.guest.on=false;S.floors.forEach(function(fl){(fl.cams||[]).forEach(function(c){c.armed=false;});});save();o.remove();render();};});}
function energyDlg(){dlg('<b>Energy usage today</b><div style="font-size:20px">Connect a meter</div><div style="font-size:11px;opacity:.8">No power meter is connected, so no reading is shown. Supported later through an adapter (e.g. Home Assistant energy, Emporia, Sense, a utility smart meter).</div><div class="hsbar"><button data-x>Close</button></div>');}
function wearDlg(){dlg('<b>Add to Oura</b><label>Type <select class="ty"><option value="ring">💍 Ring</option><option value="collar">🐾 Collar</option></select></label><label>Name <input type="text" class="nm" value="Oura ring"></label><label>Worn by <select class="who"><option>Me</option><option>Child</option><option>Pet</option><option>Robot</option></select></label><div style="font-size:11px;opacity:.8">Shown as Not connected until a wearable integration is added.</div><div class="hsbar"><button class="sv">Add</button><button data-x>Cancel</button></div>',
  function(o){o.querySelector('.sv').onclick=function(){S.wear.push({id:uid('w'),type:o.querySelector('.ty').value,name:o.querySelector('.nm').value.trim()||'Wearable',who:o.querySelector('.who').value,adapter:'demo'});save();o.remove();render();};});}
/* boot */
function tick(){syncSmall();}
setInterval(tick,1500);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);else tick();
window.__homeStatus={build:BUILD,open:openPlan,state:function(){return JSON.parse(JSON.stringify(S));},render:render,_S:function(){return S;},_save:function(){save();},
 registerAdapter:function(a){if(a&&a.id&&a.id!=='demo'){ADAPTERS[a.id]=a;render();}},adapters:function(){return Object.keys(ADAPTERS);},
 registerTracker:function(a){if(a&&a.id&&a.id!=='none'){TRK[a.id]=a;refreshTracked();}},trackers:function(){return Object.keys(TRK);},
 reset:function(){S=defState();saveLocalOnly();hpPut(true);sel=null;render();}};
})();
