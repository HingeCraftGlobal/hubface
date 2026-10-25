/* facescale-20261021a: agent bar faces scale with the box (and so with the window, via the stage scale).
   Applies to every section.ava bar: Finn (#vbBar) and agent-panel bars (Ava/Moderator, Professor, Mara, Theo).
   Face = fits the bar height and any extra width; text, input, 3rd row, buttons and 16-bar dots shift right so nothing overlaps.
   Default bars are opened a bit larger (face 64 instead of 45). Collapsed Finn (vbcol) is left untouched. Separate file: no edits to agent-panel.js. */
(function(){"use strict";
  var TAG='facescale-20261021a',BASE=45,DEF=64,MAXF=150;
  var SHIFT=':scope > .atext, :scope > #vbInput, :scope > input, :scope > .hfrow, :scope > .abtns, :scope > .wave, :scope > .ag';
  function orig(bar){if(bar.__fs)return bar.__fs;var o={w:352,els:[]};
    [].forEach.call(bar.querySelectorAll(SHIFT),function(el){var l=parseFloat(el.getAttribute('data-fsl'));if(!isFinite(l)){l=parseFloat(getComputedStyle(el).left);if(isFinite(l))el.setAttribute('data-fsl',l);}if(isFinite(l))o.els.push({el:el,l:l});});return bar.__fs=o;}
  function fit(bar){var f=bar.querySelector(':scope > .portrait:not(.vbicon)');if(!f)return;var o=orig(bar);
    if(bar.classList.contains('vbcol')||bar.classList.contains('collapsed')){f.style.width=f.style.height=f.style.top='';o.els.forEach(function(e){e.el.style.left='';});return;}
    var W=bar.offsetWidth,H=bar.offsetHeight,hf=bar.classList.contains('hfap');
    var byH=hf?H-14:H-12;   /* hfap: face spans the left column beside its 3rd row */
    var s=Math.round(Math.max(BASE,Math.min(MAXF,byH,BASE+Math.max(0,W-o.w))));var d=s-BASE;
    f.style.width=f.style.height=s+'px';f.style.top=(hf?7:Math.max(5,Math.round((H-s)/2)))+'px';
    o.els.forEach(function(e){e.el.style.left=(e.l+d)+'px';});bar.setAttribute('data-facescale',TAG);}
  var ro=('ResizeObserver' in window)?new ResizeObserver(function(es){es.forEach(function(e){fit(e.target);});}):null;
  function watch(bar){if(bar.__fsw)return;bar.__fsw=1;orig(bar);fit(bar);if(ro)ro.observe(bar);
    new MutationObserver(function(){fit(bar);}).observe(bar,{attributes:true,attributeFilter:['class']});}
  function bump(bar){var d=DEF-BASE;bar.style.width=(352+d)+'px';bar.style.height=(bar.offsetHeight||84)+'px';}
  function savedHas(id){try{var s=JSON.parse(localStorage.getItem('hinge-box-size')||'{}');return !!s[id];}catch(_){return true;}}
  function init(){var BS=window.__boxSize;
    if(BS&&!BS.__fsPatched){var a=BS.adopt;BS.adopt=function(sq){try{if(sq&&sq.classList.contains('hfap')&&!sq.__fsb){sq.__fsb=1;orig(sq);bump(sq);}}catch(_){}var r=a.apply(this,arguments);try{if(sq&&sq.classList.contains('ava'))watch(sq);}catch(_){}return r;};BS.__fsPatched=1;}
    var vb=document.getElementById('vbBar');
    if(vb){orig(vb);var id=vb.getAttribute('data-float')||'yoda';var bv=function(){if(vb.__fsb||!BS||!BS.get(id)||vb.classList.contains('vbcol'))return;vb.__fsb=1;if(savedHas(id))return;var g=BS.get(id);BS.set(id,g.w0+DEF-BASE,g.h0+DEF-BASE);};bv();new MutationObserver(bv).observe(vb,{attributes:true,attributeFilter:['class']});watch(vb);}
    [].forEach.call(document.querySelectorAll('#ui > section.ava'),watch);
    addEventListener('resize',function(){[].forEach.call(document.querySelectorAll('#ui > section.ava'),fit);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(init,0);});else setTimeout(init,0);
})();
