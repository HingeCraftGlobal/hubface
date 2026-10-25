/* hrtitle-mic-20261021a: dictation mic on the hub room "Room title" field (.hrbuild .hrbt) and description (.hrbd).
   Cause: the field never had voice-to-text wired; the page mics (Talk to Yoda / voice bar) send speech to chat, not to this field.
   Speech fills the field and fires a normal input event (state.room.title updates). It never opens the room: Enter or Open room still does.
   Roll back: ROLLBACK-hrtitlemic.sh */
(function(){'use strict';if(window.__hrTitleMic)return;
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;var S=window.__hrTitleMic={build:'hrtitlemic-20261021a',heard:0,err:''};
  if(!SR)return;var rec=null,tgt=null,btn=null;
  function css(){if(document.getElementById('hrtm-css'))return;var s=document.createElement('style');s.id='hrtm-css';
    s.textContent='.hrtm-w{display:flex;gap:6px;align-items:center}.hrtm-w>input,.hrtm-w>textarea{flex:1;min-width:0}.hrtm{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:15px;line-height:1}.hrtm.on{background:#d33;border-color:#f66;animation:hrtmp 1s infinite}@keyframes hrtmp{50%{opacity:.55}}';
    document.head.appendChild(s);}
  function stop(){if(rec){try{rec.stop();}catch(_){}}}
  function set(el,v){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}
  function start(el,b){if(rec){stop();return;}var base=el.value?el.value.replace(/\s+$/,'')+' ':'';
    try{var v=window.__voice;if(v&&v.inCall&&v.inCall()&&v.hangUp)v.hangUp();}catch(_){}
    window.__micHold=true;rec=new SR();tgt=el;btn=b;rec.lang=document.documentElement.lang||navigator.language||'en-US';rec.interimResults=true;rec.continuous=false;
    rec.onresult=function(e){var f='',i='';for(var k=0;k<e.results.length;k++){var r=e.results[k];if(r.isFinal)f+=r[0].transcript;else i+=r[0].transcript;}
      var t=(f+i).trim();if(el.matches('.hrbt'))t=t.replace(/[.!?]+$/,'');if(t){set(el,(base+t).slice(0,el.maxLength>0?el.maxLength:9999));S.heard++;}};
    rec.onerror=function(e){S.err=e.error||'error';};
    rec.onend=function(){rec=null;b.classList.remove('on');setTimeout(function(){window.__micHold=false;},300);try{if(document.contains(el))el.focus();}catch(_){}};
    b.classList.add('on');try{el.focus();rec.start();}catch(err){S.err=String(err);rec=null;b.classList.remove('on');window.__micHold=false;}}
  function add(){var els=document.querySelectorAll('.hrbuild .hrbt,.hrbuild .hrbd');for(var i=0;i<els.length;i++){var el=els[i];if(el.__hrtm)continue;el.__hrtm=1;css();
    var w=document.createElement('span');w.className='hrtm-w';el.parentNode.insertBefore(w,el);w.appendChild(el);
    var b=document.createElement('button');b.type='button';b.className='hrtm';b.title='Dictate';b.textContent='\uD83C\uDF99';w.appendChild(b);
    (function(el,b){b.addEventListener('mousedown',function(e){e.preventDefault();},true);
      b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();start(el,b);},true);})(el,b);}}
  new MutationObserver(add).observe(document.documentElement,{childList:true,subtree:true});add();
})();
