/* widgetcats-20261021a (Dan): main page only. A Widget Picker entry (the 8 built-ins) is a CATEGORY: tapping it drills into that
   category's section inside the builder list (Room Builder style) with its real items. Nothing opens and nothing moves to the row.
   Tapping an item opens the real widget (adding it to the row) at that section. Back / X return to the Widget Picker.
   Opened widgets get a "Back to Widget Picker" button. No mic/speech code. Roll back: /opt/hubface/backups/widgetcats-20261021a/ROLLBACK.sh */
(function(){
  if(window.__widgetCats)return;window.__widgetCats='widgetcats-20261021a';
  function W(id){return document.querySelector('#ui > .wbx[data-w="'+id+'"]');}
  var FV=function(v){return function(){try{window.__familyVault.open(v);}catch(e){}};};
  function sec(id,txt){return function(){var b=W(id);if(!b)return;
    var el=[].filter.call(b.querySelectorAll('.wsec,[data-tab],button,h3,h1'),function(x){return x.textContent.trim().toLowerCase().indexOf(txt)===0;})[0];
    if(el){if(el.hasAttribute('data-tab'))el.click();el.scrollIntoView({block:'center'});el.classList.add('wcflash');setTimeout(function(){el.classList.remove('wcflash');},1500);}};}
  function focus(id,s){return function(){var b=W(id),e=b&&b.querySelector(s);if(e){e.focus();e.scrollIntoView({block:'center'});}};}
  var LW=function(id,lbl){return [[lbl,sec(id,lbl.toLowerCase())],['Add new',focus(id,'input')],['Notes',sec(id,'notes')]];};
  var C={
    'family vault':{id:'family',items:[['Extended Family Vault',FV('home')],['Private Vault',FV('live')],['Immediate Family Vault',FV('immediate')],['Shared Branches',FV('branches')]]},
    'life canvas board':{id:'canvas',items:[['Boards',sec('canvas','boards')],['Gallery',sec('canvas','gal')]]},
    'fitness':{id:'fitness',items:[['Log a workout',focus('fitness','.wfa')],['Workout log',sec('fitness','workout log')],['Notes',sec('fitness','notes')]]},
    'pet vault':{id:'pets',items:[['My Pets',null],['Pet Family Tree',null]]},
    'my recipe book':{id:'recipes',items:[['All recipes',null],['Search recipes',focus('recipes','.rbq')],['Add a recipe',function(){var b=document.querySelector('#ui > section.box[data-float="recipes"] .rbadd');if(b)b.click();}]]},
    'business':{id:'business',items:LW('business','Tasks')},
    'lab':{id:'lab',items:LW('lab','Ideas & experiments')},
    'career':{id:'career',items:LW('career','Goals & milestones')}};
  function room(){return document.documentElement.classList.contains('rb-room');}
  function L(){return document.querySelector('#ui .blist');}
  function nm(t){return ((t.querySelector(':scope > b')||t).textContent||'').trim();}
  function tile(n){return [].filter.call(L().querySelectorAll(':scope > .build'),function(t){return nm(t).toLowerCase()===n;})[0];}
  var cur=null;
  function W(id){return document.querySelector('#ui > .wbx[data-w="'+id+'"]');}
  function back(){var l=L();if(!l)return;l.classList.remove('wcon');var p=l.querySelector(':scope > .wcpanel');if(p)p.remove();cur=null;}
  function show(n){var l=L(),c=C[n];if(!l||!c)return;back();cur=n;var p=document.createElement('div');p.className='wcpanel';
    var t=tile(n);p.innerHTML='<div class="wchd"><button type="button" class="wcback" title="Back to Widget Picker">\u2039 Widget Picker</button><b></b><button type="button" class="wcx" title="Back to Widget Picker" aria-label="Back to Widget Picker">\u2715</button></div>';
    p.querySelector('b').textContent=t?nm(t):n;
    c.items.forEach(function(it){var r=document.createElement('div');r.className='build wcitem';r.innerHTML='<b></b>';r.querySelector('b').textContent=it[0];r.dataset.wc=it[0];p.appendChild(r);});
    l.appendChild(p);l.classList.add('wcon');}
  function openItem(n,label){var c=C[n],it=c.items.filter(function(i){return i[0]===label;})[0];var t=tile(n);back();if(!t)return;
    function go(){t=tile(n);if(t)t.click();setTimeout(function(){addBack(c.id);if(it&&it[1])try{it[1]();}catch(e){}},350);}
    if(t.classList.contains('dwother')){t.click();setTimeout(go,120);}else go();}
  function addBack(id){var b=W(id),h=b&&b.querySelector(':scope > .whead');if(!h||h.querySelector('.wcret'))return;
    var k=document.createElement('button');k.type='button';k.className='wcret';k.textContent='\u2039 Widget Picker';k.title='Back to Widget Picker';k.setAttribute('aria-label',k.title);
    k.addEventListener('click',function(){var x=h.querySelector('.wx');if(x)x.click();
      var n=Object.keys(C).filter(function(k2){return C[k2].id===id;})[0],t=n&&tile(n);if(t&&!t.classList.contains('dwother')){var dx=t.querySelector('.dwx');if(dx)dx.click();}
      back();var l=L(),bx=l&&l.closest('section.box');if(bx)bx.classList.remove('closed','collapsed');});
    h.insertBefore(k,h.firstChild);}
  document.addEventListener('click',function(e){if(room())return;var l=L();if(!l||!l.contains(e.target))return;
    if(e.target.closest('.wcback,.wcx')){e.stopPropagation();e.preventDefault();back();return;}
    var it=e.target.closest('.wcitem');if(it){e.stopPropagation();e.preventDefault();openItem(cur,it.dataset.wc);return;}
    if(!e.isTrusted)return;var t=e.target.closest('.build.dwother');if(!t||e.target.closest('.bdel,.dwx,input'))return;
    var n=nm(t).toLowerCase();if(!C[n])return;e.stopPropagation();e.stopImmediatePropagation();e.preventDefault();show(n);},true);
  window.__widgetCatsApi={show:show,back:back,open:openItem,cats:Object.keys(C)};
})();
