/* finnlang-20261023a (Dan approved Oct 23): send the chosen dashboard language with every /api/dashboard/chat request so Fin/Ava keep replying in it. Roll back: remove the script tag. */
(function(){
  if (!window.fetch || window.fetch.__finnlang) return;
  var f0 = window.fetch;
  var w = function(u, o){
    try {
      var url = typeof u === 'string' ? u : (u && u.url) || '';
      if (url.indexOf('/api/dashboard/chat') !== -1 && o && typeof o.body === 'string') {
        var I = window.__i18n, L = I && I.lang ? I.lang() : '';
        if (L && L !== 'en') { var b = JSON.parse(o.body); if (b && typeof b === 'object' && !b.lang) { b.lang = L; o = Object.assign({}, o, { body: JSON.stringify(b) }); } }
      }
    } catch (e) {}
    return f0.apply(this, [u, o]);
  };
  w.__finnlang = 1; window.fetch = w;
})();
