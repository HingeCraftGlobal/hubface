/* hf-track.js — HubFace click tracking (pings-20261023, rollup-20261023: open + real item opens only; tabs/categories skipped).
   HOW TO TRACK A NEW FEATURE: put data-track="<widget>.<action>" on the button/link/input, e.g.
     <button data-track="weather.unit">°F</button>
   and (once per page) <meta name="hf-track-page" content="dashboard">. That's it.
   Untagged buttons/links/inputs inside a widget box are auto-tagged here as <data-float id>.<element id/label>,
   so new widgets get tracked automatically; add an explicit data-track to choose a clean name.
   Only real user clicks (isTrusted) count; code-driven clicks are ignored. Each click sends one GET to /interface/assets/hf-t.gif?e=<widget.action>&p=<page> (static 1x1 file, no
   server code). Brain OS reads that from the nginx access log and maps it into the HubFace tracker.
   Never sends element text from emails, headlines or names — only ids/labels/short button words.
   Room UI is excluded on purpose (HARD RULE: room page is not touched or tracked from here). */
(function(){
  if(window.__hfTrack)return;window.__hfTrack=1;
  var SKIP='[id^="rb_"],[id^="rx_"],#rbBar,.rbbox,#hf-roomvoice,#rosterPanel,[data-no-track]';
  var SEL='button,a[href],input,select,textarea,[role=button],[onclick]';
  var ALIAS={'ui':'dashboard','stage':'dashboard','brdock':'dashboard','wdtray':'dashboard','volpop':'dashboard','ytrx':'yoda','news-briefing':'news','home-status':'home-status','hub-rooms':'hub-rooms','vpList':'video-picker','wxLocPop':'weather','composeBox':'compose','emailReader':'email','ipPanel':'invite','yNotes':'yoda','hfp':'bots','news-briefing':'news'};
  function page(){var m=document.querySelector('meta[name="hf-track-page"]');return m?m.content:(location.pathname.split('/')[1]||'home');}
  function slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);}
  function widget(el){var f=el.closest('[data-float]');if(f){var w=f.getAttribute('data-float');if(/^priorities-/.test(w))w='priorities';return ALIAS[w]||w;}
    var c=el.parentElement;while(c&&c!==document.body){if(c.id)return ALIAS[c.id]||slug(c.id);c=c.parentElement;}return 'page';}
  function action(el){var a=el.id||el.getAttribute('aria-label')||el.getAttribute('title')||el.getAttribute('name')||el.getAttribute('data-act')||'';
    if(!a&&el.tagName=='BUTTON'){var t=(el.textContent||'').trim();if(t.length<=20&&!/[@\d]/.test(t))a=t;}
    a=slug(a);return a||(el.tagName=='A'?'link':el.tagName=='INPUT'?'input':'item');}
  function tag(root){var n=0;(root.querySelectorAll?root:document).querySelectorAll(SEL).forEach(function(el){
    if(el.hasAttribute('data-track')||el.closest(SKIP))return;el.setAttribute('data-track',widget(el)+'.'+action(el));n++;});return n;}
  var last={};
  function send(e){var k=e,now=Date.now();if(last[k]&&now-last[k]<800)return;last[k]=now;
    var u='/interface/assets/hf-t.gif?e='+encodeURIComponent(e)+'&p='+encodeURIComponent(page())+'&r='+now.toString(36);
    try{fetch(u,{keepalive:true,credentials:'omit',cache:'no-store'}).catch(function(){});}catch(x){try{(new Image()).src=u;}catch(y){}}}
  /* weather-20261023: widget-menu items (.witem) and box close buttons report the real widget: <widget>.open / .show / .close */
  function itemWidget(it){var s=it.querySelector('span:not(.wfdx)'),t=(s&&s.textContent||'').trim();if(!t){var x=it.querySelector('.wfdx');t=x?(x.getAttribute('aria-label')||'').replace(/^close\s+/i,''):'';}var w=slug(t);return w?(ALIAS[w]||w):'dashboard';}
  /* rollup-20261023 (Dan): a widget counts when it is OPENED and when a real ITEM is opened (a video watched, an article read).
     Sub-features (YouTube Shorts/Playlists/sidebar, topic/category tabs, chips, segments, pills) never count -> 'skip' = no ping. */
  var SUBRE=/^(?:[a-z]*[-_])?[a-z]*(?:tabs?|tab[pb]|chips?b?|cats?|segs?|pills?)$/;
  function isSub(t){var el=t.closest('button,a,input,select,[role=tab],[role=button],label,li,span,div');
    for(var i=0;el&&i<3&&el!==document.body;i++,el=el.parentElement){if(el.hasAttribute('data-rm'))return false;var r=el.getAttribute('role');if(r=='tab'||r=='tablist')return true;
      var c=(typeof el.className=='string'?el.className:'').split(/\s+/);for(var j=0;j<c.length;j++)if(c[j]&&!/rem/.test(c[j])&&SUBRE.test(c[j]))return true;}return false;}
  var YTW=/(?:youtube\.com\/(?:watch\?|shorts\/[\w-]{11}|live\/|channel\/[^\/]+\/live)|youtu\.be\/[\w-]{11})/i;
  function special(ev){var t=ev.target;if(!t||!t.closest)return null;
    var yb=t.closest('.wbx[data-w=ent]');if(yb){if(ev.type!='click')return 'skip';
      if(t.closest('.wres>*,.wfav>*')&&!t.closest('.wstar,.wempty,[data-rm]'))return 'youtube.watch';if(t.closest('.wynext'))return 'youtube.watch';
      if(t.closest('.wx'))return 'youtube.close';return 'skip';}
    var ya=t.closest('a[href]');if(ya&&!ya.closest(SKIP)&&(ev.type=='click'||ev.type=='auxclick')&&YTW.test(ya.getAttribute('href')||''))return 'youtube.watch';
    /* newsopen-20261023: a real click (or middle-click) on an article link in the News widget = news.open-article */
    var na=t.closest('a[href]');if(na&&!na.closest(SKIP)&&(ev.type=='click'||ev.type=='auxclick')){var nf=na.closest('[data-float]');if(nf&&/^news/.test(nf.getAttribute('data-float'))&&/^https?:/i.test(na.getAttribute('href')||''))return na.getAttribute('data-nd')?'news.open-'+na.getAttribute('data-nd'):'news.open-article';}
    if(ev.type!='click')return isSub(t)?'skip':null;var it=t.closest('.witem');
    if(it&&!it.closest(SKIP)){var w=itemWidget(it);return w+'.'+(t.closest('.wfdx')?'close':it.classList.contains('boxoff')?'open':'show');}
    var c=t.closest('.boxclose');if(c&&c.closest('[data-float]')&&!c.closest(SKIP))return widget(c)+'.close';return isSub(t)?'skip':null;}
  /* widgetclicks-20261024 (Dan): real taps inside a widget (topic tabs, dial, chips, sub-features) count as <widget>.browse, max one per widget per 20s */
  var lastB={};function browse(t){var f=t.closest&&t.closest('[data-float],.wbx[data-w=ent]');if(!f||t.closest(SKIP))return;var w=f.hasAttribute('data-float')?widget(t):'youtube';if(!w||w=='dashboard'||w=='page')return;var n=Date.now();if(lastB[w]&&n-lastB[w]<20000)return;lastB[w]=n;send(w+'.browse');}
  /* fullnet-20261024: sensitive fields (password/card/cvv/otp/token/secret) are never tracked; typed-text 'change' is an input, not a click */
  var SENS=/pass|card|cvv|cvc|otp|token|secret|ccnum|cc-|one-time/i;function sens(el){if(!el||!el.getAttribute)return false;var t=(el.getAttribute('type')||'').toLowerCase(),ac=(el.getAttribute('autocomplete')||'').toLowerCase();return t=='password'||/^cc-|one-time-code/.test(ac)||SENS.test((el.getAttribute('name')||'')+' '+(el.id||'')+' '+ac);}
  function hit(ev){if(!ev.isTrusted)return;var tg0=ev.target;if(tg0&&tg0.closest){var fe=tg0.closest('input,textarea,select');if(fe&&sens(fe))return;if(ev.type=='change'&&fe&&fe.tagName!='SELECT'&&!/^(checkbox|radio|range|file|color)$/i.test(fe.type||''))return;}var sp=special(ev);if(sp=='skip'){if(ev.type=='click')browse(ev.target);return;}if(sp)return send(sp);var el=ev.target&&ev.target.closest&&ev.target.closest('[data-track]');if(!el||el.closest(SKIP))return;
    if(ev.type=='change'&&!/^(SELECT|INPUT)$/.test(el.tagName))return;if(ev.type=='click'&&el.tagName=='SELECT')return;send(el.getAttribute('data-track'));}
  document.addEventListener('click',hit,true);window.addEventListener('click',function(ev){if(!ev.isTrusted)return;var sp=special(ev);if(/^news\.open-/.test(sp||'')||sp=='youtube.watch')send(sp);},true);/* window capture: the News widget stops article clicks before they reach document */
  window.addEventListener('auxclick',function(ev){if(ev.button!==1||!ev.isTrusted)return;var sp=special(ev);if(sp=='news.open-article'||sp=='youtube.watch')send(sp);},true);document.addEventListener('change',hit,true);
  window.hfTrack=send;window.hfTrackTag=tag;
  function go(){tag(document);var t=0;new MutationObserver(function(){if(t)return;t=setTimeout(function(){t=0;tag(document);},500);}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState=='loading')document.addEventListener('DOMContentLoaded',go);else go();
})();

/* fullnet-20261024 (Dan): every interaction, not just clicks. Separate kinds (key/input/select/toggle/drag/nav) ride the same
   1x1 ping with &k=<kind>&n=<count>; Brain OS counts them apart from clicks, so click totals are unchanged.
   PRIVACY: never sends what was typed or which key character; only field id/label, widget, kind and a count.
   Password / card / cvv / otp / token / secret fields are skipped entirely. Keystrokes + input are debounced into
   one event per field per 4s. Delegated at document level, so new controls are covered automatically. */
(function(){
  if(window.__hfIx)return;window.__hfIx=1;
  var SKIP='[id^="rb_"],[id^="rx_"],#rbBar,.rbbox,#hf-roomvoice,#rosterPanel,[data-no-track]';
  var SENS=/pass|card|cvv|cvc|otp|token|secret|ccnum|cc-|one-time/i;
  function page(){var m=document.querySelector('meta[name="hf-track-page"]');return m?m.content:(location.pathname.split('/')[1]||'home');}
  function slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);}
  function sensitive(el){if(!el||!el.getAttribute)return false;var t=(el.getAttribute('type')||'').toLowerCase(),ac=(el.getAttribute('autocomplete')||'').toLowerCase();
    if(t=='password'||/^cc-|one-time-code/.test(ac))return true;return SENS.test((el.getAttribute('name')||'')+' '+(el.id||'')+' '+ac);}
  function key(el){var c=el.closest&&el.closest('[data-track]');if(c)return c.getAttribute('data-track');
    var f=el.closest&&el.closest('[data-float]'),w=f?slug(f.getAttribute('data-float')).replace(/^priorities-.*/,'priorities'):'dashboard';
    var a=slug(el.id||el.getAttribute&&(el.getAttribute('aria-label')||el.getAttribute('title')||el.getAttribute('name'))||'')||(el.tagName||'el').toLowerCase();return w+'.'+a;}
  function ping(e,k,n){var u='/interface/assets/hf-t.gif?e='+encodeURIComponent(e)+'&p='+encodeURIComponent(page())+'&k='+k+'&n='+(n||1)+'&r='+Date.now().toString(36);
    try{fetch(u,{keepalive:true,credentials:'omit',cache:'no-store'}).catch(function(){});}catch(x){try{(new Image()).src=u;}catch(y){}}}
  var acc={};function bump(k,e,ms){var id=k+'|'+e,a=acc[id];if(a){a.n++;return;}acc[id]=a={n:1};a.t=setTimeout(function(){delete acc[id];ping(e,k,a.n);},ms||4000);}
  function ok(ev,el){return ev.isTrusted&&el&&el.closest&&!el.closest(SKIP)&&!sensitive(el);}
  document.addEventListener('input',function(ev){var el=ev.target;if(!ok(ev,el))return;if(/^(checkbox|radio|range|color|file)$/i.test(el.type||''))return;bump('input',key(el));},true);
  document.addEventListener('keydown',function(ev){var el=ev.target;if(!ok(ev,el))return;if(/^(INPUT|TEXTAREA)$/.test(el.tagName)||el.isContentEditable)return; /* typing counted by 'input' */
    if(/^(Shift|Control|Alt|Meta|CapsLock)$/.test(ev.key))return;bump('key',key(el.closest('[data-float]')||el));},true);
  document.addEventListener('change',function(ev){var el=ev.target;if(!ok(ev,el))return;var t=(el.type||'').toLowerCase();
    if(el.tagName=='SELECT')ping(key(el),'select');else if(t=='checkbox'||t=='radio')ping(key(el),'toggle');else if(t=='range')bump('select',key(el),1500);else if(t=='file')ping(key(el),'select');},true);
  var dn=null;document.addEventListener('pointerdown',function(ev){if(!ev.isTrusted)return;var f=ev.target.closest&&ev.target.closest('[data-float],[draggable=true],.witem');dn=f&&!f.closest(SKIP)?{x:ev.clientX,y:ev.clientY,el:ev.target,f:f}:null;},true);
  document.addEventListener('pointerup',function(ev){if(!dn||!ev.isTrusted)return;var d=Math.abs(ev.clientX-dn.x)+Math.abs(ev.clientY-dn.y),el=dn.el,f=dn.f;dn=null;if(d<14)return;
    var w=f.getAttribute('data-float');var r=/resize/i.test((el.className||'')+' '+(el.getAttribute&&el.getAttribute('data-track')||''));ping((w?slug(w).replace(/^priorities-.*/,'priorities'):'dashboard')+'.'+(r?'resize':'move'),'drag');},true);
  var lastNav='';function nav(why){var v=slug((location.hash||'').replace(/^#/,''))||'home';var e='view.'+v;if(e==lastNav&&why!='load')return;lastNav=e;ping(e,'nav');}
  window.addEventListener('hashchange',function(){nav('hash');});window.addEventListener('popstate',function(){nav('pop');});
  if(document.readyState=='loading')document.addEventListener('DOMContentLoaded',function(){nav('load');});else nav('load');
  window.hfTrackIx=ping;
})();
