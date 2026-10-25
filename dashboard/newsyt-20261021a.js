/* newsyt-20261021a (Dan): News Briefing add-on. Per topic: YouTube clips (keyless channel feeds, matched by topic words),
   LIVE channel links, a YouTube search link; refresh button (↻) that asks the server to fetch every topic now;
   new topics that show "coming at next refresh" are requested immediately and re-polled. Main dashboard only. */
(function(){
  if(document.documentElement.classList.contains('rb-room'))return;
  var V=null,VT=0,busy=0;
  var SPACE=/\b(space|rocket|rockets|moon|moonshots?|moon shots?|nasa|spacex|starship|artemis|mars|astronaut|orbit|launch|satellite|astronomy)\b/i;
  var SPORT=/\b(sport|sports|hockey|nhl|nba|nfl|soccer|football|baseball|basketball|senators)\b/i;
  var LIVE_SPACE=[['NASA','UCLA_DiR1FfKNvjuUpBHmylQ'],['SpaceX','UCtI0Hodo5o5dUb67FeUjDeA'],['NASASpaceflight','UCSUu1lih2RifWkKtDOJdsBA']];
  var LIVE_NEWS=[['CBC News','UCuFFtHWoLl5fauMMD5Ww2jA'],['Sky News','UCoMdktPbSTixAyNGwb-UYkQ'],['Al Jazeera English','UCNye-wNBqNL5ZzHSJj3l8Bg']];
  var LIVE_BIZ=[['Bloomberg','UCIALMKvObZNtJ6AmdCLP7Lg'],['CNBC','UCvJJ_dzjViJCoLf5uKUTwoA']];
  var SKIP={top:1,ottawa:1,world:1,video:1,emergency:1,positive:1};
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);}
  function vids(){if(V&&Date.now()-VT<10*60e3)return Promise.resolve(V);
    return fetch('assets/news/videos.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():{items:[]};}).then(function(d){V=d.items||[];VT=Date.now();return V;}).catch(function(){return V||[];});}
  function words(t){var w=t.toLowerCase().replace(/moonshots?/,'moon').split(/[^a-z0-9]+/).filter(function(x){return x.length>2&&!/^(the|and|news|for|with)$/.test(x);});return w;}
  function match(t,pool){var w=words(t);if(!w.length)return [];var sp=SPACE.test(t);
    return pool.filter(function(v){var s=(v.title+' '+(v.desc||'')).toLowerCase();return w.some(function(x){return new RegExp('\\b'+x.replace(/s$/,'')+'s?\\b').test(s);})||(sp&&/NASA|SpaceX|NASASpaceflight|Scott Manley|Everyday Astronaut/.test(v.source)&&/launch|starship|moon|artemis|falcon|rocket|mars|orbit/i.test(v.title));})
      .sort(function(a,b){return new Date(b.published)-new Date(a.published);});}
  function row(href,title,badge,src){return '<div class="nyt-r" style="margin:2px 0">'+badge+' <a class="nf-a" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">'+esc(title)+'</a>'+(src?' <span style="opacity:.6">— '+esc(src)+'</span>':'')+'</div>';}
  var CLIP='<span style="background:#c00;color:#fff;border-radius:3px;padding:0 3px">\u25b6 YouTube</span>';
  var LIVE='<span style="background:#e00;color:#fff;border-radius:3px;padding:0 3px;font-weight:700;letter-spacing:.5px">\u25cf LIVE</span>';
  function decorate(pool){
    var list=document.querySelector('section.box .nf-wrap .nf-list');if(!list)return;
    Array.prototype.forEach.call(list.children,function(g){
      if(g.querySelector('.nyt-v'))return;var h=g.firstElementChild;if(!h)return;var name=h.textContent.trim();if(!name||SKIP[name.toLowerCase()])return;
      var n=Math.max(2,g.querySelectorAll('a.nf-a').length/2|0),m=match(name,pool).slice(0,n),html='';
      m.forEach(function(v){html+=row(v.link,v.title,CLIP,v.source);});
      var lv=SPACE.test(name)?LIVE_SPACE:/business|market|stock|crypto|econom/i.test(name)?LIVE_BIZ:SPORT.test(name)?[]:LIVE_NEWS;
      lv.slice(0,2).forEach(function(c){html+=row('https://www.youtube.com/channel/'+c[1]+'/live',c[0]+' live stream (when on air)',LIVE,'');});
      html+=row('https://www.youtube.com/results?search_query='+encodeURIComponent(name),'More "'+name+'" videos on YouTube',CLIP,'search');
      var d=document.createElement('div');d.className='nyt-v';d.innerHTML=html;g.appendChild(d);
      if(/coming at next refresh/i.test(g.textContent))want(name);
    });}
  var pend={},polls=0;
  function want(name){var s=slug(name);if(pend[s])return;pend[s]=1;pend[s+'@']=new Date(0);ask([s]);poll();}
  function ask(slugs){slugs.forEach(function(s){fetch('assets/news/'+s+'.json?refresh=1&t='+Date.now(),{cache:'no-store'}).catch(function(){});});}
  function poll(){if(busy)return;busy=1;polls=0;var btn=document.querySelector('.nyt-ref');if(btn)btn.style.animation='nytspin 1s linear infinite';
    (function tick(){polls++;setTimeout(function(){var ss=Object.keys(pend);Promise.all(ss.map(function(s){return fetch('assets/news/'+s+'.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(d&&d.fetched_at&&new Date(d.fetched_at)>pend[s+'@'])delete pend[s];}).catch(function(){});}))
      .then(function(){if(!Object.keys(pend).filter(function(k){return k.indexOf('@')<0;}).length||polls>=8){pend={};busy=0;if(btn)btn.style.animation='';VT=0;if(window.__newsBriefing)window.__newsBriefing.reload();}else tick();});},15000);})();}
  function refreshAll(){var subs;try{subs=JSON.parse(localStorage.getItem('hubface.newsSubjects'))||['technology','space','rockets'];}catch(e){subs=['technology','space','rockets'];}
    var t=new Date();pend={};subs.forEach(function(x){var s=slug(x);pend[s]=1;pend[s+'@']=t;});ask(Object.keys(pend).filter(function(k){return k.indexOf('@')<0;}));VT=0;poll();}
  function btn(){var b=null,bs=document.querySelectorAll('section.box header b');for(var i=0;i<bs.length;i++)if(/NEWS BRIEFING/i.test(bs[i].textContent))b=bs[i];if(!b||b.parentNode.querySelector('.nyt-ref'))return;
    var e=document.createElement('button');e.type='button';e.className='nyt-ref';e.textContent='\u21bb';e.title='Refresh now: fetch headlines and videos for every topic (about a minute)';e.setAttribute('aria-label','Refresh news');
    e.style.cssText='cursor:pointer;font-size:11px;background:none;border:1px solid rgba(255,255,255,.25);border-radius:9px;color:inherit;padding:0 5px;margin-left:4px;position:relative;z-index:3;line-height:14px';
    ['pointerdown','mousedown'].forEach(function(t){e.addEventListener(t,function(ev){ev.stopPropagation();});});
    e.addEventListener('click',function(ev){ev.stopPropagation();ev.preventDefault();refreshAll();});b.parentNode.insertBefore(e,b.nextSibling);}
  var st=document.createElement('style');st.textContent='@keyframes nytspin{to{transform:rotate(360deg)}}';document.head.appendChild(st);
  var queued=0;function run(){if(queued)return;queued=1;setTimeout(function(){queued=0;btn();vids().then(decorate);},50);}
  function hook(){var l=document.querySelector('section.box .nf-wrap .nf-list');if(!l){setTimeout(hook,1000);return;}
    new MutationObserver(function(ms){for(var i=0;i<ms.length;i++)if(ms[i].target===l){run();return;}}).observe(l,{childList:true});run();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();
