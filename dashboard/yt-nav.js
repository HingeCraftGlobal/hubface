/* ytnav-20261021b (Dan, Oct 21 ~10:25am ET): links never leave HubFace. Search-like + topic-channel items run the widget's own search;
   WL/LL try the embed player (videoseries) with a pop-up fallback; pages YouTube won't frame open in a small centered pop-up.
   (Topic channels Music/Live/News/Learning have no UU uploads playlist -> 'playlist does not exist', so they search.)
   was ytnav-20261021a (Dan, Oct 21 ~10:15am ET): YouTube-style left sidebar inside the YouTube widget (.wbx[data-w=ent]).
   ytnav-20261021c: header icon sits right after the title (title no longer stretches while collapsed).
   ytnav-20261021b also: collapsed icon is a small fixed button beside the YouTube title in the widget header (no floating/drag; no saved position).
   Same items/order as youtube.com's sidebar; each opens in a new tab. The X collapses it to a small round YouTube icon
   (drag it anywhere; click it to expand). Open/collapsed state + icon spot in localStorage (hf.ytnav.v1).
   Page-side only. Roll back: remove the <script src="yt-nav.js"> tag. */
(function(){
  'use strict';
  if(window.__ytNav)return;
  var BUILD='ytnav-20261021c',KEY='hf.ytnav.v1',Y='https://www.youtube.com';
  var I={
    home:'<path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/>',
    shorts:'<path d="M15.5 3.5c1.7-.9 3.8-.2 4.6 1.5.9 1.7.2 3.8-1.5 4.6l-1.3.7c1.2.3 2.2 1.2 2.6 2.4.5 1.5 0 3.1-1.3 4l-6.6 3.8c-1.7.9-3.8.2-4.6-1.5-.9-1.7-.2-3.8 1.5-4.6l1.3-.7c-1.2-.3-2.2-1.2-2.6-2.4-.5-1.5 0-3.1 1.3-4zM10 9v6l5-3z"/>',
    subs:'<path d="M6 3h12v2H6zM4 6h16v2H4zm-1 3h18v12H3zm7 3v6l5-3z"/>',
    you:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/>',
    hist:'<path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-2.05-4.95L15 10h7V3l-2.6 2.6A9 9 0 0 0 13 3zm-1 5v5l4 2.5.8-1.3-3.3-2V8z"/>',
    pl:'<path d="M3 5h12v2H3zm0 4h12v2H3zm0 4h8v2H3zm12 0 6 3.5-6 3.5z"/>',
    vids:'<path d="M3 5h14v14H3zm5 4v6l5-3zm11-2 2-1v12l-2-1z"/>',
    wl:'<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l3.6 2.2-1 1.6L11 13V7z"/>',
    like:'<path d="M2 10h4v11H2zm6 11h9.3c.9 0 1.6-.6 1.9-1.4l2.6-7.5c.4-1.2-.5-2.1-1.8-2.1H14l1-4.6c.2-1-.6-2.4-2-2.4L8 9z"/>',
    dl:'<path d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM5 18h14v2H5z"/>',
    music:'<path d="M10 3h10v12.5a3.5 3.5 0 1 1-2-3.2V7h-6v10.5a3.5 3.5 0 1 1-2-3.2z"/>',
    movie:'<path d="M3 4h18v16H3zm2 2v2h2V6zm12 0v2h2V6zM5 10v2h2v-2zm12 0v2h2v-2zM5 14v2h2v-2zm12 0v2h2v-2zM9 6v12h6V6z"/>',
    hype:'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    live:'<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3l1.4 1.4a6 6 0 0 0 0 8.6l-1.4 1.4a8 8 0 0 1 0-11.4zm11.4 0a8 8 0 0 1 0 11.4l-1.4-1.4a6 6 0 0 0 0-8.6z"/>',
    game:'<path d="M7 7h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7 2.6L14 15h-4l-1 .6A4 4 0 0 1 2 13v-1a5 5 0 0 1 5-5zm-1 3v2H4v2h2v2h2v-2h2v-2H8v-2zm10 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zm2 2.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>',
    news:'<path d="M3 4h15v14a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2zm3 3v3h4V7zm6 0v1h4V7zm0 2v1h4V9zm-6 3v1h10v-1zm0 2v1h10v-1zm14-7h2v11a2 2 0 0 1-2 2z"/>',
    learn:'<path d="M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2v4L12 21l7-3.8v-4L12 17z"/>',
    pod:'<path d="M12 2a7 7 0 0 1 4 12.7v-2.5a5 5 0 1 0-8 0v2.5A7 7 0 0 1 12 2zm0 4a3 3 0 0 1 1 5.8V22h-2V11.8A3 3 0 0 1 12 6z"/>',
    play:'<path d="M4 4h16v16H4zm4 4v8l7-4z"/>',
    memb:'<path d="M12 2 9.5 8.5 3 9l5 4.3L6.5 20 12 16.5 17.5 20 16 13.3 21 9l-6.5-.5z"/>',
    yt:'<path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8z" fill="#f00"/><path d="M10 15V9l5.2 3z" fill="#fff"/>',
    kids:'<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3 6a1.3 1.3 0 1 1 0 2.6A1.3 1.3 0 0 1 9 9zm6 0a1.3 1.3 0 1 1 0 2.6A1.3 1.3 0 0 1 15 9zm-7 5h8a4 4 0 0 1-8 0z"/>',
    flag:'<path d="M5 3h2v18H5zm3 1h11l-2.5 4L19 12H8z"/>',
    gear:'<path d="M13.5 2h-3l-.5 2.6a8 8 0 0 0-1.9 1.1L5.6 4.8 4.1 7.4l2 1.7a8 8 0 0 0 0 2.2l-2 1.7 1.5 2.6 2.5-.9a8 8 0 0 0 1.9 1.1l.5 2.6h3l.5-2.6a8 8 0 0 0 1.9-1.1l2.5.9 1.5-2.6-2-1.7a8 8 0 0 0 0-2.2l2-1.7-1.5-2.6-2.5.9A8 8 0 0 0 14 4.6zM12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" transform="translate(0 2)"/>',
    help:'<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 16h-2v-2h2zm2.1-7.8-.9.9c-.7.7-1.2 1.3-1.2 2.9h-2v-.5c0-1.1.5-2.1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 8H8a4 4 0 1 1 7.1 2.2z"/>'
  };
  var SECS=[
    ['',[['Home','/','home'],['Shorts','/shorts','shorts'],['Subscriptions','/feed/subscriptions','subs']]],
    ['You',[['You','/feed/you','you'],['History','/feed/history','hist'],['Playlists','/feed/playlists','pl'],['Your videos','https://studio.youtube.com/','vids'],['Watch later','/playlist?list=WL','wl'],['Liked videos','/playlist?list=LL','like'],['Downloads','/feed/downloads','dl']]],
    ['Explore',[['Music','/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ','music'],['Movies & TV','/feed/storefront?bp=ogUCKAU%3D','movie'],['Hype','/feed/hype','hype'],['Live','/channel/UC4R8DWoMoI7CAwX8_LjQHig','live'],['Gaming','/gaming','game'],['News','/channel/UCYfdidRxbB8Qhf0Nx7ioOYw','news'],['Learning','/channel/UCtFRv9O2AHqOZjjynzrv-xg','learn'],['Podcasts','/podcasts','pod'],['Playables','/playables','play'],['Memberships','/channel_memberships','memb']]],
    ['More from YouTube',[['YouTube Premium','/premium','yt'],['YouTube Music','https://music.youtube.com/','music'],['YouTube Kids','https://www.youtubekids.com/','kids'],['Report history','/reporthistory','flag']]],
    ['',[['Settings','/account','gear'],['Help','https://support.google.com/youtube','help']]]
  ];
  var ACT={'Home':['q','trending videos today'],'Shorts':['q','#shorts'],'Subscriptions':['pop'],'You':['pop'],'History':['pop'],'Playlists':['pop'],'Your videos':['pop'],
    'Watch later':['pl','WL'],'Liked videos':['pl','LL'],'Downloads':['pop'],'Music':['q','top music videos'],'Movies & TV':['q','full movie official trailer 2026'],'Hype':['q','trending hype videos'],
    'Live':['q','live now'],'Gaming':['q','gaming highlights'],'News':['q','news today live'],'Learning':['q','learn something new explained'],'Podcasts':['q','full podcast episode'],
    'Playables':['q','playables youtube games'],'Memberships':['pop'],'YouTube Premium':['pop'],'YouTube Music':['pop'],'YouTube Kids':['pop'],'Report history':['pop'],'Settings':['pop'],'Help':['pop']};
  var NOTE='Opens in a pop-up \u2014 YouTube doesn\u2019t allow this page inside other sites.';
  function popup(u){var w=Math.min(1000,screen.availWidth-80),h=Math.min(720,screen.availHeight-80),l=Math.round((screen.availWidth-w)/2+(screen.availLeft||0)),t=Math.round((screen.availHeight-h)/2+(screen.availTop||0));
    var wn=null;try{wn=window.open(u,'hfYtPop','popup=yes,width='+w+',height='+h+',left='+l+',top='+t+',noopener=no');}catch(e){}if(wn){try{wn.opener=null;wn.focus();}catch(e){}}
    status(wn?NOTE:'Your browser blocked the pop-up. Allow pop-ups for HubFace, then click again.');return !!wn;}
  function status(t,html){var b=box();var st=b&&b.querySelector('.wmain .wstat');if(st){st.className='wstat';if(html)st.innerHTML=html;else st.textContent=t;}}
  function playList(list,label){var b=box();if(!b)return false;var m=b.querySelector('.wmain'),p=m&&m.querySelector('.wplayer');if(!p)return false;
    try{window.__widgets.ytStop();}catch(e){}
    p.innerHTML='<iframe src="https://www.youtube.com/embed/videoseries?list='+encodeURIComponent(list)+'&autoplay=1&playsinline=1&rel=0" title="'+esc(label)+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    p.hidden=false;p.setAttribute('data-ytnav-list',list);var nw=m.querySelector('.wnow');if(nw){nw.hidden=false;var t=nw.querySelector('.wnt');if(t)t.textContent=label;}m.scrollTop=0;
    status('',esc(label)+' only plays here if you\u2019re signed in to YouTube in this browser. Blank or \u201cunavailable\u201d? <a href="#" class="ytnpop">Open it in a pop-up</a>.');
    var a=m.querySelector('.wstat .ytnpop');if(a)a.addEventListener('click',function(e){e.preventDefault();popup('https://www.youtube.com/playlist?list='+list);});return true;}
  function run(label,u){var a=ACT[label]||['pop'];
    if(a[0]==='q'){try{if(window.__widgets&&window.__widgets.ytSearch){window.__widgets.ytSearch(a[1],false);return 'search';}}catch(e){}return popup(u)&&'pop';}
    if(a[0]==='pl')return playList(a[1],label)?'embed':(popup(u)&&'pop');
    popup(u);return 'pop';}
  function svg(k){return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">'+I[k]+'</svg>';}
  function url(p){return /^https?:/.test(p)?p:Y+p;}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
  var S={open:true};try{var o=JSON.parse(localStorage.getItem(KEY)||'null');if(o&&typeof o==='object')S.open=o.open!==false;}catch(e){}save0();
  function save0(){try{localStorage.setItem(KEY,JSON.stringify({open:S.open}));}catch(e){}}
  function save(){save0();}
  var css=document.createElement('style');css.id='ytnavCss';
  css.textContent=
   '#ui>.wbx[data-w=ent].ytnav-on .wmain{margin-left:var(--ytnav-w,118px)}'+
   '.ytnav{position:absolute;left:0;top:28px;bottom:0;width:var(--ytnav-w,118px);z-index:3;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;padding:4px 4px 8px;box-sizing:border-box;'+
     'background:rgba(255,255,255,var(--glass-a,.085));border-right:1px solid rgba(255,255,255,.16);backdrop-filter:blur(var(--glass-b,14px)) saturate(1.15);-webkit-backdrop-filter:blur(var(--glass-b,14px)) saturate(1.15)}'+
   '#ui>.wbx[data-w=ent]:not(.ytnav-on) .ytnav{display:none}'+
   '.ytnav .ytnh{display:flex;align-items:center;gap:4px;padding:2px 2px 4px 6px;font-weight:700;font-size:1.05em}.ytnav .ytnh svg{width:16px;height:16px}.ytnav .ytnh span{flex:1}'+
   '.ytnav .ytnx{all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;color:#fff;opacity:.8}.ytnav .ytnx:hover{background:rgba(255,255,255,.18);opacity:1}'+
   '.ytnav .ytns{margin:5px 6px 2px;font-weight:700;opacity:.9;font-size:1em}.ytnav hr{border:0;border-top:1px solid rgba(255,255,255,.16);margin:5px 4px}'+
   '.ytnav a{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:7px;color:#fff;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
   '.ytnav a span{flex:1;overflow:hidden;text-overflow:ellipsis}.ytnav .ytpop{font-style:normal;opacity:.55;font-size:.9em}.ytnav .ytnote{margin:6px 6px 0;opacity:.6;font-size:.85em;white-space:normal;line-height:1.3}'+
   '.ytnav a:hover{background:rgba(255,255,255,.14)}.ytnav a svg{flex:none;width:13px;height:13px;opacity:.95}'+
   '.wbx .whead .ytnavIcon{all:unset;display:none;flex:none;width:18px;height:18px;border-radius:50%;place-items:center;cursor:pointer;margin-left:-2px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28)}'+
   '#ui>.wbx[data-w=ent]:not(.ytnav-on) .whead .ytnavIcon{display:grid;margin-right:auto}#ui>.wbx[data-w=ent]:not(.ytnav-on) .whead .wtitle{flex:0 1 auto!important}.wbx .whead .ytnavIcon svg{width:12px;height:12px}.wbx .whead .ytnavIcon:hover{background:rgba(255,255,255,.25)}';
  (document.head||document.documentElement).appendChild(css);
  function navHtml(){var h='<div class="ytnh">'+svg('yt')+'<span>YouTube</span><button type="button" class="ytnx" title="Collapse menu to an icon" aria-label="Collapse YouTube menu">\u2715</button></div>';
    SECS.forEach(function(s,i){if(i)h+='<hr>';if(s[0]&&s[0]!=='You')h+='<div class="ytns">'+esc(s[0])+'</div>';
      s[1].forEach(function(it){h+='<a href="'+esc(url(it[1]))+'" title="'+esc((ACT[it[0]]||['pop'])[0]==='pop'?it[0]+' — '+NOTE:it[0]+' — plays here in the widget')+'" data-ytnav="'+esc(it[0])+'" data-act="'+esc((ACT[it[0]]||['pop'])[0])+'">'+svg(it[2])+'<span>'+esc(it[0])+'</span>'+((ACT[it[0]]||['pop'])[0]==='pop'?'<i class="ytpop">⧉</i>':'')+'</a>';});});
    h+='<div class="ytnote">⧉ = '+NOTE+'</div>';return h;}
  function hIcon(b){var h=b.querySelector(':scope > .whead');if(!h)return null;var i=h.querySelector('.ytnavIcon');if(i)return i;
    i=document.createElement('button');i.type='button';i.className='ytnavIcon';i.title='Open YouTube menu';i.setAttribute('aria-label','Open YouTube menu');i.innerHTML=svg('yt');
    var t=h.querySelector('.wtitle');if(t&&t.nextSibling)h.insertBefore(i,t.nextSibling);else if(t)h.appendChild(i);else h.insertBefore(i,h.firstChild);
    i.addEventListener('pointerdown',function(e){e.stopPropagation();});i.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();setOpen(true);});return i;}
  function box(){return document.querySelector('#ui > .wbx[data-w="ent"]');}
  function visible(b){return !!b&&getComputedStyle(b).display!=='none';}
  function setOpen(v){S.open=!!v;save();sync();}
  function sync(){var b=box();if(b&&!b.querySelector(':scope > .ytnav')){var n=document.createElement('nav');n.className='ytnav';n.setAttribute('aria-label','YouTube menu');n.innerHTML=navHtml();
      n.querySelector('.ytnx').addEventListener('click',function(e){e.stopPropagation();setOpen(false);});
      n.addEventListener('pointerdown',function(e){e.stopPropagation();});
      n.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-ytnav]');if(!a)return;e.preventDefault();e.stopPropagation();window.__ytNav.last=[a.getAttribute('data-ytnav'),run(a.getAttribute('data-ytnav'),a.href)];});
      b.appendChild(n);}
    if(b)b.classList.toggle('ytnav-on',S.open);
    if(b)hIcon(b);try{var old=document.getElementById('ytnavIcon');if(old)old.remove();}catch(e){}}
  setInterval(sync,500);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
  window.__ytNav={build:BUILD,open:function(){setOpen(true);},close:function(){setOpen(false);},state:function(){return {open:S.open};},
    items:function(){var a=[];SECS.forEach(function(s){s[1].forEach(function(it){a.push([it[0],url(it[1])]);});});return a;}};
})();
