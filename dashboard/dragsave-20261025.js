/* dragsave-20261025 (Dan, Oct 25): a dragged widget stays where it is dropped. Layout changes only lived until the next page reload unless Save was
   pressed, and HubFace reloads itself when a new build goes live, so a dropped box looked like it "snapped back". After a drag of a floating box,
   a widget window, or a left-list row ends and the layout is unsaved, this does what the Save button does (layoutSave.saveNow), once, 1.5s later.
   Main dashboard only (not html.rb-room). Roll back: remove the script tag from index.html (backup /root/hubface-backups/dragsave-20261025/). */
(function(){
  if(window.__dragSave)return;window.__dragSave=1;
  var HANDLE='#ui > section.floatbox > .fhandle, #ui > .wbx .whead, #ui > aside.panel:not(.props) > .witem, #ui > section.box > header';
  var down=false,t=null;
  function room(){return document.documentElement.classList.contains('rb-room');}
  function go(){t=null;return;/* noautosave1-20261027 (Dan): no autosave after drags; layouts persist only via the Save button. Rollback: .bak-noautosave1 */try{var L=window.__layoutSave;if(room()||!L||!L.saveNow)return;if(L.isDirty&&!L.isDirty())return;L.saveNow(true);}catch(e){}}
  window.addEventListener('pointerdown',function(e){if(room())return;var x=e.target&&e.target.closest&&e.target.closest(HANDLE);down=!!x;},true);
  window.addEventListener('pointerup',function(){if(!down)return;down=false;clearTimeout(t);t=setTimeout(go,1500);},true);
  window.addEventListener('pointercancel',function(){down=false;},true);

  /* Two widget windows used to open at exactly the same spot, so the one underneath had its title bar hidden and could not be grabbed.
     A window that opens on top of another one is now stepped down and right so every title bar stays visible. */
  var busy=false;
  /* shakefix1-20261027: debug log only */
  var __mv=window.__hfMoveLog||(window.__hfMoveLog=[]);function DBG(){try{return localStorage.getItem('hfdebug')==='1'||/[?&]hfdebug=1/.test(location.search);}catch(e){return false;}}
  function mlog(src,el,prop,val){if(!DBG())return;var who=el&&(el.getAttribute&&(el.getAttribute('data-float')||el.id)||el.className)||'?';var st=((new Error().stack||'').split('\n')[3]||'').trim();var r={t:Math.round(performance.now()),src:src,el:String(who).slice(0,40),prop:prop,val:val,at:st};__mv.push(r);if(__mv.length>2000)__mv.shift();try{console.debug('[hfmove]',src,r.el,prop,val,st);}catch(e){}}
  function lwait(){return document.documentElement.classList.contains('hf-lwait');}

  function cascade(){
    if(busy||room())return;busy=true;
    try{
      var ws=[].slice.call(document.querySelectorAll('#ui > .wbx.open'));
      var placed=[];
      ws.forEach(function(w){
        var L=parseFloat(w.style.left),T=parseFloat(w.style.top);if(isNaN(L)||isNaN(T))return;
        var n=0,moved=false;
        for(var k=0;k<8;k++){
          var hit=placed.some(function(p){return Math.abs(p.L-L)<30&&Math.abs(p.T-T)<30;});
          if(!hit)break;L+=40;T+=46;moved=true;
        }
        if(moved&&!w.__cascaded){w.__cascaded=1;mlog('dragsave.cascade',w,'left/top',L+','+T);w.style.left=L+'px';w.style.top=T+'px';}
        placed.push({L:L,T:T});
      });
    }catch(e){}
    busy=false;
  }
  var mo=new MutationObserver(function(){clearTimeout(cascade.t);cascade.t=setTimeout(cascade,120);});
  function init(){var ui=document.getElementById('ui');if(!ui){setTimeout(init,500);return;}mo.observe(ui,{subtree:true,attributes:true,attributeFilter:['class']});}
  init();
})();
