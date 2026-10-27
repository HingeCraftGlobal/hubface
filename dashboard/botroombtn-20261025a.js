/* botroombtn-20261025a (Dan, call Oct 25 2026): "Bot room" button (stacked icon over words like the other bar buttons) in the room bottom bar, right after "Invite bot". Opens https://hubface.org/botroom/ in the SAME tab (Dan, 6:23 PM). Roll back: remove the script tag in index.html. */
(function(){
  window.addEventListener("message",function(e){if(e.origin===location.origin&&e.data&&e.data.brClose){var o=document.getElementById("brOverlay");if(o)o.remove();try{if(window.__brFsEntered&&document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen();}catch(x){}window.__brFsEntered=false;}});
  function add(){
    var y=document.getElementById("rx_yoda"); if(!y||!y.parentNode)return;
    var b=document.getElementById("rx_botroom");
    if(!b){b=document.createElement("button");b.type="button";b.id="rx_botroom";b.className="rxBtn";
      b.onclick=function(){
        if(document.getElementById("brOverlay"))return;
        var f=document.createElement("iframe");f.id="brOverlay";f.src="/botroom/?embed=1";
        f.setAttribute("allow","microphone; camera; autoplay; fullscreen");f.setAttribute("allowfullscreen","");
        f.style.cssText="position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:#0b1220";
        document.body.appendChild(f);
        try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen){window.__brFsEntered=true;document.documentElement.requestFullscreen().catch(function(){window.__brFsEntered=false;});}}catch(e){}};}
    var T=function(en,hi){var l=(document.documentElement.lang||"").toLowerCase();return l.indexOf("hi")===0?hi:en;};
    var ic="\ud83e\udd16", tx=T("Bot room","\u092c\u0949\u091f \u0930\u0942\u092e");
    var key=ic+"|"+tx;
    if(b.getAttribute("data-k")!==key+"|stack"){b.setAttribute("data-k",key+"|stack");b.innerHTML="";var w=tx.split(" ");[ic].concat(w).forEach(function(s,n){if(n)b.appendChild(document.createElement("br"));b.appendChild(document.createTextNode(s));});}
    b.style.removeProperty("flex-direction");
    if(y.nextSibling!==b)y.parentNode.insertBefore(b,y.nextSibling);
  }
  setInterval(add,700);
})();
