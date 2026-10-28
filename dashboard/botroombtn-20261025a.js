/* botroombtn-20261025a (Dan, call Oct 25 2026): "Bot room" button (stacked icon over words like the other bar buttons) in the room bottom bar, right after "Invite bot". Opens https://hubface.org/botroom/ in the SAME tab (Dan, 6:23 PM). Roll back: remove the script tag in index.html. */
(function(){
  window.addEventListener("message",function(e){/* sharedroom5: guest card Back = remove overlay only */if(e.origin!==location.origin||!e.data||!e.data.brGuestClose)return;try{e.stopImmediatePropagation();}catch(_){}var o=document.getElementById("brOverlay");if(o)o.remove();try{if(window.__brFsEntered&&document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen();}catch(x){}window.__brFsEntered=false;});
  window.addEventListener("message",function(e){if(e.origin===location.origin&&e.data&&e.data.brClose){var o=document.getElementById("brOverlay");if(o)o.remove();try{if(window.__brFsEntered&&document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen();}catch(x){}window.__brFsEntered=false;}});
  function add(){
    var y=document.getElementById("rx_yoda"); if(!y||!y.parentNode)return;
    var b=document.getElementById("rx_botroom");
    if(!b){b=document.createElement("button");b.type="button";b.id="rx_botroom";b.className="rxBtn";
      b.onclick=function(){
        var ex=document.getElementById("brOverlay");if(ex){if(ex.tagName==="IFRAME")return;/* sharedroom4: a hidden legacy botroom-overlay div (dock) must not swallow the press */try{if(/[?&#](?:room|r)=HF-/.test(location.href)||(window.__roomId&&window.__roomId.id())){ex.remove();var dk=document.getElementById("brBotDock");if(dk)dk.style.display="none";}else return;}catch(_){return;}}
        var f=document.createElement("iframe");f.id="brOverlay";var inv=0;try{var SS=window.__hfServerSeats,mm=/[?&#](?:room|r)=(HF-[A-Z0-9-]+)/.exec(location.href);if(!mm){var rid=null;try{rid=window.__roomId&&window.__roomId.id&&window.__roomId.id();}catch(_2){}if(!rid){try{var A=window.__rb&&window.__rb.App;rid=A&&A.state&&A.state.room&&A.state.room.roomId;}catch(_3){}}if(rid&&/^HF-[A-Z0-9-]+$/.test(rid))mm=[0,rid];}inv=!!mm;}catch(_){}/* sharedroom2-20261027: room-id.js clears #room= after joining, so also read the current room id from the app. Rollback .bak-sharedroom2 */f.src="/botroom/?embed=1"+(inv?"&inv=1&room="+encodeURIComponent(mm[1]):"");/* sharedroom1-20261027: any shared HF- room -> shared mode, never a new BR- room. Rollback .bak-sharedroom1 *//* invitefree1-20261027 */
        f.setAttribute("allow","microphone; camera; autoplay; fullscreen");f.setAttribute("allowfullscreen","");
        f.style.cssText="position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483647;background:#0b1220";
        document.body.appendChild(f);
        try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen){window.__brFsEntered=true;document.documentElement.requestFullscreen().catch(function(){window.__brFsEntered=false;});}}catch(e){}};}
    var T=function(en,hi){var l=(document.documentElement.lang||"").toLowerCase();return l.indexOf("hi")===0?hi:en;};
    var ic="\ud83e\udd16", tx=T("Bot room","\u092c\u0949\u091f \u0930\u0942\u092e");
    var key=ic+"|"+tx;
    if(b.getAttribute("data-k")!==key+"|stack"){b.setAttribute("data-k",key+"|stack");b.innerHTML="";var w=tx.split(" ");[ic].concat(w).forEach(function(s,n){if(n)b.appendChild(document.createElement("br"));b.appendChild(document.createTextNode(s));});}
    b.style.removeProperty("flex-direction");
    /* nochurn1-20261027: room-extras keeps "Add Yoda" right after "Invite bot"; sit after it instead of swapping places every 700 ms */
    var an=(y.nextSibling&&y.nextSibling.id==="rx_addyoda")?y.nextSibling:y;if(an.nextSibling!==b)y.parentNode.insertBefore(b,an.nextSibling);
  }
  setInterval(add,700);
})();
