/* HubFace: vault -> widgets (vaultmedia-20261017-v1, Dan approved).
   Signed in: the Photos/Videos/Audio/Documents widget and its Links pane also show the account's server vault (GET /api/vault),
   merged with this browser's own items (a vault copy of a file that is already in the browser, same name + size, is not listed twice).
   Vault items are read-only here: thumbnails load lazily (/api/vault/thumb/:id, or the photo itself, lazily), photos/videos/music stream
   from /api/vault/file/:id (HTTP range) only when opened or played, nothing is downloaded up front. Deleting a vault item is done in /vault/.
   v2 (petdocs-20261018-v1): exposes upload(file, thumb, progress, {title}) for the Pet Vault document form.
   New uploads while signed in go to the vault (chunked: init -> PUT chunks -> complete with SHA-256); guests keep browser-only storage. */
(function () {
  'use strict';
  if (window.__vaultMedia) return;
  var BUILD = 'vaultmedia-20261019-dragout-a'   /* dragout-20261019a */, st = { on: false, items: [], at: 0, owner: null, err: '' }, P = null;
  function fetchList(force) {
    if (P && !force && Date.now() - st.at < 60000) return P;
    P = fetch('/api/vault', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      if (r.status === 401 || r.status === 403) { st.on = false; st.items = []; st.owner = null; st.at = Date.now(); return st; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().then(function (j) { st.on = true; st.owner = j.owner || null; st.items = Array.isArray(j.items) ? j.items : []; st.at = Date.now(); st.err = ''; return st; });
    }).catch(function (e) { st.err = String(e && e.message || e); st.at = Date.now(); return st; });
    return P;
  }
  function ts(x) { var t = Date.parse(x.added_at || x.created_at || ''); return isFinite(t) ? t : 0; }
  function asMedia(x) {
    return { id: 'v' + x.id, vid: x.id, vault: true, kind: x.kind, name: x.filename || x.title || ('item ' + x.id), type: x.mime || '', size: x.bytes || 0, added: ts(x),
      src: x.file, thumb: x.thumb || (x.kind === 'photo' ? x.file : ''), dl: x.dl || null };   /* dragout-20261019a: pre-signed path for OS drag-out */
  }
  /* merge into the widget's list (called by the widget after it reads the browser's IndexedDB) */
  function merge(local) {
    return fetchList().then(function () {
      local = (local || []).filter(function (x) { return !x.vault; });
      if (!st.on) return local;
      var seen = {}; local.forEach(function (x) { seen[(x.name || '') + '|' + (x.size || 0)] = 1; });
      var v = st.items.filter(function (x) { return x.kind !== 'link' && x.file && !seen[(x.filename || '') + '|' + (x.bytes || 0)]; }).map(asMedia);
      return local.concat(v).sort(function (a, b) { return (a.added || 0) - (b.added || 0); });
    });
  }
  function links(local) {
    if (!st.on) return [];
    var have = {}; (local || []).forEach(function (o) { have[o.url] = 1; });
    return st.items.filter(function (x) { return x.kind === 'link' && x.url && !have[x.url]; })
      .map(function (x) { return { id: 'vl' + x.id, url: x.url, title: x.title || '', at: ts(x), vault: true }; });
  }
  /* ---- uploads: chunked into the vault with an incremental SHA-256 (no whole-file buffering) ---- */
  var K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function Sha() { this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]); this.buf = new Uint8Array(64); this.bl = 0; this.len = 0; this.w = new Uint32Array(64); }
  Sha.prototype.blk = function (b, o) {
    var w = this.w, h = this.h, i, a, bb, c, d, e, f, g, hh, t1, t2, x, y;
    for (i = 0; i < 16; i++) w[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
    for (i = 16; i < 64; i++) { x = w[i - 15]; y = w[i - 2]; w[i] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + w[i - 16] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + w[i - 7] | 0; }
    a = h[0]; bb = h[1]; c = h[2]; d = h[3]; e = h[4]; f = h[5]; g = h[6]; hh = h[7];
    for (i = 0; i < 64; i++) {
      t1 = hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i] | 0;
      t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & bb) ^ (a & c) ^ (bb & c)) | 0;
      hh = g; g = f; f = e; e = d + t1 | 0; d = c; c = bb; bb = a; a = t1 + t2 | 0;
    }
    h[0] = h[0] + a | 0; h[1] = h[1] + bb | 0; h[2] = h[2] + c | 0; h[3] = h[3] + d | 0; h[4] = h[4] + e | 0; h[5] = h[5] + f | 0; h[6] = h[6] + g | 0; h[7] = h[7] + hh | 0;
  };
  Sha.prototype.update = function (u8) {
    var i = 0, n = u8.length; this.len += n;
    if (this.bl) { while (i < n && this.bl < 64) this.buf[this.bl++] = u8[i++]; if (this.bl === 64) { this.blk(this.buf, 0); this.bl = 0; } }
    for (; i + 64 <= n; i += 64) this.blk(u8, i);
    while (i < n) this.buf[this.bl++] = u8[i++];
  };
  Sha.prototype.hex = function () {
    var bits = this.len * 8, pad = new Uint8Array(((this.bl < 56) ? 56 : 120) - this.bl + 8); pad[0] = 0x80;
    var hi = Math.floor(bits / 4294967296), lo = bits >>> 0, L = pad.length;
    pad[L - 8] = hi >>> 24; pad[L - 7] = hi >>> 16; pad[L - 6] = hi >>> 8; pad[L - 5] = hi; pad[L - 4] = lo >>> 24; pad[L - 3] = lo >>> 16; pad[L - 2] = lo >>> 8; pad[L - 1] = lo;
    this.len -= 0; var saved = this.len; this.update(pad); this.len = saved;
    var s = ''; for (var i = 0; i < 8; i++) s += ('00000000' + (this.h[i] >>> 0).toString(16)).slice(-8); return s;
  };
  var EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', mp4: 'video/mp4', m4v: 'video/mp4',
    mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac',
    opus: 'audio/opus', weba: 'audio/webm', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown' };
  function mimeOf(f) { if (f.type) return f.type; var m = /\.([a-z0-9]{1,5})$/i.exec(f.name || ''); return (m && EXT[m[1].toLowerCase()]) || 'application/octet-stream'; }
  function j(r) { return r.json().catch(function () { return {}; }).then(function (b) { return { s: r.status, b: b }; }); }
  function post(u, o) { return fetch(u, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).then(j); }
  function upload(f, thumb, prog, o) {
    o = o || {};   /* petdocs-20261018-v1: optional {title} from the Pet Vault upload form */
    return post('/api/vault/upload/init', { filename: f.name, mime: mimeOf(f), bytes: f.size, title: o.title || (f.name || '').replace(/\.[^.]{1,6}$/, ''), thumb: thumb && thumb.length < 190000 ? thumb : undefined,
      source: 'hubface', source_id: 'hf:' + f.name + ':' + f.size + ':' + (f.lastModified || 0) }).then(function (x) {
      if (x.s === 200 && x.b.duplicate) return { dup: true, id: x.b.item_id };
      if (x.s !== 201 && x.s !== 200) throw Object.assign(new Error(x.b.error || ('HTTP ' + x.s)), { status: x.s });
      var id = x.b.upload_id, cs = Math.min(x.b.chunk_size || 8388608, 8388608), off = 0, h = new Sha();
      if (x.b.received) { /* resumed upload: rehash what the server already has */ off = 0; }
      function step() {
        if (off >= f.size) return post('/api/vault/upload/' + id + '/complete', { sha256: h.hex() }).then(function (c) {
          if (c.s !== 200 && c.s !== 201) throw new Error(c.b.error || ('HTTP ' + c.s)); return c.b.duplicate ? { dup: true, id: c.b.item_id } : { item: c.b.item };
        });
        var end = Math.min(f.size, off + cs);
        return f.slice(off, end).arrayBuffer().then(function (ab) {
          var u8 = new Uint8Array(ab); h.update(u8);
          if (x.b.received && end <= x.b.received) { off = end; return step(); }            // already on the server: just hash it
          return fetch('/api/vault/upload/' + id + '?offset=' + off, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: ab }).then(j).then(function (p) {
            if (p.s !== 200) throw new Error(p.b.error || ('HTTP ' + p.s)); off = end; if (prog) prog(off, f.size); return step();
          });
        });
      }
      return step();
    });
  }
  /* called by the widget's own add() when signed in. H = widget helpers. Files the vault refuses fall back to the browser. */
  function add(files, H) {
    files = [].slice.call(files || []); if (!files.length) return Promise.resolve(0);
    var m = H.box().main, ok = 0, fails = [], local = [], firstKind = null;
    H.stat(m, 'Uploading ' + files.length + (files.length === 1 ? ' file' : ' files') + ' to your vault\u2026');
    return files.reduce(function (p, f, i) {
      return p.then(function () {
        var k = H.kindOf(f);
        return H.thumbOf(f, k).then(function (th) {
          return upload(f, th, function (a, b) { H.stat(m, 'Uploading ' + (i + 1) + '/' + files.length + ': ' + f.name + ' \u2014 ' + Math.round(a / b * 100) + '%'); })
            .then(function () { ok++; if (!firstKind) firstKind = k; })
            .catch(function (e) { if (e && e.status === 415) local.push(f); else fails.push(f.name + ' (' + (e && e.message || e) + ')'); });
        });
      });
    }, Promise.resolve()).then(function () {
      return fetchList(true).then(function () { return H.reload(); }).then(function () {
        if (firstKind) H.setCat(firstKind);
        var tail = local.length ? H.addLocal(local).then(function (n) { return n; }) : Promise.resolve(0);
        return tail.then(function (n) {
          H.render(); H.stat(m, 'Saved ' + ok + (ok === 1 ? ' file' : ' files') + ' to your vault' + (n ? ', ' + n + ' kept in this browser (type not allowed in the vault)' : '') + (fails.length ? '. Failed: ' + fails.join(', ') : '') + '.', ok || n ? 'ok' : 'err');
          return ok + n;
        });
      });
    });
  }
  function refresh() {
    return fetchList(true).then(function () {
      try { if (window.__media && window.__media.reload) window.__media.reload(); } catch (e) {}
      try { if (window.__links && window.__links.render) window.__links.render(); } catch (e) {}
      return st.on;
    });
  }
  window.addEventListener('hubface-auth', function () { setTimeout(refresh, 300); });
  setTimeout(function () { fetchList().then(function () { if (st.on) refresh(); }); }, 1200);
  window.__vaultMedia = { build: BUILD, on: function () { return st.on; }, merge: merge, links: links, add: add, upload: upload, refresh: refresh, list: fetchList,
    state: function () { return { build: BUILD, on: st.on, owner: st.owner, n: st.items.length, err: st.err }; }, sha256: function (u8) { var h = new Sha(); h.update(u8); return h.hex(); }, _Sha: Sha };
})();
