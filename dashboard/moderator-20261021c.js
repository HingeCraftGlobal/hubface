/* moderator-20261021c (Dan): MAIN DASHBOARD ONLY (no-op on html.rb-room / in a room).
   1) Moderator prep card (#hfMod) lives inside a standard floating widget (LYX mkBox: drag header, minimize/restore, corner resize,
      plain X, position saved in hinge-w-geo like Weather/Schedule). Widget X and Esc run the card's own Close (stop()).
   2) Per-card language selector (window.HF_LANGS, hf-langs-20261021a.js), saved in localStorage hf-botlang-v1 {moderator,finn,ava}.
      Client-side only: card label + lang hint passed to __hfVoice.say({lang}) for the moderator; server TTS may ignore it.
   3) Finn/Ava bar notes-card icon (#vbBar .abtns 2nd icon) opens a small widget with ONLY that bot's language selector.
   Roll back: remove the moderator-20261021c + hf-langs-20261021a tags. */
(function(){
  var LK='hf-botlang-v1';
  function room(){var h=document.documentElement;return h.classList.contains('rb-room')||!!(window.App&&0);}
  function get(){try{return JSON.parse(localStorage.getItem(LK)||'{}')||{};}catch(_){return {};}}
  function setL(bot,c){var o=get();o[bot]=c;try{localStorage.setItem(LK,JSON.stringify(o));}catch(_){}}
  function L(){return window.HF_LANGS;}
  function lyx(){return window.__widgets&&window.__widgets.lyx;}
  var css=document.createElement('style');
  css.textContent='html:not(.rb-room) .wbx[data-w=moderator] #hfMod{position:static!important;width:auto!important;background:none!important;border:0!important;box-shadow:none!important;padding:0!important;z-index:auto!important}'+
    'html:not(.rb-room) .wbx[data-w=moderator] .wmain,html:not(.rb-room) .wbx[data-w^=botlang-] .wmain{overflow:auto;padding:6px 10px}'+
    '.hflang select{width:100%;box-sizing:border-box;background:#0f2421;color:#fff;border:1px solid #2c6b60;border-radius:6px;font:11px system-ui;margin-top:2px}.hflang small{opacity:.75;font:11px system-ui;color:#f7eef6}';
  document.head.appendChild(css);
  function langSec(bot){var d=document.createElement('div');d.className='sec hflang';d.setAttribute('data-hflang',bot);
    d.innerHTML='<small>Language</small><select data-hflang-sel="'+bot+'">'+L().options(get()[bot]||'auto')+'</select>';
    var s=d.querySelector('select');['pointerdown','click','keydown'].forEach(function(ev){s.addEventListener(ev,function(e){e.stopPropagation();});});
    s.addEventListener('change',function(){setL(bot,s.value);var l=L().byCode(s.value);try{(window.__hfToast||function(){})(bot+' language: '+(l?l.name:s.value));}catch(_){}});
    return d;}
  /* moderator speech hint */
  var vw=setInterval(function(){var v=window.__hfVoice;if(!v||!v.say||v.say.__hflang)return;var s0=v.say;
    var s1=function(t,voice,o){try{if(o&&o.bot&&!room()){var c=get()[o.bot];var l=c&&L()&&L().byCode(c);if(l&&l.speech){o.lang=o.lang||l.speech;}}}catch(_){}return s0.apply(this,arguments);};
    s1.__hflang=1;v.say=s1;clearInterval(vw);},500);
  /* ---- Moderator card inside a floating widget ---- */
  var B=null;
  function box(){var X=lyx();if(!X)return null;if(B)return B;B=X.mk('moderator','Moderator','MODERATOR',290,360);
    B.el.querySelector('.wx').addEventListener('click',function(){var m=document.getElementById('hfMod');var lv=m&&m.querySelector('[data-a=leave]');if(lv)lv.click();});
    return B;}
  function sync(){if(room())return;var m=document.getElementById('hfMod');
    if(m){var b=box();if(!b)return;if(m.parentNode!==b.main){b.main.appendChild(m);}
      if(!b.isOpen())b.open();
      if(!m.querySelector('[data-hflang=moderator]')){var secs=m.querySelectorAll(':scope > .sec'),last=secs[secs.length-1];m.insertBefore(langSec('moderator'),last||null);}}
    else if(B&&B.isOpen()){B.close();}}
  new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var t=ms[i].target;if(t===document.body||(t.id==='hfMod')||(B&&t===B.main)){sync();return;}}}).observe(document.body,{childList:true,subtree:true});
  setInterval(sync,1000);
  document.addEventListener('keydown',function(e){if(e.key!=='Escape'||room()||!B||!B.isOpen())return;var m=document.getElementById('hfMod'),lv=m&&m.querySelector('[data-a=leave]');if(lv){lv.click();}},true);
  /* ---- Finn / Ava card icon -> language-only widget ---- */
  var LB={};
  function langBox(bot){var X=lyx();if(!X)return;var nm=bot==='ava'?'Ava':'Finn';var b=LB[bot];
    if(!b){b=LB[bot]=X.mk('botlang-'+bot,nm+' language',nm.toUpperCase()+' LANGUAGE',260,150);b.main.appendChild(langSec(bot));}
    if(b.isOpen()&&!b.isMin())b.close();else b.open();}
  function whichBot(bar){var t=(bar.querySelector('.atext')||bar).textContent||'';return /\bAva\b/.test(t)?'ava':'finn';}
  document.addEventListener('click',function(e){if(room())return;var bar=document.getElementById('vbBar');if(!bar||!bar.offsetWidth)return;
    var ic=bar.querySelectorAll('.abtns > i')[1];if(!ic)return;var r=ic.getBoundingClientRect();
    if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){e.stopPropagation();langBox(whichBot(bar));}},true);
  window.__hfBotLang={build:'moderator-20261021c',get:function(b){return get()[b]||'auto';}};
})();
