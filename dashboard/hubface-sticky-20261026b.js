/* hubface-sticky-20261026b (Dan, Oct 26 2026 ~6:17 AM, Brain OS task #129): the Sticky Note is a HUBFACE widget.
   Open it from the HubFace Widgets list ("Sticky Note"), design on the creation board, drag the sticky off the board and it
   sticks directly onto HubFace (surface 'hubface', position stored as % of the #ui layer, restored on reload, re-movable by
   dragging). Personal: you see your own stickies plus any whose For name matches your username. No doors.
   Same API/vault as vw-sticky (/api/stickies/*). Roll back: swap this tag back in /opt/hubface/dashboard/index.html. */
(function(){'use strict';
if(window.HFStickyHub)return;
var VER='hfsticky-20261026b',D=document,API='/api/stickies';
var errs=[];window.__hfStickyHub={ver:VER,errs:errs};
var COLORS=['#ffe94d','#ffb3c7','#9be7a1','#9fd3ff','#ffc58a','#d9b8ff','#ffffff'];
function $(s,r){return (r||D).querySelector(s);}
function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function api(m,p,b,type){var o={method:m,credentials:'same-origin',cache:'no-store',headers:{}};
 if(b!==undefined){if(type){o.body=b;o.headers['Content-Type']=type;}else{o.body=JSON.stringify(b);o.headers['Content-Type']='application/json';}}
 return fetch(API+p,o).then(function(r){return r.json().catch(function(){return{};}).then(function(j){if(!r.ok){var e=new Error(j.error||('HTTP '+r.status));e.status=r.status;throw e;}return j;});});}
function lsg(k,d){try{var v=JSON.parse(localStorage.getItem('hfSticky:'+k));return v==null?d:v;}catch(e){return d;}}
function lss(k,v){try{localStorage.setItem('hfSticky:'+k,JSON.stringify(v));}catch(e){}}
function shade(hex,f){var n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;function c(x){return Math.max(0,Math.min(255,Math.round(f<0?x*(1+f):x+(255-x)*f)));}return 'rgb('+c(r)+','+c(g)+','+c(b)+')';}
function rnd(seed){var h=2166136261;for(var i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return function(){h^=h<<13;h^=h>>>17;h^=h<<5;return ((h>>>0)%10000)/10000;};}
function clip(seed){var R=rnd(seed||'x'),r=[],l=[],i,v=2.5;for(i=1;i<=16;i++){v=Math.max(0,Math.min(7,v+(R()-.5)*3.4));r.push('calc(100% - '+v.toFixed(1)+'px) '+(i*6.25).toFixed(1)+'%');}
 v=2.5;for(i=16;i>=1;i--){v=Math.max(0,Math.min(7,v+(R()-.5)*3.4));l.push(v.toFixed(1)+'px '+(i*6.25-6.25).toFixed(1)+'%');}
 return 'polygon(0 0,100% 0,'+r.join(',')+','+l.join(',')+')';}
var CSS='.hfsN{position:absolute;font-family:"Segoe Print","Comic Sans MS","Bradley Hand",cursive;color:#2b2a1f;touch-action:none}'+
'.hfsN .hfsP{position:absolute;inset:0;transform:perspective(1100px) rotateX(20deg);transform-origin:50% 0}'+
'.hfsN .hfsSh{position:absolute;left:5%;right:-2%;bottom:-34px;height:62px;background:rgba(40,30,0,.62);filter:blur(15px);border-radius:50%;pointer-events:none}'+
'.hfsN .hfsBody{position:relative;width:100%;height:100%;box-sizing:border-box;padding:7% 7% 9%;overflow:hidden;display:flex;flex-direction:column}'+
'.hfsN .hfsBody:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0) 55%,rgba(255,255,255,.28) 78%,rgba(0,0,0,.10) 92%,rgba(0,0,0,.20) 100%);pointer-events:none}'+
'.hfsN .hfsFor{font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.65;margin-bottom:2px}'+
'.hfsN .hfsTxt{font-size:20px;line-height:1.25;white-space:pre-wrap;word-break:break-word;flex:0 1 auto;overflow:hidden}'+
'.hfsN .hfsPol{position:relative;background:#fff;padding:8px 8px 30px;margin:10px auto 0;transform:rotate(-3deg);box-shadow:0 3px 8px #0006;width:72%;flex:0 0 auto;box-sizing:border-box}'+
'.hfsN .hfsPol img,.hfsN .hfsPol video{display:block;width:100%;aspect-ratio:1/0.9;object-fit:cover;background:#222}'+
'.hfsN .hfsPol .cap{position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:15px;color:#444}'+
'.hfsN .hfsPlay{position:absolute;left:50%;top:44%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(0,0,0,.55);border:2px solid #fff;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
'.hfsN .hfsPlay:after{content:"";border-left:18px solid #fff;border-top:11px solid transparent;border-bottom:11px solid transparent;margin-left:5px}'+
'.hfsN .hfsAud{margin:10px auto 0;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.55);border-radius:999px;padding:6px 12px;font:700 14px system-ui;cursor:pointer;width:max-content;position:relative;z-index:1}'+
'.hfsN .hfsAud i{font-style:normal;font-size:18px}'+
'#hfsLayer .hfsN .hfsCtl,.hfsN .hfsCtl{position:absolute;top:-14px;right:-10px;display:flex;gap:6px;opacity:0;pointer-events:none!important;transition:opacity .15s;z-index:3}'+
'#hfsLayer .hfsN:hover .hfsCtl,#hfsLayer .hfsN.hov .hfsCtl,.hfsN:hover .hfsCtl{opacity:1;pointer-events:auto!important}'+
'.hfsN .hfsCtl button{font:800 13px system-ui;border:0;border-radius:999px;padding:6px 11px;cursor:pointer;box-shadow:0 2px 8px #0005}'+
'.hfsN .hfsCtl .x{background:#111;color:#fff;width:30px;height:30px;padding:0}.hfsN .hfsCtl .sv{background:#16a34a;color:#fff}.hfsN .hfsCtl .sv.on{background:#065f46}'+
'#hfsLayer{position:absolute;inset:0;pointer-events:none;z-index:2147483000}#hfsLayer .hfsN,#hfsLayer .hfsN *{pointer-events:auto!important}#hfsLayer .hfsN .hfsSh{pointer-events:none!important}'+
'#hfsBoard{position:fixed;right:18px;top:50%;transform:translateY(-50%);width:min(760px,96vw);max-height:94vh;overflow:auto;background:rgba(24,24,30,.96);color:#f5f5f5;border-radius:18px;box-shadow:0 18px 60px #000a;z-index:2147483100;font:14px system-ui;display:grid;grid-template-columns:1fr 300px}'+
'#hfsBoard .hfsb,#hfsBoard .hfsrow,#hfsBoard .side,#hfsBoard .side>div,#hfsBoard .hd,#hfsBoard .msg,#hfsBoard .media,#hfsBoard .mb{position:static}#hfsBoard h3{margin:0;font:800 16px system-ui;letter-spacing:.5px}'+
'#hfsBoard .hd{grid-column:1/3;display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #fff2}'+
'#hfsBoard .hd .dst{opacity:.7;font-size:12px;flex:1}#hfsBoard .bx{background:#fff1;border:0;color:#fff;width:32px;height:32px;border-radius:50%;font:700 18px system-ui;cursor:pointer}'+
'#hfsBoard .stage{position:relative;min-height:520px;background:repeating-linear-gradient(45deg,#ffffff06 0 12px,#ffffff0b 12px 24px);overflow:visible}'+
'#hfsBoard .stage .tip{position:absolute;left:12px;bottom:10px;right:12px;font-size:12px;opacity:.7}'+
'#hfsBoard .tabs{position:absolute;left:10px;top:10px;display:flex;gap:6px;z-index:2}#hfsBoard .tabs button{width:26px;height:26px;border-radius:6px;border:2px solid transparent;cursor:pointer;font:700 12px system-ui}#hfsBoard .tabs button.on{border-color:#fff}'+
'#hfsBoard .side{padding:12px 14px;display:flex;flex-direction:column;gap:9px;border-left:1px solid #fff2}'+
'#hfsBoard label{font-size:12px;opacity:.8;display:block;margin-bottom:3px}#hfsBoard input[type=text],#hfsBoard textarea{width:100%;box-sizing:border-box;background:#0006;color:#fff;border:1px solid #fff3;border-radius:8px;padding:7px 9px;font:14px system-ui}'+
'#hfsBoard textarea{height:74px;resize:vertical}#hfsBoard .sw{display:flex;gap:6px;flex-wrap:wrap;align-items:center}#hfsBoard .sw b{width:24px;height:24px;border-radius:6px;cursor:pointer;border:2px solid #0000}#hfsBoard .sw b.on{border-color:#fff}'+
'#hfsBoard .sw input{width:30px;height:28px;border:0;background:none;padding:0}'+
'#hfsBoard .mb{display:grid;grid-template-columns:1fr 1fr;gap:6px}#hfsBoard .hfsb{background:#ffffff1c;color:#fff;border:0;border-radius:9px;padding:8px 9px;font:700 13px system-ui;cursor:pointer;text-align:center;text-decoration:none}'+
'#hfsBoard .hfsb:hover{background:#ffffff30}#hfsBoard .hfsb.pri{background:#16a34a}#hfsBoard .hfsb.rec{background:#dc2626}#hfsBoard .hfsrow{display:flex;gap:6px}#hfsBoard .hfsrow>*{flex:1}'+
'#hfsBoard input[type=range]{width:100%}#hfsBoard .msg{font-size:12px;min-height:16px;color:#fde68a}#hfsBoard .live{width:100%;border-radius:8px;background:#000;display:none}'+
'#hfsBoard .media{display:flex;gap:6px;flex-wrap:wrap;font-size:12px}#hfsBoard .media span{background:#fff2;border-radius:999px;padding:3px 8px}#hfsBoard .media span a{color:#fca5a5;margin-left:4px;cursor:pointer}'+
'.hfsX{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#fbbf24;color:#3a2414;font:800 16px system-ui;border:0;border-radius:999px;padding:10px 18px;box-shadow:0 4px 16px #0007;cursor:pointer;z-index:2147482900;display:none}'+
'.hfsDragging{opacity:.92;filter:drop-shadow(0 18px 18px #0006)}'+
'.hfsToast{position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#111e;color:#fff;font:700 14px system-ui;padding:9px 16px;border-radius:999px;z-index:2147483200;opacity:0;transition:opacity .2s;pointer-events:none}.hfsToast.on{opacity:1}'+
'.hfsN .hfsTxt{overflow:auto!important;scrollbar-width:thin}'+'#hfsLayer .hfsN .hfsRz{position:absolute;right:-12px;bottom:-12px;width:30px;height:30px;border-radius:8px;background:#111c;color:#fff;font:700 16px/30px system-ui;text-align:center;cursor:nwse-resize;touch-action:none;opacity:0;transition:opacity .15s;z-index:4;box-shadow:0 2px 8px #0005;user-select:none}'+'#hfsLayer .hfsN:hover .hfsRz,#hfsLayer .hfsN.hov .hfsRz,#hfsLayer .hfsN.rzing .hfsRz{opacity:1}'+'@media (hover:none){#hfsLayer .hfsN .hfsRz{opacity:.85}}'+'.hfsN .hfsCtl .dl{background:#2563eb;color:#fff}'+
'@media (max-width:760px){#hfsBoard{grid-template-columns:1fr;right:2vw;top:2vh;transform:none}#hfsBoard .hd{grid-column:1}#hfsBoard .side{border-left:0}}';
var st=D.createElement('style');st.textContent=CSS;(D.head||D.documentElement).appendChild(st);
function toast(m){var t=$('.hfsToast');if(!t){t=D.createElement('div');t.className='hfsToast';D.body.appendChild(t);}t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(function(){t.classList.remove('on');},2600);}
function mediaUrl(m){return m.url||(API+'/media/'+m.id);}
/* ---------- one sticky, approved look ---------- */
function noteEl(s){var e=D.createElement('div');e.className='hfsN';var w=s.w||300,h=s.h||340,c=s.color||'#ffe94d';
 e.style.width=w+'px';e.style.height=h+'px';e.style.transform='rotate('+(s.rot==null?20:s.rot)+'deg)';
 var img=null,vid=null,aud=null;(s.media||[]).forEach(function(m){if(m.kind=='image'&&!img)img=m;else if(m.kind=='video'&&!vid)vid=m;else if(m.kind=='audio'&&!aud)aud=m;});
 var pic=vid?'<div class="hfsPol"><video preload="metadata" playsinline src="'+esc(mediaUrl(vid))+'#t=0.1"></video><div class="hfsPlay" title="Play"></div><div class="cap">'+esc(s.caption||'')+'</div></div>':
  img?'<div class="hfsPol"><img alt="" src="'+esc(mediaUrl(img))+'"><div class="cap">'+esc(s.caption||'')+'</div></div>':'';
 e.innerHTML='<div class="hfsP"><div class="hfsSh"></div><div class="hfsBody" style="background:linear-gradient(175deg,'+shade(c,.35)+' 0%,'+c+' 55%,'+shade(c,-.06)+' 100%);clip-path:'+clip(s.id||s._k||'new')+'">'+
  (s.forName?'<div class="hfsFor">For: '+esc(s.forName)+'</div>':'')+'<div class="hfsTxt">'+esc(s.text||'')+'</div>'+
  (aud?'<div class="hfsAud" title="Play voice note"><i>\u25B6</i> Voice note<audio preload="none" src="'+esc(mediaUrl(aud))+'"></audio></div>':'')+pic+'</div></div>';
 var pl=$('.hfsPlay',e);if(pl)pl.addEventListener('click',function(ev){ev.stopPropagation();var v=$('video',e);v.controls=true;v.play();pl.remove();});
 var au=$('.hfsAud',e);if(au)au.addEventListener('click',function(ev){ev.stopPropagation();var a=$('audio',au);if(a.paused){a.play();$('i',au).textContent='\u23F8';}else{a.pause();$('i',au).textContent='\u25B6';}a.onended=function(){$('i',au).textContent='\u25B6';};});
 var shH=Math.max(0,Math.round(h*.11));$('.hfsSh',e).style.height=Math.max(30,shH*1.6)+'px';
 return e;}
/* ---------- placed stickies on HubFace ---------- */
var surface=null,door=null,me=null,meP=null,placed=[],mine=[];
function who(){if(!meP)meP=api('GET','/me').then(function(j){me=j.user;return me;}).catch(function(){return null;});return meP;}
function layer(){var l=$('#hfsLayer');if(!l){l=D.createElement('div');l.id='hfsLayer';(surface||D.body).appendChild(l);}return l;}
function renderDoor(){var l=layer();l.innerHTML='';placed.forEach(function(s){var e=noteEl(s);e.dataset.id=s.id;
  e.style.left='calc('+s.x+'% - '+(s.w/2)+'px)';e.style.top='calc('+s.y+'% - '+(s.h/2)+'px)';if(mine.indexOf(s.id)>=0){e.style.cursor='grab';e.addEventListener('pointerdown',function(ev){moveP(ev,e,s);});}
  var c=D.createElement('div');c.className='hfsCtl';c.innerHTML='<button class="sv'+(s.saved?' on':'')+'" type="button">'+(s.saved?'Saved \u2713':'Save')+'</button><button class="dl" type="button" title="Download this note">Download</button><button class="x" type="button" title="Dismiss">\u2715</button>';e.appendChild(c);
  e.addEventListener('touchstart',function(){e.classList.toggle('hov');},{passive:true});
  $('.x',c).onclick=function(ev){ev.stopPropagation();api('POST','/'+s.id+'/dismiss',{}).then(function(j){toast(j.kept?'Taken off HubFace. It stays in the vault.':'Sticky dismissed.');loadDoor();}).catch(function(er){toast(er.status==401?'Sign in to HubFace to dismiss stickies.':er.message);});};
  $('.sv',c).onclick=function(ev){ev.stopPropagation();if(mine.indexOf(s.id)<0){toast('Only the person who made it can save it.');return;}api('PUT','/'+s.id,{saved:true}).then(function(){toast('Saved to your sticky vault.');loadDoor();}).catch(function(er){toast(er.message);});};
  $('.dl',c).onclick=function(ev){ev.stopPropagation();dlNote(s);};
  if(mine.indexOf(s.id)>=0){var rz=D.createElement('div');rz.className='hfsRz';rz.title='Drag to resize';rz.textContent='\u21F2';e.appendChild(rz);rz.addEventListener('pointerdown',function(ev){rszP(ev,e,s);});}
  l.appendChild(e);});
 paintDoorCount();}
/* stickyresize-20261026: resize in place + download */
function rszP(ev,e,s){ev.preventDefault();ev.stopPropagation();var sr=surface.getBoundingClientRect(),sx=ev.clientX,sy=ev.clientY,ow=s.w||300,oh=s.h||340,ox=s.x,oy=s.y,moved=false,k=(sr.width/(surface.offsetWidth||sr.width))||1;e.classList.add('rzing');
 function mv(m){moved=true;var w=Math.max(160,Math.min(640,ow+(m.clientX-sx)/k)),h=Math.max(160,Math.min(760,oh+(m.clientY-sy)/k));s.w=Math.round(w);s.h=Math.round(h);
  s.x=ox+(s.w-ow)/2/sr.width*100;s.y=oy+(s.h-oh)/2/sr.height*100;e.style.width=s.w+'px';e.style.height=s.h+'px';e.style.left='calc('+s.x+'% - '+(s.w/2)+'px)';e.style.top='calc('+s.y+'% - '+(s.h/2)+'px)';
  var sh=$('.hfsSh',e);if(sh)sh.style.height=Math.max(30,Math.round(s.h*.11)*1.6)+'px';}
 function up(){removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);e.classList.remove('rzing');if(moved)api('PUT','/'+s.id,{w:s.w,h:s.h,x:+s.x.toFixed(2),y:+s.y.toFixed(2)}).catch(function(er){toast(er.message);});}
 addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up);}
function b64(u){return fetch(u,{credentials:'same-origin'}).then(function(r){if(!r.ok)throw 0;return r.blob();}).then(function(b){return new Promise(function(ok){var f=new FileReader();f.onload=function(){ok(f.result);};f.onerror=function(){ok(null);};f.readAsDataURL(b);});}).catch(function(){return null;});}
function dlNote(s){var dt=new Date(s.created||s.updated||Date.now());if(isNaN(dt))dt=new Date();var ds=dt.toISOString().slice(0,10);
 return Promise.all((s.media||[]).map(function(m){var u=new URL(mediaUrl(m),location.href).href;return m.kind=='image'?b64(u).then(function(d){return{m:m,u:u,d:d};}):Promise.resolve({m:m,u:u,d:null});})).then(function(ms){
  var h='<!doctype html><meta charset="utf-8"><title>Sticky note '+ds+'</title><body style="font-family:system-ui;max-width:640px;margin:24px auto;padding:0 16px">'+
  '<h2>HubFace sticky note</h2><p><b>Date:</b> '+esc(dt.toLocaleString())+'<br><b>From:</b> '+esc(s.by||'')+(s.forName?'<br><b>For:</b> '+esc(s.forName):'')+'</p>'+
  '<pre style="white-space:pre-wrap;font:18px/1.4 system-ui;background:'+esc(s.color||'#ffe94d')+';padding:16px;border-radius:8px">'+esc(s.text||'')+'</pre>'+(s.caption?'<p><b>Caption:</b> '+esc(s.caption)+'</p>':'');
  ms.forEach(function(x){if(x.m.kind=='image')h+='<p><img style="max-width:100%" src="'+(x.d||esc(x.u))+'"></p>';else h+='<p>'+esc(x.m.kind)+': <a href="'+esc(x.u)+'">'+esc(x.u)+'</a></p>';});
  h+='</body>';var a=D.createElement('a');a.href=URL.createObjectURL(new Blob([h],{type:'text/html'}));a.download='sticky-note-'+ds+'.html';D.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},4000);toast('Sticky note downloaded.');});}
window.hfStickyDownload=dlNote;
function loadDoor(){if(!door)return Promise.resolve();return api('GET','/door?door='+encodeURIComponent(door)).then(function(j){placed=j.stickies||[];mine=j.mine||[];if(j.me)me=j.me;renderDoor();}).catch(function(e){errs.push('door:'+e.message);});}
function setDoor(k){door=k;return loadDoor();}
function clearDoor(){door=null;placed=[];var l=$('#hfsLayer');if(l)l.innerHTML='';paintDoorCount();}
function moveP(ev,e,s){if(ev.button>0||ev.target.closest('button,.hfsPlay,.hfsAud,video'))return;ev.preventDefault();var sr=surface.getBoundingClientRect(),sx=ev.clientX,sy=ev.clientY,ox=s.x,oy=s.y,moved=false;e.style.cursor='grabbing';
 function mv(m){moved=true;s.x=Math.max(3,Math.min(97,ox+(m.clientX-sx)/sr.width*100));s.y=Math.max(3,Math.min(97,oy+(m.clientY-sy)/sr.height*100));e.style.left='calc('+s.x+'% - '+(s.w/2)+'px)';e.style.top='calc('+s.y+'% - '+(s.h/2)+'px)';}
 function up(){removeEventListener('pointermove',mv);removeEventListener('pointerup',up);e.style.cursor='grab';if(moved)api('PUT','/'+s.id,{x:+s.x.toFixed(2),y:+s.y.toFixed(2)}).catch(function(er){toast(er.message);});}
 addEventListener('pointermove',mv);addEventListener('pointerup',up);}
var countCbs=[];function paintDoorCount(){countCbs.forEach(function(f){try{f(placed.length);}catch(e){}});}
/* ---------- creation board ---------- */
var B=null,drafts=[],cur=0,rec=null,boardDoor=null;
function blank(){return{_k:'d'+Math.random().toString(36).slice(2),w:300,h:340,rot:20,color:lsg('color','#ffe94d'),text:'',forName:'',caption:'',media:[],saved:false};}
function closeBoard(){stopRec();if(B){B.remove();B=null;}lss('drafts',drafts.filter(function(d){return d.text||d.media.length||d.forName||d.id;}));}
function openBoard(doorKey,opt){opt=opt||{};boardDoor=doorKey||door||null;
 drafts=lsg('drafts',[]);if(!Array.isArray(drafts))drafts=[];if(opt.edit){var ex=drafts.findIndex(function(d){return d.id===opt.edit.id;});var dd=JSON.parse(JSON.stringify(opt.edit));if(ex>=0)drafts[ex]=dd;else drafts.push(dd);cur=ex>=0?ex:drafts.length-1;}
 else if(opt.reuse){var r=JSON.parse(JSON.stringify(opt.reuse));delete r.id;r._k='d'+Math.random().toString(36).slice(2);r.saved=false;drafts.push(r);cur=drafts.length-1;}
 if(!drafts.length)drafts.push(blank());if(cur>=drafts.length)cur=drafts.length-1;
 if(B)B.remove();B=D.createElement('div');B.id='hfsBoard';B.setAttribute('role','dialog');B.setAttribute('aria-label','Sticky Note board');
 B.innerHTML='<div class="hd"><h3>\u{1F4DD} STICKY NOTE</h3><span class="dst"></span><a class="hfsb vlt" href="/interface/hubface-sticky-vault.html" target="_blank" rel="noopener">\u{1F5C3} Vault</a><button class="hfsb plus" type="button" title="Another sticky">\uFF0B</button><button class="bx" type="button" title="Close the board" aria-label="Close the board">\u2715</button></div>'+
 '<div class="stage"><div class="tabs"></div><div class="tip">Grab the sticky and drag it off the board (resize it after it\u2019s on HubFace) onto HubFace to stick it there.</div></div>'+
 '<div class="side"><div><label>Colour</label><div class="sw">'+COLORS.map(function(c){return '<b data-c="'+c+'" style="background:'+c+'"></b>';}).join('')+'<input type="color" title="Any colour"></div></div>'+
 '<div><label>For (optional name, e.g. Ava)</label><input type="text" class="fn" maxlength="40" placeholder="Ava, Finn, me\u2026"></div>'+
 '<div><label>Note</label><textarea class="tx" maxlength="600" placeholder="Write your note\u2026"></textarea></div>'+
 '<div><label>Add below the note</label><div class="mb"><button class="hfsb pic" type="button">\u{1F4F7} Picture</button><button class="hfsb voi" type="button">\u{1F399} Voice</button><button class="hfsb vid" type="button">\u{1F3A5} Video</button><button class="hfsb clp" type="button">\u{1F39E} Clip</button></div>'+
 '<video class="live" muted playsinline></video><div class="media"></div><input type="file" class="fpic" accept="image/*" hidden><input type="file" class="fclp" accept="video/*" hidden>'+
 '<input type="text" class="cp" maxlength="40" placeholder="Photo caption (optional)" style="margin-top:6px"></div>'+
 '<div><label>Size <span class="szv"></span></label><div class="hfsrow"><input type="range" class="sw_" min="200" max="560" step="10" title="Width"><input type="range" class="sh_" min="220" max="680" step="10" title="Height"></div></div>'+
 '<div><label>Tilt <span class="rtv"></span></label><input type="range" class="rt" min="-35" max="35" step="1"></div>'+
 '<div class="hfsrow"><button class="hfsb pri sav" type="button">\u{1F4BE} Save to vault</button></div><div class="msg"></div></div>';
 D.body.appendChild(B);
 $('.bx',B).onclick=closeBoard;
 $('.plus',B).onclick=function(){drafts.push(blank());cur=drafts.length-1;paint();msg('New sticky ready.');};
 B.querySelectorAll('.sw b').forEach(function(b){b.onclick=function(){d().color=b.dataset.c;lss('color',b.dataset.c);paint();};});
 $('.sw input',B).oninput=function(e){d().color=e.target.value;paint();};
 $('.fn',B).oninput=function(e){d().forName=e.target.value;paintNote();};
 $('.tx',B).oninput=function(e){d().text=e.target.value;paintNote();};
 $('.cp',B).oninput=function(e){d().caption=e.target.value;paintNote();};
 $('.sw_',B).oninput=function(e){d().w=+e.target.value;paint();};$('.sh_',B).oninput=function(e){d().h=+e.target.value;paint();};
 $('.rt',B).oninput=function(e){d().rot=+e.target.value;paint();};
 $('.pic',B).onclick=function(){$('.fpic',B).click();};$('.clp',B).onclick=function(){$('.fclp',B).click();};
 $('.fpic',B).onchange=function(e){var f=e.target.files[0];if(f)upload(f,f.type);e.target.value='';};
 $('.fclp',B).onchange=function(e){var f=e.target.files[0];if(f)upload(f,f.type);e.target.value='';};
 $('.voi',B).onclick=function(){toggleRec('audio');};$('.vid',B).onclick=function(){toggleRec('video');};
 $('.sav',B).onclick=function(){persist({saved:true}).then(function(){msg('Saved to your vault. It stays here on the board too.');}).catch(function(er){msg(er.message);});};
 paint();who().then(function(u){if(!u)msg('Sign in to HubFace to place or save stickies. You can still design one here.');});
 return B;}
function d(){return drafts[cur];}
function msg(m){if(B)$('.msg',B).textContent=m;}
function paint(){if(!B)return;var x=d();$('.dst',B).textContent=boardDoor?'Sticks onto HubFace':'Vault only';
 $('.tabs',B).innerHTML=drafts.length>1?drafts.map(function(q,i){return '<button type="button" data-i="'+i+'" class="'+(i==cur?'on':'')+'" style="background:'+(q.color||'#ffe94d')+'">'+(i+1)+'</button>';}).join(''):'';
 B.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){cur=+b.dataset.i;paint();};});
 B.querySelectorAll('.sw b').forEach(function(b){b.classList.toggle('on',b.dataset.c.toLowerCase()==String(x.color).toLowerCase());});
 $('.sw input',B).value=x.color;$('.fn',B).value=x.forName||'';$('.tx',B).value=x.text||'';$('.cp',B).value=x.caption||'';
 $('.sw_',B).value=x.w;$('.sh_',B).value=x.h;$('.szv',B).textContent=x.w+' \u00d7 '+x.h;$('.rt',B).value=x.rot;$('.rtv',B).textContent=x.rot+'\u00b0';
 $('.media',B).innerHTML=x.media.map(function(m,i){return '<span>'+({image:'\u{1F4F7} picture',audio:'\u{1F399} voice',video:'\u{1F3A5} video'}[m.kind]||m.kind)+'<a data-i="'+i+'" title="Remove">\u2715</a></span>';}).join('');
 B.querySelectorAll('.media a').forEach(function(a){a.onclick=function(){x.media.splice(+a.dataset.i,1);paint();};});
 paintNote();}
function paintNote(){if(!B)return;var x=d(),sg=$('.stage',B),old=$('.hfsN',sg);if(old)old.remove();var e=noteEl(x);
 var sc=Math.min(1,(sg.clientWidth-60)/(x.w*1.25),(Math.max(520,sg.clientHeight)-90)/(x.h*1.2));e.style.left=((sg.clientWidth-x.w)/2)+'px';e.style.top=(40+(Math.max(520,sg.clientHeight)-80-x.h)/2)+'px';
 e.style.transform='scale('+sc.toFixed(3)+') rotate('+x.rot+'deg)';e.style.cursor='grab';e.title='Drag me onto HubFace';sg.appendChild(e);e.addEventListener('pointerdown',startDrag);
 $('.szv',B).textContent=x.w+' \u00d7 '+x.h;$('.rtv',B).textContent=x.rot+'\u00b0';}
function persist(extra){var x=d();var body={color:x.color,text:x.text,forName:x.forName,caption:x.caption,w:x.w,h:x.h,rot:x.rot,media:x.media.map(function(m){return{id:m.id};})};for(var k in extra)body[k]=extra[k];
 return who().then(function(u){if(!u)throw new Error('Sign in to HubFace first.');return x.id?api('PUT','/'+x.id,body):api('POST','/new',body);}).then(function(j){var s=j.sticky;x.id=s.id;x.saved=s.saved;lss('drafts',drafts);return s;});}
function startDrag(ev){if(ev.button>0)return;ev.preventDefault();var src=ev.currentTarget,x=d(),r=src.getBoundingClientRect();
 var g=noteEl(x);g.classList.add('hfsDragging');g.style.position='fixed';g.style.zIndex=2147483300;g.style.pointerEvents='none';D.body.appendChild(g);src.style.visibility='hidden';
 function mv(e){g.style.left=(e.clientX-x.w/2)+'px';g.style.top=(e.clientY-x.h/2)+'px';}mv(ev);
 function up(e){removeEventListener('pointermove',mv);removeEventListener('pointerup',up);g.remove();src.style.visibility='';var br=B.getBoundingClientRect();
  var inside=e.clientX>br.left&&e.clientX<br.right&&e.clientY>br.top&&e.clientY<br.bottom;if(inside)return;
  if(!boardDoor){msg('Open the board from HubFace to stick it there. Saved to the vault instead.');persist({saved:true}).catch(function(er){msg(er.message);});return;}
  var sr=(surface||D.body).getBoundingClientRect();var px=Math.max(3,Math.min(97,(e.clientX-sr.left)/sr.width*100)),py=Math.max(3,Math.min(97,(e.clientY-sr.top)/sr.height*100));
  persist({door:boardDoor,x:+px.toFixed(2),y:+py.toFixed(2)}).then(function(){drafts.splice(cur,1);if(!drafts.length)drafts.push(blank());cur=Math.min(cur,drafts.length-1);lss('drafts',drafts);paint();msg('Stuck on HubFace. Press \uFF0B for another, or X when you are done.');if(door===boardDoor)loadDoor();else setDoor(boardDoor);}).catch(function(er){msg(er.message);});}
 addEventListener('pointermove',mv);addEventListener('pointerup',up);}
function upload(blob,type){type=String(type||blob.type||'').split(';')[0];if(blob.size>25*1024*1024){msg('That file is over 25 MB.');return;}msg('Uploading\u2026');
 return who().then(function(u){if(!u)throw new Error('Sign in to HubFace to add pictures, voice or video.');return api('POST','/media',blob,type);}).then(function(j){var x=d();
  x.media=x.media.filter(function(m){return j.kind=='audio'?m.kind!='audio':(m.kind=='audio');});x.media.push({id:j.id,kind:j.kind,type:j.type});paint();msg(({image:'Picture',audio:'Voice note',video:'Video'}[j.kind])+' added.');}).catch(function(er){msg(er.message);});}
function stopRec(){if(rec){try{if(rec.r.state!='inactive')rec.r.stop();}catch(e){}rec.s.getTracks().forEach(function(t){t.stop();});clearTimeout(rec.t);}}
function toggleRec(kind){if(rec){var k=rec.kind;stopRec();return;}if(!navigator.mediaDevices||!window.MediaRecorder){msg('Recording is not supported in this browser.');return;}
 navigator.mediaDevices.getUserMedia(kind=='video'?{video:{facingMode:'user'},audio:true}:{audio:true}).then(function(s){var ch=[],r=new MediaRecorder(s);rec={r:r,s:s,kind:kind};
  var lv=$('.live',B);if(kind=='video'){lv.srcObject=s;lv.style.display='block';lv.play().catch(function(){});}
  var bt=$(kind=='video'?'.vid':'.voi',B);bt.classList.add('rec');bt.textContent='\u23F9 Stop';
  r.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data);};
  r.onstop=function(){var t=(r.mimeType||(kind=='video'?'video/webm':'audio/webm')).split(';')[0];if(kind=='audio'&&/^video\//.test(t))t='audio/webm';rec=null;if(B){lv.style.display='none';lv.srcObject=null;bt.classList.remove('rec');bt.textContent=kind=='video'?'\u{1F3A5} Video':'\u{1F399} Voice';}if(ch.length)upload(new Blob(ch,{type:t}),t);};
  r.start(500);rec.t=setTimeout(stopRec,90000);msg('Recording\u2026 press Stop when done (90 s max).');}).catch(function(){msg('Microphone or camera permission was refused.');});}
/* ---------- HubFace surface ---------- */
function surf(){return D.getElementById('ui');}
function hubface(){var ui=surf();if(!ui||D.documentElement.classList.contains('rb-room'))return false;var p=D.querySelector('#ui > aside.panel:not(.props)');if(!p)return false;
 surface=ui;setDoor('hubface');var last=null;p.querySelectorAll('.witem').forEach(function(w){last=w;});
 var it=D.createElement('div');it.className='witem hfsitem';it.setAttribute('role','button');it.title='Sticky Note';
 it.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/></svg><span>Sticky Note</span>';
 if(last){it.style.top=(parseFloat(last.style.top||0)+(last.offsetHeight||20))+'px';}p.appendChild(it);
 it.addEventListener('click',function(e){e.stopPropagation();if(B)closeBoard();else openBoard('hubface');});
 who().then(function(u){if(u)loadDoor();});setInterval(function(){if(!D.hidden&&!B)loadDoor();},120000);return true;}
window.HFStickyHub={ver:VER,openBoard:openBoard,closeBoard:closeBoard,setDoor:setDoor,clearDoor:clearDoor,reload:loadDoor,noteEl:noteEl,api:api,who:who,toast:toast,
 board:function(){return B;},placed:function(){return placed;},door:function(){return door;}};
function boot(){try{if(window.HF_STICKY_MANUAL)return;var tries=0;(function t(){if(hubface())return;if(++tries<40)setTimeout(t,500);})();}catch(e){errs.push(String(e.message));}}
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',function(){setTimeout(boot,300);});else setTimeout(boot,300);
})();
