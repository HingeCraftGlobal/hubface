/* i18n-all-20261022a (Dan, voice Oct 22 2026 ~9pm ET): full screen-text translation for every HubFace language that is not
   en/fil/fr/hi (those keep the built-in overlay). Loads i18n-20261022a/<code>.json only when that language is picked in Properties.
   Exact dictionary matches (same 1105 keys as Hindi) + 42 templates; anything missing stays English. Never touches inputs/user text.
   Preview without installing: open hubface.org, then in the console:  var s=document.createElement('script');s.src='i18n-all-20261022a.js?v=1';document.head.appendChild(s);  then pick a language in Properties.
   Roll back: ROLLBACK-i18n-all-20261022a.sh */
(function(){"use strict";if(window.__hfI18nAll)return;
var TAG='i18n-20261022a',FULL={en:1,fil:1,fr:1,hi:1},PATS=[["^(.+) Layout$", "{1} layout", [1]], ["^Layout: (.+) — click for layouts$", "Layout: {1} — click for layouts", [1]], ["^(.+) is ready —$", "{1} is ready —", []], ["^(.+) is speaking —$", "{1} is speaking —", []], ["^(.+) is thinking —$", "{1} is thinking —", []], ["^(.+) is checking —$", "{1} is checking —", []], ["^(.+) is listening —$", "{1} is listening —", []], ["^Close (.+)$", "Close {1}", [1]], ["^Open (.+?)( in a new tab \\(drag to reorder\\)| \\(drag to reorder\\))?$", "Open {1}", [1]], ["^Collapse (.+)$", "Collapse {1}", [1]], ["^Show (.+)$", "Show {1}", [1]], ["^Minimize (.+)$", "Minimize {1}", [1]], ["^Transparency (\\d+)% — drag to change how see-through the boxes are$", "Transparency {1}% — drag to change how see-through the boxes are", []], ["^Background volume (\\d+)%$", "Background volume {1}%", []], ["^\\+ (\\d+) more events?$", "+ {1} more", []], ["^Feels like (-?\\d+)°$", "Feels like {1}°", []], ["^(\\d+)% rain$", "{1}% rain", []], ["^WEATHER · (.+)$", "WEATHER · {1}", []], ["^(\\S+) Wind (\\d+) km/h (\\w+)$", "{1} Wind {2} km/h {3}", []], ["^(\\S+) Humidity (\\d+)%$", "{1} Humidity {2}%", []], ["^(\\S+) (\\d+)% rain today$", "{1} {2}% rain today", []], ["^Auto-back: (\\d+) min$", "Auto-back: {1} min", []], ["^Return to Norwood weather after (\\d+) minutes$", "Return to Norwood weather after {1} minutes", []], ["^Live roster · (\\d+)$", "Live roster · {1}", []], ["^Fog set to (\\d+) ?%\\.?$", "Fog set to {1}%.", []], ["^(\\d+) min$", "{1} min", []], ["^(\\d+) minutes?$", "{1} minutes", []], ["^(\\d+) (people|participants)$", "{1} people", []], ["^Invite sent to (.+?)\\.?$", "Invite sent to {1}", []], ["^✓ Sent to (.+)$", "✓ Sent to {1}", []], ["^Saved to (.+?)\\.?$", "Saved to {1}", []], ["^Switched to (.+?)\\.?$", "Switched to {1}", []], ["^Room ID (HF-[A-Z0-9-]+)$", "Room ID {1}", []], ["^Good morning, (.+)$", "Good morning, {1}", []], ["^Good afternoon, (.+)$", "Good afternoon, {1}", []], ["^Good evening, (.+)$", "Good evening, {1}", []], ["^Scene: (.+)\\. Tap to pick\\.$", "Scene: {1}. Tap to pick.", [1]], ["^(.+) \\(create\\)$", "{1} (create)", [1]], ["^Rooms · (.+)$", "Rooms · {1}", []], ["^(.+) · has the floor$", "{1} · has the floor", []], ["^(\\d+) minutes, (\\d+) tokens?$", "{1} minutes, {2} tokens", []], ["^(\\d+) tokens?$", "{1} tokens", []]],CACHE={},D=null,PR=[],cur='en',mo=null,busy=false;
var XS='script,style,svg,textarea,input,select,option,[contenteditable],.i18n-no,.langmenu,.langsel,.contact,.wbx[data-w="family"],.wbx[data-w="pets"],.fvroot,.pvroot,.wbx[data-w="recipes"] .wmain,.wbx[data-w="canvas"] .wmain,.wbx[data-w="fitness"] .wmain,.nlist';
var SKIP=XS+',.plist,.wlist li,.wlist .wit,.rows:not(.kv),#aiDd,.rtx,.socgrid .soclb > b';
var TXT=new Map(),ATT=new Map(),A=['title','placeholder'];var LOW={};
function up(s){return s===s.toUpperCase()&&/[A-Z]/.test(s);}
function look(t){if(!D)return null;var k=D.hasOwnProperty(t)?t:LOW[t.toLowerCase()];if(!k)return null;var v=D[k];if(!v)return null;
  if(up(t)&&!up(k)){try{v=v.toLocaleUpperCase(cur);}catch(e){v=v.toUpperCase();}}return v;}
function tr(s,pat){var raw=String(s),t=raw.replace(/\s+/g,' ').trim();if(!t||t.length>200)return null;var v=look(t);
  if(v==null&&pat)for(var i=0;i<PR.length;i++){var p=PR[i],m=p[0].exec(t);if(m){v=p[1].replace(/\{(\d)\}/g,function(_,n){var a=m[+n]||'';return p[2].indexOf(+n)>=0?(look(a)||a):a;});break;}}
  if(v==null||v===t)return null;return (/^\s/.test(raw)?' ':'')+v+(/\s$/.test(raw)?' ':'');}
function doText(n){var p=n.parentNode;if(!p||p.nodeType!==1||!/\S/.test(n.nodeValue))return;var e=TXT.get(n);
  if(e&&n.nodeValue===e[1])return;if(p.closest(XS)||p.closest('.i18n'))return;var pat=!p.closest(SKIP);var o=n.nodeValue,v=tr(o,pat);if(!v)return;TXT.set(n,[o,v]);n.nodeValue=v;}
function doEl(el){if(el.closest&&el.closest('.langsel'))return;A.forEach(function(a){if(!el.hasAttribute(a))return;var k=el.getAttribute(a),m=ATT.get(el)||{};
  if(m[a]&&m[a][1]===k)return;var v=tr(k,true);if(!v)return;m[a]=[k,v];ATT.set(el,m);
  if(a==='title'&&!el.hasAttribute('aria-label')&&!el.hasAttribute('data-voice'))el.setAttribute('data-voice',k);el.setAttribute(a,v);});
  if(el.tagName==='OPTION'&&el.hasAttribute('value')&&!el.closest('.hfbl')){var o=el.getAttribute('data-en-text')||el.textContent,v=look(o.trim());if(v&&el.textContent!==v){if(el.getAttribute('data-en-text')==null)el.setAttribute('data-en-text',o);el.textContent=v;}}}
function scan(root){if(!root)return;if(root.nodeType===3){doText(root);return;}if(root.nodeType!==1)return;doEl(root);
  var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,null),n;while((n=w.nextNode())){if(n.nodeType===3)doText(n);else doEl(n);}}
var q=[],qt=0;function flush(){qt=0;busy=true;try{var x=q;q=[];x.forEach(scan);}catch(e){}if(mo)mo.takeRecords();busy=false;}
function observe(){if(mo)return;mo=new MutationObserver(function(ms){if(busy||!D)return;ms.forEach(function(m){if(m.type==='childList')[].forEach.call(m.addedNodes,function(x){q.push(x);});else q.push(m.target);});if(q.length&&!qt)qt=requestAnimationFrame(flush);});
  mo.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:A});}
function restore(){if(mo){mo.disconnect();mo=null;}busy=true;TXT.forEach(function(e,n){if(n.nodeValue===e[1])n.nodeValue=e[0];});TXT.clear();
  ATT.forEach(function(m,el){Object.keys(m).forEach(function(a){if(el.getAttribute(a)===m[a][1])el.setAttribute(a,m[a][0]);});});ATT.clear();
  [].forEach.call(document.querySelectorAll('option[data-en-text]'),function(o){if(!o.closest('.hfbl')){o.textContent=o.getAttribute('data-en-text');o.removeAttribute('data-en-text');}});busy=false;D=null;}
function load(c){if(CACHE[c])return Promise.resolve(CACHE[c]);return fetch(TAG+'/'+encodeURIComponent(c)+'.json?v='+TAG).then(function(r){if(!r.ok)throw r.status;return r.json();}).then(function(j){CACHE[c]=j;return j;});}
function set(c){if(c===cur&&D)return;restore();cur=c;if(!c||FULL[c])return;
  load(c).then(function(j){if(cur!==c)return;D=j.d||{};LOW={};Object.keys(D).forEach(function(k){LOW[k.toLowerCase()]=k;});
    PR=[];PATS.forEach(function(p,i){var t=j.p&&j.p[i];if(t)PR.push([new RegExp(p[0]),t,p[2]]);});
    busy=true;try{scan(document.body);}catch(e){}busy=false;observe();},function(){});}
function boot(n){var I=window.__i18n;if(!I||!I.lang||!document.body){if((n||0)<150)setTimeout(function(){boot((n||0)+1);},100);return;}
  set(I.lang());window.addEventListener('hinge:lang',function(e){set(e&&e.detail&&e.detail.lang||I.lang());});
  setInterval(function(){if(I.lang()!==cur)set(I.lang());},2000);}
window.__hfI18nAll={tag:TAG,lang:function(){return cur;},set:set,tr:function(s){return tr(s,true);},stats:function(){return {text:TXT.size,attrs:ATT.size,keys:D?Object.keys(D).length:0};}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot(0);});else boot(0);
})();
