/* roomdrop-20261020a (Dan approved): drop desktop files onto a room -> local floating cards (image preview or file icon,
   name, size, X). Draggable with pointer events, kept inside the viewport. LOCAL ONLY: nothing is uploaded or sent. */
(function () {
  function inRoom() { return !!document.getElementById('rbBar'); }
  function isFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  var st = document.createElement('style');
  st.textContent = 'body.rdOver::after{content:"Drop to add";position:fixed;inset:8px;border:2px dashed rgba(120,180,255,.7);border-radius:14px;background:rgba(120,180,255,.06);color:#cfe3ff;font:600 15px system-ui;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:99998}' +
    '.rdCard{position:fixed;z-index:99990;width:200px;background:rgba(20,24,32,.95);color:#eee;border:1px solid rgba(255,255,255,.15);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);font:12px system-ui;touch-action:none;cursor:grab;user-select:none;overflow:hidden}' +
    '.rdCard.drag{cursor:grabbing}.rdCard img{display:block;width:100%;max-height:160px;object-fit:contain;background:#000;pointer-events:none}' +
    '.rdCard .rdIco{font-size:34px;text-align:center;padding:14px 0 4px}.rdCard .rdMeta{padding:6px 26px 7px 8px;word-break:break-all}.rdCard .rdSz{opacity:.65}' +
    '.rdCard .rdX{position:absolute;top:4px;right:4px;width:20px;height:20px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;font:14px/20px system-ui;padding:0}';
  document.head.appendChild(st);
  function size(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function clamp(c, x, y) { var w = c.offsetWidth, h = c.offsetHeight; c.style.left = Math.max(0, Math.min(innerWidth - w, x)) + 'px'; c.style.top = Math.max(0, Math.min(innerHeight - h, y)) + 'px'; }
  function card(f, x, y) {
    var c = document.createElement('div'), url = null; c.className = 'rdCard';
    if (/^image\//.test(f.type)) { url = URL.createObjectURL(f); var im = document.createElement('img'); im.src = url; im.alt = f.name; im.onload = function () { clamp(c, c.offsetLeft, c.offsetTop); }; c.appendChild(im); }
    else { var i = document.createElement('div'); i.className = 'rdIco'; i.textContent = '\ud83d\udcc4'; c.appendChild(i); }
    var m = document.createElement('div'); m.className = 'rdMeta'; m.textContent = f.name; var s = document.createElement('div'); s.className = 'rdSz'; s.textContent = size(f.size); m.appendChild(s); c.appendChild(m);
    var x_ = document.createElement('button'); x_.type = 'button'; x_.className = 'rdX'; x_.textContent = '\u00d7'; x_.title = 'Remove'; x_.setAttribute('aria-label', 'Remove');
    x_.addEventListener('click', function (e) { e.stopPropagation(); if (url) URL.revokeObjectURL(url); c.remove(); }); c.appendChild(x_);
    document.body.appendChild(c); clamp(c, x - 100, y - 40);
    var d = null;
    c.addEventListener('pointerdown', function (e) { if (e.target === x_) return; d = { id: e.pointerId, dx: e.clientX - c.offsetLeft, dy: e.clientY - c.offsetTop }; c.setPointerCapture(e.pointerId); c.classList.add('drag'); document.body.appendChild(c); e.preventDefault(); e.stopPropagation(); });
    c.addEventListener('pointermove', function (e) { if (d && e.pointerId === d.id) clamp(c, e.clientX - d.dx, e.clientY - d.dy); });
    function up(e) { if (d && e.pointerId === d.id) { d = null; c.classList.remove('drag'); } }
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }
  var depth = 0;
  function off() { depth = 0; document.body.classList.remove('rdOver'); }
  addEventListener('dragenter', function (e) { if (!inRoom() || !isFiles(e)) return; depth++; document.body.classList.add('rdOver'); });
  addEventListener('dragleave', function (e) { if (!inRoom() || !isFiles(e)) return; if (--depth <= 0) off(); });
  addEventListener('dragover', function (e) { if (!inRoom() || !isFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  addEventListener('drop', function (e) {
    if (!inRoom() || !isFiles(e)) return; off(); if (e.defaultPrevented) return; e.preventDefault();
    var fs = e.dataTransfer.files; for (var i = 0; i < fs.length && i < 10; i++) card(fs[i], e.clientX + i * 24, e.clientY + i * 24);
  });
  addEventListener('resize', function () { document.querySelectorAll('.rdCard').forEach(function (c) { clamp(c, c.offsetLeft, c.offsetTop); }); });
})();
