(function () {
  var dmCache = {};
  var dmIndex = {};
  var currentDm = null;
  var wired = false;
  var TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);

  function el(id) { return document.getElementById(id); }
  function on(id, ev, fn) { var n = el(id); if (n) n.addEventListener(ev, fn); }
  function click(id, fn) { var n = el(id); if (n) n.onclick = fn; }
  function md(text) { return window.renderDiscordMarkdown ? window.renderDiscordMarkdown(text, { members: [], roles: [], channels: [] }) : esc(text); }

  function renderList(dms) {
    dmIndex = {};
    (dms || []).forEach(function (d) { dmIndex[d.channel_id] = d; });
    var box = el('dms-list');
    if (!box) return;
    box.innerHTML = (dms || []).map(function (d) {
      return '<div class="dm-item' + (currentDm === d.channel_id ? ' active' : '') + '" data-dm="' + d.channel_id + '"><img src="' + (d.avatar_url || '/arklum.png') + '" loading="lazy" onerror="this.src=\'/arklum.png\'"><span>' + esc(d.name) + '</span></div>';
    }).join('') || '<div class="muted" style="padding:8px;">No DMs yet — open one from a member list or wait for a message.</div>';
  }

  function bodyHtml(m) {
    if (m.segments && m.segments.length) {
      return m.segments.map(function (seg) {
        if (seg.type === 'text') return md(seg.content);
        if (seg.type === 'emoji') return '<img src="' + esc(seg.url) + '" style="height:1.4em;vertical-align:bottom;" loading="lazy">';
        if (seg.type === 'mention') return '<span class="mention">@' + esc(seg.display) + '</span>';
        return esc(seg.content || '');
      }).join('');
    }
    return md(m.content_raw || '');
  }

  function renderMsgs() {
    var list = el('dms-msgs');
    if (!list) return;
    var msgs = dmCache[currentDm] || [];
    list.innerHTML = msgs.map(function (m) {
      var att = '';
      if (m.attachments && m.attachments.length) {
        att = m.attachments.map(function (a) {
          if (a.type === 'image') return '<img class="dm-att" src="' + esc(a.url) + '" loading="lazy">';
          if (a.type === 'audio') return '<audio class="dm-att" controls src="' + esc(a.url) + '"></audio>';
          if (a.type === 'video') return '<video class="dm-att" controls src="' + esc(a.url) + '"></video>';
          return '<a class="dm-att-link" href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.filename || 'file') + '</a>';
        }).join('');
      }
      return '<div class="dm-row"><img src="' + esc(m.avatar_url || '/arklum.png') + '" loading="lazy" onerror="this.style.display=\'none\'"><div><strong>' + esc(m.display_name || m.author) + '</strong> <span class="msg-time">[' + esc(m.timestamp || '') + ']</span><div class="msg-text">' + bodyHtml(m) + '</div>' + att + '</div></div>';
    }).join('') || '<div class="muted" style="padding:12px;">No messages yet.</div>';
    list.scrollTop = list.scrollHeight;
  }

  function sendDm() {
    var inp = el('dms-input');
    if (!inp || !inp.value.trim() || !currentDm) return;
    Session.socket.emit('send_dm_message', { channel_id: currentDm, content: inp.value.trim() });
    inp.value = '';
  }

  function loadDm(cid) {
    currentDm = cid;
    State.set('session.dmPage', cid);
    var lay = el('dms-layout');
    if (lay) lay.classList.add('dm-open');
    var who = el('dms-who');
    if (who && dmIndex[cid]) who.textContent = dmIndex[cid].name;
    if (dmCache[cid] && dmCache[cid].length) renderMsgs();
    else Session.socket.emit('fetch_dm_messages', { channel_id: cid, limit: 50 });
    var box = el('dms-list');
    if (box) box.querySelectorAll('.dm-item').forEach(function (n) { n.classList.toggle('active', n.getAttribute('data-dm') === cid); });
  }

  function page(params) {
    Shell.setTitle('Direct Messages');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="dms-layout" id="dms-layout">' +
      '<aside class="dms-side"><div class="chat-cat">DIRECT MESSAGES</div><div id="dms-list"></div></aside>' +
      '<div class="dms-main">' +
      '<div class="dms-top"><button id="dms-back" class="secondary-btn" type="button">‹ Back</button><span id="dms-who" class="dms-who"></span></div>' +
      '<div class="dms-msgs" id="dms-msgs"></div>' +
      '<div class="chat-input-wrap"><div class="chat-input-row"><textarea id="dms-input" rows="1" placeholder="Message..."></textarea><button class="primary-btn" id="dms-send">' + arkIcon('send', 16) + '</button></div></div>' +
      '</div></div>';
    if (!wired) {
      wired = true;
      Session.on('dm_list', function (dms) { renderList(dms); });
      Session.on('dm_messages', function (d) { dmCache[d.channel_id] = d.messages || []; if (d.channel_id === currentDm) renderMsgs(); });
      Session.on('new_dm_message', function (m) {
        var cid = m.channel_id;
        if (!dmCache[cid]) dmCache[cid] = [];
        dmCache[cid].push(m);
        if (cid === currentDm) renderMsgs();
        Session.socket.emit('run_command', { cmd: 'dm_list', params: {} });
      });
      Session.on('dm_opened', function (d) { Router.go('/dms/' + d.channel_id); });
    }
    on('dms-list', 'click', function (e) {
      var it = e.target.closest('[data-dm]');
      if (it) loadDm(it.getAttribute('data-dm'));
    });
    click('dms-back', function () { var lay = el('dms-layout'); if (lay) lay.classList.remove('dm-open'); });
    click('dms-send', sendDm);
    on('dms-input', 'keydown', function (e) {
      if (e.key === 'Enter' && !TOUCH) { e.preventDefault(); sendDm(); }
    });
    Session.socket.emit('run_command', { cmd: 'dm_list', params: {} });
    if (params.cid) loadDm(params.cid);
    else { var last = State.get('session.dmPage', ''); if (last) loadDm(last); }
  }

  Router.add('/dms/:cid?', page, { guard: 'auth', css: ['chat.css'] });
  Shell.registerNav({ page: 'dms', label: 'DMs', icon: 'chat', dock: true, ctx: 'global', group: 'general' });
})();