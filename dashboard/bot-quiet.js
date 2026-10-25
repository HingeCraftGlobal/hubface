/* botquiet-20261021b (supersedes 20261021a) (Dan): permanent "Quiet bots" button, bottom-right between the account chip (.hfa-entry) and the
   nine-dot background/recording/full-screen controls. One tap = every bot voice on THIS page (Finn, Ava, room bot clips) stops now
   and stays silent until tapped again. 100% local: nothing is sent to the server, other people's pages are untouched.
   Hooks: speechSynthesis.speak (dropped while quiet, onend fired so queues move on) + speechSynthesis.cancel() on tap;
   HTMLMediaElement.play for bot-voice <audio> only (blobs from /api/tts, Audio() made by room-live.js, data:/tts clips):
   paused + 'ended' fired so the room queue advances; music/vault/video players are left alone.
   Roll back: remove the bot-quiet.js <script> tag from index.html. */
(function(){
  if(window.__hfBotQuiet)return;
  var K='hf-bots-quiet',quiet=false;try{quiet=localStorage.getItem(K)==='1';}catch(e){}
  var botUrls=new Set(),botBlobs=new WeakSet(),botEls=new Set();
  /* 1) tag blobs that came from the TTS endpoint, and the object URLs made from them */
  try{var rb=Response.prototype.blob;Response.prototype.blob=function(){var r=this,p=rb.apply(this,arguments);
    if(/\/api\/tts|\/tts\b/i.test(r.url||''))p=p.then(function(b){try{botBlobs.add(b);}catch(e){}return b;});return p;};}catch(e){}
  try{var cou=URL.createObjectURL;URL.createObjectURL=function(o){var u=cou.apply(URL,arguments);try{if(o&&botBlobs.has(o))botUrls.add(u);}catch(e){}return u;};}catch(e){}
  /* 2) tag Audio() objects created by the room bot queue (room-live.js) or made from TTS/data clips */
  try{var A0=window.Audio;var A1=function(src){var a=arguments.length?new A0(src):new A0();
      try{var st=(new Error().stack)||'';if(/room-live\.js/.test(st)||(typeof src==='string'&&/^data:audio|\/tts\b|\/api\/tts/i.test(src)))botEls.add(a);}catch(e){}return a;};
    A1.prototype=A0.prototype;window.Audio=A1;}catch(e){}
  function isBot(el){if(!el||el.tagName==='VIDEO')return false;if(botEls.has(el))return true;var s=el.currentSrc||el.src||'';return botUrls.has(s)||/\/api\/tts/i.test(s);}
  function endSoon(el){setTimeout(function(){try{el.dispatchEvent(new Event('ended'));}catch(e){}},30);}
  try{var pl=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){
    if(quiet&&isBot(this)){try{this.pause();}catch(e){}endSoon(this);return Promise.resolve();}
    if(isBot(this))botEls.add(this);return pl.apply(this,arguments);};}catch(e){}
  /* 3) speechSynthesis: drop while quiet */
  var ss=window.speechSynthesis;
  if(ss){try{var sp=ss.speak.bind(ss);ss.speak=function(u){if(quiet){setTimeout(function(){try{if(u&&typeof u.onend==='function')u.onend({type:'end',utterance:u});}catch(e){}},30);return;}return sp(u);};}catch(e){}}
  function hush(){try{if(ss)ss.cancel();}catch(e){}
    botEls.forEach(function(a){try{if(!a.paused){a.pause();endSoon(a);}}catch(e){}});
    [].forEach.call(document.querySelectorAll('audio'),function(a){if(isBot(a)&&!a.paused){try{a.pause();endSoon(a);}catch(e){}}});}
  /* botquiet-20261021b (Dan): OFF = plain speaker (same look as neighbours); ON = same speaker + red diagonal slash (the ONLY indicator).
     Lives inside #ui (same stage/scale as the nine-dot #brIcon and #btnFs), sized from #btnFs computed style, placed left of #brIcon
     with the same gap as #brIcon->#btnFs, i.e. between the account pill and the nine-dot button. */
  var SPK='<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/>';
  var SLASH='<line class="hfbq-slash" x1="3" y1="3" x2="21" y2="21" stroke="#ff3b30" stroke-width="2.6"/>';
  var css=document.createElement('style');css.textContent='#hfBotQuiet{position:absolute;z-index:9000;border:1px solid rgba(255,255,255,.3);background:rgba(15,15,20,.6);color:#fff;cursor:pointer;pointer-events:auto!important;font-family:inherit;outline:none;-webkit-tap-highlight-color:transparent;display:block}#hfBotQuiet:hover{border-color:#fff}#hfBotQuiet svg{width:100%;height:100%;display:block}#hfBotQuiet.hfbq-float{position:fixed;z-index:2147482990}';
  var b=document.createElement('button');b.type='button';b.id='hfBotQuiet';b.className='live';
  function paint(){b.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+SPK+(quiet?SLASH:'')+'</svg>';
    b.classList.toggle('quiet',quiet);b.setAttribute('aria-pressed',quiet?'true':'false');
    b.title=quiet?'Bots are quiet - tap to let Ava and Finn speak':'Bots can speak - tap to quiet Ava and Finn';b.setAttribute('aria-label',quiet?'Bots quiet. Tap to unmute Ava and Finn':'Quiet bots. Tap to silence Ava and Finn');}
  function place(){var ui=document.getElementById('ui'),fs=document.getElementById('btnFs'),ic=document.getElementById('brIcon');
    var ref=(ic&&ic.offsetWidth&&!ic.classList.contains('brhide'))?ic:fs;
    if(!ui||!fs||!ref||!fs.offsetWidth){b.classList.add('hfbq-float');var e=document.querySelector('.hfa-entry'),r=e&&e.getBoundingClientRect();
      b.style.width=b.style.height='30px';b.style.borderRadius='15px';b.style.padding='5px';
      if(r&&r.width){b.style.left=Math.round(r.right+6)+'px';b.style.top=Math.round(r.bottom-30)+'px';}
      if(b.parentNode!==document.body)document.body.appendChild(b);return;}
    b.classList.remove('hfbq-float');if(b.parentNode!==ui)ui.appendChild(b);
    var cs=getComputedStyle(fs);['width','height','borderRadius','padding','boxSizing','borderWidth'].forEach(function(k){b.style[k]=cs[k];});
    var gap=6;if(ic&&ref===ic){var g=fs.offsetLeft-(ic.offsetLeft+ic.offsetWidth);if(g>=2&&g<=16)gap=g;}
    b.style.left=Math.round(ref.offsetLeft-gap-b.offsetWidth)+'px';b.style.top=Math.round(ref.offsetTop+(ref.offsetHeight-b.offsetHeight)/2)+'px';}
  b.addEventListener('click',function(ev){ev.stopPropagation();quiet=!quiet;try{localStorage.setItem(K,quiet?'1':'0');}catch(e){}if(quiet)hush();paint();});
  ['pointerdown','dblclick'].forEach(function(n){b.addEventListener(n,function(e){e.stopPropagation();});});
  function mount(){if(document.getElementById('hfBotQuiet'))return;document.head.appendChild(css);paint();place();
    addEventListener('resize',place);setInterval(place,700);}
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
  window.__hfBotQuiet={isQuiet:function(){return quiet;},set:function(v){quiet=!!v;try{localStorage.setItem(K,quiet?'1':'0');}catch(e){}if(quiet)hush();paint();},hush:hush};
})();