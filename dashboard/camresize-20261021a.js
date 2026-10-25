/* camresize-20261021a (Dan, Oct 21 2026): Home Status device cards + Devices picker + Home Status tray.
   - Device card (camera/doorbell/sprinkler/pool/outside lights): corner resize grip (size saved, video fills), X at far right,
     inline field mics (existing .fmic moved inside each input), Record (MediaRecorder -> local webm download, nothing uploaded),
     8-10px wrapping gaps, Remove = clear stream URL only (confirm), separate "Delete device" link.
   - "+ Devices" button next to "+ Room": picker from one DEVICES array; drag (pointer events) or click to place on the plan.
   - Pool / Sprinkler / Outside lights local controls in small icon boxes (icons pickable), saved per device in localStorage.
   - Home Status small box = favorites tray: drag devices in, click to open, hover/long-press x to remove.
   Everything is local (localStorage); not connected to real hardware. Rollback: ROLLBACK-camresize.sh */
(function(){'use strict';if(window.__camresize)return;window.__camresize='camresize-20261021a';
var DEVICES=[
 {k:'camera',i:'\ud83d\udcf7',n:'Camera',feed:true},
 {k:'doorbell',i:'\ud83d\udd14',n:'Doorbell',feed:true},
 {k:'sprinkler',i:'\ud83d\udca7',n:'Sprinkler',feed:true,ctl:[
   {key:'power',n:'Watering',i:'\ud83d\udca7',t:'toggle',on:'On',off:'Off'},
   {key:'mins',n:'Run time',i:'\u23f1\ufe0f',t:'num',unit:'min',min:1,max:120,step:1,def:15},
   {key:'start',n:'Start time',i:'\ud83d\udd52',t:'time',def:'06:00'}]},
 {k:'pool',i:'\ud83c\udfca',n:'Pool',feed:true,ctl:[
   {key:'temp',n:'Water temp',i:'\ud83c\udf21\ufe0f',t:'num',unit:'\u00b0F',min:50,max:104,step:1,def:82},
   {key:'pump',n:'Pump',i:'\u2699\ufe0f',t:'toggle',on:'On',off:'Off'},
   {key:'lights',n:'Lights',i:'\ud83d\udca1',t:'toggle',on:'On',off:'Off'},
   {key:'cover',n:'Cover',i:'\ud83d\udee1\ufe0f',t:'toggle',on:'Closed',off:'Open'}]},
 {k:'lights',i:'\ud83d\udca1',n:'Outside lights',feed:true,ctl:[
   {key:'power',n:'Lights',i:'\ud83d\udca1',t:'toggle',on:'On',off:'Off'},
   {key:'bright',n:'Brightness',i:'\ud83d\udd06',t:'range',min:0,max:100,def:80,unit:'%'},
   {key:'sched',n:'Schedule',i:'\ud83d\uddd3\ufe0f',t:'sched',def:{on:'18:30',off:'23:00',dusk:false}}]}
];
var SYS=[{a:'lock',i:'\ud83d\udd12',n:'Front door'},{a:'thermo',i:'\ud83c\udf21\ufe0f',n:'Thermostat'},{a:'guest',i:'\ud83e\uddf3',n:'Guest mode'},{a:'energy',i:'\u26a1',n:'Energy'}];
var EMOJI=['\ud83d\udca7','\ud83c\udfca','\ud83d\udca1','\ud83c\udf21\ufe0f','\u2699\ufe0f','\ud83d\udee1\ufe0f','\ud83d\udd06','\u23f1\ufe0f','\ud83d\udd52','\ud83c\udf19','\u2600\ufe0f','\ud83c\udf3f'];
var SZK='hf.devcard.size',TRK='hf.homestatus.tray.v1';
function dev(k){for(var i=0;i<DEVICES.length;i++)if(DEVICES[i].k===k)return DEVICES[i];return DEVICES[0];}
function H(){return window.__homeStatus;}
function S(){var h=H();return h&&h._S?h._S():null;}
function persist(){var h=H();if(h&&h._save)h._save();}
function rerender(){var h=H();if(h&&h.render)h.render();}
function allCams(){var s=S();if(!s)return[];var a=[];s.floors.forEach(function(f){(f.cams||[]).forEach(function(c){a.push({c:c,f:f});});});return a;}
function camById(id){var a=allCams();for(var i=0;i<a.length;i++)if(a[i].c.id===id)return a[i];return null;}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function ratio(el){var r=el.getBoundingClientRect();return el.offsetWidth?r.width/el.offsetWidth:1;}
var lastCam=null;
var dragCam=null;document.addEventListener('pointerdown',function(e){var t=e.target&&e.target.closest&&e.target.closest('.hscam[data-cam]');if(t){lastCam=t.getAttribute('data-cam');dragCam=lastCam;}},true);
/* ---------- plan: icons + Devices button ---------- */
function patchPlan(){var b=document.querySelector('.hsbd');if(!b)return;
 [].forEach.call(b.querySelectorAll('.hscam[data-cam]'),function(el){var x=camById(el.getAttribute('data-cam'));if(!x)return;var d=dev(x.c.kind);if(el.textContent!==d.i)el.textContent=d.i;el.title=x.c.name+' \u2014 tap for controls';});
 var bar=b.querySelector(':scope > .hsbar');if(bar&&!bar.querySelector('.hsdevbtn')){var ar=bar.querySelector('[data-a="addroom"]');var btn=document.createElement('button');btn.className='hsdevbtn';btn.type='button';btn.textContent='+ Devices';btn.title='Add a device to the plan';
  btn.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();togglePop(btn);},true);
  if(ar)ar.insertAdjacentElement('afterend',btn);else bar.appendChild(btn);}}
function togglePop(btn){var old=document.querySelector('.hsdevpop');if(old){old.remove();return;}var b=document.querySelector('.hsbd');if(!b)return;
 var p=document.createElement('div');p.className='hsdevpop';
 p.innerHTML=DEVICES.map(function(d){return '<div class="hsdev" data-dev="'+d.k+'" title="Drag onto the plan (or click)"><span>'+d.i+'</span>'+esc(d.n)+'</div>';}).join('')+
  SYS.map(function(s){return '<div class="hsdev" data-sys="'+s.a+'" title="Open (drag to the Home Status tray to pin)"><span>'+s.i+'</span>'+esc(s.n)+'</div>';}).join('');
 b.appendChild(p);var br=b.getBoundingClientRect(),r=btn.getBoundingClientRect(),k=ratio(b);p.style.left=Math.max(0,(r.left-br.left)/k-120)+'px';p.style.top=((r.bottom-br.top)/k+4)+'px';
 p.addEventListener('pointerdown',function(e){e.stopPropagation();});
 [].forEach.call(p.querySelectorAll('.hsdev'),function(it){it.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();e.stopPropagation();
   var sx=e.clientX,sy=e.clientY,moved=false,ghost=null;
   function mv(ev){if(!moved&&Math.abs(ev.clientX-sx)+Math.abs(ev.clientY-sy)>4){moved=true;ghost=it.querySelector('span').cloneNode(true);ghost.className='hsghost';ghost.style.cssText='position:fixed;z-index:99999;pointer-events:none;font-size:22px';document.body.appendChild(ghost);}
    if(ghost){ghost.style.left=(ev.clientX-12)+'px';ghost.style.top=(ev.clientY-14)+'px';}}
   function up(ev){document.removeEventListener('pointermove',mv,true);document.removeEventListener('pointerup',up,true);if(ghost)ghost.remove();
    var sys=it.getAttribute('data-sys'),k2=it.getAttribute('data-dev');
    if(!moved){if(sys){p.remove();openSys(sys);}else{var cv=document.querySelector('.hscanvas');if(cv){var R=cv.getBoundingClientRect();place(k2,R.left+R.width/2,R.top+R.height/2);}p.remove();}return;}
    if(overTray(ev)){if(sys)trayAdd({sys:sys});else{var id=place(k2,null,null,true);if(id)trayAdd({cam:id});}return;}
    if(!sys)place(k2,ev.clientX,ev.clientY);}
   document.addEventListener('pointermove',mv,true);document.addEventListener('pointerup',up,true);});});
 setTimeout(function(){document.addEventListener('pointerdown',function cl(e){if(!p.contains(e.target)&&!(e.target.closest&&e.target.closest('.hsdevbtn'))){p.remove();}document.removeEventListener('pointerdown',cl,true);},true);},0);}
function place(kind,cx,cy,force){var s=S(),cv=document.querySelector('.hscanvas');if(!s||!cv)return null;var R=cv.getBoundingClientRect();
 if(cx==null){cx=R.left+R.width/2;cy=R.top+R.height/2;}else if(!force&&!(cx>=R.left&&cx<=R.right&&cy>=R.top&&cy<=R.bottom))return null;
 var f=s.floors.filter(function(x){return x.id===s.cur;})[0]||s.floors[0];f.cams=f.cams||[];var d=dev(kind),n=f.cams.filter(function(x){return x.kind===kind;}).length+1,k=ratio(cv);
 var id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
 f.cams.push({id:id,kind:kind,name:d.n+' '+n,x:Math.max(0,Math.round((cx-R.left)/k+cv.scrollLeft-15)),y:Math.max(0,Math.round((cy-R.top)/k+cv.scrollTop-15)),url:'',adapter:'demo'});
 persist();rerender();return id;}
/* ---------- device card ---------- */
function enhance(o){var P=o.firstElementChild;if(!P||P.__cam)return;if(!o.querySelector('input.cu'))return;P.__cam=1;P.classList.add('camcard');
 var x=lastCam&&camById(lastCam);var cm=x?x.c:null;var d=dev(cm?cm.kind:'camera');
 var t=P.querySelector(':scope > b');if(t&&cm)t.textContent=cm.name+' \u00b7 '+(d.k==='camera'||d.k==='doorbell'?'live feed':d.n);
 try{var z=JSON.parse(localStorage.getItem(SZK)||'null');if(z&&z.w>=300&&z.h>=260){P.style.width=z.w+'px';P.style.height=z.h+'px';}}catch(_){}
 var X=document.createElement('span');X.className='ctl x boxclose camx';X.setAttribute('data-x','');X.setAttribute('role','button');X.title='Close';X.setAttribute('aria-label','Close');X.textContent='\u2715';P.appendChild(X);
 [].forEach.call(P.querySelectorAll('label > input'),function(i){var w=document.createElement('span');w.className='cmw';i.parentNode.insertBefore(w,i);w.appendChild(i);var m=i.__fmic&&w.parentNode.querySelector(':scope > .fmic');if(m)w.appendChild(m);});
 var feed=P.querySelector('.hsfeed');if(feed){var ind=document.createElement('span');ind.className='camind';ind.innerHTML='<i></i>REC <b>00:00</b>';feed.appendChild(ind);}
 var bar=P.querySelector('.hsbar');
 if(bar){var rb=document.createElement('button');rb.className='camrec';rb.type='button';rb.textContent='\u23fa Record';rb.title='Record this feed to a file on this computer';bar.insertBefore(rb,bar.firstChild);rb.addEventListener('click',function(e){e.stopPropagation();toggleRec(P,rb);});
  var rm=bar.querySelector('.rm');if(rm){rm.textContent='Remove URL';rm.title='Clear the stream URL (keeps the device on the plan)';rm.onclick=function(e){e.stopPropagation();if(!cm)return;if(!confirm('Clear the stream URL for '+cm.name+'? The device stays on the plan.'))return;cm.url='';persist();rerender();var cu=P.querySelector('.cu');if(cu)cu.value='';if(feed){stopRec(P);[].forEach.call(feed.querySelectorAll('video,img,iframe'),function(v){v.remove();});if(!feed.querySelector('.cnc')){var s0=document.createElement('span');s0.className='cnc';s0.textContent='Not connected';feed.insertBefore(s0,feed.firstChild);}}upNc(P,cm);};}}
 if(cm&&d.ctl){var g=document.createElement('div');g.className='cdgrid';P.insertBefore(g,bar||null);buildCtl(g,cm,d);}
 if(cm){var del=document.createElement('button');del.type='button';del.className='camdel';del.textContent='Delete device';del.addEventListener('click',function(e){e.stopPropagation();if(!confirm('Delete '+cm.name+' from the plan?'))return;
   var s=S();s.floors.forEach(function(f){f.cams=(f.cams||[]).filter(function(c){return c.id!==cm.id;});});trayDel(function(it){return it.cam===cm.id;});persist();stopRec(P);o.remove();rerender();});P.appendChild(del);}
 var G=document.createElement('span');G.className='camrz';G.title='Resize (drag the corner)';P.appendChild(G);var rz=null;
 G.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();e.stopPropagation();rz={id:e.pointerId,sx:e.clientX,sy:e.clientY,w:P.offsetWidth,h:P.offsetHeight,k:ratio(P)};try{G.setPointerCapture(e.pointerId);}catch(_){}});
 G.addEventListener('pointermove',function(e){if(!rz||e.pointerId!==rz.id)return;var mw=o.clientWidth-8,mh=o.clientHeight-8;P.style.width=Math.round(Math.max(300,Math.min(mw,rz.w+(e.clientX-rz.sx)/rz.k)))+'px';P.style.height=Math.round(Math.max(260,Math.min(mh,rz.h+(e.clientY-rz.sy)/rz.k)))+'px';});
 function gend(e){if(rz&&e.pointerId===rz.id){rz=null;try{localStorage.setItem(SZK,JSON.stringify({w:P.offsetWidth,h:P.offsetHeight}));}catch(_){}}}
 ['pointerup','pointercancel','lostpointercapture'].forEach(function(ev){G.addEventListener(ev,gend);});
 new MutationObserver(function(){if(!o.isConnected)stopRec(P);}).observe(o.parentNode||document.body,{childList:true});
 upNc(P,cm);}
function upNc(P,cm){[].forEach.call(P.querySelectorAll('.cdnc'),function(b){var on=!!(cm&&cm.url);b.textContent=on?'URL set':'Not connected';b.classList.toggle('on',on);});}
function buildCtl(g,cm,d){cm.ctl=cm.ctl||{};cm.icons=cm.icons||{};
 g.innerHTML='<div style="flex:1 1 100%;display:flex;gap:6px;align-items:center;font-size:11px"><b>Controls</b><em class="cdnc">Not connected</em><span style="opacity:.75">Local only, saved on this computer.</span></div>'+
 d.ctl.map(function(c){var v=cm.ctl[c.key];if(v==null)v=c.def!=null?JSON.parse(JSON.stringify(c.def)):false;cm.ctl[c.key]=v;var ic=cm.icons[c.key];
  var icon=ic&&/^data:image\//.test(ic)?'<img alt="" src="'+ic+'">':esc(ic||c.i);var body='';
  if(c.t==='toggle')body='<button type="button" class="cdt'+(v?' on':'')+'">'+(v?c.on:c.off)+'</button>';
  else if(c.t==='num')body='<button type="button" class="cdm">\u2212</button><input type="number" class="cdn" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'" value="'+v+'"><button type="button" class="cdp">+</button>'+c.unit;
  else if(c.t==='range')body='<input type="range" class="cdr" min="0" max="100" value="'+v+'" style="width:90px"><span class="cdv">'+v+'%</span>';
  else if(c.t==='time')body='<input type="time" class="cdtm" value="'+esc(v)+'">';
  else if(c.t==='sched')body='On <input type="time" class="cdon" value="'+esc(v.on)+'"> Off <input type="time" class="cdoff" value="'+esc(v.off)+'"><label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" class="cddusk"'+(v.dusk?' checked':'')+'>Dusk to dawn</label>';
  return '<div class="cdbox" data-k="'+c.key+'"><div class="cdh"><span class="cdic" title="Change icon">'+icon+'</span>'+esc(c.n)+'</div><div class="cdrow">'+body+'</div></div>';}).join('');
 function setv(k,v){cm.ctl[k]=v;persist();}
 d.ctl.forEach(function(c){var B=g.querySelector('.cdbox[data-k="'+c.key+'"]');if(!B)return;
  var tg=B.querySelector('.cdt');if(tg)tg.addEventListener('click',function(e){e.stopPropagation();var v=!cm.ctl[c.key];setv(c.key,v);tg.classList.toggle('on',v);tg.textContent=v?c.on:c.off;});
  var n=B.querySelector('.cdn');if(n){var cl=function(v){v=Math.max(c.min,Math.min(c.max,Math.round(+v||c.def)));n.value=v;setv(c.key,v);};n.addEventListener('change',function(){cl(n.value);});
   B.querySelector('.cdm').addEventListener('click',function(e){e.stopPropagation();cl(+n.value-c.step);});B.querySelector('.cdp').addEventListener('click',function(e){e.stopPropagation();cl(+n.value+c.step);});}
  var r=B.querySelector('.cdr');if(r)r.addEventListener('input',function(){B.querySelector('.cdv').textContent=r.value+'%';setv(c.key,+r.value);});
  var tm=B.querySelector('.cdtm');if(tm)tm.addEventListener('change',function(){setv(c.key,tm.value);});
  if(c.t==='sched'){var sv=function(){setv(c.key,{on:B.querySelector('.cdon').value,off:B.querySelector('.cdoff').value,dusk:B.querySelector('.cddusk').checked});};['.cdon','.cdoff','.cddusk'].forEach(function(q){B.querySelector(q).addEventListener('change',sv);});}
  var ic=B.querySelector('.cdic');ic.addEventListener('click',function(e){e.stopPropagation();pickIcon(g,ic,function(val){cm.icons[c.key]=val;persist();ic.innerHTML=/^data:image\//.test(val)?'<img alt="" src="'+val+'">':esc(val);});});});}
function pickIcon(g,anchor,done){var old=g.querySelector('.cdpick');if(old)old.remove();var P=g.closest('.camcard');var p=document.createElement('div');p.className='cdpick';
 p.innerHTML=EMOJI.map(function(e){return '<span>'+e+'</span>';}).join('')+'<label>Upload image\u2026<input type="file" accept="image/*" style="display:none"></label>';
 P.appendChild(p);var pr=P.getBoundingClientRect(),ar=anchor.getBoundingClientRect(),k=ratio(P);p.style.left=Math.max(4,(ar.left-pr.left)/k)+'px';p.style.top=((ar.bottom-pr.top)/k+P.scrollTop+4)+'px';
 p.addEventListener('click',function(e){e.stopPropagation();var s=e.target.closest('span');if(s){done(s.textContent);p.remove();}});
 p.querySelector('input').addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;var fr=new FileReader();fr.onload=function(){var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=c.height=48;var x=c.getContext('2d'),s=Math.min(im.width,im.height);x.drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,48,48);done(c.toDataURL('image/png'));p.remove();};im.src=fr.result;};fr.readAsDataURL(f);});}
/* ---------- Record ---------- */
function pad(n){return(n<10?'0':'')+n;}
function fname(){var d=new Date();return 'hubface-cam-'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds())+'.webm';}
function srcStream(P){var feed=P.querySelector('.hsfeed');var v=feed&&feed.querySelector('video');
 if(v&&v.captureStream){try{var s=v.captureStream();if(s.getVideoTracks().length)return Promise.resolve({s:s});}catch(_){}}
 var im=feed&&feed.querySelector('img');if(im&&im.naturalWidth){try{var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;var x=c.getContext('2d');var raf;(function dr(){x.drawImage(im,0,0);raf=requestAnimationFrame(dr);})();var s2=c.captureStream(15);return Promise.resolve({s:s2,stop:function(){cancelAnimationFrame(raf);}});}catch(_){}}
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return Promise.reject(new Error('No camera available'));
 return navigator.mediaDevices.getUserMedia({video:true}).then(function(s){if(feed){var cnc=feed.querySelector('.cnc');[].forEach.call(feed.childNodes,function(n){if(n.nodeType===3)n.remove();});var lv=document.createElement('video');lv.className='camlocal';lv.autoplay=true;lv.muted=true;lv.playsInline=true;lv.srcObject=s;feed.insertBefore(lv,feed.firstChild);try{lv.play();}catch(_){}}
  return {s:s,stop:function(){s.getTracks().forEach(function(t){t.stop();});}};});}
function stopRec(P){var R=P.__rec;if(R&&R.mr&&R.mr.state!=='inactive'){try{R.mr.stop();}catch(_){}}}
function toggleRec(P,btn){var R=P.__rec;if(R){stopRec(P);return;}if(!window.MediaRecorder){alert('Recording is not supported in this browser.');return;}
 btn.disabled=true;srcStream(P).then(function(src){btn.disabled=false;var mt=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].filter(function(m){return MediaRecorder.isTypeSupported(m);})[0];
  var mr=new MediaRecorder(src.s,mt?{mimeType:mt}:{}),ch=[],t0=Date.now(),ind=P.querySelector('.camind'),tb=ind&&ind.querySelector('b');
  var tm=setInterval(function(){var s=Math.floor((Date.now()-t0)/1000);if(tb)tb.textContent=pad(Math.floor(s/60))+':'+pad(s%60);},500);
  mr.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data);};
  mr.onstop=function(){clearInterval(tm);P.__rec=null;btn.classList.remove('on');btn.textContent='\u23fa Record';if(ind)ind.classList.remove('on');if(src.stop&&!P.querySelector('video.camlocal'))src.stop();
   var blob=new Blob(ch,{type:'video/webm'});window.__camresizeLast={size:blob.size,name:null};if(!blob.size)return;var a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=fname();window.__camresizeLast.name=a.download;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},60000);};
  P.__rec={mr:mr,src:src};mr.start(1000);btn.classList.add('on');btn.textContent='\u23f9 Stop';if(ind){ind.classList.add('on');if(tb)tb.textContent='00:00';}
 }).catch(function(e){btn.disabled=false;alert('Could not start recording: '+(e&&e.message||e));});}
/* ---------- Home Status tray ---------- */
function trayGet(){try{return JSON.parse(localStorage.getItem(TRK)||'[]')||[];}catch(_){return[];}}
function traySet(a){try{localStorage.setItem(TRK,JSON.stringify(a));}catch(_){}paintTray();}
function trayAdd(it){var a=trayGet();if(a.some(function(x){return (it.cam&&x.cam===it.cam)||(it.sys&&x.sys===it.sys);}))return;a.push(it);traySet(a);}
function trayDel(fn){traySet(trayGet().filter(function(x){return !fn(x);}));}
function small(){return document.querySelector('#ui > section[data-float="home-status"]');}
function overTray(ev){var t=document.querySelector('.hstray');if(!t||!t.offsetWidth)return false;var r=t.getBoundingClientRect();return ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom;}
function openSys(a){var sb=small();var t=sb&&sb.querySelector('.hsmini .t[data-a="'+a+'"]');if(t){t.click();}}
function openCam(id){var x=camById(id);if(!x)return trayDel(function(i){return i.cam===id;});var h=H(),s=S();if(h&&h.open)h.open();if(s&&s.cur!==x.f.id){s.cur=x.f.id;persist();rerender();}
 setTimeout(function(){var el=document.querySelector('.hscam[data-cam="'+id+'"]');if(!el)return;var r=el.getBoundingClientRect(),o={bubbles:true,cancelable:true,clientX:r.left+5,clientY:r.top+5,button:0,pointerId:91,isPrimary:true};lastCam=id;el.dispatchEvent(new PointerEvent('pointerdown',o));el.dispatchEvent(new PointerEvent('pointerup',o));},60);}
function paintTray(){var sb=small();if(!sb)return;var m=sb.querySelector(':scope > .hsmini');if(!m)return;var t=m.querySelector('.hstray');
 if(!t){t=document.createElement('div');t.className='hstray hsg';t.style.cssText='grid-column:1/3;display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-height:30px;padding:4px 6px;font-size:10px';m.insertBefore(t,m.firstChild);}
 var a=trayGet(),h='';a.forEach(function(it,ix){var ic,n;if(it.cam){var x=camById(it.cam);if(!x)return;ic=dev(x.c.kind).i;n=x.c.name;}else{var s=SYS.filter(function(q){return q.a===it.sys;})[0];if(!s)return;ic=s.i;n=s.n;}
  h+='<span class="hstri" data-ix="'+ix+'" title="'+esc(n)+' (hover or long-press for \u2715)" style="position:relative;font-size:18px;cursor:pointer;padding:2px 4px;border-radius:6px;background:rgba(255,255,255,.1)">'+ic+'<b class="hstrx" style="display:none;position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:50%;background:#d33;color:#fff;font:700 9px/14px system-ui;text-align:center">\u2715</b></span>';});
var sig=h||'-';if(t.__sig===sig)return hideOld(m);t.__sig=sig;
 t.innerHTML=h||'<span style="opacity:.7">Drag devices here for shortcuts</span>';
 [].forEach.call(t.querySelectorAll('.hstri'),function(el){var it=a[+el.dataset.ix],x=el.querySelector('.hstrx'),lp=null;
  el.addEventListener('mouseenter',function(){x.style.display='block';});el.addEventListener('mouseleave',function(){x.style.display='none';});
  el.addEventListener('pointerdown',function(e){e.stopPropagation();lp=setTimeout(function(){x.style.display='block';lp='x';},600);});
  el.addEventListener('pointerup',function(e){if(lp&&lp!=='x')clearTimeout(lp);});
  el.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();if(e.target===x){traySet(trayGet().filter(function(q){return !((it.cam&&q.cam===it.cam)||(it.sys&&q.sys===it.sys));}));return;}if(lp==='x'){lp=null;return;}if(it.cam)openCam(it.cam);else openSys(it.sys);});});
hideOld(m);}
function hideOld(m){ [].forEach.call(m.querySelectorAll(':scope > .t[data-a="lock"],:scope > .t[data-a="thermo"],:scope > .t[data-a="guest"],:scope > .t[data-a="energy"]'),function(e){if(e.style.display!=='none')e.style.display='none';});}
/* drag a placed plan icon onto the tray */
document.addEventListener('pointerup',function(e){var d=dragCam;dragCam=null;if(d&&overTray(e))trayAdd({cam:d});},true);
/* ---------- observe ---------- */
var q=false;function run(){q=false;try{patchPlan();}catch(e){}try{[].forEach.call(document.querySelectorAll('.hsdlg'),enhance);}catch(e){}try{paintTray();}catch(e){}}
new MutationObserver(function(){if(!q){q=true;Promise.resolve().then(run);}}).observe(document.documentElement,{childList:true,subtree:true});
setInterval(run,1500);run();
})();
