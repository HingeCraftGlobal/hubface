/* roomcustom-20261021a: "+ Name your own widget" in the room Widget picker. A custom room widget is a simple list + notes
   box (same idea as the dashboard's custom widgets). The list of custom widgets is kept in localStorage hubface-rb-custom,
   added to the room's widget bar, and saved with the room (hcrb-saved entry .cw) / restored by Saved rooms. */
(function(){
  'use strict';
  if(window.__roomCustom)return;
  var KC='hubface-rb-custom',KB='hubface-rb-bar',KN='hubface-rb-cwdata',MAX=30;
  function LS(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}}
  function LSs(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function clean(n){return String(n||'').replace(/\s+/g,' ').trim().slice(0,MAX).trim();}
  function slug(n){return 'cw_'+clean(n).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24);}
  function rb(){return window.__rb&&window.__rb.App&&window.__rb.W?window.__rb:null;}
  function list(){var a=LS(KC,[]);return Array.isArray(a)?a.filter(function(o){return o&&o.k&&o.name;}):[];}
  function render(name,k){return function(b){
    var D=LS(KN,{}),d=D[k]||{items:[],notes:''};
    b.innerHTML='<div class="rcw"><div class="row"><input class="rcin" type="text" maxlength="120" placeholder="Add to '+esc(name)+'\u2026"><button type="button" class="rcadd">Add</button></div><div class="rcl"></div><textarea class="rcn" placeholder="'+esc(name)+' notes\u2026"></textarea></div>';
    var L=b.querySelector('.rcl'),inp=b.querySelector('.rcin'),ta=b.querySelector('.rcn');ta.value=d.notes||'';
    function save(){var D2=LS(KN,{});D2[k]=d;LSs(KN,D2);}
    function paint(){L.innerHTML=d.items.length?d.items.map(function(t,i){return '<div class="rci"><span>'+esc(t)+'</span><button type="button" data-i="'+i+'" title="Remove">\u00d7</button></div>';}).join(''):'<div class="muted">Nothing here yet.</div>';}
    function add(){var v=inp.value.trim();if(!v)return;d.items.push(v.slice(0,120));inp.value='';save();paint();}
    b.querySelector('.rcadd').onclick=add;inp.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter')add();});
    ['keyup','keypress'].forEach(function(ev){inp.addEventListener(ev,function(e){e.stopPropagation();});ta.addEventListener(ev,function(e){e.stopPropagation();});});
    ta.addEventListener('keydown',function(e){e.stopPropagation();});ta.addEventListener('input',function(){d.notes=ta.value;save();});
    L.addEventListener('click',function(e){var x=e.target.closest('button[data-i]');if(!x)return;d.items.splice(+x.dataset.i,1);save();paint();});
    paint();};}
  function register(){var R=rb();if(!R)return;list().forEach(function(o){if(!R.W[o.k]||R.W[o.k]._rc!==o.name){R.W[o.k]={title:o.name,cat:'Custom',keys:[o.name.toLowerCase()],w:360,h:260,render:render(o.name,o.k),_rc:o.name};}});}
  function exists(n){var R=rb(),l=clean(n).toLowerCase();if(list().some(function(o){return o.name.toLowerCase()===l;}))return true;
    if(R)for(var k in R.W){if(R.W[k]&&String(R.W[k].title||'').toLowerCase()===l)return true;}return false;}
  function add(n){n=clean(n);if(!n)return {ok:false,why:'empty'};if(exists(n))return {ok:false,why:'dup',name:n};
    var k=slug(n),i=2;while(rb()&&rb().W[k])k=slug(n)+'_'+(i++);
    var a=list();a.push({k:k,name:n});LSs(KC,a);register();
    var b=LS(KB,null);if(Array.isArray(b)){if(b.indexOf(k)<0)b.push(k);LSs(KB,b);}
    repaint();return {ok:true,name:n,k:k};}
  function remove(k){var a=list().filter(function(o){return o.k!==k;});LSs(KC,a);var R=rb();try{if(R&&R.App.wins[k])R.App.close(k);}catch(e){}if(R)delete R.W[k];
    var b=LS(KB,null);if(Array.isArray(b))LSs(KB,b.filter(function(x){return x!==k;}));repaint();}
  function repaint(){var R=rb();if(!R)return;try{R.App.paintList();}catch(e){}try{if(R.App.wins&&R.App.wins.picker)R.App.rerender('picker');}catch(e){}}
  function toast(t){try{if(window.__rbToast)return window.__rbToast(t);}catch(e){}var d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:2147483000;background:rgba(10,20,34,.92);color:#fff;border:1px solid #4fd1ff;border-radius:8px;padding:6px 12px;font:600 12px system-ui';document.body.appendChild(d);setTimeout(function(){d.remove();},1800);}
  /* picker: + Name your own widget row (and an x on custom rows) */
  function hookPicker(){new MutationObserver(function(){[].forEach.call(document.querySelectorAll('.rxPk'),function(pk){if(!pk.querySelector('.rcNew'))try{decorate(pk);}catch(e){}});}).observe(document.body,{childList:true,subtree:true});return true;}
  function decorate(box){var pk=box;if(pk.querySelector('.rcNew'))return;
    list().forEach(function(o){var row=pk.querySelector('.rxRow[data-k="'+o.k+'"]');if(row&&!row.querySelector('.rcDel')){var x=document.createElement('span');x.className='rcDel';x.title='Delete this custom widget';x.textContent='\u00d7';row.appendChild(x);}});
    var nw=document.createElement('div');nw.className='rxRow rcNew';nw.setAttribute('role','button');nw.innerHTML='<span>+ Name your own widget</span>';
    var p=pk.querySelector('p');if(p&&p.nextSibling)pk.insertBefore(nw,p.nextSibling);else pk.insertBefore(nw,pk.firstChild);
    pk.addEventListener('click',function(e){var x=e.target.closest('.rcDel');if(x){e.stopPropagation();e.preventDefault();var r=x.closest('.rxRow');if(r)remove(r.getAttribute('data-k'));return;}
      if(!e.target.closest('.rcNew')||e.target.closest('input'))return;e.stopPropagation();e.preventDefault();edit(nw);},true);}
  function edit(host){if(host.querySelector('input'))return;host.innerHTML='<input type="text" class="rcName" maxlength="'+MAX+'" placeholder="Widget name, then Enter">';var i=host.querySelector('input'),done=false;
    function fin(ok){if(done)return;done=true;var v=i.value;host.innerHTML='<span>+ Name your own widget</span>';if(ok&&clean(v)){var r=add(v);toast(r.ok?'Added '+r.name+' to the bar':r.why==='dup'?'You already have '+r.name:'Type a name first');}}
    ['pointerdown','click','dblclick','keyup','keypress'].forEach(function(ev){i.addEventListener(ev,function(e){e.stopPropagation();});});
    i.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter'){e.preventDefault();fin(true);}else if(e.key==='Escape'){e.preventDefault();fin(false);}});
    i.addEventListener('blur',function(){fin(true);});setTimeout(function(){try{i.focus();}catch(e){}},0);}
  /* save with the room / restore */
  function hookSave(){var R=rb();if(!R||!R.App.openSaved||R.App.openSaved._rc)return false;
    document.addEventListener('rb-saved',function(){try{var id=R.App.state.room.savedId,all=LS('hcrb-saved',[]),e=all.find(function(o){return o.id===id;});if(e){e.cw=list();LSs('hcrb-saved',all);}}catch(err){}});
    var o=R.App.openSaved;R.App.openSaved=function(id){try{var e=LS('hcrb-saved',[]).find(function(x){return x.id===id;});if(e&&Array.isArray(e.cw)){var cur=list();e.cw.forEach(function(c){if(!cur.some(function(x){return x.k===c.k;}))cur.push(c);});LSs(KC,cur);register();}}catch(err){}return o.apply(this,arguments);};R.App.openSaved._rc=1;return true;}
  function css(){var s=document.createElement('style');s.textContent=['.rxPk .rcNew{border-style:dashed!important;border-color:rgba(var(--hub-blue-rgb,79,209,255),.75)!important;color:var(--hub-blue-hi,#7fdcff);font-weight:600}',
    '.rxPk .rcNew input{flex:1;min-width:0;font:inherit;color:#fff;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.3);border-radius:5px;padding:2px 6px}',
    '.rxPk .rcDel{margin-left:4px;opacity:.55;cursor:pointer;padding:0 3px}.rxPk .rcDel:hover{opacity:1;color:#ff8a8a}',
    '.rcw{display:flex;flex-direction:column;gap:4px;height:100%}.rcw .rcl{display:flex;flex-direction:column;gap:2px}.rcw .rci{display:flex;align-items:center;gap:4px;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.08)}',
    '.rcw .rci span{flex:1;min-width:0;overflow-wrap:anywhere}.rcw .rci button{padding:0 5px!important}.rcw .rcin{flex:1;min-width:0}.rcw .rcn{min-height:50px;flex:1;resize:vertical}'].join('\n');document.head.appendChild(s);}
  var tries=0;function init(){var R=rb();if(!R||!R.App.renderPicker||!R.App.openSaved){if(tries++<60)setTimeout(init,500);return;}
    register();hookPicker();hookSave();
    window.__roomCustom={list:list,add:add,remove:remove,build:'roomcustom-20261021a'};}
  css();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
