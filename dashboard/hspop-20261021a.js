/* hspop-20261021a (Dan): MAIN DASHBOARD ONLY. Every Home Status popout (home-status.js dlg(): camera/doorbell live feed, lock,
   thermostat, guest mode, energy, Oura/wearables, vehicle, pet map, add-room, name/device dialogs, camresize device cards) is moved
   out of the floor plan into its own standard floating widget (LYX mkBox: drag, corner resize, minimize/restore, plain X,
   position saved per popout kind in hinge-w-geo). The dialog node (.hsdlg) and all its handlers are kept, only re-parented.
   Close/Save/Remove inside the dialog and the widget X both end it. Floor plan unchanged. Roll back: remove the hspop-20261021a tag. */
(function(){
  if(window.__hspop)return;window.__hspop='hspop-20261021a';
  function room(){return document.documentElement.classList.contains('rb-room');}
  var css=document.createElement('style');
  css.textContent='html:not(.rb-room) .wbx[data-w^=hspop-] .hsdlg{position:static!important;inset:auto!important;background:none!important;display:block!important;z-index:auto!important}'+
    'html:not(.rb-room) .wbx[data-w^=hspop-] .hsdlg>div{width:auto!important;max-height:none!important;background:none!important;border:0!important;box-shadow:none!important}'+
    'html:not(.rb-room) .wbx[data-w^=hspop-] .wmain{overflow:auto}html:not(.rb-room) .wbx[data-w^=hspop-] .hsfeed video,html:not(.rb-room) .wbx[data-w^=hspop-] .hsfeed img,html:not(.rb-room) .wbx[data-w^=hspop-] .hsfeed iframe{max-width:100%}';
  document.head.appendChild(css);
  function slug(t){return (t||'popout').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'popout';}
  var live={};   /* box id -> {B, o} */
  function detach(o){if(room()||o.__hspop)return;var X=window.__widgets&&window.__widgets.lyx;if(!X)return;o.__hspop=1;
    var t=(o.querySelector('.hsg > b, b')||{}).textContent||'Home Status';var id='hspop-'+slug(t.replace(/\s*·\s*live feed$/i,'-feed'));
    var B=X.mk(id,t,'HOME STATUS',400,420);B.setTitle(t);
    var prev=live[id];if(prev&&prev.o&&prev.o!==o&&prev.o.isConnected)prev.o.remove();
    [].forEach.call(B.main.children,function(c){if(c!==o)c.remove();});
    B.main.appendChild(o);live[id]={B:B,o:o};
    if(!B.__hsx){B.__hsx=1;B.el.querySelector('.wx').addEventListener('click',function(){var L=live[id];if(L&&L.o&&L.o.isConnected)L.o.remove();});}
    B.open();}
  new MutationObserver(function(ms){if(room())return;
    for(var i=0;i<ms.length;i++){var m=ms[i];
      for(var j=0;j<m.addedNodes.length;j++){var n=m.addedNodes[j];if(n.nodeType===1&&n.classList.contains('hsdlg')&&n.parentNode&&n.parentNode.closest&&n.parentNode.closest('.hsplan'))detach(n);}
      for(var k=0;k<m.removedNodes.length;k++){var r=m.removedNodes[k];if(r.nodeType===1&&r.__hspop){Object.keys(live).forEach(function(id){var L=live[id];if(L.o===r&&!r.isConnected){delete live[id];L.B.close();}});}}}
  }).observe(document.body,{childList:true,subtree:true});
})();
