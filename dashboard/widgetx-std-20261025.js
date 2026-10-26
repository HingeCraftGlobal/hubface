/* widgetx-std-20261025 (Dan, Oct 25 1:32pm): header controls (X, minimize arrows, fog, two-arrows resize) share the header s
   visibility. Whenever a widget header is hidden (display/visibility/opacity, any hover/hide state) the box gets .hf-hdroff and
   those controls hide with it; the corner resize grip stays with the body. Roll back: remove the tag. */
(function(){
  "use strict";
  if(window.__hdrSync||document.documentElement.classList.contains("rb-room"))return;
  var css=document.createElement("style");
  css.textContent="html:not(.rb-room) #ui > section.box.hf-hdroff > .ctl:not(.cgrip),html:not(.rb-room) #ui > section.box.hf-hdroff > .fsmini,html:not(.rb-room) #ui > .wbx.hf-hdroff > .whead > *{visibility:hidden!important;opacity:0!important;pointer-events:none!important}";
  document.head.appendChild(css);
  function hidden(h){if(!h||!h.isConnected)return false;var c=getComputedStyle(h);if(c.display==="none"||c.visibility==="hidden"||parseFloat(c.opacity)<0.05)return true;var r=h.getBoundingClientRect();return r.width<1||r.height<1;}
  function sync(b){var h=b.querySelector(":scope > header, :scope > h3, :scope > .whead");if(!h)return;var off=hidden(h);if(b.classList.contains("hf-hdroff")!==off)b.classList.toggle("hf-hdroff",off);}
  var seen=new WeakSet();
  function all(){document.querySelectorAll("#ui > section.box, #ui > .wbx").forEach(function(b){sync(b);if(seen.has(b))return;seen.add(b);
    new MutationObserver(function(){sync(b);}).observe(b,{attributes:true,subtree:true,attributeFilter:["class","style","hidden"]});
    ["pointerenter","pointerleave","transitionend","animationend"].forEach(function(t){b.addEventListener(t,function(){requestAnimationFrame(function(){sync(b);});},true);});});}
  new MutationObserver(function(){requestAnimationFrame(all);}).observe(document.getElementById("ui")||document.body,{childList:true});
  new MutationObserver(function(){requestAnimationFrame(all);}).observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
  setInterval(all,1500);all();
  window.__hdrSync={sync:all};
})();
