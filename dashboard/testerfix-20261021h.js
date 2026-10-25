/* testerfix-20261021h (Tester, Oct 21 2026): first Enter in the Build Your Own title after a room exit now opens the room.
   Cause: the title field (.hrbt) had browser autocomplete on; after a room the browser offers the previous title, and the
   first Enter only accepts that suggestion (no keydown reaches the page), so the second Enter opened the room.
   Fix: autocomplete=off on the title (and description) fields, plus a keyup-Enter fallback that opens the room if the keydown
   path (testerfix-e/g) didn't. Roll back: ROLLBACK-testerfixh.sh */
(function(){
  'use strict';if(window.__testerfixH)return;var S=window.__testerfixH={build:'testerfix-20261021h',acOff:0,keyupOpen:0};
  function R(){return window.__rb;}function inR(){var X=R();return !!(X&&X.inRoom&&X.inRoom());}
  function ac(){[].forEach.call(document.querySelectorAll('.hrbuild .hrbt,.hrbuild .hrbd,#rb_aT,#rb_aD'),function(i){if(i.getAttribute('autocomplete')!=='off'){i.setAttribute('autocomplete','off');i.setAttribute('autocorrect','off');S.acOff++;}});}
  new MutationObserver(ac).observe(document.body,{childList:true,subtree:true});ac();
  document.addEventListener('keyup',function(e){if(e.key!=='Enter'||!(e.target.matches&&e.target.matches('.hrbuild .hrbt')))return;
    setTimeout(function(){var X=R();if(!X||inR())return;var r=X.state.room,v=e.target.value.trim();if(!r.mode||!v)return;
      r.title=v;S.keyupOpen++;X.pickMode(r.mode,r.type||null);},60);},true);
})();
