/* agentpanel-20261021a: shared Finn-layout panel for the new agents (Professor, Moderator, Support companions f/m).
   Clones Finn's bar (#vbBar: section.ava, .portrait, .atext status+line, input, .abtns gear/notes/mic/hang-up, .wave dots, fog)
   and adds ONE extra row under the dots: Simple · Standard · Deep · Ask · Explain it another way.
   Same drag (window.__float), resize corner (window.__boxSize) and glass as Finn. Finn/Ava's own bar is never touched.
   Voice: browser speechSynthesis (each bot's own voice) + webkitSpeechRecognition (free); ~1.2s silence = end of turn;
   recognition paused while the bot talks (echo filter), barge-in stops him. Roll back: remove the <script src="agent-panel.js"> tag. */
(function(){
  'use strict';
  if(window.HF_agentPanel)return;
  var css=document.createElement('style');
  css.textContent='html.rb-room #ui > section.ava.hfap.floatbox[data-agent][data-build]{display:block!important}#ui > section.ava.hfap{height:84px}#ui > section.ava.hfap .hfrow{position:absolute;left:57px;right:8px;top:60px;display:flex;gap:4px;pointer-events:auto!important}'+
   '#ui > section.ava.hfap .hfrow button{flex:1 1 auto;min-width:0;height:17px;padding:0 5px;border-radius:4px;border:1px solid rgba(255,255,255,.35);background:rgba(10,20,30,.55);color:#fff;font:400 8.6px "Montserrat",system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;pointer-events:auto!important}'+
   '#ui > section.ava.hfap .hfrow button.on{background:var(--hub-blue);color:#08222c;border-color:var(--hub-blue)}'+
   '#ui > section.ava.hfap .abtns i{pointer-events:auto!important;cursor:pointer}'+
   '.hfap-pop{position:fixed;z-index:99991;max-width:340px;max-height:50vh;overflow:auto;padding:10px 12px;border-radius:8px;color:#fff;font:12px system-ui;background:rgba(22,20,32,.55);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(14px) saturate(1.15);-webkit-backdrop-filter:blur(14px) saturate(1.15)}'+
   '.hfap-pop .x{float:right;background:none;border:0;color:#fff;cursor:pointer;font-size:14px}.hfap-pop ol{margin:4px 0 6px 18px;padding:0}.hfap-pop a{color:#ffd1d6;font-weight:600}';
  (document.head||document.documentElement).appendChild(css);
  /* Finn's bar is also styled by id (#vbBar, #vbInput, #vbWave, #vbMic...): mirror those rules once onto the clones (#hfap_vb*). */
  var mirrored=false;function mirror(){if(mirrored)return;mirrored=true;var out=[];
    function walk(rules,wrap){[].forEach.call(rules||[],function(r){try{
      if(r.selectorText&&/#vb/.test(r.selectorText)){var sel=r.selectorText.split(',').filter(function(x){return /#vb/.test(x);}).map(function(x){return x.replace(/#vbBar\b/g,'section.ava.hfap').replace(/#vb([A-Za-z])/g,'#hfap_vb$1');}).join(',');
        if(sel)out.push((wrap?wrap+'{':'')+sel+'{'+r.style.cssText+'}'+(wrap?'}':''));}
      else if(r.cssRules&&r.media)walk(r.cssRules,'@media '+r.media.mediaText);}catch(_){}});}
    [].forEach.call(document.styleSheets,function(sh){try{walk(sh.cssRules,'');}catch(_){}});
    var st=document.createElement('style');st.id='hfapMirror';st.textContent=out.join('\n');(document.body||document.documentElement).appendChild(st);}
  var cur=null;
  function voice(sex){var vs=((window.speechSynthesis&&speechSynthesis.getVoices())||[]).filter(function(v){return /^en/i.test(v.lang);});
    var F=/female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|aria|jenny|susan|hazel|serena|allison|libby|sonia/i,M=/\bmale\b|daniel|alex|fred|david|mark|guy|ryan|george|tom|arthur|oliver|aaron|thomas/i;
    var m=vs.filter(function(v){return sex==='f'?F.test(v.name):(M.test(v.name)&&!F.test(v.name));});return m[0]||null;}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function pop(bar,html){var o=document.getElementById('hfapPop');if(o)o.remove();var d=document.createElement('div');d.id='hfapPop';d.className='hfap-pop';
    d.innerHTML='<button class="x" aria-label="Close">\u2715</button>'+html;document.body.appendChild(d);var r=bar.getBoundingClientRect();
    d.style.left=Math.max(8,r.left)+'px';d.style.bottom=Math.max(8,innerHeight-r.top+6)+'px';d.querySelector('.x').onclick=function(){d.remove();};return d;}
  function close(){if(!cur)return;var c=cur;cur=null;c.stopV();try{speechSynthesis.cancel();}catch(_){}try{window.__float&&window.__float.drop(c.bar);}catch(_){}
    var p=document.getElementById('hfapPop');if(p)p.remove();c.bar.remove();}
  function open(cfg){
    if(cur&&cur.id===cfg.id){close();return null;}close();
    var src=document.getElementById('vbBar'),ui=document.getElementById('ui');if(!src||!ui)return null;
    mirror();var bar=src.cloneNode(true);
    [].forEach.call(bar.querySelectorAll('.fhandle,.boxresize,.boxmin,.boxclose'),function(e){e.remove();});
    [].forEach.call(bar.querySelectorAll('[id]'),function(e){e.id='hfap_'+e.id;});
    bar.id='hfap-'+cfg.id;bar.className='ava hfap';bar.removeAttribute('data-float');bar.removeAttribute('data-state');bar.setAttribute('data-agent',cfg.id);bar.setAttribute('data-build','agentpanel-20261021a');
    bar.style.cssText='';bar.style.left='305px';bar.style.top='396px';
    var $=function(s){return bar.querySelector(s);};
    var face=$('.portrait');face.src=cfg.face;face.alt=cfg.name;face.style.objectFit='cover';
    var stat=$('#hfap_vbStatus'),txt=$('#hfap_vbText'),line=$('#hfap_vbLine'),inp=$('#hfap_vbInput'),wave=[].slice.call($('#hfap_vbWave').querySelectorAll('i'));
    var base=wave.map(function(b){return parseFloat(b.style.height)||8;});
    stat.textContent=cfg.name+' is ready \u2014';txt.textContent=cfg.idle||'Tap the mic to talk';inp.placeholder='Type to '+cfg.name+', then Enter';inp.value='';inp.classList.remove('show');
    var ic=[].slice.call($('.abtns').querySelectorAll('i'));var gear=ic[0],notes=ic[1],mic=ic[2],end=ic[3];
    gear.title=cfg.gearTitle||'Options';notes.title=cfg.notesTitle||'Details';mic.title='Talk to '+cfg.name+' (mic)';end.title='Hang up: stop and close '+cfg.name;
    mic.classList.remove('on');
    var row=document.createElement('div');row.className='hfrow';
    row.innerHTML='<button data-l="simple">Simple</button><button data-l="standard" class="on">Standard</button><button data-l="deep">Deep</button><button data-a="ask">Ask</button><button data-a="again">Explain it another way</button>';
    bar.appendChild(row);
    var C={id:cfg.id,bar:bar,level:'standard',alt:0,last:null,lastQ:'',on:false,rec:null,buf:'',t:0,speaking:false,say:'',hist:[]};cur=C;
    var state='idle',raf=0;
    function setState(s){state=s;bar.classList.toggle('vb-live',s==='listening'||s==='speaking');bar.classList.toggle('vb-listening',s==='listening');bar.classList.toggle('vb-speaking',s==='speaking');bar.setAttribute('data-state',s);mic.classList.toggle('on',C.on);
      if((s==='listening'||s==='speaking')&&!raf)loop();}
    function loop(){if(!bar.isConnected||(state!=='listening'&&state!=='speaking')){raf=0;wave.forEach(function(b,i){b.style.height=base[i]+'px';});return;}
      var amp=state==='speaking'?1:0.45;wave.forEach(function(b,i){b.style.height=Math.max(3,Math.round(base[i]*(0.35+Math.random()*amp*1.2)))+'px';});raf=setTimeout(function(){raf=0;loop();},90);}
    function show(s,t){stat.textContent=s;txt.textContent=t||'';line.title=t||'';}
    function speak(t,done){try{if(!window.speechSynthesis||window.__botQuiet||(window.__hfQuiet&&window.__hfQuiet())){done&&done();return;}var u=new SpeechSynthesisUtterance(t);var v=voice(cfg.voice.sex);if(v)u.voice=v;u.pitch=cfg.voice.pitch;u.rate=cfg.voice.rate;
      u.onend=u.onerror=function(){done&&done();};speechSynthesis.cancel();speechSynthesis.speak(u);}catch(_){done&&done();}}
    function talk(t){C.speaking=true;C.say=t;setState('speaking');show(cfg.name+' is speaking \u2014',t);try{C.rec&&C.rec.abort();}catch(_){}
      setTimeout(function(){if(C.speaking&&C.on){try{C.rec&&C.rec.start();}catch(_){}}},700);
      speak(t,function(){C.speaking=false;if(cur!==C)return;if(C.on)rearm();else setState('idle');});}
    function echo(h){var w=h.toLowerCase().match(/[a-z']+/g)||[];if(!w.length)return true;var s=' '+C.say.toLowerCase().replace(/[^a-z' ]+/g,' ')+' ';return w.filter(function(x){return s.indexOf(' '+x+' ')>=0;}).length/w.length>0.6;}
    function rearm(){if(!C.on||C.speaking||cur!==C)return;setState('listening');show(cfg.name+' is listening \u2014','Go ahead, I\u2019m listening');try{C.rec&&C.rec.start();}catch(_){}}
    function startV(){var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){show(cfg.name+' is ready \u2014','Voice needs Chrome or Edge; type instead');inp.classList.add('show');return;}
      if(C.rec){C.on=true;rearm();return;}var r=new R();r.continuous=true;r.interimResults=true;r.lang='en-US';C.rec=r;C.on=true;
      r.onresult=function(e){var fin='',heard=false;for(var i=e.resultIndex;i<e.results.length;i++){var x=e.results[i],tr=x[0].transcript.trim();if(C.speaking&&echo(tr))continue;if(tr)heard=true;if(x.isFinal)fin+=tr+' ';}
        if(heard&&C.speaking){try{speechSynthesis.cancel();}catch(_){}C.speaking=false;setState('listening');}
        if(fin)C.buf+=fin;clearTimeout(C.t);if(heard)C.t=setTimeout(function(){var q=C.buf.trim();C.buf='';if(q)ask(q,false);},1200);};
      r.onend=function(){if(C.on&&cur===C)setTimeout(function(){if(C.speaking){try{r.start();}catch(_){}}else rearm();},250);};
      r.onerror=function(e){if(e.error==='not-allowed'||e.error==='service-not-allowed'){C.on=false;setState('idle');show(cfg.name+' is ready \u2014','Microphone blocked: allow the mic, or type');inp.classList.add('show');}};
      rearm();}
    function stopV(){C.on=false;clearTimeout(C.t);try{C.rec&&C.rec.abort();}catch(_){}C.rec=null;setState(C.speaking?'speaking':'idle');}
    C.stopV=function(){stopV();C.speaking=false;};
    function ask(q,again){q=String(q||'').trim();if(!q)return;C.lastQ=q;C.alt=again?C.alt+1:0;
      if(cfg.crisis&&cfg.crisis(q)){cfg.onCrisis&&cfg.onCrisis(bar);}
      try{C.rec&&C.rec.abort();}catch(_){}setState('thinking');show(cfg.name+' is thinking \u2014',q);
      Promise.resolve(cfg.ask?cfg.ask(q,C.level,C.alt,C.hist):null).then(function(d){if(cur!==C)return;
        if(!d||!d.text){var m=cfg.noAnswer||'Answers need server AI, which isn\u2019t switched on for me yet.';show(cfg.name+' \u2014',m);speak(m,function(){if(C.on)rearm();else setState('idle');});return;}
        C.last=d;C.hist.push({role:'user',text:q},{role:'assistant',text:d.text});C.hist=C.hist.slice(-6);talk(d.text);},
      function(){if(cur!==C)return;show(cfg.name+' \u2014','Sorry, I couldn\u2019t reach my answer service. Try again.');if(C.on)setTimeout(rearm,800);else setState('idle');});}
    C.ask=ask;C.talk=talk;
    mic.onclick=function(e){e.stopPropagation();if(C.on)stopV();else startV();};
    end.onclick=function(e){e.stopPropagation();close();};
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
    if(cfg.greeting)setTimeout(function(){if(cur===C)talk(cfg.greeting);},250);
    if(cfg.autoListen)setTimeout(function(){if(cur===C&&!C.on)startV();},400);
    return C;}
  function crisisPop(bar){pop(bar,'<b>If you\u2019re in danger or thinking about hurting yourself or someone else, please reach a real person now.</b><br>US: call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline) \u00b7 Emergency: <a href="tel:911">911</a><br><small>Outside the US, call your local emergency number.</small>');}
  window.HF_agentPanel={build:'agentpanel-20261021a',open:open,close:close,current:function(){return cur;},crisisPop:crisisPop,pop:pop};

  /* ---- the three existing agents (companions, moderator) get the same bar on the dashboard; their own cards stay one tap away ---- */
  function compCfg(id){var C=window.__hfCompanion,p=C&&C.personas[id];if(!p)return null;
    return {id:id,name:p.short||p.name,face:emojiFace(p.face,p.bg),voice:{sex:p.sex,pitch:p.pitch,rate:p.rate},autoListen:false,
      greeting:'Hi, I\u2019m '+(p.short||p.name)+', a support companion. I\u2019m not a therapist, but I\u2019m here to listen. Tap the notes icon any time for crisis help.',
      noAnswer:'I hear you. Take your time; I\u2019m listening. For deeper replies I need server AI, which isn\u2019t switched on yet.',
      crisis:C.crisis,onCrisis:crisisPop,gearTitle:'Check-in & journal',notesTitle:'Crisis help (988 / 911)',
      onGear:function(){origComp(id);},onNotes:function(bar){crisisPop(bar);}};}
  function emojiFace(em,bg){var m=String(bg||'').match(/#[0-9a-f]{3,6}/gi)||['#556','#889'];
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="'+m[0]+'"/><stop offset="1" stop-color="'+(m[1]||m[0])+'"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><text x="32" y="42" font-size="30" text-anchor="middle">'+em+'</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
  function modCfg(){var M=window.__hfModerator;return {id:'moderator',name:'Moderator',face:(M&&M.face)||'',voice:{sex:'f',pitch:1.0,rate:0.9},
      greeting:'Hello, I am the Moderator. I keep conversations calm and fair, and I never take sides. Tap the settings icon for my prep card.',
      noAnswer:'I can help prepare an agenda and ground rules. Live answers need server AI, which isn\u2019t switched on yet.',gearTitle:'Prep card',notesTitle:'Prep card',
      onGear:function(){origMod();},onNotes:function(){origMod();}};}
  var origCompOpen=null;function origComp(id){try{(origCompOpen||window.__hfCompanion.open)(id);}catch(_){}}
  function origMod(){try{window.__hfModerator.start('dash');}catch(_){}}
  function wrapComp(){var C=window.__hfCompanion;if(!C||C.__hfap)return;origCompOpen=C.open;C.__hfap=1;
    C.open=function(id){if(document.documentElement.classList.contains('rb-room'))return origCompOpen.apply(this,arguments);var c=compCfg(id);return c?open(c):origCompOpen.apply(this,arguments);};}
  /* AI Assistant dropdown rows (ai-rows.js / moderator.js): open the shared bar on the dashboard. Window capture runs before their row handlers. */
  window.addEventListener('click',function(e){var r=e.target&&e.target.closest&&e.target.closest('#aiDd .dd-row[data-mod], #aiDd .dd-row[data-hfrow]');if(!r)return;
    if(document.documentElement.classList.contains('rb-room'))return;
    var id=r.hasAttribute('data-mod')?'moderator':r.getAttribute('data-hfrow');var cfg=id==='moderator'?modCfg():/^companion-/.test(id)?compCfg(id):(id==='professor'&&window.HF_professor&&window.HF_professor.cfg)?window.HF_professor.cfg():null;
    if(!cfg)return;e.stopPropagation();e.preventDefault();open(cfg);},true);
  setInterval(wrapComp,1000);wrapComp();
})();
