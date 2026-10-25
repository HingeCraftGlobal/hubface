/* voice4-20261021a: Grok TTS for Moderator (aurora), Professor (orion), Mara (ursa), Theo (helios) via POST /api/tts.
   Waits until the clip is fully buffered (canplaythrough) before play so first words are not clipped.
   No speechSynthesis fallback: on any failure the line is shown quietly as text. */
(function(){
  var cur=null;
  function stop(){try{if(cur){cur.pause();cur.src='';}}catch(_){}cur=null;}
  function quiet(){return !!(window.__botQuiet||(window.__hfQuiet&&window.__hfQuiet()));}
  function note(who,t){try{var d=document.createElement('div');d.textContent=(who?who+': ':'')+t;d.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:70vw;background:rgba(20,20,28,.85);color:#eee;font:13px system-ui;padding:6px 12px;border-radius:10px;z-index:100005;opacity:.9';document.body.appendChild(d);setTimeout(function(){d.remove();},Math.min(12000,2500+t.length*60));}catch(_){}}
  function say(text,voice,opts){opts=opts||{};var done=opts.done||function(){};
    if(!text||quiet()){done();return;}
    var ctl=window.AbortController?new AbortController():null,to=setTimeout(function(){try{ctl&&ctl.abort();}catch(_){}},15000);
    fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text,voice_id:voice,bot:opts.bot||''}),signal:ctl?ctl.signal:undefined})
      .then(function(r){if(!r.ok)throw r.status;return r.blob();})
      .then(function(b){clearTimeout(to);if(quiet()){done();return;}stop();var a=new Audio();a.preload='auto';cur=a;var started=false;
        a.oncanplaythrough=function(){if(started)return;started=true;a.play().catch(function(){if(!opts.silentFail)note(opts.who,text);done();});};
        a.onended=function(){if(cur===a)cur=null;done();};a.onerror=function(){if(!opts.silentFail)note(opts.who,text);done();};
        a.src=URL.createObjectURL(b);a.load();})
      .catch(function(){clearTimeout(to);if(!opts.silentFail)note(opts.who,text);done();});}
  window.__hfVoice={say:say,stop:stop,V:{moderator:'aurora',professor:'orion','companion-f':'ursa','companion-m':'helios'}};
})();
