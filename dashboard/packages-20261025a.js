/* packages-20261025a (Dan approved by voice, Oct 25 2026): PACKAGES floating glass box, signed-in OWNER only.
   Data: GET /api/account/packages-feed (owner-gated; built from Dan's carrier emails, read-only Gmail; no carrier API).
   Guests / non-owners get 401/403 -> nothing is added to the page. Main dashboard only (never html.rb-room).
   Left Widgets row "Packages" toggles the box; while the box is closed a red glowing dot on that row counts parcels with
   an alert or a change not yet seen (seen state: localStorage hf-pkg-seen {parcelKey: sig}). Opening the box marks them seen.
   Roll back: remove the packages-20261025a tags from index.html (backup /root/hubface-backups/packages-20261025/). */
(function(){
  "use strict";
  if(window.__packages)return;
  var CK='hf-pkg-closed',SK='hf-pkg-seen',STAGES=['Ordered','Shipped','Out for delivery','Delivered'];
  var feed=null,box=null,item=null,seenT=null;
  function room(){return document.documentElement.classList.contains('rb-room');}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function ls(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}}
  function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function closed(){return !!ls(CK,0);}
  function unseen(){if(!feed)return [];var s=ls(SK,{});return (feed.parcels||[]).filter(function(p){return s[p.key]!==p.sig;});}
  function badgeCount(){return unseen().length;}
  function markSeen(){if(!feed)return;var s=ls(SK,{});(feed.parcels||[]).forEach(function(p){s[p.key]=p.sig;});lsSet(SK,s);paintItem();}
  function front(){var z=0;document.querySelectorAll('#ui > section.floatbox').forEach(function(o){if(o!==box)z=Math.max(z,+o.style.zIndex||0);});box.style.zIndex=z+1;}
  function setClosed(c){lsSet(CK,c?1:0);if(box){box.classList.toggle('closed',c);if(!c){front();clearTimeout(seenT);seenT=setTimeout(markSeen,1200);}}paintItem();}
  function makeBox(){
    box=document.createElement('section');box.className='box pkbox';box.style.cssText='left:620px;top:300px;width:250px;height:200px';
    box.setAttribute('data-float','packages');
    /* widget-x-20261025: same header set as Priorities: auto fog, minimize (four arrows), X; corner resize grip */
    box.innerHTML='<header><b>PACKAGES</b><em class="pksum"></em><em class="pkal" hidden></em></header>'+
      '<span class="ctl fogbtn" role="button" title="Auto fog" aria-pressed="false" style="left:186px;top:10px"><svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 18.5h10.5a4.2 4.2 0 0 0 .6-8.35A6.2 6.2 0 0 0 6.3 9.3 4.6 4.6 0 0 0 7 18.5z"/></svg></span>'+
      '<span class="ctl" style="left:191px;top:10px"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/></svg></span>'+
      '<span class="ctl" style="left:204px;top:10px"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h5V4M9 9 3.5 3.5M20 9h-5V4M15 9l5.5-5.5M4 15h5v5M9 15l-5.5 5.5M20 15h-5v5M15 15l5.5 5.5"/></svg></span>'+
      '<span class="ctl x boxclose" role="button" title="Close Packages" aria-label="Close Packages" style="left:221px;top:6.5px"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>'+
      '<div class="pkrows"></div><div class="fogpop af" style="left:116px;top:30px"><b>FOG</b><em>AUTO</em><span class="pct">--</span><div class="trk"><div class="fill" style="width:0%"></div><div class="knob" style="left:0%"></div></div></div><i class="pin af" style="left:190px;top:26px"></i>';
    document.getElementById('ui').appendChild(box);
    var x=box.querySelector('.boxclose');
    x.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();});
    x.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();setClosed(true);});
    box.querySelector('.pkrows').addEventListener('click',function(e){var r=e.target.closest('.pkrow');if(!r)return;var u=r.getAttribute('data-link');if(u)window.open(u,'_blank','noopener');});
    try{if(window.__float&&window.__float.adopt)window.__float.adopt(box);}catch(e){}
    try{window.__boxMin.adopt(box);}catch(e){}try{window.__fog.adopt(box.querySelector('.fogbtn'));}catch(e){}
    try{window.__boxSize.adopt(box);var g=box.querySelector(':scope > .boxresize');if(g&&!g.classList.contains('cgrip')){g.classList.add('cgrip');g.innerHTML='';g.style.left='';g.style.top='';g.title='Resize (drag the corner)';g.setAttribute('aria-label','Resize');box.appendChild(g);}}catch(e){}
    /* keep the dropped spot across reloads: own key hf-pkg-pos (the shared hinge-float-pos can be rewritten by layout restore) */
    var fp=ls('hinge-float-pos',{})||{},pp=(fp&&fp.packages)||ls('hf-pkg-pos',null);
    if(pp&&isFinite(pp.x)&&isFinite(pp.y)){try{window.__float.move('packages',pp.x,pp.y);}catch(e){box.style.left=pp.x+'px';box.style.top=pp.y+'px';}}
    var fh=box.querySelector(':scope > .fhandle');
    if(fh){var keep=function(){setTimeout(function(){lsSet('hf-pkg-pos',{x:box.offsetLeft,y:box.offsetTop});},0);};fh.addEventListener('pointerup',keep);fh.addEventListener('dblclick',function(){setTimeout(function(){try{localStorage.removeItem('hf-pkg-pos');}catch(e){}},0);});}
    if(closed())box.classList.add('closed');
  }
  function makeItem(){
    var p=document.querySelector('#ui > aside.panel:not(.props)');if(!p)return;
    var hs=null;p.querySelectorAll('.witem').forEach(function(w){var s=w.querySelector('span');if(s&&s.textContent.trim()==='Home Status')hs=w;});
    item=document.createElement('div');item.className='witem pkitem';item.setAttribute('role','button');item.title='Packages';
    item.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8M7.5 5.5l9 5"/></svg><span>Packages</span><b class="pkdot"></b>';
    item.style.top=((hs?parseFloat(hs.style.top):212)+0.5)+'px';
    if(hs&&hs.nextSibling)p.insertBefore(item,hs.nextSibling);else p.appendChild(item);
    item.addEventListener('click',function(e){e.stopPropagation();setClosed(!closed());});
    item.addEventListener('dblclick',function(e){e.stopPropagation();});
  }
  function paintItem(){if(!item)return;var c=closed(),n=c?badgeCount():0;item.classList.toggle('boxoff',c);item.classList.toggle('pkhas',n>0);
    var d=item.querySelector('.pkdot');if(d)d.textContent=n>0?String(n):'';item.title=n?('Packages: '+n+' new update'+(n>1?'s':'')+' or alert'+(n>1?'s':'')):'Packages';}
  function rowHTML(p){
    var sev=(p.alerts||[]).some(function(a){return a.severity==='red';})?'':'amber',al=p.alerts||[];
    var bar='';for(var i=0;i<4;i++)bar+='<i class="'+(i<=p.stage?'on':'')+'"></i>';
    var w=al.map(function(a){return '<div class="pkwarn '+(a.severity==='red'?'':'amber')+'" title="'+esc(a.text)+'">\u26a0 '+esc(a.label)+': '+esc(a.text)+'</div>';}).join('');
    return '<div class="pkrow'+(al.length?' alert '+sev:'')+'" data-key="'+esc(p.key)+'" data-link="'+esc(p.link||'')+'" title="'+esc(p.subject)+'">'+
      '<div class="pktop"><span class="pkcar">'+esc(p.carrier)+'</span><span class="pktrk">'+(p.tracking?esc(p.tracking):'no tracking number yet')+'</span><span class="pkst">'+esc(STAGES[p.stage]||'')+(p.eta&&p.stage<3?' \u00b7 '+esc(p.eta):'')+'</span></div>'+
      '<div class="pkbar">'+bar+'</div><div class="pklab"><span>Ordered</span><span>Shipped</span><span>Out for delivery</span><span>Delivered</span></div>'+w+'</div>';
  }
  function render(){
    if(!box)return;var ps=feed.parcels||[],n=feed.arrivingToday||0,ac=feed.alertCount||0;
    box.querySelector('.pksum').textContent=ps.length?(n+' arriving today'):'';
    var al=box.querySelector('.pkal');al.hidden=!ac;al.textContent=ac+' alert'+(ac>1?'s':'');
    al.classList.toggle('amber',!ps.some(function(p){return (p.alerts||[]).some(function(a){return a.severity==='red';});}));
    var t=new Date(feed.generatedAt),ts=isNaN(t)?'':t.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    box.querySelector('.pkrows').innerHTML=(ps.length?ps.map(rowHTML).join(''):'<div class="pkempty">No Amazon, UPS, FedEx or USPS shipping emails in the last '+(feed.windowDays||21)+' days.</div>')+
      '<div class="pkfoot">From your carrier emails \u00b7 updated '+esc(ts)+'</div>';
    box.setAttribute('data-live','packages');
    if(!closed()){clearTimeout(seenT);seenT=setTimeout(markSeen,1200);}
    paintItem();
  }
  function teardown(){if(box){try{window.__float&&window.__float.drop&&window.__float.drop(box);}catch(e){}box.remove();box=null;}if(item){item.remove();item=null;}feed=null;}
  function load(){
    if(room())return;
    fetch('/api/account/packages-feed',{credentials:'same-origin',cache:'no-store'}).then(function(r){if(r.status===401||r.status===403){teardown();return null;}if(!r.ok)return null;return r.json();})
      .then(function(d){if(!d||!Array.isArray(d.parcels))return;feed=d;if(!box)makeBox();if(!item)makeItem();render();}).catch(function(){});
  }
  window.__packages={reload:load,feed:function(){return feed;},badge:badgeCount,markSeen:markSeen,open:function(){setClosed(false);},close:function(){setClosed(true);},
    summary:function(){if(!feed)return 'Package info is not available.';var ps=feed.parcels||[];if(!ps.length)return 'No packages on the way from your carrier emails.';
      var a=feed.alertCount||0;return (feed.arrivingToday||0)+' arriving today, '+ps.length+' tracked'+(a?', '+a+' with alerts':'')+'.';}};
  function start(){if(!document.getElementById('ui')||!window.__float){setTimeout(start,500);return;}setTimeout(load,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  setInterval(function(){if(!document.hidden)load();},300000);
  window.addEventListener('focus',function(){if(feed)load();});
})();
