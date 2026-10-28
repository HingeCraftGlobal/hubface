/* nochurn-20261027a (Dan, Oct 27 2026: "the widgets are flickering, I can't choose anything"). Many dashboard timers (250-700 ms) re-write
   the SAME text/attributes into buttons and widgets every tick (briefing Play, room bar, call buttons, bot chips, debug chip), replacing
   nodes under the pointer. This makes identical writes no-ops: textContent (text-only elements), innerHTML, className, title, classList add/remove/toggle(force), hidden and
   setAttribute (never for src/href/value/srcdoc/data, which can have side effects). Different values still write normally.
   Roll back: remove this script tag from dashboard/index.html. */
(function(){
  'use strict';if(window.__hfNoChurn)return;window.__hfNoChurn='nochurn-20261027a';
  try{
    var N=Node.prototype,E=Element.prototype,H=HTMLElement.prototype;
    var tc=Object.getOwnPropertyDescriptor(N,'textContent');
    if(tc&&tc.set)Object.defineProperty(N,'textContent',{configurable:true,enumerable:tc.enumerable,get:tc.get,set:function(v){
      if(this.nodeType===1){var s=v==null?'':String(v),c=this.childNodes;
        if(c.length===1&&c[0].nodeType===3&&c[0].data===s)return;if(c.length===0&&s==='')return;}
      return tc.set.call(this,v);}});
    var ih=Object.getOwnPropertyDescriptor(E,'innerHTML');
    if(ih&&ih.set)Object.defineProperty(E,'innerHTML',{configurable:true,enumerable:ih.enumerable,get:ih.get,set:function(v){
      var s=v==null?'':String(v);if(s.length<4000&&this.childNodes.length<60&&ih.get.call(this)===s)return;return ih.set.call(this,v);}});
    var cn=Object.getOwnPropertyDescriptor(E,'className');
    if(cn&&cn.set)Object.defineProperty(E,'className',{configurable:true,enumerable:cn.enumerable,get:cn.get,set:function(v){if(cn.get.call(this)===String(v))return;return cn.set.call(this,v);}});
    var hd=Object.getOwnPropertyDescriptor(H,'hidden');
    if(hd&&hd.set)Object.defineProperty(H,'hidden',{configurable:true,enumerable:hd.enumerable,get:hd.get,set:function(v){
      var cur=this.getAttribute('hidden');if(typeof v==='boolean'||v==null||v===0||v===1){if(!!v===(cur!==null)&&(!v||cur===''))return;}return hd.set.call(this,v);}});
    var ti=Object.getOwnPropertyDescriptor(H,'title');
    if(ti&&ti.set)Object.defineProperty(H,'title',{configurable:true,enumerable:ti.enumerable,get:ti.get,set:function(v){if(this.getAttribute('title')===String(v))return;return ti.set.call(this,v);}});
    /* classList add/remove/toggle re-write the class attribute even when nothing changes; skip those no-op writes */
    var D=DOMTokenList.prototype,dA=D.add,dR=D.remove,dT=D.toggle;
    D.add=function(){for(var i=0;i<arguments.length;i++)if(!this.contains(arguments[i]))return dA.apply(this,arguments);};
    D.remove=function(){for(var i=0;i<arguments.length;i++)if(this.contains(arguments[i]))return dR.apply(this,arguments);};
    D.toggle=function(t,f){if(arguments.length>1){var w=!!f;if(this.contains(t)===w)return w;return dT.call(this,t,w);}return dT.apply(this,arguments);};
    var sa=E.setAttribute,SKIP=/^(src|href|value|srcdoc|data|action|formaction|poster|srcset)$/i;
    E.setAttribute=function(n,v){try{if(!SKIP.test(n)&&this.getAttribute(n)===String(v))return;}catch(e){}return sa.apply(this,arguments);};
  }catch(e){}
})();
