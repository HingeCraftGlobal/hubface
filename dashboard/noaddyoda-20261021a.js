/* noaddyoda-20261021a: removes the Add Yoda button (#rx_addyoda) from the room bar. Invite bot / Record untouched.
   room-extras.js re-creates it on every repaint, so it is removed from layout with display:none (row closes up) and from the DOM.
   Roll back: remove this script tag from index.html. */
(function () {
  var st = document.createElement('style'); st.id = 'noaddyoda'; st.textContent = '#rx_addyoda{display:none!important}';
  (document.head || document.documentElement).appendChild(st);
  function zap() { var b = document.getElementById('rx_addyoda'); if (b && b.parentNode) b.parentNode.removeChild(b); }
  /* nochurn2-20261027: no longer deleted from the DOM every 500 ms (room-extras re-created it each 700 ms: endless add/remove churn in the room bar). The CSS above keeps it hidden. */
})();
