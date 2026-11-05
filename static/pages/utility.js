(function () {
  function call(cmd, params) {
    return Session.call(cmd, params || {});
  }
  function el(id) {
    return document.getElementById(id);
  }
  function gid() {
    var g = Session.guilds && Session.guilds[0];
    return g ? g.id : '';
  }
  function renderAuthorized() {
    Shell.setTitle('Authorized Users');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="glass-card"><h3>Add Authorized User</h3>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><input id="au-id" placeholder="Name or user id" style="flex:1;min-width:160px;margin-bottom:0;">' +
      '<input id="au-prefix" value="!" style="width:60px;margin-bottom:0;">' +
      '<button class="primary-btn" id="au-add">Add</button></div>' +
      '<div id="au-list" style="margin-top:12px;"></div></div>';
    el('au-add').onclick = function () {
      call('utility_authorized_add', { guild_id: gid(), identifier: el('au-id').value.trim() });
    };
    call('utility_authorized_list', {});
  }
  function renderAutoreact() {
    Shell.setTitle('Auto-React');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="glass-card"><h3>Add Auto-React</h3>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><input id="ar-user" placeholder="User id" style="flex:1;min-width:140px;margin-bottom:0;">' +
      '<input id="ar-emoji" placeholder="Emoji" style="flex:1;min-width:100px;margin-bottom:0;">' +
      '<button class="primary-btn" id="ar-add">Add</button></div>' +
      '<div id="ar-list" style="margin-top:12px;"></div></div>';
    el('ar-add').onclick = function () {
      call('utility_autoreact_add', { user_id: el('ar-user').value.trim(), emoji: el('ar-emoji').value.trim() });
    };
    call('utility_autoreact_list', {});
  }
  function renderHush() {
    Shell.setTitle('Hush');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="glass-card"><h3>Hush List</h3>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;"><input id="hu-id" placeholder="Name or user id" style="flex:1;min-width:160px;margin-bottom:0;">' +
      '<button class="primary-btn" id="hu-add">Add</button>' +
      '<button class="danger-btn" id="hu-clear">Clear All</button></div>' +
      '<div id="hu-list"></div></div>';
    el('hu-add').onclick = function () {
      call('utility_hush_add', { guild_id: gid(), identifier: el('hu-id').value.trim() });
    };
    el('hu-clear').onclick = function () {
      customConfirm('Clear the entire hush list?').then(function (ok) {
        if (ok) call('utility_hush_clear', {});
      });
    };
    call('utility_hush_list', {});
  }
  function renderAnnounce() {
    Shell.setTitle('DM Announce');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="glass-card"><h3>DM Announce</h3>' +
      '<div class="form-group"><label>Message</label><textarea id="da-msg" rows="3"></textarea></div>' +
      '<div class="form-group"><label>Role id (optional)</label><input id="da-role"></div>' +
      '<div class="form-group"><label>Batch size</label><input type="number" id="da-batch" value="3" min="1" style="width:90px;"></div>' +
      '<div class="form-group"><label>Speed (seconds between batches)</label><input type="number" id="da-speed" value="0.5" step="0.1" style="width:90px;"></div>' +
      '<div class="ut-bar"><i id="da-bar"></i></div>' +
      '<div class="muted" id="da-status" style="font-size:.8rem;margin-bottom:10px;">Idle</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="primary-btn" id="da-start">Start</button>' +
      '<button class="secondary-btn" id="da-pause">Pause</button>' +
      '<button class="secondary-btn" id="da-resume">Resume</button>' +
      '<button class="danger-btn" id="da-stop">Stop</button></div></div>';
    el('da-start').onclick = function () {
      call('dm_announce_start', {
        guild_id: gid(),
        message: el('da-msg').value,
        role_id: el('da-role').value.trim(),
        batch_size: parseInt(el('da-batch').value, 10) || 3,
        speed: parseFloat(el('da-speed').value) || 0.5
      });
    };
    el('da-pause').onclick = function () { call('dm_announce_pause', { guild_id: gid() }); };
    el('da-resume').onclick = function () { call('dm_announce_resume', { guild_id: gid() }); };
    el('da-stop').onclick = function () { call('dm_announce_stop', { guild_id: gid() }); };
  }
  var wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    Session.on('utility_authorized_list', function (d) {
      var list = el('au-list');
      if (!list) return;
      var users = d.users || {};
      var keys = Object.keys(users);
      if (!keys.length) {
        list.innerHTML = '<div class="muted" style="font-size:.8rem;">No authorized users.</div>';
        return;
      }
      list.innerHTML = keys.map(function (uid) {
        var u = users[uid];
        return '<div class="ut-row"><span class="grow"><strong>' + esc(u.name) + '</strong></span>' +
          '<input value="' + esc(u.prefix || '!') + '" style="width:50px;margin-bottom:0;" data-prefix="' + uid + '">' +
          '<div class="toggle-switch' + ((u.features || []).indexOf('ar') >= 0 ? ' active' : '') + '" data-feat="ar" data-user="' + uid + '" title="ar"></div>' +
          '<div class="toggle-switch' + ((u.features || []).indexOf('hush') >= 0 ? ' active' : '') + '" data-feat="hush" data-user="' + uid + '" title="hush"></div>' +
          '<button class="danger-btn" data-del="' + uid + '">Remove</button></div>';
      }).join('');
      list.querySelectorAll('[data-prefix]').forEach(function (inp) {
        inp.onchange = function () {
          call('utility_authorized_set_prefix', { user_id: inp.getAttribute('data-prefix'), prefix: inp.value });
        };
      });
      list.querySelectorAll('[data-feat]').forEach(function (t) {
        t.onclick = function () {
          call('utility_authorized_toggle_feature', { user_id: t.getAttribute('data-user'), feature: t.getAttribute('data-feat') });
        };
      });
      list.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () { call('utility_authorized_remove', { user_id: b.getAttribute('data-del') }); };
      });
    });
    Session.on('utility_autoreact_list', function (d) {
      var list = el('ar-list');
      if (!list) return;
      var users = d.users || {};
      var keys = Object.keys(users);
      if (!keys.length) {
        list.innerHTML = '<div class="muted" style="font-size:.8rem;">No auto-react users.</div>';
        return;
      }
      list.innerHTML = keys.map(function (uid) {
        return '<div class="ut-row"><span class="grow">' + esc(users[uid].name || uid) + '</span>' +
          (users[uid].emojis || []).map(function (e) {
            return '<span class="ut-emoji" data-emoji="' + esc(e) + '" data-user="' + uid + '">' + esc(e) + ' ✕</span>';
          }).join('') + '</div>';
      }).join('');
      list.querySelectorAll('[data-emoji]').forEach(function (c) {
        c.onclick = function () {
          call('utility_autoreact_remove', { user_id: c.getAttribute('data-user'), emoji: c.getAttribute('data-emoji') });
        };
      });
    });
    Session.on('utility_hush_list', function (d) {
      var list = el('hu-list');
      if (!list) return;
      var users = d.users || [];
      if (!users.length) {
        list.innerHTML = '<div class="muted" style="font-size:.8rem;">No hushed users.</div>';
        return;
      }
      list.innerHTML = users.map(function (u) {
        return '<div class="ut-row"><span class="grow"><strong>' + esc(u.name) + '</strong> <small class="muted">' + esc(u.username) + '</small></span>' +
          '<button class="danger-btn" data-del="' + u.id + '">Remove</button></div>';
      }).join('');
      list.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () { call('utility_hush_remove', { user_id: b.getAttribute('data-del') }); };
      });
    });
    Session.on('dm_announce_progress', function (d) {
      var bar = el('da-bar');
      var status = el('da-status');
      if (!bar || !status) return;
      var pct = d.total ? Math.round(((d.success + d.failed) / d.total) * 100) : 0;
      bar.style.width = pct + '%';
      status.textContent = 'success ' + d.success + ' / failed ' + d.failed + ' / total ' + d.total +
        (d.running ? (d.paused ? ' (paused)' : ' (running)') : ' (stopped)');
    });
  }
  Router.add('/utility/authorized', renderAuthorized, { guard: 'auth', css: ['utility.css'] });
  Router.add('/utility/autoreact', renderAutoreact, { guard: 'auth', css: ['utility.css'] });
  Router.add('/utility/hush', renderHush, { guard: 'auth', css: ['utility.css'] });
  Router.add('/utility/announce', renderAnnounce, { guard: 'auth', css: ['utility.css'] });
  Shell.registerNav({ page: 'utility/authorized', label: 'Authorized', icon: 'shield', ac: '#f97316', dock: false, ctx: 'global', group: 'utility' });
  Shell.registerNav({ page: 'utility/autoreact', label: 'Auto-React', icon: 'react', ac: '#f97316', dock: false, ctx: 'global', group: 'utility' });
  Shell.registerNav({ page: 'utility/hush', label: 'Hush', icon: 'ban', ac: '#f97316', dock: false, ctx: 'global', group: 'utility' });
  Shell.registerNav({ page: 'utility/announce', label: 'DM Announce', icon: 'send', ac: '#f97316', dock: false, ctx: 'global', group: 'utility' });
  wire();
  function renderWebhookStudio() {
    Shell.setTitle('Webhook Studio');
    Shell.setActions('');
    var files = [];
    document.getElementById('page-root').innerHTML =
      '<div class="glass-card anim-in"><h3>Webhook Studio</h3>' +
      '<div class="form-group"><label>Webhook URL (optional)</label><input id="ws-url" placeholder="https://discord.com/api/webhooks/..."></div>' +
      '<div class="form-group"><label>Or pick server</label><select id="ws-server"><option value="">Select server</option></select></div>' +
      '<div class="form-group"><label>Channel</label><select id="ws-channel"><option value="">Select channel</option></select></div>' +
      '<div class="form-group"><label>Username</label><input id="ws-user"></div>' +
      '<div class="form-group"><label>Avatar URL</label><input id="ws-avatar"></div>' +
      '<div class="form-group"><label>Thread name</label><input id="ws-thread"></div>' +
      '<div class="form-group"><label>Content</label><textarea id="ws-content" rows="3"></textarea></div>' +
      '<div class="form-group"><label>Embed title</label><input id="ws-title"></div>' +
      '<div class="form-group"><label>Embed description</label><textarea id="ws-desc" rows="2"></textarea></div>' +
      '<div class="form-group"><label>Embed color</label><input id="ws-color" placeholder="#454af8"></div>' +
      '<div class="set-row"><span>TTS</span><div class="toggle-switch" id="ws-tts"></div>' +
      '<button class="secondary-btn" id="ws-attach">Add file</button><input type="file" id="ws-file" multiple style="display:none;"></div>' +
      '<div id="ws-chips" class="attach-chips"></div>' +
      '<button class="primary-btn" id="ws-send">Send webhook</button></div>';
    var srv = document.getElementById('ws-server');
    (Session.guilds || []).forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.name;
      srv.appendChild(o);
    });
    srv.onchange = function () {
      if (srv.value) Session.socket.emit('get_guild_details', { guild_id: srv.value });
    };
    document.getElementById('ws-attach').onclick = function () {
      document.getElementById('ws-file').click();
    };
    document.getElementById('ws-file').onchange = function (e) {
      Array.prototype.forEach.call(e.target.files, function (f) { files.push(f); });
      paintChips();
      e.target.value = '';
    };
    function paintChips() {
      document.getElementById('ws-chips').innerHTML = files.map(function (f, i) {
        return '<span class="attach-chip">' + esc(f.name) + '<button data-rm="' + i + '">✕</button></span>';
      }).join('');
      document.getElementById('ws-chips').querySelectorAll('[data-rm]').forEach(function (b) {
        b.onclick = function () {
          files.splice(parseInt(b.getAttribute('data-rm'), 10), 1);
          paintChips();
        };
      });
    }
    document.getElementById('ws-send').onclick = async function () {
      var attachments = [];
      for (const f of files) {
        const b64 = await getFileBase64({ files: [f] });
        if (b64) attachments.push({ filename: f.name, data: b64 });
      }
      var embed = null;
      var title = document.getElementById('ws-title').value.trim();
      var desc = document.getElementById('ws-desc').value.trim();
      var color = document.getElementById('ws-color').value.trim();
      if (title || desc) {
        embed = { title: title, description: desc, color: color || '#454af8' };
      }
      Session.call('utility_send_webhook', {
        url: document.getElementById('ws-url').value.trim(),
        channel_id: document.getElementById('ws-channel').value,
        username: document.getElementById('ws-user').value.trim(),
        avatar_url: document.getElementById('ws-avatar').value.trim(),
        thread_name: document.getElementById('ws-thread').value.trim(),
        content: document.getElementById('ws-content').value,
        tts: document.getElementById('ws-tts').classList.contains('active'),
        embed: embed,
        files: attachments
      });
    };
  }
  Session.on('guild_details', function (d) {
    if (!Router.current() || Router.current().route.path !== '/utility/webhook-studio') return;
    var sel = document.getElementById('ws-channel');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select channel</option>';
    (d.channels || []).filter(function (c) { return c.type === 'text'; }).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id;
      o.textContent = '#' + c.name;
      sel.appendChild(o);
    });
  });
})();