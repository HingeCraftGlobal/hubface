/* modfix-20261021a (Dan, voice Oct 21 7:17 PM ET): room/dashboard bots stop repeating. Rolling context (older turns packed into the
   question, since the server keeps only 6 history lines), repeat guard (reply ~same as one of the last 4 -> re-ask once with a
   'move forward' nudge, else a varied move-on line), own-voice echo ignored up to 2.5 s after a clip ends, canned/budget line never loops.
   Roll back: /opt/hubface/backups/modfix-20261021a/ROLLBACK.sh */
window.HF_modfix=window.HF_modfix||(function(){
  function W(t){return String(t||'').toLowerCase().match(/[a-z0-9']+/g)||[];}
  function sim(a,b){var A=W(a),B=W(b);if(!A.length||!B.length)return 0;var sb={};B.forEach(function(x){sb[x]=1;});var sa={},i=0;A.forEach(function(x){sa[x]=1;});
    for(var k in sa)if(sb[k])i++;var u=Object.keys(sa).length+Object.keys(sb).length-i;return u?i/u:0;}
  function first(t){return W(t).slice(0,6).join(' ');}
  function isRepeat(t,prev){return (prev||[]).some(function(p){return sim(t,p)>=0.6||(first(t).length>12&&first(t)===first(p));});}
  var MOVE=['Let us keep moving. What is the next point anyone wants to raise?','Good, that is noted. Who would like to add something new?','Let us move to the next part of this. What matters most to settle now?','Thank you. Does anyone see it differently, or shall we go on?'];
  function moveOn(prev){for(var i=0;i<MOVE.length;i++){if(!isRepeat(MOVE[i],prev))return MOVE[i];}return MOVE[0];}
  function pack(hist,q){hist=hist||[];if(hist.length<=6)return q;var old=hist.slice(0,-6).slice(-10).map(function(h){return (h.role==='assistant'?'You':'They')+': '+String(h.text).slice(0,90);}).join(' | ');
    var room=790-q.length-40;if(room<80)return q;if(old.length>room)old='\u2026'+old.slice(-room);return '[Earlier in this conversation: '+old+'] '+q;}
  return {sim:sim,isRepeat:isRepeat,moveOn:moveOn,pack:pack,NUDGE:'(You already said something like your last reply; do not repeat it. Respond to this exact point and move the conversation forward.)'};})();
/* agentpanel-20261021a: shared Finn-layout panel for the new agents (Professor, Moderator, Support companions f/m).
   Clones Finn's bar (#vbBar: section.ava, .portrait, .atext status+line, input, .abtns gear/notes/mic/hang-up, .wave dots, fog)
   and adds ONE extra row under the dots: Simple · Standard · Deep · Ask · Explain it another way.
   Same drag (window.__float), resize corner (window.__boxSize) and glass as Finn. Finn/Ava's own bar is never touched.
   Voice: browser speechSynthesis (each bot's own voice) + webkitSpeechRecognition (free); ~1.2s silence = end of turn;
   recognition paused while the bot talks (echo filter), barge-in stops him. Roll back: remove the <script src="agent-panel.js"> tag. */
/* botsep-20261021a (Dan): MAIN dashboard: Moderator / Professor / Support companions are independent panels (several open at once, each with its own
   red circled X like Finn's; Finn's X no longer closes them, see botrow-20261021d). Room page (html.rb-room): unchanged single-panel behaviour.
   Roll back: /opt/hubface/backups/botsep-20261021a/ROLLBACK.sh */
(function(){
  'use strict';
  if(window.HF_agentPanel)return;
  var css=document.createElement('style');
  css.textContent='html.rb-room #ui > section.ava.hfap.floatbox[data-agent][data-build]{display:block!important}#ui > section.ava.hfap{height:84px}#ui > section.ava.hfap .hfrow{position:absolute;left:57px;right:8px;top:60px;display:flex;gap:4px;pointer-events:auto!important}'+
   '#ui > section.ava.hfap .hfrow button{flex:1 1 auto;min-width:0;height:17px;padding:0 5px;border-radius:4px;border:1px solid rgba(255,255,255,.35);background:rgba(10,20,30,.55);color:#fff;font:400 8.6px "Montserrat",system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;pointer-events:auto!important}'+
   '#ui > section.ava.hfap .hfrow button.on{background:var(--hub-blue);color:#08222c;border-color:var(--hub-blue)}'+
   '#ui > section.ava.hfap .abtns i{pointer-events:auto!important;cursor:pointer}'+
   '.hfap-pop{position:fixed;z-index:99991;max-width:340px;max-height:50vh;overflow:auto;padding:10px 12px;border-radius:8px;color:#fff;font:12px system-ui;background:rgba(22,20,32,.55);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(14px) saturate(1.15);-webkit-backdrop-filter:blur(14px) saturate(1.15)}'+
   'html:not(.rb-room) #ui > section.ava.hfap{overflow:visible!important}html:not(.rb-room) #ui > section.ava.hfap > .hfapX{position:absolute;right:-10px;top:-12px;transform-origin:center;z-index:5;width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:#b3261e;color:#fff;font:bold 14px/22px system-ui;text-align:center;padding:0;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:auto!important}html:not(.rb-room) #ui > section.ava.hfap > .hfapX:hover{background:#d93025}html.rb-room .hfapX{display:none!important}'+
   '.hfap-pop .x{float:right;background:none;border:0;color:#fff;cursor:pointer;font-size:14px}.hfap-pop ol{margin:4px 0 6px 18px;padding:0}.hfap-pop a{color:#ffd1d6;font-weight:600}';
  (document.head||document.documentElement).appendChild(css);
  /* Finn's bar is also styled by id (#vbBar, #vbInput, #vbWave, #vbMic...): mirror those rules once onto the clones (#hfap_vb*). */
  var mirrored=false;function mirror(){if(mirrored)return;mirrored=true;var out=[];
    function walk(rules,wrap){[].forEach.call(rules||[],function(r){try{
      if(r.selectorText&&/#vb/.test(r.selectorText)){var sel=r.selectorText.split(',').filter(function(x){return /#vb/.test(x)&&!/hf-homebar-off/.test(x);}).map(function(x){return x.replace(/#vbBar\b/g,'section.ava.hfap').replace(/#vb([A-Za-z])/g,'#hfap_vb$1');}).join(',');
        if(sel)out.push((wrap?wrap+'{':'')+sel+'{'+r.style.cssText+'}'+(wrap?'}':''));}
      else if(r.cssRules&&r.media)walk(r.cssRules,'@media '+r.media.mediaText);}catch(_){}});}
    [].forEach.call(document.styleSheets,function(sh){try{walk(sh.cssRules,'');}catch(_){}});
    var st=document.createElement('style');st.id='hfapMirror';st.textContent=out.join('\n');(document.body||document.documentElement).appendChild(st);}
  var cur=null,P={};function rm(){return document.documentElement.classList.contains('rb-room');}function live(C){return P[C.id]===C;}
  function voice(sex){var vs=((window.speechSynthesis&&speechSynthesis.getVoices())||[]).filter(function(v){return /^en/i.test(v.lang);});
    var F=/female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|aria|jenny|susan|hazel|serena|allison|libby|sonia/i,M=/\bmale\b|daniel|alex|fred|david|mark|guy|ryan|george|tom|arthur|oliver|aaron|thomas/i;
    var m=vs.filter(function(v){return sex==='f'?F.test(v.name):(M.test(v.name)&&!F.test(v.name));});return m[0]||null;}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function pop(bar,html){var o=document.getElementById('hfapPop');if(o)o.remove();var d=document.createElement('div');d.id='hfapPop';d.className='hfap-pop';
    d.innerHTML='<button class="x" aria-label="Close">\u2715</button>'+html;document.body.appendChild(d);var r=bar.getBoundingClientRect();
    d.style.left=Math.max(8,r.left)+'px';d.style.bottom=Math.max(8,innerHeight-r.top+6)+'px';d.querySelector('.x').onclick=function(){d.remove();};return d;}
  function close1(c){if(!c||P[c.id]!==c)return;delete P[c.id];if(cur===c){cur=null;var k=Object.keys(P);if(k.length)cur=P[k[k.length-1]];}c.stopV();try{speechSynthesis.cancel();window.__hfVoice&&window.__hfVoice.stop();}catch(_){}try{window.__float&&window.__float.drop(c.bar);}catch(_){}
    var p=document.getElementById('hfapPop');if(p)p.remove();c.bar.remove();}
  function close(id){if(id&&typeof id==='string'){close1(P[id]);return;}Object.keys(P).forEach(function(k){close1(P[k]);});}
  function open(cfg){
    if(P[cfg.id]){close1(P[cfg.id]);return null;}if(rm())close();
    var src=document.getElementById('vbBar'),ui=document.getElementById('ui');if(!src||!ui)return null;
    mirror();var bar=src.cloneNode(true);
    [].forEach.call(bar.querySelectorAll('.fhandle,.boxresize,.boxmin,.boxclose'),function(e){e.remove();});
    [].forEach.call(bar.querySelectorAll('[id]'),function(e){e.id='hfap_'+e.id;});
    bar.id='hfap-'+cfg.id;bar.className='ava hfap';bar.removeAttribute('data-float');bar.removeAttribute('data-state');bar.setAttribute('data-agent',cfg.id);bar.setAttribute('data-build','agentpanel-20261021f');
    bar.style.cssText='';var nOpen=Object.keys(P).length;bar.style.left=(305+(rm()?0:nOpen*18))+'px';bar.style.top=(rm()?396:Math.max(60,396-nOpen*100))+'px';
    var $=function(s){return bar.querySelector(s);};
    var face=$('.portrait');face.src=cfg.face;face.alt=cfg.name;face.title=cfg.tip||cfg.name;face.style.objectFit='cover';
    var stat=$('#hfap_vbStatus'),txt=$('#hfap_vbText'),line=$('#hfap_vbLine'),inp=$('#hfap_vbInput'),wave=[].slice.call($('#hfap_vbWave').querySelectorAll('i'));
    var base=wave.map(function(b){return parseFloat(b.style.height)||8;});
    stat.textContent=cfg.name+' is ready \u2014';txt.textContent=cfg.idle||'Tap the mic to talk';inp.placeholder='Type to '+cfg.name+', then Enter';inp.value='';inp.classList.remove('show');
    var ic=[].slice.call($('.abtns').querySelectorAll('i'));var gear=ic[0],notes=ic[1],mic=ic[2],end=ic[3];
    gear.title=cfg.gearTitle||'Options';notes.title=cfg.notesTitle||'Details';mic.title='Talk to '+cfg.name+' (mic)';end.title='Hang up: stop and close '+cfg.name;
    mic.classList.remove('on');
    var row=document.createElement('div');row.className='hfrow';
    row.innerHTML='<button data-l="simple">Simple</button><button data-l="standard" class="on">Standard</button><button data-l="deep">Deep</button><button data-a="ask">Ask</button><button data-a="again">Explain it another way</button>';
    bar.appendChild(row);
    var C={said:[],endAt:0,cannedAt:0,id:cfg.id,bar:bar,level:'standard',alt:0,last:null,lastQ:'',on:false,rec:null,buf:'',t:0,speaking:false,say:'',hist:[]};cur=C;P[cfg.id]=C;
    var state='idle',raf=0;
    function setState(s){state=s;bar.classList.toggle('vb-live',s==='listening'||s==='speaking');bar.classList.toggle('vb-listening',s==='listening');bar.classList.toggle('vb-speaking',s==='speaking');bar.setAttribute('data-state',s);mic.classList.toggle('on',C.on);
      if((s==='listening'||s==='speaking')&&!raf)loop();}
    function loop(){if(!bar.isConnected||(state!=='listening'&&state!=='speaking')){raf=0;wave.forEach(function(b,i){b.style.height=base[i]+'px';});return;}
      var amp=state==='speaking'?1:0.45;wave.forEach(function(b,i){b.style.height=Math.max(3,Math.round(base[i]*(0.35+Math.random()*amp*1.2)))+'px';});raf=setTimeout(function(){raf=0;loop();},90);}
    function show(s,t){stat.textContent=s;txt.textContent=t||'';line.title=t||'';}
    function speak(t,done){if(cfg.voice&&cfg.voice.id&&window.__hfVoice){if(window.__botQuiet||(window.__hfQuiet&&window.__hfQuiet())){done&&done();return;}window.__hfVoice.say(t,cfg.voice.id,{bot:cfg.id,who:cfg.name,done:done});return;}   /* voice4-20261021a: Grok voice when cfg.voice.id set (Professor only) */
      try{if(!window.speechSynthesis||window.__botQuiet||(window.__hfQuiet&&window.__hfQuiet())){done&&done();return;}var u=new SpeechSynthesisUtterance(t);var v=voice(cfg.voice.sex);if(v)u.voice=v;u.pitch=cfg.voice.pitch;u.rate=cfg.voice.rate;
      u.onend=u.onerror=function(){done&&done();};speechSynthesis.cancel();speechSynthesis.speak(u);}catch(_){done&&done();}}
    function talk(t,quiet){C.speaking=true;C.say=t;setState('speaking');show(cfg.name+' is speaking \u2014',quiet?'Speaking\u2026':t);try{C.rec&&C.rec.abort();}catch(_){}
      setTimeout(function(){if(C.speaking&&C.on){try{C.rec&&C.rec.start();}catch(_){}}},700);
      speak(t,function(){C.speaking=false;C.endAt=Date.now();if(!live(C))return;if(C.on)rearm();else setState('idle');});}
    function echo(h){var w=h.toLowerCase().match(/[a-z']+/g)||[];if(!w.length)return true;var s=' '+[C.say].concat(C.said||[]).join(' ').toLowerCase().replace(/[^a-z' ]+/g,' ')+' ';return w.filter(function(x){return s.indexOf(' '+x+' ')>=0;}).length/w.length>0.6;}
    function echoNow(){return C.speaking||Date.now()-(C.endAt||0)<2500;}   /* modfix-20261021a: STT tail of its own voice arrives after the clip ends */
    function rearm(){if(!C.on||C.speaking||!live(C))return;setState('listening');show(cfg.name+' is listening \u2014','Go ahead, I\u2019m listening');try{C.rec&&C.rec.start();}catch(_){}}
    function startV(){var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){show(cfg.name+' is ready \u2014','Voice needs Chrome or Edge; type instead');inp.classList.add('show');return;}
      if(C.rec){C.on=true;rearm();return;}var r=new R();r.continuous=true;r.interimResults=true;r.lang='en-US';C.rec=r;C.on=true;
      r.onresult=function(e){var fin='',heard=false;for(var i=e.resultIndex;i<e.results.length;i++){var x=e.results[i],tr=x[0].transcript.trim();if(echoNow()&&echo(tr))continue;if(tr)heard=true;if(x.isFinal)fin+=tr+' ';}
        if(heard&&C.speaking){try{speechSynthesis.cancel();window.__hfVoice&&window.__hfVoice.stop();}catch(_){}C.speaking=false;setState('listening');}
        if(fin)C.buf+=fin;clearTimeout(C.t);if(heard)C.t=setTimeout(function(){var q=C.buf.trim();C.buf='';if(q&&C.said&&C.said.length&&echo(q))return;if(q)ask(q,false);},1200);};
      r.onend=function(){if(C.on&&live(C))setTimeout(function(){if(C.speaking){try{r.start();}catch(_){}}else rearm();},250);};
      r.onerror=function(e){if(e.error==='not-allowed'||e.error==='service-not-allowed'){C.on=false;setState('idle');show(cfg.name+' is ready \u2014','Microphone blocked: allow the mic, or type');inp.classList.add('show');}};
      rearm();}
    function stopV(){C.on=false;clearTimeout(C.t);try{C.rec&&C.rec.abort();}catch(_){}C.rec=null;setState(C.speaking?'speaking':'idle');}
    C.stopV=function(){stopV();C.speaking=false;};
    function ask(q,again){q=String(q||'').trim();if(!q)return;C.lastQ=q;C.alt=again?C.alt+1:0;
      if(cfg.crisis&&cfg.crisis(q)){cfg.onCrisis&&cfg.onCrisis(bar);}
      try{C.rec&&C.rec.abort();}catch(_){}setState('thinking');show(cfg.name+' is thinking \u2014',q);
      var MF=window.HF_modfix;var go=function(qq){return Promise.resolve(cfg.ask?cfg.ask(MF?MF.pack(C.hist,qq):qq,C.level,C.alt,C.hist.slice(-6)):null);};
      go(q).then(function(d){if(MF&&d&&d.text&&MF.isRepeat(d.text,C.said))return go(q+' '+MF.NUDGE).then(function(d2){return d2&&d2.text&&!MF.isRepeat(d2.text,C.said)?d2:{text:MF.moveOn(C.said),fallback:1};},function(){return d;});return d;}).then(function(d){if(!live(C))return;
        if(!d||!d.text){var m=(d&&d.capMsg)||cfg.noAnswer||'Answers need server AI, which isn\u2019t switched on for me yet.';show(cfg.name+' \u2014',m);
          if(C.cannedAt&&Date.now()-C.cannedAt<60000){stopV();return;}C.cannedAt=Date.now();speak(m,function(){C.endAt=Date.now();if(C.on)rearm();else setState('idle');});return;}   /* modfix: same canned line never loops */
        C.last=d;C.hist.push({role:'user',text:q},{role:'assistant',text:d.text});C.hist=C.hist.slice(-24);C.said=(C.said||[]).concat(d.text).slice(-4);talk(d.text);},
      function(){if(!live(C))return;show(cfg.name+' \u2014','Sorry, I couldn\u2019t reach my answer service. Try again.');if(C.on)setTimeout(rearm,800);else setState('idle');});}
    C.ask=ask;C.talk=talk;
    mic.onclick=function(e){e.stopPropagation();if(C.on)stopV();else startV();};
    end.onclick=function(e){e.stopPropagation();close1(C);};
    if(!rm()){var bx=document.createElement('button');bx.type='button';bx.className='hfapX';bx.textContent='\u2715';bx.title='Close '+cfg.name+' (back to AI Assistant picker)';bx.setAttribute('aria-label',bx.title);
      ['pointerdown','mousedown','dblclick'].forEach(function(ev){bx.addEventListener(ev,function(e){e.stopPropagation();});});bx.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();close1(C);});bar.appendChild(bx);
      var fx=function(){if(!bar.isConnected)return;var r=bar.getBoundingClientRect(),k=(bar.offsetWidth&&r.width/bar.offsetWidth)||1,v='scale('+(1/k).toFixed(3)+')';if(bx.style.transform!==v)bx.style.transform=v;setTimeout(fx,1000);};setTimeout(fx,50);}
    gear.onclick=function(e){e.stopPropagation();cfg.onGear?cfg.onGear(bar,C):null;};
    notes.onclick=function(e){e.stopPropagation();if(cfg.onNotes)return cfg.onNotes(bar,C);var d=C.last;
      if(!d){pop(bar,'<b>'+esc(cfg.name)+'</b><br>Ask a question and the step-by-step breakdown, a check-your-understanding question and a glossary appear here.');return;}
      pop(bar,'<b>Step by step</b><ol>'+(d.steps||[]).map(function(s){return '<li>'+esc(s)+'</li>';}).join('')+'</ol>'+(d.check?'<b>Check your understanding</b><div>'+esc(d.check)+'</div>':'')+((d.glossary||[]).length?'<b>Glossary</b>'+d.glossary.map(function(g){return '<div><i>'+esc(g.term)+'</i> \u2014 '+esc(g.def)+'</div>';}).join(''):''));};
    line.classList.add('tap');line.onclick=function(e){e.stopPropagation();inp.classList.add('show');inp.focus();};
    inp.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter'){var q=inp.value;inp.value='';ask(q,false);}if(e.key==='Escape')inp.classList.remove('show');});
    row.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;e.stopPropagation();
      if(b.dataset.l){C.level=b.dataset.l;[].forEach.call(row.querySelectorAll('[data-l]'),function(x){x.classList.toggle('on',x===b);});return;}
      if(b.dataset.a==='ask'){var q=inp.value.trim();if(q){inp.value='';ask(q,false);}else{inp.classList.add('show');inp.focus();show(cfg.name+' is ready \u2014','Type your question, or tap the mic and speak');}return;}
      if(b.dataset.a==='again'){if(C.lastQ)ask(C.lastQ,true);else show(cfg.name+' is ready \u2014','Ask something first, then I can explain it another way');}});
    [].forEach.call(bar.querySelectorAll('input,button,.abtns i,.hfrow'),function(el){el.addEventListener('pointerdown',function(e){e.stopPropagation();});});
    ui.appendChild(bar);
    try{window.__float&&window.__float.adopt(bar);}catch(_){}
    try{if(window.__boxSize){window.__boxSize.adopt(bar);var g=bar.querySelector(':scope > .boxresize');if(g&&!g.classList.contains('cgrip')){g.classList.add('cgrip');g.innerHTML='';g.style.left='';g.style.top='';g.title='Resize (drag the corner)';bar.appendChild(g);}}}catch(_){}
    bar.style.zIndex=30;
    setState('idle');
    if(cfg.greeting)talk(cfg.greeting,true);   /* spoken only, synchronously inside the opening click; never shown on screen */
    if(cfg.autoListen)setTimeout(function(){if(live(C)&&!C.on)startV();},400);
    return C;}
  function crisisPop(bar){pop(bar,'<b>If you\u2019re in danger or thinking about hurting yourself or someone else, please reach a real person now.</b><br>US: call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline) \u00b7 Emergency: <a href="tel:911">911</a><br><small>Outside the US, call your local emergency number.</small>');}
  window.HF_agentPanel={build:'agentpanel-botsep-20261021a',open:open,close:close,open_ids:function(){return Object.keys(P);},current:function(){return cur;},crisisPop:crisisPop,pop:pop};

  /* ---- the three existing agents (companions, moderator) get the same bar on the dashboard; their own cards stay one tap away ---- */
  /* agentpanel-20261021f: server answers for Moderator / Mara / Theo. Route missing (404/503) or any error -> null -> the canned noAnswer line. */
  function botAsk(url,extra){return function(q,level,alt,hist){var b={q:q,level:level,alt:alt,voice:true,history:hist||[]};for(var k in extra)b[k]=extra[k];
    return fetch(url,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})
    .then(function(r){if(r.status===429)return {text:'',capMsg:'I\u2019ve reached today\u2019s answer budget. Let\u2019s pick this up tomorrow.'};if(!r.ok)return null;return r.json().then(function(d){return d&&d.text?d:null;},function(){return null;});},function(){return null;});};}
  function compCfg(id){var C=window.__hfCompanion,p=C&&C.personas[id];if(!p)return null;
    return {id:id,name:p.short||p.name,face:'assets/'+id+'-face.jpg?v=agentpanel-20261021e',voice:{sex:p.sex,pitch:p.pitch,rate:p.rate},autoListen:false,
      greeting:'Hi, I\u2019m '+(p.short||p.name)+', a support companion. I\u2019m not a therapist, but I\u2019m here to listen. Tap the notes icon any time for crisis help.',
      noAnswer:'I hear you. Take your time; I\u2019m listening. For deeper replies I need server AI, which isn\u2019t switched on yet.',
      crisis:C.crisis,onCrisis:crisisPop,tip:'Support companion \u2014 not a therapist',gearTitle:'Check-in & journal',notesTitle:'Crisis help (988 / 911)',
      ask:botAsk('/api/bots/companion/ask',{who:id}),
      onGear:function(){origComp(id);},onNotes:function(bar){crisisPop(bar);}};}
  function emojiFace(em,bg){var m=String(bg||'').match(/#[0-9a-f]{3,6}/gi)||['#556','#889'];
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+m[0]+'"/><stop offset="1" stop-color="'+(m[1]||m[0])+'"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="42" font-size="30" text-anchor="middle">'+em+'</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
  function modCfg(){var M=window.__hfModerator;return {id:'moderator',name:'Moderator',face:'assets/moderator-face.jpg?v=agentpanel-20261021e',voice:{sex:'f',pitch:1.0,rate:0.9},
      greeting:'Hello, I am the Moderator. I keep conversations calm and fair, and I never take sides. Tap the settings icon for my prep card.',
      noAnswer:'I can help prepare an agenda and ground rules. Live answers need server AI, which isn\u2019t switched on yet.',gearTitle:'Prep card',notesTitle:'Prep card',
      ask:botAsk('/api/bots/moderator/ask',{}),
      onGear:function(){origMod();},onNotes:function(){origMod();}};}
  var origCompOpen=null;function origComp(id){try{(origCompOpen||window.__hfCompanion.open)(id);}catch(_){}}
  function origMod(){try{window.__hfModerator.start('dash');}catch(_){}}
  function wrapComp(){var C=window.__hfCompanion;if(!C)return;Object.keys(C.personas||{}).forEach(function(id){var p=C.personas[id];p.face='<img src="assets/'+id+'-face.jpg?v=agentpanel-20261021d" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle">';p.bg='transparent';});
    [].forEach.call(document.querySelectorAll('.hfcpTile[data-bot] > div:first-child'),function(f){var id=f.parentNode.getAttribute('data-bot')||'';if(C.personas[id]&&!f.querySelector('img')){f.innerHTML=C.personas[id].face;f.parentNode.style.background='rgba(255,255,255,.085)';}});
    [].forEach.call(document.querySelectorAll('.hfcpTile .fc, .hfcp .fc'),function(f){var t=f.closest('[data-bot]');var id=t&&t.getAttribute('data-bot');if(C.personas[id]&&!f.querySelector('img')){f.innerHTML=C.personas[id].face;f.style.background='transparent';}});
    if(C.__hfap)return;origCompOpen=C.open;C.__hfap=1;   /* agentpanel-20261021f: wrap order fix (was set-then-return, so C.open was never wrapped) */
    C.open=function(id){if(document.documentElement.classList.contains('rb-room'))return origCompOpen.apply(this,arguments);var c=compCfg(id);return c?open(c):origCompOpen.apply(this,arguments);};}
  /* AI Assistant dropdown rows (ai-rows.js / moderator.js): open the shared bar on the dashboard. Window capture runs before their row handlers. */
  window.addEventListener('click',function(e){var r=e.target&&e.target.closest&&e.target.closest('#aiDd .dd-row[data-mod], #aiDd .dd-row[data-hfrow]');if(!r)return;
    if(document.documentElement.classList.contains('rb-room'))return;
    var id=r.hasAttribute('data-mod')?'moderator':r.getAttribute('data-hfrow');var cfg=id==='moderator'?modCfg():/^companion-/.test(id)?compCfg(id):(id==='professor'&&window.HF_professor&&window.HF_professor.cfg)?window.HF_professor.cfg():null;
    if(!cfg)return;e.stopPropagation();e.preventDefault();open(cfg);},true);
  setInterval(wrapComp,1000);wrapComp();
})();
