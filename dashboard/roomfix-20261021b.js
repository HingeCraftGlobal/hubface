/* roomfix-20261021b (Dan, Tester's live-browser fails):
   (a) #20 room box close X: room boxes are lifted above the self-video tile (.rlPanel, z 30) and a capture-phase hit test
       closes the box when its X is pressed even if something else is drawn on top of it.
   (b) #20 auto-size: Invite People and Photos/Videos boxes shrink/grow to their content, capped at the visible area.
       Stops for a box once you resize it yourself. (Properties already fits via room-fit.js.)
   (c) #16 per-bot mute: a small speaker toggle on every bot bar (Finn/Ava, Professor, Moderator, Mara, Theo). Local to this
       screen; muted bot's lines still show as text, its voice is dropped. Saved in localStorage 'hf-botmute-bars'.
       'Mic blocked' pill is nudged up when it overlaps the Bots quiet button.
   (d) Widgets panel 'Other widgets' label no longer overlaps the title; #vbFace alt follows the face (Ava / Finn).
   roomfix-20261021b (Tester real-click fails): (e) auto-fit also reads Photos/Videos .wmain content (was sized to the whole box) and
       grows a box whose body still scrolls (Invite last line); (f) Mic pill moved clear of every bot bar + Bots quiet (right of the
       bars, or above them if no room); (g) transcript box kept inside the viewport and above the Mic pill so its resize handle stays
       reachable; (h) dashboard AI pick restored to what it was before a room invite (Finn no longer sticks over Ava);
       (i) News Briefing opens expanded the first time and at least 260px tall so headlines show.
   Replaces roomfix-20261021a incl. the avamute-20261021a edit (same features). Roll back: remove the roomfix-20261021b include line from index.html (files can stay). */
(function(){
  if(window.__roomFix)return;window.__roomFix='roomfix-20261021b';
  var BUILD='roomfix-20261021b';
  function A(){try{return window.__rb&&window.__rb.App;}catch(e){return null;}}
  function ui(){return document.getElementById('ui');}
  function room(){return document.documentElement.classList.contains('rb-room');}
  function vis(e){return !!(e&&e.offsetWidth&&e.offsetHeight&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');}
  function inR(r,x,y){return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}

  /* ---------- (a) close X ---------- */
  function lift(){if(!room())return;document.querySelectorAll('#ui > section.rbbox').forEach(function(b){var z=+b.style.zIndex||0;if(z<=30)b.style.zIndex=String(z+31);});}
  function closeBox(b){var k=b.dataset.k,App=A();if(App&&k&&App.wins&&App.wins[k]===b){App.close(k);try{App.rerender('picker');}catch(e){}return true;}return false;}
  function xAt(x,y){var best=null,bz=-1;document.querySelectorAll('#ui > section.rbbox > .boxclose').forEach(function(c){if(!vis(c))return;var r=c.getBoundingClientRect();
    if(!inR(r,x,y))return;var z=+c.parentNode.style.zIndex||0;if(z>bz){bz=z;best=c;}});return best;}
  var pressed=null;
  document.addEventListener('pointerdown',function(e){if(!room())return;var c=xAt(e.clientX,e.clientY);pressed=c;if(!c)return;
    if(e.target!==c&&!c.contains(e.target)){e.stopPropagation();e.preventDefault();}},true);
  document.addEventListener('click',function(e){if(!room())return;var c=xAt(e.clientX,e.clientY)||(e.target&&e.target.closest&&e.target.closest('#ui > section.rbbox > .boxclose'));
    if(!c)return;var b=c.parentNode;e.stopPropagation();e.preventDefault();closeBox(b);},true);

  /* ---------- (b) auto-size ---------- */
  var FIT=['#ui > section.rbbox[data-k=invite]','#ui > .wbx[data-w=media]','#ui > section.rbbox[data-k=__media]'];
  function natH(box){var br=box.getBoundingClientRect(),sc=box.offsetHeight?br.height/box.offsetHeight:1,mx=0;
    var bd=box.querySelector(':scope > .rbbd')||box.querySelector(':scope > .wbody')||box.querySelector(':scope > .wmain')||box.querySelector(':scope > .bd');
    function take(c){if(!vis(c))return;var r=c.getBoundingClientRect();var b=(r.bottom-br.top)/sc;if(b>mx)mx=b;}
    [].forEach.call(box.children,function(c){if(c===bd)return;if(/\b(ctl|fogpop|fhandle|rbgrip|bsgrip)\b/.test(c.className)||getComputedStyle(c).position==='absolute')return;take(c);});
    if(bd){[].forEach.call(bd.children,take);var cs=getComputedStyle(bd);mx+=(parseFloat(cs.paddingBottom)||0)+(parseFloat(cs.borderBottomWidth)||0);}
    return Math.ceil(mx+8);}
  function fitOne(box){if(!vis(box)||box.classList.contains('collapsed')||box._rfUser)return;
    if(box._rfH&&Math.abs(box.offsetHeight-box._rfH)>3){box._rfUser=1;return;}
    var u=ui(),cap=Math.max(120,(u?u.clientHeight:576)-box.offsetTop-6),h=Math.max(90,Math.min(cap,natH(box)));
    if(Math.abs(h-box.offsetHeight)<=3){box._rfH=box.offsetHeight;return;}
    var id=box.getAttribute('data-float'),done=false;
    if(id&&window.__boxSize){try{done=window.__boxSize.set(id,box.offsetWidth,h)!==null;}catch(e){}}
    if(!done||Math.abs(box.offsetHeight-h)>3)box.style.setProperty('height',h+'px','important');
    box._rfH=box.offsetHeight;
    var b2=box.querySelector(':scope > .rbbd')||box.querySelector(':scope > .wmain');if(b2&&b2.scrollHeight>b2.clientHeight+1&&box.offsetHeight<cap){
      var h2=Math.min(cap,box.offsetHeight+(b2.scrollHeight-b2.clientHeight)+2);box.style.setProperty('height',h2+'px','important');box._rfH=box.offsetHeight;}}
  function fitAll(){FIT.forEach(function(s){document.querySelectorAll(s).forEach(fitOne);});}

  /* ---------- (c) per-bot mute ---------- */
  var MK='hf-botmute-bars';
  function mload(){try{return JSON.parse(localStorage.getItem(MK)||'{}')||{};}catch(e){return {};}}
  function persona(bar){if(bar.dataset.agent)return bar.dataset.agent;var sel=document.querySelector('#aiDd [aria-selected=true][data-ai]');if(sel)return sel.getAttribute('data-ai')==='ava'?'ava':'finn';var stt=document.getElementById('vbStatus');if(stt&&/^\s*Ava\b/.test(stt.textContent))return 'ava';var f=bar.querySelector('#vbFace,.portrait'),s=(f&&(f.currentSrc||f.src))||'';
    return /ava/i.test(s.split('/').pop())?'ava':'finn';}
  function key(bar){return bar.dataset.agent?String(bar.dataset.agent).toLowerCase():persona(bar);}  /* avamute-20261021a merged: the shared Finn/Ava bar mutes whoever is on it */  /* Finn/Ava share one bar and one voice queue */
  function label(bar){if(!bar.dataset.agent)return persona(bar)==='ava'?'Ava':'Finn';var n=bar.querySelector('.aname,.atext > span');
    var t=((n&&n.textContent.trim().split(/[\s\u00b7\u2014:-]/)[0])||bar.dataset.agent);return t.charAt(0).toUpperCase()+t.slice(1);}
  function muted(k){if(k==='finn'||k==='ava')return false;return !!mload()[k];}
  try{var m0=mload();if(m0.finn||m0.ava){delete m0.finn;delete m0.ava;localStorage.setItem(MK,JSON.stringify(m0));}}catch(e){}
  var SPK='<path d="M11 5 6 9H2v6h4l5 4V5z"/>',WAV='<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/>',X='<line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/>';
  function paintBtn(bar){var b=bar.querySelector(':scope > .rfMute');if(!b){b=document.createElement('span');b.className='rfMute';b.setAttribute('role','button');b.tabIndex=0;bar.appendChild(b);}
    var k=key(bar),m=muted(k),n=label(bar),t=(m?'Unmute ':'Mute ')+n+' (only on this screen)',h='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+SPK+(m?X:WAV)+'</svg>';
    if(b._h!==h){b.innerHTML=h;b._h=h;}b.classList.toggle('on',m);b.dataset.bot=k;b.setAttribute('aria-pressed',m?'true':'false');b.title=t;b.setAttribute('aria-label',t);}
  function bars(){return [].slice.call(document.querySelectorAll('#ui > section.ava')).filter(function(b){return b.id==='vbBar'||b.dataset.agent;});}
  function paintAll(){bars().forEach(function(b){if(b.id==='vbBar'){var o=b.querySelector(':scope > .rfMute');if(o)o.remove();return;}paintBtn(b);});}  /* finn-mute-20261025: no per-screen mute on Finn/Ava bar */
  var lastKey=null;
  function setMute(k,on){var m=mload();if(on)m[k]=1;else delete m[k];try{localStorage.setItem(MK,JSON.stringify(m));}catch(e){}
    if(on){try{if(lastKey===k&&window.speechSynthesis&&speechSynthesis.speaking)speechSynthesis.cancel();}catch(e){}
      document.querySelectorAll('audio').forEach(function(a){if(a._rfBot===k&&!a.paused){try{a.pause();a.dispatchEvent(new Event('ended'));}catch(e){}}});}
    paintAll();}
  function toggleFrom(el){var k=el.dataset.bot;if(k)setMute(k,!muted(k));}
  ['pointerdown','mousedown','dblclick'].forEach(function(n){document.addEventListener(n,function(e){if(e.target.closest&&e.target.closest('.rfMute'))e.stopPropagation();},true);});
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.rfMute');if(!b)return;e.stopPropagation();e.preventDefault();toggleFrom(b);},true);
  document.addEventListener('keydown',function(e){var b=e.target.closest&&e.target.closest('.rfMute');if(!b||(e.key!=='Enter'&&e.key!==' '))return;e.preventDefault();toggleFrom(b);},true);
  function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
  /* who is saying this text? the bar whose shown line matches it; otherwise the bar that is in a speaking/thinking state */
  function whoSays(text){var t=norm(text).slice(0,24);if(!t)return null;var hit=null;
    bars().forEach(function(b){if(hit)return;var ln=b.querySelector('#vbLine,.atext > b,.atext > em')||b.querySelector('.atext')||b;var s=norm(ln.textContent);if(s&&(s.indexOf(t)>=0||(s.length>=12&&t.indexOf(s.slice(0,24))>=0)))hit=key(b);});
    if(!hit){var act=bars().filter(function(b){return /\b(speaking|thinking|talking|busy)\b/.test(b.className)||/speaking|thinking/.test(b.getAttribute('data-state')||'');});if(act.length===1)hit=key(act[0]);}
    return hit;}
  try{var ss=window.speechSynthesis;if(ss){var sp=ss.speak;ss.speak=function(u){var k=null;try{k=whoSays(u&&u.text);}catch(e){}lastKey=k;
    if(k&&muted(k)){setTimeout(function(){try{if(u&&typeof u.onend==='function')u.onend({type:'end',utterance:u});}catch(e){}},30);return;}
    return sp.apply(ss,arguments);};}}catch(e){}
  /* Finn/Ava server-TTS clips (<audio> from /api/tts outside the room queue, which room-live.js handles with its own mute) */
  var ttsBlobs=new WeakSet(),ttsUrls=new Set();
  try{var rb=Response.prototype.blob;Response.prototype.blob=function(){var r=this,p=rb.apply(this,arguments);if(/\/api\/tts|\/tts\b/i.test(r.url||''))p=p.then(function(b){try{ttsBlobs.add(b);}catch(e){}return b;});return p;};}catch(e){}
  try{var cou=URL.createObjectURL;URL.createObjectURL=function(o){var u=cou.apply(URL,arguments);try{if(o&&ttsBlobs.has(o))ttsUrls.add(u);}catch(e){}return u;};}catch(e){}
  try{var pl=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){var el=this;
    try{if(el.tagName!=='VIDEO'&&!el._rfSkip){var src=el.currentSrc||el.src||'';var st=(new Error().stack)||'';
      if((ttsUrls.has(src)||/^data:audio|\/api\/tts/i.test(src))&&!/room-live\.js/.test(st)){var vb=document.getElementById('vbBar');var k=null;
        if(/agent-panel\.js|companion\.js|moderator\.js|professor\.js/.test(st)){k=lastKey;}else if(vb)k=persona(vb);/* avamute-20261021a */
        if(k){el._rfBot=k;if(muted(k)){try{el.pause();}catch(e){}setTimeout(function(){try{el.dispatchEvent(new Event('ended'));}catch(e){}},30);return Promise.resolve();}}}}}catch(e){}
    return pl.apply(this,arguments);};}catch(e){}

  /* (f) Mic pill clear of the bot bars and Bots quiet */
  function hit(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
  function pillFix(){var obs=[];var q=document.getElementById('hfBotQuiet');if(q&&vis(q))obs.push(q.getBoundingClientRect());
    bars().forEach(function(b){if(vis(b)){var r=b.getBoundingClientRect();if(r.bottom>innerHeight*0.55)obs.push(r);}});
    document.querySelectorAll('.vl-pill').forEach(function(p){if(!vis(p))return;
      p.style.removeProperty('translate');p.style.removeProperty('max-width');p.style.removeProperty('white-space');
      var r=p.getBoundingClientRect(),o=obs.filter(function(x){return hit(r,x);});if(!o.length)return;
      var right=Math.max.apply(null,o.map(function(x){return x.right;}))+8,avail=innerWidth-8-right;
      var s=p.offsetWidth?r.width/p.offsetWidth:1;
      if(avail>=170){var dx=(right-r.left)/s;var w=Math.min(r.width,avail);p.style.setProperty('translate',Math.round(dx)+'px 0');
        if(w<r.width){p.style.setProperty('max-width',Math.floor(w/s)+'px','important');p.style.setProperty('white-space','normal','important');}
        var r2=p.getBoundingClientRect(),o2=obs.filter(function(x){return hit(r2,x);});if(r2.bottom>innerHeight-2){p.style.setProperty('translate',Math.round(dx)+'px '+Math.round((innerHeight-4-r2.bottom)/s)+'px');}
        if(!o2.length)return;p.style.removeProperty('max-width');p.style.removeProperty('white-space');}
      /* no room on the right: sit just above the bars, inside their width */
      var top=Math.min.apply(null,o.map(function(x){return x.top;})),L=Math.min.apply(null,o.map(function(x){return x.left;})),Rr=Math.max.apply(null,o.map(function(x){return x.right;}));
      p.style.setProperty('max-width',Math.floor((Rr-L)/s)+'px','important');p.style.setProperty('white-space','normal','important');
      var r3=p.getBoundingClientRect();p.style.setProperty('translate',Math.round((L-r3.left)/s)+'px '+(-Math.round((r3.bottom-top+8)/s))+'px');});}
  /* (g) transcript: own resize (the page's fitTrx rewrote the height every tick, so drags did not stick), kept inside the
     viewport and above the Mic pill so the handle stays reachable. Height via min/max-height so fitTrx can't undo it. */
  var TH='hf-trx-h',want=+(function(){try{return sessionStorage.getItem(TH);}catch(e){return 0;}})()||0,drag=null;
  function trxT(){return document.getElementById('yTrx');}
  function trxLim(t){var r=t.getBoundingClientRect(),lim=innerHeight-6;var u=ui();if(u){var ur=u.getBoundingClientRect();lim=Math.min(lim,ur.bottom-4);}
    document.querySelectorAll('.vl-pill, .hfa-entry, #hfBotQuiet').forEach(function(p){if(!vis(p))return;var pr=p.getBoundingClientRect();if(pr.left<r.right&&pr.right>r.left&&pr.top>r.top+40)lim=Math.min(lim,pr.top-6);});return lim;}
  function trxApply(t,h){var r=t.getBoundingClientRect(),s=t.offsetHeight?r.height/t.offsetHeight:1,max=Math.floor((trxLim(t)-r.top)/s);h=Math.round(Math.max(60,Math.min(max,h)));
    if(max<60)h=Math.max(40,max);var v=h+'px';if(t.style.getPropertyValue('min-height')!==v){t.style.setProperty('min-height',v,'important');t.style.setProperty('max-height',v,'important');}return h;}
  function trxClamp(){var t=trxT();if(!t||!t.classList.contains('open')||!vis(t))return;if(want)trxApply(t,want);else{var r=t.getBoundingClientRect(),L=trxLim(t);if(r.bottom>L+1){trxApply(t,t.offsetHeight-(r.bottom-L));}}}
  document.addEventListener('pointerdown',function(e){var g=e.target.closest&&e.target.closest('#yTrx .rfgrip');if(!g)return;var t=trxT();e.stopPropagation();e.preventDefault();
    var r=t.getBoundingClientRect();drag={y:e.clientY,h:t.offsetHeight,s:t.offsetHeight?r.height/t.offsetHeight:1};t.classList.add('rfdrag');try{g.setPointerCapture(e.pointerId);}catch(_){}},true);
  document.addEventListener('pointermove',function(e){if(!drag)return;e.stopPropagation();var t=trxT();if(t)want=trxApply(t,drag.h+(e.clientY-drag.y)/drag.s);},true);
  function dend(){if(!drag)return;drag=null;var t=trxT();if(t){t.classList.remove('rfdrag');try{sessionStorage.setItem(TH,String(want));}catch(_){}}}
  document.addEventListener('pointerup',dend,true);document.addEventListener('pointercancel',dend,true);
  /* (h) dashboard AI pick restored after a room invite */
  var AK='hf-rf-dash-ai';
  function curAi(){var r=document.querySelector('#aiDd .dd-row[data-ai][aria-selected="true"]');return r?r.getAttribute('data-ai'):null;}
  var wasRoom=null;
  function aiGuard(){var inr=room();if(inr&&wasRoom===false){var c=curAi();if(c){try{localStorage.setItem(AK,c);}catch(e){}}}
    if(!inr){var want=null;try{want=localStorage.getItem(AK);}catch(e){}if(want){var c2=curAi();if(c2&&c2!==want){var row=document.querySelector('#aiDd .dd-row[data-ai="'+want+'"]');if(row)row.click();}
      if(curAi()===want||!document.querySelector('#aiDd .dd-row[data-ai="'+want+'"]')){try{localStorage.removeItem(AK);}catch(e){}}}}
    wasRoom=inr;}
  /* (i) News Briefing first open: expanded, tall enough for headlines */
  var NK='hf-rf-news-first';
  function newsFit(){if(room())return;var b=document.querySelector('#ui > section.box[data-float="news-briefing"]');if(!b||!vis(b))return;var done=null;try{done=localStorage.getItem(NK);}catch(e){}
    if(!done){if(b.classList.contains('collapsed')){var m=b.querySelector(':scope > .boxmin');if(m)m.click();}
      if(!b.classList.contains('collapsed')&&b.offsetHeight<260){var okk=false;if(window.__boxSize){try{okk=window.__boxSize.set('news-briefing',Math.max(b.offsetWidth,230),260)!==null;}catch(e){}}if(!okk||b.offsetHeight<250)b.style.height='260px';}
      try{localStorage.setItem(NK,'1');}catch(e){}}}

  /* ---------- (d) cosmetics ---------- */
  function widgetsLabel(){var p=document.querySelector('#ui > aside.panel:not(.props)');if(!p)return;var l=p.querySelector(':scope > .wfrlbl'),h=p.querySelector(':scope > h2');
    if(!l||!h||room()||!vis(l)||!vis(h))return;var a=l.getBoundingClientRect(),c=h.getBoundingClientRect();
    var txt=document.createRange();txt.selectNodeContents(h);var tr=txt.getBoundingClientRect();
    if(a.left<tr.right+4&&a.right>tr.left&&a.top<tr.bottom&&a.bottom>tr.top){l.style.setProperty('top',(h.offsetTop+h.offsetHeight+1)+'px','important');l.style.setProperty('left',(h.offsetLeft)+'px','important');l.style.setProperty('right','auto','important');l.style.setProperty('text-align','left','important');}}
  function faceAlt(){var f=document.getElementById('vbFace');if(!f)return;var bar=document.getElementById('vbBar');var n=bar?(persona(bar)==='ava'?'Ava':'Finn'):(/ava/i.test((f.currentSrc||f.src||'').split('/').pop())?'Ava':'Finn');
    if(/yoda/i.test(document.documentElement.className)&&0)n='Ava';if(f.alt!==n)f.alt=n;}

  function tick(){try{lift();}catch(e){}try{fitAll();}catch(e){}try{paintAll();}catch(e){}try{pillFix();}catch(e){}try{widgetsLabel();}catch(e){}try{trxClamp();}catch(e){}try{aiGuard();}catch(e){}try{newsFit();}catch(e){}try{faceAlt();}catch(e){}}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;tick();},80);}
  function start(){var u=ui();if(!u){setTimeout(start,400);return;}
    new MutationObserver(soon).observe(u,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src']});
    new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    addEventListener('resize',soon);setInterval(tick,1000);tick();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.__roomFixApi={build:BUILD,muted:muted,setMute:setMute,whoSays:whoSays,fit:fitAll,tick:tick};
})();
