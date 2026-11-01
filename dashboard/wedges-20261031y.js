/*wedges-20261031y: C (HingeCraft Chat) and V (HubFace Video) "wedges" inside HubFace. Small dock bottom-left; each opens the program in a full-screen in-app panel (iframe, same site) with "Back to HubFace" and "New tab". Page-only.
 Who sees which wedge: by signed-in HubFace email (/api/account/me), snapshot of program membership 2026-10-31: C = members of HingeCraft Chat (/opt/hingechat/data/users.json, name-matched), V = people in HubFace Video (/opt/hingevideo/data/members-extra.json, name-matched). Undo: /opt/hubface-staging/wedges-20261031y/undo.sh */
(function(){if(window.__wdg)return;window.__wdg=1;
var W={c:{n:'Chat',t:'HingeCraft Chat',u:'/chat/',i:'wedge-c-20261031y.png'},v:{n:'Video',t:'HubFace Video',u:'/video/',i:'wedge-v-20261031y.png'}};
var WHO={'dan@hingecraft-global.ai':['c','v'],'sarah@hingecraft-global.ai':['c','v'],'trishala@hingecraft-global.ai':['c','v'],'gsns.stella@mail.grokbot.com':['c']};
var st=document.createElement('style');st.id='wedges-20261031y';st.textContent=[
'#wdgDock{position:fixed;left:12px;bottom:60px;z-index:2147483000;display:flex;gap:8px}',
'#wdgDock button{display:flex;align-items:center;gap:6px;height:36px;padding:0 12px 0 6px;border-radius:18px;border:1px solid rgba(198,234,237,.45);background:#13203d;color:#e8eef8;font:600 13px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}',
'#wdgDock button:hover{background:#1d2f57}#wdgDock img{width:24px;height:24px;border-radius:6px;object-fit:contain}',
'#wdgOv{position:fixed;inset:0;z-index:2147483001;background:#0b1428;display:flex;flex-direction:column}',
'#wdgBar{display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;background:#13203d;border-bottom:1px solid #2a3a5e;color:#e8eef8;font:600 14px system-ui}',
'#wdgBar button,#wdgBar a{background:#C6EAED;color:#0f1830;border:0;border-radius:8px;padding:7px 12px;font:600 13px system-ui;cursor:pointer;text-decoration:none}',
'#wdgBar a{background:transparent;color:#e8eef8;border:1px solid #2a3a5e}#wdgBar img{width:22px;height:22px;border-radius:5px}#wdgBar .sp{flex:1}',
'#wdgOv iframe{flex:1;border:0;width:100%;background:#0b1428}'].join('\n');document.head.appendChild(st);
function open(k){var w=W[k],o=document.getElementById('wdgOv');if(o)o.remove();o=document.createElement('div');o.id='wdgOv';
 o.innerHTML='<div id="wdgBar"><button type="button" id="wdgBack">← Back to HubFace</button><img src="'+w.i+'" alt=""><span>'+w.t+'</span><span class="sp"></span><a href="'+w.u+'" target="_blank" rel="noopener">New tab ↗</a></div><iframe src="'+w.u+'" title="'+w.t+'" allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-read; clipboard-write; notifications"></iframe>';
 document.body.appendChild(o);document.getElementById('wdgBack').onclick=function(){o.remove()}}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.getElementById('wdgOv')&&!(document.activeElement&&document.activeElement.tagName==='IFRAME'))document.getElementById('wdgOv').remove()});
fetch('/api/account/me',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(d){var a=d&&d.authenticated&&d.account;if(!a)return;var ks=WHO[String(a.email||'').toLowerCase()]||[];if(!ks.length)return;
 var dk=document.createElement('div');dk.id='wdgDock';ks.forEach(function(k){var b=document.createElement('button');b.type='button';b.title='Open '+W[k].t+' inside HubFace';b.innerHTML='<img src="'+W[k].i+'" alt="">'+W[k].n;b.onclick=function(){open(k)};dk.appendChild(b)});document.body.appendChild(dk)}).catch(function(){})})();
