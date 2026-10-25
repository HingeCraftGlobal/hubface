/* roomrec-20261021b (Dan approved 10:50pm ET Oct 20): Record button in the room bar. getDisplayMedia (this tab preferred) +
   MediaRecorder; audio = tab audio + local mic (if the tab gives no audio: remote room audio + local mic). Red REC timer;
   Stop or the browser's own stop saves hubface-<room>-<datetime>.webm (mp4 when supported). Desktop only. Separate from Share screen. */
(function () {
  var App = (window.__rb && window.__rb.App) || null;   // App lives inside the room builder script; exposed as window.__rb.App
  function hi() { try { return window.__i18n && window.__i18n.lang() === 'hi'; } catch (_) { return false; } }
  function T(en, h) { return hi() ? h : en; }
  function toast(t) { try { App.toast(t); } catch (_) {} }
  var phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) || !window.MediaRecorder;
  var st = document.createElement('style');
  st.textContent = '#rx_rec.on{background:#c62828!important;color:#fff!important}#rx_rec[disabled]{opacity:.45;cursor:not-allowed}' +
    '#rxRecT{position:fixed;z-index:99996;left:12px;top:12px;background:rgba(198,40,40,.92);color:#fff;font:600 12px ui-monospace,Menlo,monospace;padding:3px 8px;border-radius:10px;pointer-events:none}#rxRecT::before{content:"\u25cf ";animation:rxBl 1s steps(2) infinite}@keyframes rxBl{50%{opacity:.2}}';
  document.head.appendChild(st);
  var R = null;
  function mime() { var c = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']; for (var i = 0; i < c.length; i++) if (MediaRecorder.isTypeSupported(c[i])) return c[i]; return ''; }
  function room() { try { return (window.__roomLive.state().room || App.state.room.title || 'room').replace(/[^A-Za-z0-9-]+/g, '-'); } catch (_) { return 'room'; } }
  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  function start() {
    if (R) return stop();
    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' }).then(function (disp) {
      var ac = new (window.AudioContext || window.webkitAudioContext)(), dst = ac.createMediaStreamDestination(), n = 0;
      function add(s) { try { if (s && s.getAudioTracks().length) { ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dst); n++; } } catch (_) {} }
      var tabA = disp.getAudioTracks().length; add(disp);
      try { var ls = App.state.stream; if (ls && App.state.mic) add(ls); } catch (_) {}
      if (!tabA) document.querySelectorAll('#rlAudio audio, #ui .rlPanel video, #ui .rlPanel audio').forEach(function (m) { if (m.srcObject instanceof MediaStream) add(m.srcObject); });
      var out = new MediaStream(disp.getVideoTracks().concat(n ? dst.stream.getAudioTracks() : []));
      var mt = mime(), mr; try { mr = mt ? new MediaRecorder(out, { mimeType: mt }) : new MediaRecorder(out); } catch (e) { mr = new MediaRecorder(out); }
      R = { mr: mr, disp: disp, ac: ac, ch: [], t0: Date.now(), ext: /mp4/.test(mr.mimeType || mt) ? 'mp4' : 'webm' };
      mr.ondataavailable = function (e) { if (e.data && e.data.size) R.ch.push(e.data); };
      mr.onstop = save;
      disp.getVideoTracks()[0].addEventListener('ended', stop);
      mr.start(1000);
      var t = document.createElement('div'); t.id = 'rxRecT'; document.body.appendChild(t); R.tEl = t;
      R.iv = setInterval(function () { var s = Math.floor((Date.now() - R.t0) / 1000); t.textContent = 'REC ' + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + s % 60; }, 500);
      paint(); toast(T('Recording started', 'रिकॉर्डिंग शुरू'));
    }).catch(function () { toast(T('Recording cancelled', 'रिकॉर्डिंग रद्द')); });
  }
  function stop() { if (!R) return; try { if (R.mr.state !== 'inactive') R.mr.stop(); else save(); } catch (_) { save(); } }
  function save() {
    if (!R) return; var r = R; R = null; clearInterval(r.iv); if (r.tEl) r.tEl.remove();
    try { r.disp.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} try { r.ac.close(); } catch (_) {}
    if (r.ch.length) { var b = new Blob(r.ch, { type: r.ch[0].type || 'video/' + r.ext }), u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = 'hubface-' + room() + '-' + stamp() + '.' + r.ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
      toast(T('Recording saved', 'रिकॉर्डिंग सहेजी गई')); }
    paint();
  }
  function paint() {
    var B = document.getElementById('rbBar'); if (!B) { if (R) stop(); return; }
    var b = document.getElementById('rx_rec');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = 'rx_rec'; b.className = 'rxBtn'; var x = document.getElementById('rb_exit'); if (x) B.insertBefore(b, x); else B.appendChild(b);
      b.onclick = function () { if (phone) { toast(T('Recording works on a desktop browser only', 'रिकॉर्डिंग केवल डेस्कटॉप ब्राउज़र पर काम करती है')); return; } start(); }; }
    b.classList.toggle('on', !!R); if (phone) b.setAttribute('aria-disabled', 'true');
    b.style.opacity = phone ? '.45' : '';
    b.textContent = R ? '\u25a0 ' + T('Stop', 'रोकें') : '\u23fa ' + T('Record', 'रिकॉर्ड');
    b.title = phone ? T('Recording works on a desktop browser only', 'रिकॉर्डिंग केवल डेस्कटॉप ब्राउज़र पर काम करती है') : '';
  }
  setInterval(paint, 800);
})();
