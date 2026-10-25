/* roomvoice-20261022a name-first gate (pure; shared by the room client and the node test).
   Rule (Dan): speech that does not START with a bot name gets no response at all: no audio leaves the browser, nothing is routed. */
(function (root) {
  'use strict';
  function Gate(opts) { opts = opts || {}; this.bots = (opts.bots || ['yoda', 'stella']).map(function (s) { return String(s).toLowerCase(); }); this.silenceMs = opts.silenceMs || 600; this.lastWords = 0; this.reset(); }
  Gate.prototype.reset = function () { this.state = 'idle'; this.base = this.lastWords || 0; this.bot = null; this.speechAt = 0; this.quietAt = 0; };
  // per audio block: returns 'end' when an armed turn closes, 'reset' when an unnamed/undecided utterance ended, else null
  Gate.prototype.vad = function (speaking, t) {
    if (speaking) { this.quietAt = 0; if (this.state === 'idle') { this.state = 'listening'; this.speechAt = t; this.base = this.lastWords; } return null; }
    if (this.state === 'idle') return null;
    if (!this.quietAt) this.quietAt = t;
    if (t - this.quietAt < this.silenceMs) return null;
    var was = this.state; this.state = 'idle'; this.bot = null; this.quietAt = 0;
    return was === 'armed' ? 'end' : 'reset';
  };
  // recognizer partial word list for its current segment; returns {wake: bot} once, only when this utterance's FIRST word is a bot name
  Gate.prototype.words = function (list) {
    list = (list || []).map(function (w) { return String(w).toLowerCase(); }).filter(Boolean);
    if (list.length < this.base) this.base = 0;
    this.lastWords = list.length;
    if (this.state !== 'listening') return null;
    var mine = list.slice(this.base); if (!mine.length) return null;
    if (this.bots.indexOf(mine[0]) >= 0) { this.state = 'armed'; this.bot = mine[0]; return { wake: mine[0] }; }
    this.state = 'unnamed';   // silent until this utterance ends
    return null;
  };
  Gate.prototype.segmentDone = function () { this.lastWords = 0; this.base = 0; };
  root.HFVoiceGate = Gate;
  if (typeof module === 'object' && module.exports) module.exports = Gate;
})(typeof window !== 'undefined' ? window : globalThis);
