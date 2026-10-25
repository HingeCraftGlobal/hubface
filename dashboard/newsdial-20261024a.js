/* newsdial-20261024a (Dan, Brain OS job 40): News Briefing video/article ratio dial.
   Per-user dial (100/0, 75/25, 50/50, 25/75, 0/100 video/article) applied to every group: Emergency, Top/Ottawa/World/Video,
   Positive and custom subjects. Order: Emergency pinned first, then custom subjects, then remaining modes by usage.
   Each group shows a red video dot and white article dot with counts; links carry data-nd="video--<group>" / "article--<group>"
   so hf-track sends news.open-video--<group> / news.open-article--<group>. Main dashboard only. */
(function(){
  if(document.documentElement.classList.contains('rb-room'))return;
  var BUILD='newsdial-20261024a', R=[[100,0],[75,25],[50,50],[25,75],[0,100]], DEFI=2, UID='guest', busy=0, V=[], VT=0;
  var EM=/\b(evacuat\w*|wildfire|earthquake|tsunami|tornado|hurricane|flood(?:ing|s|ed)?|storm warning|weather warning|blizzard|amber alert|emergency|state of emergency|shooting|explosion|lockdown|power outage|outage|recall(?:ed|s)?|plane crash|derail\w*|chemical spill)\b/i;
  var EMN=/\b(nhl|nba|nfl|mlb|playoff|season|asteroid|ancient|million years)\b/i;
  var NEWSCH=/^(CBC News|BBC News|Reuters|Associated Press|Global News|PBS NewsHour|Sky News|Al Jazeera English)$/;
  var WORLDCH=/^(BBC News|Reuters|Sky News|Al Jazeera English|Associated Press)$/;
  var MODES={emergency:1,top:1,ottawa:1,world:1,video:1,positive:1};
  function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30)||'x';}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function h32(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}
  function rk(){return 'hubface.newsRatio.'+UID;} function uk(){return 'hubface.newsUsage.'+UID;}
  function ratio(){var i=parseInt(localStorage.getItem(rk()),10);return i>=0&&i<5?i:DEFI;}
  function usage(){try{return JSON.parse(localStorage.getItem(uk()))||{};}catch(e){return {};}}
  function subs(){try{var v=JSON.parse(localStorage.getItem('hubface.newsSubjects'));if(Array.isArray(v))return v;}catch(e){}return ['technology','space','rockets'];}
  function vids(){if(Date.now()-VT<10*60e3)return Promise.resolve(V);
    return fetch('assets/news/videos.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():{items:[]};}).then(function(d){V=d.items||[];VT=Date.now();return V;}).catch(function(){return V;});}
  function poolFor(k){var p;
    if(k==='emergency')p=V.filter(function(v){return EM.test(v.title)&&!EMN.test(v.title)&&v.tag!=='positive';});
    else if(k==='positive')p=V.filter(function(v){return v.tag==='positive';});
    else if(k==='top')p=V.filter(function(v){return NEWSCH.test(v.source);});
    else if(k==='world')p=V.filter(function(v){return WORLDCH.test(v.source)&&!/\b(canada|canadian|ottawa)\b/i.test(v.title);});
    else if(k==='ottawa')p=V.filter(function(v){return /\b(ottawa|parliament|carney|federal government)\b/i.test(v.title);});
    else return [];
    return p.slice().sort(function(a,b){return new Date(b.published)-new Date(a.published);});}
  var CLIP='<span style="background:#c00;color:#fff;border-radius:3px;padding:0 3px">\u25b6 YouTube</span>';
  function vrow(v){return '<div class="nd-pv" style="margin:2px 0">'+CLIP+' <a class="nf-a" href="'+esc(v.link)+'" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">'+esc(v.title)+'</a> <span style="opacity:.6">- '+esc(v.source)+'</span></div>';}
  function isVid(n){return /YouTube|\u25cf LIVE/.test(n.textContent)&&!!n.querySelector('span[style*="#c00"],span[style*="#e00"]');}
  function list(){return document.querySelector('section.box .nf-wrap .nf-list');}
  function apply(){var l=list();if(!l)return;busy=1;
    try{
    var ri=ratio(),pv=R[ri][0],subsl=subs().map(function(s){return s.toLowerCase();}),u=usage(),groups=[];
    Array.prototype.forEach.call(l.children,function(g,ix){var h=g.firstElementChild;if(!h||g.children.length<1)return;
      var name=(h.getAttribute('data-nd-name')||h.textContent).trim();h.setAttribute('data-nd-name',name);var k=name.toLowerCase(),sl=slug(k);
      var old=g.querySelector('.nd-pool');if(old)old.remove();
      var rows=[];Array.prototype.forEach.call(g.querySelectorAll(':scope > div:not(:first-child), :scope > .nyt-v > div'),function(n){if(n.classList.contains('nyt-v'))return;if(!n.querySelector('a.nf-a'))return;rows.push(n);});
      var vs=rows.filter(isVid), as=rows.filter(function(n){return !isVid(n);}), extra=[];
      var clips=vs.filter(function(n){return !/live stream|More "/.test(n.textContent);});
      var meta=vs.filter(function(n){return clips.indexOf(n)<0;});
      var N=Math.max(3,Math.min(5,as.length+clips.length));if(ri===2)N=as.length+clips.length>=6?6:4;var _n=N, nv=Math.round(N*pv/100), na=N-nv;
      if(clips.length<nv&&MODES[k]){var have={};clips.forEach(function(n){var a=n.querySelector('a.nf-a');have[a.href]=1;});
        poolFor(k).forEach(function(v){if(extra.length<nv-clips.length&&!have[v.link])extra.push(v);});}
      var vcount=Math.min(nv,clips.length+extra.length), acount=Math.min(na,as.length);
      if(pv>0&&pv<100){if(vcount<nv)acount=Math.min(as.length,N-vcount);if(acount<na)vcount=Math.min(clips.length+extra.length,N-acount);}
      var vshow=clips.slice(0,vcount),eshow=extra.slice(0,Math.max(0,vcount-vshow.length));
      as.forEach(function(n,i){n.style.display=i<acount?'':'none';tag(n,'article',sl);});
      clips.forEach(function(n){n.style.display=vshow.indexOf(n)>=0?'':'none';tag(n,'video',sl);});
      meta.forEach(function(n){n.style.display=pv>0?'':'none';tag(n,'video',sl);});
      if(eshow.length){var d=document.createElement('div');d.className='nd-pool';d.innerHTML=eshow.map(vrow).join('');Array.prototype.forEach.call(d.children,function(n){tag(n,'video',sl);});
        var after=g.querySelector(':scope > .nyt-v');if(after)g.insertBefore(d,after);else g.appendChild(d);}
      if(pv>0&&vcount===0&&MODES[k]&&k!=='video'){var d2=g.querySelector('.nd-pool')||g.appendChild(Object.assign(document.createElement('div'),{className:'nd-pool'}));
        d2.insertAdjacentHTML('beforeend','<div class="nd-pv" style="margin:2px 0">'+CLIP+' <a class="nf-a" data-nd="video--'+sl+'" href="https://www.youtube.com/results?search_query='+encodeURIComponent((k==='positive'?'good news':k==='emergency'?'emergency alert news':name+' news'))+'&sp=CAI%253D" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">Latest '+esc(name)+' videos on YouTube</a></div>');}
      /* dots sit beside (not inside) the group title so newsyt still reads the plain group name */
      var dots=g.querySelector(':scope > span.nd-dots');if(!dots){h.style.display='inline-block';dots=document.createElement('span');dots.className='nd-dots';dots.style.cssText='margin-left:6px;font-size:10px;color:#fff';h.insertAdjacentElement('afterend',dots);}
      dots.innerHTML='<span title="Videos shown" style="color:#fff"><b style="color:#ff4d4d;font-size:12px">\u25cf</b>'+vcount+'</span> <span title="Articles shown" style="color:#fff"><b style="color:#fff;font-size:12px">\u25cf</b>'+acount+'</span>';
      var rank=k==='emergency'?0:subsl.indexOf(k)>=0?1:2;
      groups.push({g:g,rank:rank,si:subsl.indexOf(k),use:u[sl]||0,ix:ix});
    });
    groups.sort(function(a,b){return a.rank-b.rank||(a.rank===1?a.si-b.si:(b.use-a.use))||a.ix-b.ix;});
    groups.forEach(function(x){l.appendChild(x.g);});
    }finally{setTimeout(function(){busy=0;},0);}
  }
  function tag(n,kind,sl){Array.prototype.forEach.call(n.querySelectorAll('a.nf-a'),function(a){a.setAttribute('data-nd',kind+'--'+sl);});}
  function dial(){var b=null,bs=document.querySelectorAll('section.box header b');for(var i=0;i<bs.length;i++)if(/NEWS BRIEFING/i.test(bs[i].textContent))b=bs[i];if(!b)return;var h=b.parentNode;
    var row=h.querySelector('.nf-chips-type')||h;if(h.querySelector('.nd-dial'))return paintDial();
    var w=document.createElement('span');w.className='nd-dial';w.title='Video / article mix for every news group';
    w.style.cssText='display:inline-flex;align-items:center;gap:3px;margin-left:4px;font-size:10px;color:#fff;position:relative;z-index:3;border:1px solid rgba(255,255,255,.25);border-radius:9px;padding:0 5px';
    w.innerHTML='<span style="font-size:15px;font-weight:700;color:#fff">Videos</span><input type="range" min="0" max="4" step="1" aria-label="Video to article mix" style="width:56px;height:10px;margin:0;accent-color:#fff;cursor:pointer"><span style="font-size:15px;font-weight:700;color:#fff">Articles</span><span class="nd-lbl" style="min-width:42px;color:#fff;font-size:11px;font-weight:700"></span>';
    ['pointerdown','mousedown','touchstart','click'].forEach(function(t){w.addEventListener(t,function(e){e.stopPropagation();});});
    var inp=w.querySelector('input');inp.addEventListener('input',function(){localStorage.setItem(rk(),String(parseInt(inp.value,10)));paintDial();apply();});
    row.appendChild(w);paintDial();}
  function paintDial(){var w=document.querySelector('.nd-dial');if(!w)return;var i=ratio();w.querySelector('input').value=String(i);
    w.querySelector('.nd-lbl').textContent=R[i][0]+'/'+R[i][1];w.querySelector('input').setAttribute('aria-valuetext',R[i][0]+'% video, '+R[i][1]+'% articles');}
  /* usage: real item opens only (dial moves and chip switches are not counted) */
  window.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.nf-wrap a.nf-a[data-nd]');if(!a)return;var sl=a.getAttribute('data-nd').split('--')[1],u=usage();u[sl]=(u[sl]||0)+1;try{localStorage.setItem(uk(),JSON.stringify(u));}catch(x){}},true);
  var q=0;function run(){if(q)return;q=1;setTimeout(function(){q=0;dial();vids().then(apply);},350);}
  function hook(){var l=list();if(!l){setTimeout(hook,1000);return;}
    new MutationObserver(function(){if(!busy)run();}).observe(l,{childList:true,subtree:true});run();}
  function start(){fetch('/api/account/me',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(d){var a=d&&(d.user||d.account||d);var id=a&&(a.id||a.email||a.username);if(id){var old=localStorage.getItem('hubface.newsRatio.guest');UID=h32(String(id));if(old!=null&&localStorage.getItem(rk())==null)localStorage.setItem(rk(),old);}}).catch(function(){}).then(hook);}
  window.__newsDial={build:BUILD,apply:apply,ratio:function(){return R[ratio()];},set:function(i){localStorage.setItem(rk(),String(i));paintDial();apply();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
