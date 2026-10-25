/* news-feed.js newsfeed-20261021h — News Briefing: groups (Top/Ottawa/World/Video + subjects), type filter chips, hardened links */
(function(){
  var BUILD='newsfeed-20261021h', KEY='hubface.newsSubjects', FKEY='hubface.newsFilters', DEF=['technology','space','rockets'], MAXAGE=36*3600*1000;
  var GROUPS=[['top','Top'],['ottawa','Ottawa'],['world','World'],['video','Video']];
  var EM=/\b(evacuat\w*|wildfire|forest fire|earthquake|tsunami|tornado|hurricane|flood(?:ing|s|ed)?|storm warning|weather warning|heat warning|blizzard|boil[- ]water|amber alert|emergency alert|state of emergency|shooting|gunman|stabbing|explosion|hostage|lockdown|power outage|outage|recall(?:ed|s)?|warning issued|missing child|plane crash|derail\w*|chemical spill|air quality (?:warning|advisory))\b/i;
  var EMN=/\b(non-emergency|breaking bread|record-breaking|ground-?breaking|breaking ball|dies at|dead at|obituar\w*|passes away|celebration of life|nhl|nba|nfl|mlb|playoff|game \d|season|management|resilience|roadmap|partners?(?:hip)?s?|solution|introduces|recalls? \w+ \w+ from|recalled from|asteroid|ancient|million years)\b/i;
  var PO=/\b(good news|uplifting|heartwarming|feel-good|rescued|reunited|breakthrough|cured?|donat\w*|volunteer\w*|kindness|generous|celebrat\w*|milestone|record-breaking|award(?:ed|s)?|honou?red|restored|recovered|thriving|returns? (?:the|every)|found (?:safe|alive|after))\b/i;
  var PON=/\b(killed|dead|death|shooting|attack|war|crash|lawsuit|sues?|tariff|layoffs?)\b/i;
  function tagOf(i){var t=i.title||'';if(EM.test(t)&&!EMN.test(t))return 'emergency';if(i.tag==='positive'||(PO.test(t)&&!PON.test(t)))return 'positive';return 'standard';}
  function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function ls(k,d){try{var v=JSON.parse(localStorage.getItem(k));if(v!=null)return v;}catch(e){}return d;}
  function subs(){var v=ls(KEY,null);return Array.isArray(v)?v:DEF.slice();}
  function filters(){var f=ls(FKEY,null);return f&&typeof f==='object'?f:{emergency:false,standard:true,positive:true};}
  function box(){var bs=document.querySelectorAll('section.box header b');for(var i=0;i<bs.length;i++)if(/NEWS BRIEFING/i.test(bs[i].textContent))return bs[i].closest('section.box');return null;}
  function ago(t){var m=Math.round((Date.now()-new Date(t))/60000);if(!(m>=0))return '';if(m<60)return m+'m ago';if(m<1440)return Math.round(m/60)+'h ago';return Math.round(m/1440)+'d ago';}
  function getJSON(u){return fetch(u+'?t='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw r.status;return r.json();});}
  function fresh(d){return d&&d.items&&d.items.length&&Date.now()-new Date(d.fetched_at)<MAXAGE;}
  function subjItems(s){
    return getJSON('assets/news/'+slug(s)+'.json').then(function(d){if(!fresh(d))throw 0;return {items:d.items};}).catch(function(){
      return getJSON('assets/news/index.json').then(function(ix){return Promise.all((ix.subjects||[]).slice(0,40).map(function(x){return getJSON('assets/news/'+x+'.json').catch(function(){return null;});})).then(function(all){
        var w=s.toLowerCase().split(/\s+/).filter(Boolean),seen={},out=[];
        all.forEach(function(d){(d&&d.items||[]).forEach(function(i){var t=i.title.toLowerCase();if(!seen[i.link]&&w.every(function(x){return t.indexOf(x)>=0;})){seen[i.link]=1;out.push(i);}});});
        if(!out.length)throw 0;return {items:out,partial:true};});});
    });
  }
  var state={groups:[]};
  function chipCss(on){return 'cursor:pointer;font-size:10px;font-style:normal;border-radius:9px;padding:0 5px;margin-left:3px;border:1px solid rgba(255,255,255,.25);'+(on?'background:rgba(255,255,255,.22);opacity:1':'background:none;opacity:.45');}
  function header(b){
    var h=b.querySelector('header'); if(!h||b.querySelector('.nf-chips-type'))return;
    var tag=h.querySelector('em.sample'); if(tag){tag.classList.remove('sample');tag.title='';tag.textContent='Live';}
    var row=document.createElement('span'); row.className='nf-chips-type'; row.style.cssText='display:inline-flex;flex-wrap:wrap;align-items:center;gap:2px;margin-left:4px;position:relative;z-index:3';
    [['emergency','🚨','Emergency: urgent events, disasters, alerts, breaking news'],['standard','📰','Standard news'],['positive','☀','Positive: good news and uplifting stories']].forEach(function(c){
      var e=document.createElement('button'); e.type='button'; e.className='nf-tchip'; e.dataset.t=c[0]; e.title=c[2]; e.textContent=c[1]; row.appendChild(e);
    });
    h.appendChild(row); var wb=b.querySelector('.wr-btn'); if(wb) row.appendChild(wb);
    h.style.flexWrap='wrap'; fit(b); if(window.ResizeObserver) new ResizeObserver(function(){fit(b);}).observe(b);
    row.addEventListener('click',function(ev){var t=ev.target.closest('.nf-tchip');if(!t)return;ev.stopPropagation();var f=filters();f[t.dataset.t]=!f[t.dataset.t];localStorage.setItem(FKEY,JSON.stringify(f));load();});
    if(window.__widgetRead) window.__widgetRead.register('news-briefing',{title:'News Briefing',getText:api.getText});
  }
  /* layout (d): chips sit in the title bar beside the title; header keeps clear of the box's corner icons and wraps only when narrow */
  function fit(b){var h=b.querySelector('header');if(!h)return;var bw=b.clientWidth,minL=bw;
    b.querySelectorAll(':scope > .ctl').forEach(function(c){if(c.offsetParent===null)return;var l=c.offsetLeft;if(l>40&&l<minL)minL=l;});
    h.style.paddingRight=Math.max(0,bw-minL+4)+'px'; h.style.boxSizing='border-box';
    var w=b.querySelector('.nf-wrap'); if(w) w.style.top=(h.offsetTop+h.offsetHeight+6)+'px';}
  function ui(b){
    header(b);
    if(b.querySelector('.nf-wrap'))return b.querySelector('.nf-wrap');
    var ul=b.querySelector('ul.nlist'); if(ul) ul.style.display='none';
    var w=document.createElement('div'); w.className='nf-wrap';
    w.style.cssText='position:absolute;left:8px;right:8px;top:26px;bottom:6px;display:flex;flex-direction:column;gap:4px;font-size:11px;overflow:hidden';
    w.innerHTML='<div style="display:flex;gap:4px"><input class="nf-in" placeholder="Add subject…" style="flex:1;min-width:0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:6px;color:inherit;padding:2px 6px;font-size:11px"><button class="nf-mic" title="Speak a subject" style="background:none;border:1px solid rgba(255,255,255,.2);border-radius:6px;color:inherit;cursor:pointer">🎤</button></div><div class="nf-chips" style="display:flex;flex-wrap:wrap;gap:3px"></div><div class="nf-list" style="flex:1;overflow-y:auto"></div>';
    b.appendChild(w); fit(b);
    ['pointerdown','mousedown','touchstart'].forEach(function(t){w.addEventListener(t,function(e){e.stopPropagation();});});
    var inp=w.querySelector('.nf-in');
    function add(v){v=(v||'').trim().toLowerCase().replace(/[.!?]+$/,'');if(!v)return;var s=subs();if(s.indexOf(v)<0){s.push(v);localStorage.setItem(KEY,JSON.stringify(s));}inp.value='';load();}
    inp.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter')add(inp.value);});
    w.querySelector('.nf-mic').addEventListener('click',function(){var SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){inp.placeholder='Mic not supported — type';return;}var r=new SR(),btn=this;r.lang='en-CA';btn.textContent='⏺';r.onresult=function(e){add(e.results[0][0].transcript);};r.onend=r.onerror=function(){btn.textContent='🎤';};r.start();});
    w.querySelector('.nf-chips').addEventListener('click',function(e){var x=e.target.closest('[data-rm]');if(!x)return;localStorage.setItem(KEY,JSON.stringify(subs().filter(function(v){return v!==x.dataset.rm;})));load();});
    return w;
  }
  function visible(){var f=filters();return state.groups.map(function(g){return {name:g.name,msg:g.msg,partial:g.partial,items:(g.items||[]).filter(function(i){return f[tagOf(i)];}).slice(0,5)};});}
  function paint(){
    var b=box(); if(!b)return; var w=ui(b), f=filters();
    b.querySelectorAll('.nf-tchip').forEach(function(c){c.style.cssText=chipCss(!!f[c.dataset.t]);c.setAttribute('aria-pressed',!!f[c.dataset.t]);});
    w.querySelector('.nf-chips').innerHTML=subs().map(function(v){return '<span style="background:rgba(255,255,255,.12);border-radius:10px;padding:0 6px">'+esc(v)+' <b data-rm="'+esc(v)+'" title="Remove" style="cursor:pointer;opacity:.7">×</b></span>';}).join('');
    var html=visible().map(function(g){
      var body=g.msg?'<div style="opacity:.6">'+esc(g.msg)+'</div>':g.items.length?g.items.map(function(i){var t=tagOf(i);return '<div style="margin:2px 0">'+(t==='emergency'?'🚨 ':t==='positive'?'☀ ':'')+'<a class="nf-a" href="'+esc(i.link)+'" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">'+esc(i.title)+'</a> '+(i.video?'<span style="background:#c00;color:#fff;border-radius:3px;padding:0 3px">▶ YouTube</span> ':'')+'<span style="opacity:.6">— '+esc(i.source)+(i.published?' · '+ago(i.published):'')+'</span> <a class="nf-a" href="'+esc(i.link)+'" target="_blank" rel="noopener noreferrer">Open ↗</a></div>';}).join('')+(g.partial?'<div style="opacity:.6">Full results coming at next refresh</div>':''):'<div style="opacity:.6">No headlines in the selected types</div>';
      return '<div><div style="font-weight:700;text-transform:capitalize;margin-top:4px">'+esc(g.name)+'</div>'+body+'</div>';}).join('');
    w.querySelector('.nf-list').innerHTML=html||'<div style="opacity:.6">Add a subject above</div>';
  }
  function load(){
    var s=subs(), f=filters();
    var main=getJSON('assets/news.json').then(function(d){if(!fresh(d))throw 0;return d.items;}).catch(function(){return null;});
    var extra=[]; if(f.emergency)extra.push(['evacuation OR warning OR wildfire OR outage OR recall','Emergency']); if(f.positive)extra.push(['good news','Positive']);
    var emAll=f.emergency?getJSON('assets/news/index.json').then(function(ix){return Promise.all((ix.subjects||[]).slice(0,60).map(function(x){return getJSON('assets/news/'+x+'.json').then(function(d){return fresh(d)?d.items:[];}).catch(function(){return [];});}));}).then(function(a){return [].concat.apply([],a);}).catch(function(){return [];}):Promise.resolve([]);
    Promise.all([main,emAll].concat(extra.concat(s.map(function(x){return [x,x];})).map(function(p){return subjItems(p[0]).then(function(r){return {name:p[1],items:r.items,partial:r.partial};}).catch(function(){return {name:p[1],items:[],msg:'Headlines coming at next refresh'};});}))).then(function(res){
      var top=res.shift(), emPool=res.shift()||[], g=[];
      if(top) GROUPS.forEach(function(c){g.push({name:c[1],items:top.filter(function(i){return i.category===c[0];})});});
      else g.push({name:'Top',items:[],msg:'Headlines unavailable'});
      /* (g) Emergency group = alert feed + every emergency-tagged item already loaded (top/Ottawa/world/video + subjects), de-duplicated */
      var all=g.concat(res), em=all.filter(function(x){return x.name==='Emergency';})[0];
      if(em){var seen={},pool=[];all.concat([{items:emPool}]).forEach(function(x){(x.items||[]).forEach(function(i){if(tagOf(i)==='emergency'&&!seen[i.link]&&!seen[i.title]){seen[i.link]=seen[i.title]=1;pool.push(i);}});});
        pool.sort(function(a,b){return new Date(b.published||0)-new Date(a.published||0);}); em.items=pool; if(pool.length) em.msg=null;}
      state.groups=all; paint();
    });
    paint();
  }
  var api={build:BUILD,reload:load,getItems:function(){return visible();},getText:function(){
    return visible().filter(function(g){return g.items.length;}).map(function(g){return g.name+'. '+g.items.map(function(i){return i.title+', from '+i.source+'.';}).join(' ');}).join(' ');},
    read:function(o){return window.__widgetRead&&window.__widgetRead.read('news-briefing',o);}};
  window.__newsBriefing=api;
  /* link hardening: always open the real URL in a new tab, even if box/drag handlers interfere */
  document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.nf-wrap a.nf-a');if(!a)return;e.preventDefault();e.stopImmediatePropagation();window.open(a.href,'_blank','noopener');},true);
  function start(){load();setInterval(load,30*60*1000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
