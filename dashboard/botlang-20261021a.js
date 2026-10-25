/* botlang-20261021a (Dan, voice Oct 21 2026 ~1:01pm ET): per-bot reply language for every bot panel in HubFace rooms.
   - Small language chip (bottom-right of each bot panel: vbBar = Ava/Finn, hfap-* = Moderator/Professor/Mara/Theo). No voice picker; voices stay fixed.
   - Saved per bot in localStorage 'hf.botlang.v1' ({bot: code}). English = default (nothing changes).
   - Ava/Finn model replies: POST /api/dashboard/chat from the voice bar gets "[Reply only in <lang>]" prepended (client-side).
   - Every bot's /api/tts text is translated to that bot's language before it is spoken (voice_id untouched):
     static botlang-20261021a.json (wake lines) -> localStorage cache -> free translate (Google gtx, then MyMemory). No xAI calls.
   - The bot's on-panel line and transcript entries are translated the same way.
   Roll back: ROLLBACK-botlang.sh (removes the tag). */
(function(){
  'use strict';
  if(window.__hfBotLang)return;
  var BUILD='botlang-20261021a',KEY='hf.botlang.v1',CK='hf.botlang.cache.v1';
  /* 29 languages: [code, native name, English name, translate code] */
  var LANGS=[['en','English','English','en'],['es','Español','Spanish','es'],['fr','Français','French','fr'],['de','Deutsch','German','de'],
    ['it','Italiano','Italian','it'],['pt','Português','Portuguese','pt'],['nl','Nederlands','Dutch','nl'],['pl','Polski','Polish','pl'],
    ['ru','Русский','Russian','ru'],['uk','Українська','Ukrainian','uk'],['tr','Türkçe','Turkish','tr'],['ar','العربية','Arabic','ar'],
    ['he','עברית','Hebrew','he'],['hi','हिन्दी','Hindi','hi'],['bn','বাংলা','Bengali','bn'],['ur','اردو','Urdu','ur'],
    ['zh','中文','Chinese (Simplified)','zh-CN'],['ja','日本語','Japanese','ja'],['ko','한국어','Korean','ko'],['vi','Tiếng Việt','Vietnamese','vi'],
    ['th','ไทย','Thai','th'],['id','Bahasa Indonesia','Indonesian','id'],['ms','Bahasa Melayu','Malay','ms'],['fil','Filipino','Filipino','tl'],
    ['sw','Kiswahili','Swahili','sw'],['el','Ελληνικά','Greek','el'],['sv','Svenska','Swedish','sv'],['cs','Čeština','Czech','cs'],['ro','Română','Romanian','ro']];
  var BY={};LANGS.forEach(function(l){BY[l[0]]=l;});
  var VOICE={lumen:'finn',eve:'ava',helios:'theo',ursa:'mara',aurora:'moderator',orion:'professor'};
  var AGENT={'companion-f':'mara','companion-m':'theo',mara:'mara',theo:'theo',moderator:'moderator',professor:'professor',finn:'finn',ava:'ava',fin:'finn',yoda:'finn'};   /* roster id 'yoda' is the Fin bar = Finn */
  function rd(k,d){try{return JSON.parse(localStorage.getItem(k)||'null')||d;}catch(_){return d;}}
  var MAP=rd(KEY,{}),CACHE=rd(CK,{}),STATIC={},stats={chat:0,tts:0,tr:0,hit:0,net:0,fail:0};
  function get(b){b=AGENT[b]||b;var c=MAP[b];return BY[c]?c:'en';}
  function set(b,c){b=AGENT[b]||b;if(!BY[c])c='en';if(c==='en')delete MAP[b];else MAP[b]=c;try{localStorage.setItem(KEY,JSON.stringify(MAP));}catch(_){}paint();}
  var _f=window.fetch.bind(window);
  _f('botlang-20261021a.json?v='+BUILD).then(function(r){return r.ok?r.json():{};}).then(function(j){STATIC=j||{};},function(){});
  function saveC(){try{var k=Object.keys(CACHE);if(k.length>600)k.slice(0,k.length-600).forEach(function(x){delete CACHE[x];});localStorage.setItem(CK,JSON.stringify(CACHE));}catch(_){}}
  var OUT={};   /* text we produced, never re-translated */
  function tmo(p,ms){return Promise.race([p,new Promise(function(_,j){setTimeout(function(){j('t');},ms);})]);}
  function gtx(s,tl){return tmo(_f('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='+tl+'&dt=t&q='+encodeURIComponent(s)).then(function(r){if(!r.ok)throw 0;return r.json();})
    .then(function(j){var t=(j&&j[0]||[]).map(function(x){return x&&x[0]||'';}).join('');if(!t)throw 0;return t;}),3000);}
  function mym(s,tl){return tmo(_f('https://api.mymemory.translated.net/get?q='+encodeURIComponent(s.slice(0,480))+'&langpair=en|'+tl).then(function(r){return r.json();})
    .then(function(j){var t=j&&j.responseData&&j.responseData.translatedText;if(j.responseStatus!=200||!t||/MYMEMORY WARNING|QUERY LENGTH/i.test(t))throw 0;return t;}),4000);}
  function tr(s,c){s=String(s||'');if(c==='en'||!BY[c]||!s.trim()||OUT[s])return Promise.resolve(s);var tl=BY[c][3];stats.tr++;
    var st=STATIC[tl]&&STATIC[tl][s];if(st){stats.hit++;OUT[st]=1;return Promise.resolve(st);}
    var ck=tl+'|'+s;if(CACHE[ck]){stats.hit++;OUT[CACHE[ck]]=1;return Promise.resolve(CACHE[ck]);}
    stats.net++;return gtx(s,tl).catch(function(){return mym(s,tl);}).then(function(t){CACHE[ck]=t;saveC();OUT[t]=1;return t;},function(){stats.fail++;return s;});}
  function curBot(){try{var R=window.__roster;return R&&R.current?String(R.current()||''):'';}catch(_){return '';}}
  function u(x){return typeof x==='string'?x:(x&&x.url)||'';}
  window.fetch=function(input,init){
    try{var url=u(input),m=init&&String(init.method||'').toUpperCase()==='POST',body=m&&typeof init.body==='string'?init.body:null;
      if(body&&/\/api\/dashboard\/chat(\?|$)/.test(url)){var j=JSON.parse(body);
        if(j&&typeof j.text==='string'&&j.text.indexOf('[Answer only Dan')===0){var b=curBot(),nm=/Dan says:\s*(?:hey\s+|hi\s+)?(finn|fin|ava)\b/i.exec(j.text);if(nm)b=nm[1].toLowerCase();var c=get(b);
          if(c!=='en'){stats.chat++;var L=BY[c];j.text='[Reply only in '+L[2]+' ('+L[1]+'), even if Dan writes in English. Keep names as they are.] '+j.text;j.reply_language=c;
            return _f(input,Object.assign({},init,{body:JSON.stringify(j)}));}}}
      if(body&&/\/api\/tts(\?|$)/.test(url)){var t=JSON.parse(body),bt=VOICE[t&&t.voice_id],lc=bt?get(bt):'en';
        if(bt&&lc!=='en'&&typeof t.text==='string'){stats.tts++;
          return tr(t.text,lc).then(function(x){t.text=x;last[bt]={src:'tts',text:x,lang:lc,at:Date.now()};return _f(input,Object.assign({},init,{body:JSON.stringify(t)}));});}}
    }catch(_){}
    return _f(input,init);};
  var last={};
  /* on-panel line + transcript */
  function panelBot(s){var a=s.getAttribute('data-agent');if(a)return AGENT[a]||a;if(s.id==='vbBar')return AGENT[s.getAttribute('data-bot')]||curBot();return '';}
  function fixLine(s){var b=panelBot(s),c=b?get(b):'en';if(c==='en')return;
    [].forEach.call(s.querySelectorAll('[id$="vbText"]'),function(e){var x=e.textContent;if(!x||!x.trim()||OUT[x]||e.__blBusy===x)return;e.__blBusy=x;
      tr(x,c).then(function(y){if(e.textContent===x&&y!==x)e.textContent=y;});});}
  function hookTrx(){var T=window.__trxAdd;if(typeof T!=='function'||T.__bl)return;var w=function(who,text){var a=arguments,self=this,c=get(String(who||'').toLowerCase());
      if(c==='en'||typeof text!=='string')return T.apply(self,a);tr(text,c).then(function(y){var b=[].slice.call(a);b[1]=y;T.apply(self,b);});};w.__bl=1;window.__trxAdd=w;}
  /* UI chip */
  var css=document.createElement('style');css.textContent=
    '#ui > section.ava .hfbl{position:absolute;right:4px;bottom:3px;z-index:6;height:16px;min-width:22px;padding:0 4px;border-radius:8px;font:600 10px/16px system-ui,sans-serif;'+
    'color:#cfe3ff;background:rgba(20,40,80,.55);border:1px solid rgba(140,190,255,.35);text-align:center;cursor:pointer;overflow:hidden;box-sizing:border-box;letter-spacing:.02em}'+
    '#ui > section.ava .hfbl.on{color:#fff;background:rgba(40,110,220,.85);border-color:rgba(160,210,255,.8)}'+
    '#ui > section.ava .hfbl select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:13px}';
  (document.head||document.documentElement).appendChild(css);
  function chip(s){var e=s.querySelector(':scope > .hfbl');if(e&&!e.__bl){e.__bl=1;['mousedown','pointerdown','click','dblclick'].forEach(function(t){e.addEventListener(t,function(ev){ev.stopPropagation();});});}if(!e){e=document.createElement('span');e.className='hfbl';e.title='Language this bot speaks and writes in';
      var sel=document.createElement('select');sel.setAttribute('aria-label','Bot language');
      LANGS.forEach(function(l){var o=document.createElement('option');o.value=l[0];o.textContent=l[1]+(l[1]!==l[2]?' \u2014 '+l[2]:'');sel.appendChild(o);});
      var lab=document.createElement('b');lab.style.fontWeight='inherit';e.appendChild(lab);e.appendChild(sel);e.__bl=1;['mousedown','pointerdown','click','dblclick'].forEach(function(t){e.addEventListener(t,function(ev){ev.stopPropagation();});});
      
      s.appendChild(e);}
    var b=panelBot(s),c=b?get(b):'en';e.style.display=b?'':'none';e.querySelector('b').textContent=c.toUpperCase();e.classList.toggle('on',c!=='en');
    var sl=e.querySelector('select');if(sl.value!==c)sl.value=c;e.setAttribute('data-bot',b);}
  /* delegated: agent panels are cloned from the bar markup, so per-element listeners would be lost */
  document.addEventListener('change',function(ev){var t=ev.target;if(!t||!t.closest)return;var c=t.closest('.hfbl'),s=c&&c.closest('section.ava');if(!s||t.tagName!=='SELECT')return;var b=panelBot(s);if(b)set(b,t.value);},true);
  function paint(){[].forEach.call(document.querySelectorAll('#ui > section.ava'),function(s){if(!s.offsetParent)return;chip(s);fixLine(s);});hookTrx();}
  setInterval(paint,800);
  window.__hfBotLang={build:BUILD,langs:LANGS,get:get,set:set,map:function(){return Object.assign({},MAP);},tr:tr,stats:stats,last:last,paint:paint};
})();
