/* roomfix-20261021a (Dan, Tester's live-browser fails):
   (a) #20 room box close X: room boxes are lifted above the self-video tile (.rlPanel, z 30) and a capture-phase hit test
       closes the box when its X is pressed even if something else is drawn on top of it.
   (b) #20 auto-size: Invite People and Photos/Videos boxes shrink/grow to their content, capped at the visible area.
       Stops for a box once you resize it yourself. (Properties already fits via room-fit.js.)
   (c) #16 per-bot mute: a small speaker toggle on every bot bar (Finn/Ava, Professor, Moderator, Mara, Theo). Local to this
       screen; muted bot's lines still show as text, its voice is dropped. Saved in localStorage 'hf-botmute-bars'.
       'Mic blocked' pill is nudged up when it overlaps the Bots quiet button.
   (d) Widgets panel 'Other widgets' label no longer overlaps the title; #vbFace alt follows the face (Ava / Finn).
   Roll back: remove the roomfix-20261021a include line from index.html (files can stay). */
(function(){
  if(window.__roomFix)return;window.__roomFix='roomfix-20261021a';
  var BUILD='roomfix-20261021a';
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
    var bd=box.querySelector(':scope > .rbbd')||box.querySelector(':scope > .wbody')||box.querySelector(':scope > .bd');
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
    box._rfH=box.offsetHeight;}
  function fitAll(){FIT.forEach(function(s){document.querySelectorAll(s).forEach(fitOne);});}

  /* ---------- (c) per-bot mute ---------- */
  var MK='hf-botmute-bars';
  function mload(){try{return JSON.parse(localStorage.getItem(MK)||'{}')||{};}catch(e){return {};}}
  function persona(bar){if(bar.dataset.agent)return bar.dataset.agent;var sel=document.querySelector('#aiDd [aria-selected=true][data-ai]');if(sel)return sel.getAttribute('data-ai')==='ava'?'ava':'finn';var stt=document.getElementById('vbStatus');if(stt&&/^\s*Ava\b/.test(stt.textContent))return 'ava';var f=bar.querySelector('#vbFace,.portrait'),s=(f&&(f.currentSrc||f.src))||'';
    return /ava/i.test(s.split('/').pop())?'ava':'finn';}
  function key(bar){return bar.dataset.agent?String(bar.dataset.agent).toLowerCase():persona(bar);}  /* avamute-20261021a: the shared Finn/Ava bar mutes whoever is on it, so a Finn mute no longer silences Ava */  /* Finn/Ava share one bar and one voice queue */
  function label(bar){if(!bar.dataset.agent)return persona(bar)==='ava'?'Ava':'Finn';var n=bar.querySelector('.aname,.atext > span');
    var t=((n&&n.textContent.trim().split(/[\s\u00b7\u2014:-]/)[0])||bar.dataset.agent);return t.charAt(0).toUpperCase()+t.slice(1);}
  function muted(k){return !!mload()[k];}
  var SPK='<path d="M11 5 6 9H2v6h4l5 4V5z"/>',WAV='<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/>',X='<line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/>';
  function paintBtn(bar){var b=bar.querySelector(':scope > .rfMute');if(!b){b=document.createElement('span');b.className='rfMute';b.setAttribute('role','button');b.tabIndex=0;bar.appendChild(b);}
    var k=key(bar),m=muted(k),n=label(bar),t=(m?'Unmute ':'Mute ')+n+' (only on this screen)',h='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+SPK+(m?X:WAV)+'</svg>';
    if(b._h!==h){b.innerHTML=h;b._h=h;}b.classList.toggle('on',m);b.dataset.bot=k;b.setAttribute('aria-pressed',m?'true':'false');b.title=t;b.setAttribute('aria-label',t);}
  function bars(){return [].slice.call(document.querySelectorAll('#ui > section.ava')).filter(function(b){return b.id==='vbBar'||b.dataset.agent;});}
  function paintAll(){bars().forEach(paintBtn);}
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

  /* Mic blocked pill vs Bots quiet button */
  function pillFix(){var q=document.getElementById('hfBotQuiet');var qr=q&&vis(q)?q.getBoundingClientRect():null;
    document.querySelectorAll('.vl-pill').forEach(function(p){if(!vis(p)){return;}
      var was=p.style.getPropertyValue('translate');p.style.removeProperty('translate');var r=p.getBoundingClientRect();
      if(qr&&/mic blocked|microphone/i.test(p.textContent)&&r.left<qr.right&&r.right>qr.left&&r.top<qr.bottom&&r.bottom>qr.top){
        var s=p.offsetHeight?r.height/p.offsetHeight:1,dy=(r.bottom-qr.top+8)/s;p.style.setProperty('translate','0 '+(-Math.round(dy))+'px');}
      else if(was&&!p.style.getPropertyValue('translate')){/* cleared */}});}

  /* ---------- (d) cosmetics ---------- */
  function widgetsLabel(){var p=document.querySelector('#ui > aside.panel:not(.props)');if(!p)return;var l=p.querySelector(':scope > .wfrlbl'),h=p.querySelector(':scope > h2');
    if(!l||!h||room()||!vis(l)||!vis(h))return;var a=l.getBoundingClientRect(),c=h.getBoundingClientRect();
    var txt=document.createRange();txt.selectNodeContents(h);var tr=txt.getBoundingClientRect();
    if(a.left<tr.right+4&&a.right>tr.left&&a.top<tr.bottom&&a.bottom>tr.top){l.style.setProperty('top',(h.offsetTop+h.offsetHeight+1)+'px','important');l.style.setProperty('left',(h.offsetLeft)+'px','important');l.style.setProperty('right','auto','important');l.style.setProperty('text-align','left','important');}}
  function faceAlt(){var f=document.getElementById('vbFace');if(!f)return;var bar=document.getElementById('vbBar');var n=bar?(persona(bar)==='ava'?'Ava':'Finn'):(/ava/i.test((f.currentSrc||f.src||'').split('/').pop())?'Ava':'Finn');
    if(/yoda/i.test(document.documentElement.className)&&0)n='Ava';if(f.alt!==n)f.alt=n;}

  function tick(){try{lift();}catch(e){}try{fitAll();}catch(e){}try{paintAll();}catch(e){}try{pillFix();}catch(e){}try{widgetsLabel();}catch(e){}try{faceAlt();}catch(e){}}
  var q=0;function soon(){if(q)return;q=setTimeout(function(){q=0;tick();},80);}
  function start(){var u=ui();if(!u){setTimeout(start,400);return;}
    new MutationObserver(soon).observe(u,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src']});
    new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    addEventListener('resize',soon);setInterval(tick,1000);tick();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.__roomFixApi={build:BUILD,muted:muted,setMute:setMute,whoSays:whoSays,fit:fitAll,tick:tick};
})();
