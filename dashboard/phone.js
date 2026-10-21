/* phone-rbapp-20261020m: the room controls live at window.__rb.App (App is private to the room builder) */
function RBA(){return (window.__rb&&window.__rb.App)||null;}
/* phone-20261020a: simple phone room for /interface/. Turns on only below 600px wide or on a phone user agent.
   Mirrors the existing room (people tiles + #rb_roomChat) into a large-text overlay; sends via the existing #rb_rcIn/#rb_rcSend;
   Leave uses the existing #rb_exit. Desktop: does nothing. ?desktop=1 forces it off. */
(function(){
  var ua=navigator.userAgent||'';
  function isPhone(){ if(/[?&]desktop=1/.test(location.search))return false;
    return matchMedia('(max-width:600px)').matches||/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua); }
  function roomId(){var m=/[#&?]room=(HF-[A-Z0-9]{5}-[A-Z0-9]{5})/i.exec(location.hash+'&'+location.search);return m?m[1].toUpperCase():null;}
  var root=null,ppl,chat,inp,toast,title,lastChat=null,tileSig='';
  function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;}
  function say(t){toast.textContent=t;toast.style.display='block';clearTimeout(say.t);say.t=setTimeout(function(){toast.style.display='none';},2200);}
  function link(){return location.origin+'/interface/#room='+(roomId()||'');}
  function invite(){var u=link();
    if(navigator.share){navigator.share({title:'HubFace room',text:'Join me in my HubFace room:',url:u}).catch(function(){});return;}
    var done=function(){say('Link copied');};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(done,function(){prompt('Copy this link:',u);});
    else prompt('Copy this link:',u);}
  function leave(){var b=document.getElementById('rb_exit');/* phone-ready-leave-20261020k: exit directly, then land on /app/?stay=1 so auto-join does not reopen the room */try{if(!!RBA()&&RBA().exit)RBA().exit();}catch(e){}if(b){setTimeout(function(){location.href='/app/?stay=1';},600);}else location.href='/app/?stay=1';}
  function send(){var t=inp.value.trim();if(!t)return;var ri=document.getElementById('rb_rcIn'),rs=document.getElementById('rb_rcSend');
    if(!ri||!rs){say('Chat not ready yet');return;}
    ri.value=t;ri.dispatchEvent(new Event('input',{bubbles:true}));rs.click();inp.value='';}
  /* phone-dictate-20261020d (Dan): mic button in the message box. Tap = one speech recognition pass, text goes into the box (Send as usual). */
  function mkMic(){var b=el('button','hfp-mic','\ud83c\udf99');b.type='button';b.setAttribute('aria-label','Speak a message');var rec=null;
    b.onclick=function(){var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SR){say('Voice typing not supported here. Use the mic on your keyboard.');try{inp.focus();}catch(e){}return;}
      if(rec){try{rec.stop();}catch(e){}return;}
      rec=new SR();rec.lang=navigator.language||'en-US';rec.interimResults=false;rec.continuous=false;rec.maxAlternatives=1;
      b.classList.add('on');
      rec.onresult=function(ev){var t='';for(var i=0;i<ev.results.length;i++)t+=ev.results[i][0].transcript;t=t.trim();if(t){inp.value=(inp.value?inp.value+' ':'')+t;}};
      rec.onerror=function(ev){var e=ev&&ev.error;if(e==='not-allowed'||e==='service-not-allowed')say('Microphone blocked. Allow it for hubface.org.');else if(e&&e!=='no-speech'&&e!=='aborted')say('Mic error: '+e);};
      rec.onend=function(){rec=null;b.classList.remove('on');};
      try{rec.start();}catch(e){rec=null;b.classList.remove('on');say('Could not start the mic');}};
    return b;}
  /* phone-cam-20261020e (Dan): Camera on/off button. Uses the room's own RBA().setAV('cam'), so the video goes to the other person over the existing live connection. */
  function mkCam(){var b=el('button','hfp-cam','Camera');b.type='button';
    function paint(){var on=!!(!!RBA()&&RBA().state&&RBA().state.cam);b.textContent=on?'Camera off':'Camera on';b.classList.toggle('on',on);}
    b.onclick=function(){mediaToggle('cam','Camera',b,paint);};
    setInterval(paint,1500);setTimeout(paint,0);return b;}
  /* phone-voice-20261020f (Dan): Voice on/off = the room's own mic track (RBA().setAV('mic')) sent live to the other person.
     Phones only play sound after a tap, so every tap also starts any paused incoming audio. */
  function unlockAudio(){var m=document.querySelectorAll('audio,video');for(var i=0;i<m.length;i++){var x=m[i];if(x.srcObject&&x.paused&&!x.__hfpDead&&!(x.closest&&x.closest('#hfp'))){try{var p=x.play();if(p&&p.catch)p.catch(function(){});}catch(e){}}}}
  document.addEventListener('touchend',unlockAudio,true);document.addEventListener('click',unlockAudio,true);
  /* phone-media-20261020l (Dan): Camera/Voice ask the phone directly first (inside the tap), then hand the track to the room.
     Every failure shows the button name + the phone's own error, so the message always names the right thing. */
  function hasApp(){return !!RBA()&&App&&RBA().setAV&&RBA().state;}
  /* phone-diag-20261020n: each step shows on screen (stays 6 s) and pings /interface/__pd?... (shows in the server log, 404 is fine) */
  function pd(k,st,x){try{(new Image()).src='/interface/__pd?k='+k+'&s='+encodeURIComponent(st)+'&x='+encodeURIComponent(String(x||'').slice(0,120))+'&t='+Date.now();}catch(e){}}
  function sayL(t){say(t);clearTimeout(say.t);say.t=setTimeout(function(){toast.style.display='none';},6000);}
  function mediaToggle(kind,label,b,paint){
    pd(kind,'tap',(navigator.mediaDevices?'md':'nomd')+(window.isSecureContext?'-sec':'-insec'));
    var A=RBA(); if(!A||!A.setAV||!A.state){sayL(label+': room controls missing');pd(kind,'noapp',(window.__rb?'rb':'norb'));return;}
    var want=!A.state[kind];sayL(label+': asking your phone...');
    var done=false,tm=setTimeout(function(){if(!done){sayL(label+': phone did not answer (no permission popup?)');pd(kind,'timeout','');b.disabled=false;}},10000);
    b.disabled=true;
    var pre=(!want)?Promise.resolve():(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia?navigator.mediaDevices.getUserMedia(kind==='mic'?{audio:true}:{video:{facingMode:'user'}}).then(function(st){pd(kind,'gum-ok','');st.getTracks().forEach(function(t){t.stop();});}):Promise.reject({name:'NoMediaDevices',message:'no camera/mic access in this browser'}));
    pre.then(function(){pd(kind,'setav','');return A.setAV(kind,want);}).then(function(r){done=true;pd(kind,'result',r);sayL(want&&!r?label+' did not turn on':label+(want?' on':' off'));},
      function(e){done=true;var m=((e&&e.name)||'error')+(e&&e.message?' - '+e.message:'');pd(kind,'fail',m);sayL(label+' failed: '+m);})
      .then(function(){clearTimeout(tm);b.disabled=false;paint();if(kind==='cam')tileSig='';});}
  function mkVoice(){var b=el('button','hfp-voice','Voice');b.type='button';
    function paint(){var on=!!(!!RBA()&&RBA().state&&RBA().state.mic);b.textContent=on?'Voice off':'Voice on';b.classList.toggle('on',on);}
    b.onclick=function(){unlockAudio();mediaToggle('mic','Voice',b,paint);};
    setInterval(paint,1500);setTimeout(paint,0);return b;}
  function build(){root=el('div');root.id='hfp';
    var hd=el('div','hfp-hd');var ic=el('img','hfp-ic');ic.src='assets/brand/hubface-logo.png';ic.alt='HubFace';ic.className='hfp-ic hfp-logo';ic.draggable=false;ic.alt='';hd.appendChild(ic);/* brand-hdr-20261020h */var tw=el('div','hfp-tw');title=el('b',null,'HubFace');tw.appendChild(title);tw.appendChild(el('span','hfp-tag','Build. Share. Collab.'));hd.appendChild(tw);root.appendChild(hd);
    ppl=el('div','hfp-ppl');root.appendChild(ppl);
    chat=el('div','hfp-chat');chat.setAttribute('aria-live','polite');root.appendChild(chat);
    var ty=el('div','hfp-type');inp=el('input');inp.placeholder='Type a message';inp.setAttribute('enterkeyhint','send');
    inp.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();send();}};
    var sb=el('button',null,'Send');sb.type='button';sb.onclick=send;ty.appendChild(inp);ty.appendChild(mkMic());ty.appendChild(sb);root.appendChild(ty);
    var bar=el('div','hfp-bar'),iv=el('button',null,'Invite'),lv=el('button','hfp-lv','Leave');iv.type=lv.type='button';iv.onclick=invite;lv.onclick=leave;
    bar.appendChild(mkVoice());bar.appendChild(mkCam());bar.appendChild(iv);bar.appendChild(lv);root.appendChild(bar);
    toast=el('div','hfp-toast');root.appendChild(toast);document.body.appendChild(root);}
  function syncTiles(){var ts=[].slice.call(document.querySelectorAll('.rlPanel.rlTile'));
    var sig=ts.map(function(t){var v=t.querySelector('video');return (t.dataset.pk||'')+'|'+((t.querySelector('.rlNm')||{}).textContent||'')+'|'+(v&&v.srcObject?v.srcObject.id:'');}).join(';');
    if(sig===tileSig)return;tileSig=sig;ppl.innerHTML='';
    ts.sort(function(a,b){return (a.dataset.self?1:0)-(b.dataset.self?1:0);});
    ts.forEach(function(t){var d=el('div','hfp-tile'),v=t.querySelector('video'),img=t.querySelector('img.rlAv,img'),ini=t.querySelector('.rlIni');
      if(v&&v.srcObject){var nv=el('video');nv.autoplay=true;nv.playsInline=true;nv.muted=true;nv.srcObject=v.srcObject;d.appendChild(nv);nv.play&&nv.play().catch(function(){});}
      else if(img){var ni=el('img');ni.src=img.src;ni.alt='';d.appendChild(ni);}
      else d.appendChild(el('div','hfp-ini',ini?ini.textContent:'?'));
      var nm=el('div','hfp-nm');nm.textContent=((t.querySelector('.rlNm')||{}).textContent||'');d.appendChild(nm);ppl.appendChild(d);});
    ppl.classList.toggle('hfp-one',ts.length<2);}
  function syncChat(){var c=document.getElementById('rb_roomChat');var h=c?c.innerHTML:'';if(h===lastChat)return;lastChat=h;
    var atEnd=chat.scrollHeight-chat.scrollTop-chat.clientHeight<60;
    chat.innerHTML=h||'<div class="hfp-empty">No messages yet. Say hello below.</div>';if(atEnd||!h)chat.scrollTop=chat.scrollHeight;}
  function tick(){if(!root)return;var on=isPhone();document.documentElement.classList.toggle('hfPhone',on);if(!on)return;
    var r=roomId();if(!r){location.replace('/app/');return;}
    var rn=document.querySelector('#rbBar .ridv');title.textContent='HubFace';/* hide-roomid-20261020g: ID kept in roomId(), not shown */
    var ok=document.querySelector('#ridCard .pri');if(ok&&ok.offsetParent)ok.click();
    syncTiles();syncChat();}
  function start(){build();tick();setInterval(tick,1000);addEventListener('resize',tick);addEventListener('hashchange',tick);}
  window.__hfPhone={build:'phone-20261020a',on:function(){return document.documentElement.classList.contains('hfPhone');}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
/* phone-nobg-20261020c (Dan): phones get NO background at all (plain black) and no background or ambient sound:
   #bg, #bg2 videos, #sfx nature track, YouTube background layer #ytBg, media-widget background videos. Live camera/voice audio untouched. Desktop unchanged. */
(function(){
  var ua=navigator.userAgent||'';
  if(/[?&]desktop=1/.test(location.search))return;
  if(!(matchMedia('(max-width:600px)').matches||/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)))return;
  function kill(el){ if(!el||el.__hfpDead)return; el.__hfpDead=1;
    try{el.play=function(){return Promise.resolve();};}catch(e){}
    try{el.muted=true;el.volume=0;el.pause();el.removeAttribute('src');el.load();}catch(e){}
    el.style.display='none'; }
  function clean(){
    ['bg','bg2','sfx'].forEach(function(id){kill(document.getElementById(id));});
    var vs=document.querySelectorAll('video.mdbgv,.wbx[data-w=media] video,.wbx[data-w=media] audio'); for(var i=0;i<vs.length;i++)kill(vs[i]);
    var yt=document.getElementById('ytBg'); if(yt){var f=yt.querySelectorAll('iframe');for(var j=0;j<f.length;j++){try{f[j].src='about:blank';}catch(e){}} yt.style.display='none';}
    var h=document.documentElement,b=document.body; h.style.background='#000'; if(b){b.style.background='#000';}
  }
  clean(); document.addEventListener('DOMContentLoaded',clean); setInterval(clean,1000);
})();
/* phone-nofinn-20261020j (Dan): on phones Finn (the dashboard voice helper) never starts, never speaks, and never plays the
   welcome / tutorial intro. Every Finn entry point becomes a no-op; any call in progress is hung up. Desktop unchanged. */
(function(){
  var ua=navigator.userAgent||'';
  if(/[?&]desktop=1/.test(location.search))return;
  if(!(matchMedia('(max-width:600px)').matches||/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)))return;
  try{localStorage.setItem('hubface-visited',localStorage.getItem('hubface-visited')||new Date().toISOString());localStorage.setItem('hubface-intro-mode','normal');}catch(e){}
  function off(){var v=window.__voice;if(!v||v.__hfpOff)return;
    try{if(v.inCall&&v.inCall()&&v.hangUp)v.hangUp();}catch(e){}
    for(var k in v){if(typeof v[k]==='function'&&!/^(state|inCall|hangUp)$/.test(k)){v[k]=function(){return false;};}}
    v.__hfpOff=true;}
  off();setInterval(function(){var v=window.__voice;if(v){try{if(v.inCall&&v.inCall()&&v.hangUp)v.hangUp();}catch(e){}}off();},1000);
})();
