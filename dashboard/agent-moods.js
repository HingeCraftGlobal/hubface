/* agentmoods-20261021a: mood-matched faces for HubFace agents (page-side only).
   Swaps the portrait of each agent bar to the expression matching what the agent is saying.
   Sets live in assets/expressions/<slug>/<name>.png; assets/expressions/index.json lists the sets that are present.
   Agents: Professor, Mara (companion-f), companion-m, Moderator (shared bar, section.ava.hfap[data-agent]) and Finn / Ava (#vbBar #vbFace).
   Default warm_smile; listening while the mic is open; thoughtful while thinking.
   Roll back: remove the <script src="agent-moods.js"> tag. */
(function(){
  'use strict';
  if(window.HF_moods)return;
  var BUILD='agentmoods-20261021a',BASE='assets/expressions/',have={};
  var SLUG={professor:'professor','companion-f':'mara','companion-m':'companion-m',moderator:'moderator',ava:'ava',finn:'finn'};
  /* keyword map, first match wins; mirrors the Yoda pack's map */
  var MAP=[
    ['apologetic',/\b(sorry|apolog|my mistake|my bad|i was wrong|forgive)/i],
    ['concerned',/\b(worr|concern|careful|risk|danger|unsafe|crisis|hurt|afraid|scared|warning)/i],
    ['empathetic',/\b(i hear you|that sounds (hard|difficult|tough)|i understand how|must be hard|you feel|feelings?|grief|loss|lonely|sad)/i],
    ['reassuring',/\b(don'?t worry|it'?s ok|it'?s okay|you'?re safe|no problem|it will be fine|you'?ll be fine|take your time|relax)/i],
    ['relieved',/\b(phew|relief|relieved|finally|thank goodness|all clear|resolved)/i],
    ['excited',/\b(amazing|awesome|fantastic|incredible|can'?t wait|let'?s go|wow,? this)/i],
    ['joyful',/\b(congrat|wonderful|delight|so happy|great news|hooray|yay|celebrat)/i],
    ['surprised',/\b(wow|whoa|really\?|no way|surpris|unexpected|didn'?t expect)/i],
    ['proud',/\b(proud|well done|nailed it|great job|you did it|achievement|accomplish)/i],
    ['encouraging',/\b(you can|keep going|try again|you'?ve got this|good start|nice work|almost there|let'?s try)/i],
    ['amused',/\b(haha|ha ha|lol|funny|joke|laugh|hilarious)/i],
    ['wry',/\b(of course|naturally|ironic|well,? well|figures|as usual)/i],
    ['skeptical',/\b(not sure that|doubt|really sure|i'?m skeptical|questionable|hmm,? maybe not|unlikely)/i],
    ['puzzled',/\b(confus|puzzl|unclear|i don'?t follow|didn'?t catch|not sure what you mean|could you repeat|say that again)/i],
    ['curious',/\b(tell me more|curious|interesting|what do you think|why do you|how did you|i wonder)/i],
    ['firm',/\b(must not|must|not allowed|cannot|can'?t do that|no,|stop|rule|boundary|non-negotiable|ground rules?)/i],
    ['serious',/\b(important|serious|critical|legal|deadline|consequence|urgent)/i],
    ['determined',/\b(we will|i will|let'?s get|plan|commit|determined|on it|get this done)/i],
    ['confident',/\b(definitely|certainly|absolutely|clearly|for sure|the answer is|exactly)/i],
    ['focused',/\b(step \d|first,|second,|next,|focus|let'?s break|in detail|specifically)/i],
    ['thoughtful',/\b(consider|think about|perhaps|on the other hand|it depends|reflect)/i],
    ['tired',/\b(tired|exhausted|long day|sleepy|worn out|late night)/i],
    ['listening',/\b(i'?m listening|go ahead|tell me|i'?m here)/i],
    ['neutral',/\b(okay\.|noted|understood|fine\.)/i]
  ];
  function mood(t){t=String(t||'');for(var i=0;i<MAP.length;i++)if(MAP[i][1].test(t))return MAP[i][0];if(/\?\s*$/.test(t))return 'curious';if(/!\s*$/.test(t))return 'joyful';return 'warm_smile';}
  function url(slug,name){return BASE+slug+'/'+name+'.png?v='+BUILD;}
  function setFace(img,slug,name){if(!img||!slug||!have[slug])return;var u=url(slug,name);if(img.getAttribute('data-mood')===name&&img.getAttribute('data-mslug')===slug)return;
    var pre=new Image();pre.onload=function(){img.src=u;img.setAttribute('data-mood',name);img.setAttribute('data-mslug',slug);};pre.src=u;}
  function stateMood(st,said){return st==='speaking'?mood(said):st==='listening'?'listening':st==='thinking'?'thoughtful':'warm_smile';}
  /* shared bar agents */
  function tickPanels(){[].forEach.call(document.querySelectorAll('section.ava.hfap[data-agent]'),function(bar){var id=bar.getAttribute('data-agent'),slug=SLUG[id];if(!slug||!have[slug])return;
    var st=bar.getAttribute('data-state')||'idle',P=window.HF_agentPanel,c=P&&P.current&&P.current(),said=(c&&c.bar===bar&&c.say)||((bar.querySelector('#hfap_vbText')||{}).textContent||'');
    var key=st+'|'+said;if(bar.__mk===key)return;bar.__mk=key;setFace(bar.querySelector('.portrait'),slug,stateMood(st,said));});}
  /* Finn / Ava bar: whose face is it? remember the last non-expression src */
  function tickFinn(){var bar=document.getElementById('vbBar'),img=document.getElementById('vbFace');if(!bar||!img)return;
    var src=img.getAttribute('src')||'';if(src.indexOf(BASE)<0)img.__base=src;var b=img.__base||'';
    var slug=/dan-ava|avadan|\bava\b/i.test(b)?'ava':/yoda-finn|finn/i.test(b)?'finn':null;if(!slug||!have[slug])return;
    var st=bar.classList.contains('vb-speaking')?'speaking':bar.classList.contains('vb-listening')?'listening':'idle';
    var said=((document.getElementById('vbText')||{}).textContent||'')+' '+((document.getElementById('vbLine')||{}).textContent||'');
    var key=slug+'|'+st+'|'+said;if(bar.__mk===key)return;bar.__mk=key;
    if(st==='idle'&&!img.getAttribute('data-mood')){return;}  /* leave the original photo until the agent first talks or listens */
    setFace(img,slug,stateMood(st,said));}
  function tick(){try{tickPanels();}catch(_){}try{tickFinn();}catch(_){}}
  fetch(BASE+'index.json?v='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():{};}).then(function(j){(j.sets||[]).forEach(function(s){if(s.count>=25)have[s.slug]=1;});tick();}).catch(function(){});
  setInterval(tick,400);
  window.HF_moods={build:BUILD,mood:mood,have:have,set:setFace,slugs:SLUG};
})();
