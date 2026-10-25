/* noaddyoda-20261021a: removes the Add Yoda button (#rx_addyoda) from the room bar. Invite bot / Record untouched.
   room-extras.js re-creates it on every repaint, so it is removed from layout with display:none (row closes up) and from the DOM.
   Roll back: remove this script tag from index.html. */
(function () {
  var st = document.createElement('style'); st.id = 'noaddyoda'; st.textContent = '#rx_addyoda{display:none!important}';
  (document.head || document.documentElement).appendChild(st);
  function zap() { var b = document.getElementById('rx_addyoda'); if (b && b.parentNode) b.parentNode.removeChild(b); }
  setInterval(zap, 500); document.addEventListener('DOMContentLoaded', zap);
})();
