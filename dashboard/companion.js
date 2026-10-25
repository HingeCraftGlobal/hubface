/* companion-20261021a: Support companions v1 (page-only, no AI spend, no server). ids companion-f / companion-m.
   Not a therapist. Scripted prompts, feelings check-in, local-only journal, crisis card (988/911), browser voice.
   Journal is kept in this browser only (localStorage hf-companion-journal) and is never posted to room chat or transcripts.
   Rollback: remove the companion.js script tag from index.html (see backups/companion-STAMP/ROLLBACK.sh). */
(function(){
  if(window.__hfCompanion)return;
  var P={'companion-f':{name:'Support companion (female)',short:'Mara',face:'\ud83c\udf38',bg:'linear-gradient(135deg,#7a4f8c,#c98bb0)',sex:'f',pitch:1.05,rate:0.92},
         'companion-m':{name:'Support companion (male)',short:'Theo',face:'\ud83c\udf32',bg:'linear-gradient(135deg,#2f5d62,#6fa38f)',sex:'m',pitch:0.9,rate:0.9}};
  var DISC='I\u2019m a support companion, not a therapist or counsellor, and I can\u2019t give medical advice. I\u2019m here to listen.';
  var FEEL=['Calm','Okay','Tired','Anxious','Sad','Angry','Overwhelmed','Lonely','Hopeful'];
  var REFL={Calm:'It sounds like things feel fairly steady right now. What would you like to talk through?',
    Okay:'Okay can mean a lot of things. What\u2019s sitting underneath it today?',
    Tired:'It sounds like you\u2019re running low. What\u2019s been taking the most out of you?',
    Anxious:'It sounds like something has you on edge. What\u2019s the worry that keeps coming back?',
    Sad:'I hear that you\u2019re feeling sad. Would you like to tell me what\u2019s been weighing on you?',
    Angry:'It sounds like something really got to you. What happened?',
    Overwhelmed:'It sounds like a lot is landing at once. If we pick just one piece, which one is loudest?',
    Lonely:'Feeling alone is hard. When did you notice it most this week?',
    Hopeful:'It\u2019s good to hear some hope in there. What\u2019s giving you that?'};
  var PROMPTS=['What\u2019s on your mind right now?','If you could say one thing without anyone judging it, what would it be?',
    'What part of this feels the heaviest?','What do you wish someone understood about this?','What\u2019s in your control here, and what isn\u2019t?',
    'If a friend told you this, what would you say to them?','What would feel like a small step forward today?','Is there anything you need right now, even something tiny?'];
  var CRISIS=/\b(kill (my ?self|him|her|them)|suicid\w*|end (my|it all)|want to die|don'?t want to (live|be here)|self[- ]?harm|cut(ting)? myself|hurt (my ?self|someone|him|her|them)|overdose|no reason to live|better off dead|being (hit|abused)|abus(e|ed|ing) me|he hits me|she hits me|not safe at home)\b/i;
  var JK='hf-companion-journal';
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function inRoom(){return document.documentElement.classList.contains('rb-room');}
  /* ---- browser voice, distinct from Ava/Finn (they use the server TTS voices eve/lumen; this uses the browser's own voices) ---- */
  var FEM=/female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|aria|jenny|susan|hazel|serena|allison|ava|libby|sonia/i, MAL=/\bmale\b|\bman\b|daniel|alex|fred|david|mark|guy|ryan|george|tom|arthur|oliver|aaron|thomas/i;
  function pickVoice(sex){var vs=(window.speechSynthesis&&speechSynthesis.getVoices())||[];vs=vs.filter(function(v){return /^en/i.test(v.lang);});
    var re=sex==='f'?FEM:MAL,no=sex==='f'?/\bmale\b|daniel|alex|fred|david|mark|guy|ryan|george/i:/female|woman|samantha|victoria|karen|zira|aria|jenny|susan|hazel|ava/i;
    return vs.filter(function(v){return re.test(v.name)&&!no.test(v.name.replace(/female/i,''));})[0]||vs[0]||null;}
  var voiceOn={};
  function say(id,t){try{if(!voiceOn[id]||!window.__hfVoice)return;if(window.__hfQuiet&&window.__hfQuiet())return;var p=P[id];window.__hfVoice.say(t,p.sex==='f'?'ursa':'helios',{bot:p.sex==='f'?'companion-f':'companion-m',who:p.name});}catch(_){}}   /* voice4-20261021a */
  function stopVoice(){try{window.__hfVoice&&window.__hfVoice.stop();}catch(_){}}
  /* ---- styles ---- */
  var css=document.createElement('style');css.textContent=
   '.hfcp{position:fixed;right:16px;bottom:90px;width:340px;max-height:78vh;overflow:auto;background:#1d1a24;color:#f3eef6;border-radius:16px;box-shadow:0 10px 34px rgba(0,0,0,.5);z-index:100002;font:14px/1.4 system-ui;pointer-events:auto}'+
   '.hfcp *{pointer-events:auto}.hfcp h3{margin:0;font-size:15px}.hfcp .hd{display:flex;gap:10px;align-items:center;padding:12px;border-bottom:1px solid #332c3d}'+
   '.hfcp .fc{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;flex:none}'+
   '.hfcp .x{margin-left:auto;background:none;border:0;color:#bbb;font-size:20px;cursor:pointer}.hfcp .sec{padding:10px 12px;border-bottom:1px solid #2a2432}'+
   '.hfcp .disc{font-size:12px;opacity:.85;background:#2a2432;padding:8px 12px}.hfcp .chips button{margin:3px;padding:5px 9px;border-radius:14px;border:1px solid #5a4b66;background:#2a2432;color:#fff;cursor:pointer;font-size:12px}'+
   '.hfcp .chips button.on{background:#6d5580}.hfcp .bub{background:#2d2738;border-radius:10px;padding:8px 10px;margin:6px 0}'+
   '.hfcp textarea{width:100%;box-sizing:border-box;min-height:80px;background:#141119;color:#fff;border:1px solid #3d3447;border-radius:8px;padding:8px;font:13px system-ui;resize:vertical}'+
   '.hfcp .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.hfcp .row button{padding:5px 10px;border-radius:8px;border:0;background:#3b3248;color:#fff;cursor:pointer;font-size:12px}'+
   '.hfcp .crisis{background:#3a1f24;border-left:4px solid #e25c6a;padding:10px 12px;font-size:13px}.hfcp .crisis.alert{background:#5a1f28;animation:hfcpP 1.2s 3}'+
   '.hfcp .crisis a{color:#ffd1d6;font-weight:600}@keyframes hfcpP{50%{box-shadow:inset 0 0 0 2px #ff8090}}'+
   '.hfcp .jl{font-size:12px;opacity:.8;max-height:120px;overflow:auto}.hfcp small{opacity:.7}'+
   '.hfcpTile{cursor:pointer!important;pointer-events:auto!important}';
  document.head.appendChild(css);
  /* ---- journal (local only) ---- */
  function jl(){try{return JSON.parse(localStorage.getItem(JK)||'[]')||[];}catch(_){return [];}}
  function jsave(a){try{localStorage.setItem(JK,JSON.stringify(a.slice(-100)));}catch(_){}}
  var open=null;
  function panel(id){var p=P[id];if(!p)return;if(open){open.remove();stopVoice();}
    if(voiceOn[id]==null)voiceOn[id]=!inRoom();   /* in a room the voice starts off so other people (and room speech-to-text) don't hear it */
    var d=document.createElement('div');d.className='hfcp';d.setAttribute('data-bot',id);d.setAttribute('data-no-transcript','1');open=d;
    d.innerHTML='<div class="hd"><div class="fc" style="background:'+p.bg+'" aria-hidden="true">'+p.face+'</div><div><h3>'+esc(p.name)+'</h3><small>v1 \u00b7 scripted, no AI \u00b7 '+(inRoom()?'only on your screen':'just you')+'</small></div><button class="x" title="Close" aria-label="Close">\u00d7</button></div>'+
      '<div class="disc">'+esc(DISC)+'</div>'+
      '<div class="crisis" id="hfcpCr"><b>If you\u2019re in danger or thinking about hurting yourself or someone else, please reach a real person now.</b><br>US: call or text <a href="tel:988">988</a> (Suicide &amp; Crisis Lifeline) \u00b7 emergency <a href="tel:911">911</a>.<br>Outside the US: your local emergency number, or <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a>.</div>'+
      '<div class="sec"><b>How are you feeling right now?</b><div class="chips" id="hfcpF">'+FEEL.map(function(f){return '<button type="button" data-f="'+f+'">'+f+'</button>';}).join('')+'</div><div id="hfcpR"></div></div>'+
      '<div class="sec"><b>Something to think about</b><div class="bub" id="hfcpQ">'+esc(PROMPTS[0])+'</div><div class="row"><button type="button" id="hfcpN">Another question</button><button type="button" id="hfcpV">Voice: '+(voiceOn[id]?'on':'off')+'</button></div></div>'+
      '<div class="sec"><b>Journal</b> <small>(saved only in this browser, never in room chat or transcripts)</small><textarea id="hfcpT" placeholder="Write whatever you need to get off your chest\u2026"></textarea>'+
      '<div class="row"><button type="button" id="hfcpS">Save entry</button><button type="button" id="hfcpC">Clear all entries</button></div><div class="jl" id="hfcpL"></div></div>';
    ['pointerdown','keydown','keyup','keypress','dblclick','click'].forEach(function(ev){d.addEventListener(ev,function(e){e.stopPropagation();});});
    document.body.appendChild(d);
    var qi=0,$=function(s){return d.querySelector(s);};
    function renderL(){var a=jl();$('#hfcpL').innerHTML=a.length?a.slice().reverse().map(function(e){return '<div class="bub"><small>'+esc(new Date(e.at).toLocaleString())+'</small><br>'+esc(e.t)+'</div>';}).join(''):'<small>No entries yet.</small>';}
    function crisisCheck(t){if(CRISIS.test(t)){var c=$('#hfcpCr');c.classList.remove('alert');void c.offsetWidth;c.classList.add('alert');c.scrollIntoView({block:'nearest'});
      say(id,'I\u2019m really glad you told me. I can\u2019t help with this on my own, and you deserve a real person right now. In the US you can call or text 9 8 8, or call 9 1 1 if you\u2019re in danger.');return true;}return false;}
    $('.x').onclick=function(){d.remove();open=null;stopVoice();};
    $('#hfcpF').onclick=function(e){var b=e.target.closest('button[data-f]');if(!b)return;[].forEach.call(this.children,function(x){x.classList.toggle('on',x===b);});var r=REFL[b.getAttribute('data-f')];$('#hfcpR').innerHTML='<div class="bub">'+esc(r)+'</div>';say(id,r);};
    $('#hfcpN').onclick=function(){qi=(qi+1)%PROMPTS.length;$('#hfcpQ').textContent=PROMPTS[qi];say(id,PROMPTS[qi]);};
    $('#hfcpV').onclick=function(){voiceOn[id]=!voiceOn[id];this.textContent='Voice: '+(voiceOn[id]?'on':'off');if(!voiceOn[id])stopVoice();};
    $('#hfcpT').addEventListener('input',function(){crisisCheck(this.value);});
    $('#hfcpS').onclick=function(){var t=$('#hfcpT').value.trim();if(!t)return;var a=jl();a.push({at:Date.now(),bot:id,t:t});jsave(a);$('#hfcpT').value='';renderL();
      if(!crisisCheck(t))say(id,'Thank you for writing that down. It\u2019s saved only on this device.');};
    $('#hfcpC').onclick=function(){if(confirm('Delete all journal entries saved in this browser?')){jsave([]);try{localStorage.removeItem(JK);}catch(_){}renderL();}};
    renderL();
    setTimeout(function(){say(id,'Hi, I\u2019m here to listen. '+DISC.split('. ')[0]+'. How are you feeling right now?');},150);}
  /* ---- room: upgrade the picker tile made by room-extras.js and open the panel on invite ---- */
  function upgradeTiles(){Object.keys(P).forEach(function(id){var t=document.getElementById('rxSoon_'+id);if(!t||t.__hfc)return;t.__hfc=1;t.classList.add('hfcpTile');
      t.style.background=P[id].bg;t.innerHTML='<div style="font-size:26px">'+P[id].face+'</div><b>'+esc(P[id].name)+'</b><br><small>v1 \u00b7 text + browser voice \u00b7 tap to open</small>';
      t.addEventListener('click',function(e){e.stopPropagation();panel(id);});});
    if(open&&inRoom()){var id=open.getAttribute('data-bot');if(window.HF_roomBots&&window.HF_roomBots().indexOf(id)<0&&!open.__dash){open.remove();open=null;stopVoice();}}}
  addEventListener('hf:bot-invite',function(e){var id=e.detail&&e.detail.id;if(P[id])setTimeout(function(){upgradeTiles();panel(id);},50);});
  addEventListener('hf:bot-remove',function(e){var id=e.detail&&e.detail.id;if(P[id]&&open&&open.getAttribute('data-bot')===id){open.remove();open=null;stopVoice();}});
  setInterval(upgradeTiles,1000);
  /* ---- main dashboard widget row (#ui .blist): two tiles before the "+ Name your own widget" tile ---- */
  function dashTiles(){var list=document.querySelector('#ui .blist');if(!list)return false;
    Object.keys(P).forEach(function(id){if(list.querySelector('.build[data-bot="'+id+'"]'))return;var d=document.createElement('div');d.className='build bsm hfcpTile';d.setAttribute('data-bot',id);d.setAttribute('role','button');
      d.title=P[id].name+' \u2014 listen-and-reflect companion (not a therapist)';d.innerHTML='<b>'+esc(P[id].name)+'</b>';
      ['pointerdown','dblclick'].forEach(function(ev){d.addEventListener(ev,function(e){e.stopPropagation();});});
      d.addEventListener('click',function(e){e.stopPropagation();panel(id);if(open)open.__dash=1;});
      var plus=list.querySelector('.bnew');list.insertBefore(d,plus||null);});return true;}
  if(!dashTiles()){var n=0,iv=setInterval(function(){if(dashTiles()||++n>30)clearInterval(iv);},500);}
  window.__hfCompanion={open:panel,personas:P,voice:pickVoice,crisis:function(t){return CRISIS.test(t);}};
})();
