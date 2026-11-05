// ===== static/shell/voice.js : FULL replacement =====
(function () {
  var I = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var SVG = {
    mic: '<svg ' + I + ' width="18" height="18"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/></svg>',
    micOff: '<svg ' + I + ' width="18" height="18"><path d="M2 2l20 20"/><path d="M9 9v2a3 3 0 0 0 5 2"/><path d="M15 9V5a3 3 0 0 0-5.9-.9"/><path d="M19 10v1a7 7 0 0 1-11.4 5.4"/><path d="M12 18v4"/></svg>',
    vol: '<svg ' + I + ' width="18" height="18"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
    volOff: '<svg ' + I + ' width="18" height="18"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    chat: '<svg ' + I + ' width="18" height="18"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    chev: '<svg ' + I + ' width="16" height="16"><path d="M6 9l6 6 6-6"/></svg>',
    phone: '<svg ' + I + ' width="20" height="20"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
  };
  var POS_KEY = 'arklum.vc.pos';
  var COL_KEY = 'arklum.vc.collapsed';
  var joined = null;
  var muted = false;
  var downlink = true;
  var collapsed = false;
  var startedAt = 0;
  var tickT = null, anchorT = null;
  var pos = null, dragging = null, padded = null;
  var capCtx = null, capProc = null, capStream = null, capWatch = null;
  var outCtx = null, outProc = null;
  var rxQ = {};
  var speak = {};
  var members = [];

  function el(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }
  function fmtT(ms) { var s = Math.floor(ms / 1000), m = Math.floor(s / 60); s = s % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

  /* ---------- UI ---------- */
  function build() {
    if (el('vc-card')) return;
    collapsed = lsGet(COL_KEY) === '1';
    var c = document.createElement('div');
    c.id = 'vc-card';
    c.className = 'vc-card';
    c.innerHTML =
      '<div class="vc-head" id="vc-head">' +
      '<button class="vc-chev" id="vc-chev" type="button" title="Collapse">' + SVG.chev + '</button>' +
      '<span class="vc-name" id="vc-name"></span><span class="vc-time" id="vc-time">00:00</span></div>' +
      '<div class="vc-list" id="vc-list"></div>' +
      '<div class="vc-ctl">' +
      '<button class="vc-btn" id="vc-mute" type="button"></button>' +
      '<button class="vc-btn" id="vc-chat" type="button" title="Open voice chat">' + SVG.chat + '</button>' +
      '<button class="vc-btn" id="vc-speaker" type="button"></button>' +
      '<button class="vc-btn vc-leave" id="vc-leave" type="button">' + SVG.phone + '</button></div>';
    document.body.appendChild(c);
    el('vc-chev').onclick = function () {
      collapsed = !collapsed;
      lsSet(COL_KEY, collapsed ? '1' : '0');
      paint();
      anchor();
    };
    el('vc-mute').onclick = function () {
      muted = !muted;
      Session.socket.emit('vc_mute', { muted: muted });
      paint();
    };
    el('vc-chat').onclick = function () {
      if (!joined) return;
      var cur = window.Router && Router.current();
      var sameGuild = cur && cur.params && String(cur.params.gid) === String(joined.guild_id);
      if (sameGuild && window.ChatHooks && ChatHooks.channel && document.getElementById('chat-layout')) ChatHooks.channel(joined.channel_id);
      else if (window.Router && joined.guild_id) Router.go('/server/' + joined.guild_id + '/chat/' + joined.channel_id + '/');
    };
    el('vc-speaker').onclick = function () { downlink = !downlink; paint(); };
    el('vc-leave').onclick = function () { leave(); };
    wireDrag(el('vc-head'), c);
  }

  function findMember(id) {
    for (var i = 0; i < members.length; i++) if (members[i].id === id) return members[i];
    return null;
  }
  function rowStatus(m) { return m.deaf ? 'Deafened' : (m.mute ? 'Muted' : (speak[m.id] ? 'Speaking' : 'Connected')); }

  function renderList() {
    var list = el('vc-list');
    if (!list) return;
    list.innerHTML = members.map(function (m) {
      return '<div class="vc-row' + (speak[m.id] ? ' sp' : '') + '" data-id="' + esc(m.id) + '"><img src="' + esc(m.avatar || '/arklum.png') + '" alt="">' +
        '<div class="vc-rt"><span class="vc-rn">' + esc(m.name) + '</span><span class="vc-rs">' + rowStatus(m) + '</span></div></div>';
    }).join('') || '<div class="muted" style="padding:8px;font-size:12px;">Alone here.</div>';
  }

  function updateSpeak() {
    var rows = document.querySelectorAll('#vc-list .vc-row');
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].getAttribute('data-id');
      rows[i].classList.toggle('sp', !!speak[id]);
      var m = findMember(id), s = rows[i].querySelector('.vc-rs');
      if (m && s) s.textContent = rowStatus(m);
    }
  }

  function paint() {
    var c = el('vc-card');
    if (!c) return;
    c.classList.toggle('show', !!joined);
    if (!joined) return;
    c.classList.toggle('collapsed', collapsed);
    el('vc-name').textContent = joined.channel_name || 'Voice';
    el('vc-mute').innerHTML = muted ? SVG.micOff : SVG.mic;
    el('vc-mute').classList.toggle('on', muted);
    el('vc-speaker').innerHTML = downlink ? SVG.vol : SVG.volOff;
    el('vc-speaker').classList.toggle('on', !downlink);
    renderList();
  }

  function tickStart() {
    clearInterval(tickT);
    tickT = setInterval(function () {
      var t = el('vc-time');
      if (t && joined) t.textContent = fmtT(Date.now() - startedAt);
    }, 1000);
  }

  /* ---------- placement: docked in the channel sidebar on desktop, draggable on mobile ---------- */
  function clearPad() {
    if (padded) { padded.style.paddingBottom = ''; padded = null; }
  }
  function setPos(x, y) {
    var c = el('vc-card');
    if (!c) return;
    var w = c.offsetWidth, h = c.offsetHeight;
    x = Math.max(4, Math.min(window.innerWidth - w - 4, x));
    y = Math.max(4, Math.min(window.innerHeight - h - 4, y));
    c.style.left = x + 'px';
    c.style.top = y + 'px';
    c.style.right = 'auto';
    c.style.bottom = 'auto';
    c.style.width = '';
    pos = { x: x, y: y };
  }
  function anchor() {
    var c = el('vc-card');
    if (!c || !joined) return;
    var mobile = isMobile();
    c.classList.toggle('vc-mobile', mobile);
    c.classList.toggle('vc-desk', !mobile);
    if (mobile) {
      clearPad();
      if (dragging) return;
      if (!pos) {
        var saved = null;
        try { saved = JSON.parse(lsGet(POS_KEY) || 'null'); } catch (e) {}
        pos = saved && isFinite(saved.x) && isFinite(saved.y) ? saved : { x: Math.max(8, window.innerWidth - 308), y: 64 };
      }
      setPos(pos.x, pos.y);
      return;
    }
    var side = el('chat-chans');
    if (side && side.offsetWidth > 40 && side.offsetHeight > 0) {
      var r = side.getBoundingClientRect();
      c.style.left = (r.left + 1) + 'px';
      c.style.width = (r.width - 2) + 'px';
      c.style.right = 'auto';
      c.style.top = 'auto';
      c.style.bottom = (window.innerHeight - r.bottom + 1) + 'px';
      if (padded && padded !== side) clearPad();
      var pb = (c.offsetHeight + 10) + 'px';
      if (side.style.paddingBottom !== pb) side.style.paddingBottom = pb;
      padded = side;
    } else {
      clearPad();
      var m = el('ns-main');
      var left = m ? m.getBoundingClientRect().left : 0;
      c.style.left = (left + 12) + 'px';
      c.style.width = '260px';
      c.style.right = 'auto';
      c.style.top = 'auto';
      c.style.bottom = '12px';
    }
  }
  function wireDrag(head, card) {
    head.addEventListener('pointerdown', function (e) {
      if (!isMobile() || e.target.closest('button')) return;
      var r = card.getBoundingClientRect();
      dragging = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { head.setPointerCapture(e.pointerId); } catch (err) {}
      card.classList.add('dragging');
      e.preventDefault();
    });
    head.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      setPos(e.clientX - dragging.dx, e.clientY - dragging.dy);
    });
    function end() {
      if (!dragging) return;
      dragging = null;
      card.classList.remove('dragging');
      if (pos) lsSet(POS_KEY, JSON.stringify(pos));
    }
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }
  window.addEventListener('resize', function () { anchor(); });

  /* ---------- mic capture (browser -> Discord) ---------- */
  function startCapture() {
    stopCapture();
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (st) {
      capStream = st;
      var AC = window.AudioContext || window.webkitAudioContext;
      var src;
      try { capCtx = new AC({ sampleRate: 48000 }); src = capCtx.createMediaStreamSource(st); }
      catch (err) { try { capCtx.close(); } catch (e2) {} capCtx = new AC(); src = capCtx.createMediaStreamSource(st); }
      if (capCtx.state === 'suspended') capCtx.resume();
      var rate = capCtx.sampleRate;
      capProc = capCtx.createScriptProcessor(2048, 1, 1);
      var frames = 0;
      capProc.onaudioprocess = function (e) {
        if (muted || !joined) return;
        var f = e.inputBuffer.getChannelData(0);
        if (rate !== 48000) {
          var ratio = rate / 48000, len = Math.round(f.length / ratio), up = new Float32Array(len);
          for (var u = 0; u < len; u++) {
            var p = u * ratio, i0 = Math.floor(p), fr = p - i0;
            var a = f[i0] || 0, b = f[i0 + 1] || 0;
            up[u] = a + (b - a) * fr;
          }
          f = up;
        }
        var out = new Int16Array(f.length);
        for (var i = 0; i < f.length; i++) {
          var s = Math.max(-1, Math.min(1, f[i]));
          out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        frames++;
        Session.socket.emit('mic_audio', out.buffer);
      };
      src.connect(capProc);
      capProc.connect(capCtx.destination);
      capWatch = setInterval(function () {
        if (frames === 0 && capCtx && capCtx.state === 'suspended') capCtx.resume();
      }, 3000);
    }).catch(function (e) { console.log('[vc] mic error', e); });
  }

  function stopCapture() {
    clearInterval(capWatch);
    capWatch = null;
    try { if (capProc) capProc.disconnect(); } catch (e) {}
    try { if (capStream) capStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { if (capCtx) capCtx.close(); } catch (e) {}
    capProc = null; capStream = null; capCtx = null;
  }

  /* ---------- playback (Discord -> browser) ---------- */
  function startSink() {
    stopSink();
    var AC = window.AudioContext || window.webkitAudioContext;
    try { outCtx = new AC({ sampleRate: 48000 }); } catch (e) { outCtx = new AC(); }
    if (outCtx.state === 'suspended') outCtx.resume();
    outProc = outCtx.createScriptProcessor(2048, 1, 1);
    outProc.onaudioprocess = function (e) {
      var out = e.outputBuffer.getChannelData(0);
      for (var i = 0; i < out.length; i++) out[i] = 0;
      for (var k in rxQ) {
        var q = rxQ[k];
        if (!q.primed) { if (q.length < 3) continue; q.primed = true; }
        for (var j = 0; j < out.length; j++) {
          if (!q.cur || q.pos >= q.cur.length) {
            if (!q.length) { q.cur = null; q.primed = false; break; }
            q.cur = q.shift();
            q.pos = 0;
          }
          out[j] += q.cur[q.pos++];
        }
      }
      for (var n = 0; n < out.length; n++) out[n] = Math.max(-1, Math.min(1, out[n] * 0.9));
    };
    outProc.connect(outCtx.destination);
  }

  function stopSink() {
    try { if (outProc) outProc.disconnect(); } catch (e) {}
    try { if (outCtx) outCtx.close(); } catch (e) {}
    outProc = null; outCtx = null; rxQ = {};
  }

  function pushRx(uid, data) {
    var buf = (data instanceof ArrayBuffer) ? data : (data && data.buffer ? data.buffer.slice(data.byteOffset || 0, (data.byteOffset || 0) + data.byteLength) : null);
    if (!buf || buf.byteLength < 2) return;
    var i16 = new Int16Array(buf, 0, buf.byteLength >> 1), f32 = new Float32Array(i16.length);
    for (var i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    var q = rxQ[uid] || (rxQ[uid] = []);
    q.push(f32);
    while (q.length > 25) q.shift();
  }

  /* ---------- lifecycle ---------- */
  function teardown() {
    joined = null;
    members = [];
    speak = {};
    stopCapture();
    stopSink();
    clearInterval(tickT);
    clearInterval(anchorT);
    anchorT = null;
    clearPad();
    var c = el('vc-card');
    if (c) c.classList.remove('show');
  }

  Session.on('vc_joined', function (d) {
    joined = d;
    startedAt = Date.now();
    muted = false;
    Session.socket.emit('vc_mute', { muted: false });
    build();
    paint();
    anchor();
    clearInterval(anchorT);
    anchorT = setInterval(anchor, 250);
    startCapture();
    startSink();
    tickStart();
  });
  Session.on('vc_states', function (d) {
    if (!joined || d.channel_id !== joined.channel_id) return;
    members = d.members || [];
    renderList();
    anchor();
  });
  Session.on('vc_speaking', function (d) {
    speak[d.user_id] = d.speaking;
    updateSpeak();
  });
  Session.on('vc_audio', function (d) {
    if (!downlink || !joined) return;
    pushRx(d.user_id, d.data);
  });
  Session.on('vc_left', function () { teardown(); });
  Session.on('vc_state', function (d) {
    if (d && (d.state === 'disconnected' || d.state === 'destroyed')) teardown();
  });

  function join(cid) { Session.socket.emit('join_vc', { channel_id: cid }); }
  function leave() { Session.socket.emit('leave_vc', {}); teardown(); }

  window.Voice = {
    join: join,
    leave: leave,
    joinedChannel: function () { return joined ? joined.channel_id : null; },
    members: function () { return members; },
    isSpeaking: function (id) { return !!speak[id]; }
  };
})();