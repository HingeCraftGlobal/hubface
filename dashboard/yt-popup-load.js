/* ytpop-20261021b: pop-up videos -> in-app player; first-time add-on offer. */
(function(){if(window.__hfYtPop)return;window.__hfYtPop=1;
var KEY='hf-ytext-choice',ZIP='downloads/HubFace-YouTube-addon.zip',STEPS='downloads/HubFace-YouTube-addon.html';
function id(u){var m=/(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i.exec(String(u||''));return m&&m[1];}
function load(u){var v=id(u);if(!v||typeof window.__ytLink!=='function')return false;var r=window.__ytLink(v,'YouTube video');return !!(r&&r.ok);}
window.hfYtLoad=load;
window.addEventListener('message',function(e){var d=e.data;if(!d||d.type!=='hf-yt-load'||typeof d.url!=='string')return;
 var ok=e.origin===location.origin&&e.source===window;
 ok=ok||(e.origin==='https://www.youtube.com'&&/^https:\/\/www\.youtube\.com\/(watch|shorts)/.test(d.url));
 if(ok)load(d.url);});
document.addEventListener('paste',function(e){var t=e.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))return;
 var s=(e.clipboardData||window.clipboardData).getData('text');if(id(s)&&load(s))e.preventDefault();});
/* ---- add-on offer ---- */
function has(){return document.documentElement.dataset.hfYtExt==='1';}
function choice(){try{return localStorage.getItem(KEY);}catch(e){return null;}}
function setChoice(v){try{localStorage.setItem(KEY,v);}catch(e){}}
function openPop(u){var w=Math.min(1000,screen.availWidth-80),h=Math.min(720,screen.availHeight-80),l=Math.round((screen.availWidth-w)/2+(screen.availLeft||0)),t=Math.round((screen.availHeight-h)/2+(screen.availTop||0));
 var wn=null;try{wn=window.open(u,'hfYtPop','popup=yes,width='+w+',height='+h+',left='+l+',top='+t);}catch(e){}if(wn){try{wn.opener=null;wn.focus();}catch(e){}}return wn;}
var css=document.createElement('style');css.textContent=
 '.hfyx{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(5,8,16,.55);backdrop-filter:blur(3px)}'+
 '.hfyx .c{width:min(420px,92vw);background:#141b2b;color:#e8ecf4;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.5);font:15px/1.45 system-ui,sans-serif}'+
 '.hfyx h3{margin:0 0 8px;font-size:18px;display:flex;gap:8px;align-items:center}.hfyx h3 i{width:26px;height:18px;border-radius:5px;background:#f00;display:inline-grid;place-items:center;color:#fff;font-style:normal;font-size:10px}'+
 '.hfyx p{margin:0 0 16px;opacity:.85}.hfyx .b{display:flex;gap:10px;justify-content:flex-end}.hfyx button{all:unset;cursor:pointer;padding:9px 16px;border-radius:10px;font-weight:600}'+
 '.hfyx .y{background:#3b82f6;color:#fff}.hfyx .n{background:rgba(255,255,255,.1)}.hfyx ol{margin:0 0 16px;padding-left:20px}.hfyx li{margin:5px 0}.hfyx code{background:#223;padding:1px 5px;border-radius:4px}.hfyx a{color:#7cb8ff}'+
 'nav.ytnav a.hfyxo{opacity:.8}';
(document.head||document.documentElement).appendChild(css);
function card(then){var o=document.createElement('div');o.className='hfyx';o.setAttribute('role','dialog');
 o.innerHTML='<div class="c"><h3><i>\u25B6</i>YouTube in HubFace</h3><p>'+(has()?'The HubFace YouTube add-on is installed \u2014 clicked videos play here.':'Want clicked YouTube videos to play here in HubFace? Download the small Chrome add-on.')+'</p><div class="b"><button class="n" type="button">No thanks</button><button class="y" type="button">Yes, download</button></div></div>';
 function done(){o.remove();if(then)then();}
 o.querySelector('.n').onclick=function(){setChoice('no');done();};
 o.querySelector('.y').onclick=function(){setChoice('yes');var a=document.createElement('a');a.href=ZIP;a.download='HubFace-YouTube-addon.zip';document.body.appendChild(a);a.click();a.remove();
  var pending=then;then=null; /* open pop-up now while the click still counts as a user gesture */ if(pending)pending();
  o.querySelector('.c').innerHTML='<h3><i>\u25B6</i>Install the add-on</h3><ol><li>Unzip <b>HubFace-YouTube-addon.zip</b> to a folder you\u2019ll keep.</li><li>In Chrome open <code>chrome://extensions</code>.</li><li>Turn on <b>Developer mode</b> (top right).</li><li>Click <b>Load unpacked</b> and pick the folder.</li><li>Reload HubFace.</li></ol><p><a href="'+STEPS+'" target="_blank" rel="noopener">Full steps page</a></p><div class="b"><button class="y" type="button">Got it</button></div>';
  o.querySelector('.y').onclick=function(){o.remove();};};
 document.body.appendChild(o);return o;}
window.__hfYtAddon={card:card,choice:choice,installed:has};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('nav.ytnav a');if(!a)return;
 if(a.classList.contains('hfyxo')){e.preventDefault();e.stopImmediatePropagation();card(null);return;}
 if(a.getAttribute('data-act')!=='pop'||has()||choice())return;
 e.preventDefault();e.stopImmediatePropagation();var u=a.href;card(function(){openPop(u);});},true);
setInterval(function(){var n=document.querySelector('nav.ytnav');if(!n||n.querySelector('.hfyxo'))return;var x=document.createElement('a');x.href='#';x.className='hfyxo';x.title='Get or change the YouTube add-on';x.innerHTML='<span>\u2699 YouTube add-on</span>';var note=n.querySelector('.ytnote');n.insertBefore(x,note||null);},700);
})();
