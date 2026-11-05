(function () {
  var guildId = null;
  var serverData = null;
  var currentKey = null;
  var lastStructure = null;
  var dragState = null;
  var permEditor = { open: false, category: false, id: '', target: '', type: '' };
  var pendingEmoji = null;
  var botPerms = [];
  var botName = 'Bot';
  var botHighest = 0;
  var lastMemberDetail = null;
  var memberTimer = null;
  var KEYS = ['overview', 'channels', 'members', 'roles', 'bans', 'audit', 'expressions', 'invites'];
  var LABELS = {
    overview: 'Overview',
    channels: 'Channels',
    members: 'Members',
    roles: 'Roles',
    bans: 'Bans',
    audit: 'Audit Log',
    expressions: 'Expressions',
    invites: 'Invites'
  };
  var NICONS = {
    overview: 'sliders',
    channels: 'hash',
    members: 'users',
    roles: 'shield',
    bans: 'ban',
    audit: 'list',
    expressions: 'smile',
    invites: 'link'
  };
  var PERM_BITS = {
    administrator: 3,
    view_audit_log: 7,
    manage_guild: 5,
    manage_roles: 28,
    manage_channels: 16,
    kick_members: 1,
    ban_members: 2,
    create_invite: 0,
    change_nickname: 26,
    manage_nicknames: 27,
    manage_webhooks: 29,
    manage_emojis_and_stickers: 30,
    manage_events: 31,
    moderate_members: 40,
    view_channel: 10,
    send_messages: 11,
    send_tts_messages: 12,
    manage_messages: 13,
    embed_links: 14,
    attach_files: 15,
    read_message_history: 17,
    mention_everyone: 18,
    use_external_emojis: 19,
    connect: 20,
    speak: 21,
    mute_members: 22,
    deafen_members: 23,
    move_members: 24,
    use_voice_activity: 25,
    priority_speaker: 32,
    stream: 33,
    use_application_commands: 34,
    request_to_speak: 35,
    create_public_threads: 36,
    create_private_threads: 37,
    use_external_stickers: 38,
    send_messages_in_threads: 39,
    start_embedded_activities: 41
  };

  function el(id) { return document.getElementById(id); }
  function root() { return document.getElementById('page-root'); }
  function emit(cmd, params) {
    var p = params || {};
    if (guildId && !p.guild_id) p.guild_id = guildId;
    Session.socket.emit('run_command', { cmd: cmd, params: p });
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#12141f;border:1px solid var(--glass-border);color:var(--text);border-radius:999px;padding:8px 16px;font:600 12px var(--font);z-index:10400;box-shadow:0 8px 24px rgba(0,0,0,.5);';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  function lastGuildId() {
    var m = (State.get('session.lastRoute', '') || '').match(/\/server\/(\d+)\//);
    if (m) return m[1];
    var mg = State.get('session.mgmtLastGuild', null);
    if (mg) return mg;
    return (Session.guilds && Session.guilds[0]) ? Session.guilds[0].id : null;
  }
  function statusColor(s) {
    return s === 'online' ? '#23a55a' : s === 'idle' ? '#fbd44c' : s === 'dnd' ? '#f23f43' : '#8b90a8';
  }
  function syncRailActive(key) {
    var items = document.querySelectorAll('#ns-rail .ns-it, #ns-sheet .nsh-it');
    Array.prototype.forEach.call(items, function (it) {
      var p = it.getAttribute('data-page');
      if (!p) return;
      if (KEYS.indexOf(p) >= 0 || p === 'chat') it.classList.toggle('active', p === key);
    });
  }
  function openModal(id) { var m = el(id); if (m) m.classList.add('show'); }
  function closeModal(id) { var m = el(id); if (m) m.classList.remove('show'); }
  function toggleSwitch(node) { if (node) node.classList.toggle('active'); }
  function switchOn(node) { return !!node && node.classList.contains('active'); }

  function can(perm) { return botPerms.indexOf('Administrator') >= 0 || botPerms.indexOf(perm) >= 0; }
  function permText(p) { return p.replace(/_/g, ' ').toLowerCase(); }
  function toastPerm(p) { toast(botName + " doesn't have " + permText(p) + ' permission'); }
  function gateClick(p) { if (!can(p)) { toastPerm(p); return false; } return true; }
  function gateBtn(btn, p) {
    if (!btn) return;
    if (can(p)) { btn.classList.remove('perm-disabled'); btn.title = ''; }
    else { btn.classList.add('perm-disabled'); btn.title = botName + " doesn't have " + permText(p) + ' permission'; }
  }
  function permNotice(p) {
    return '<div class="glass-card"><div class="empty-state"><p>' + esc(botName) + " doesn't have " + permText(p) + ' permission</p></div></div>';
  }
  function qBtn(msg) { return '<button class="secondary-btn mg-q" type="button" data-qmsg="' + esc(msg) + '">?</button>'; }
  function topRole(m) {
    var best = null;
    (m.roles || []).forEach(function (rid) {
      var r = (serverData.roles || []).filter(function (x) { return x.id === rid; })[0];
      if (!r || r.name === '@everyone') return;
      if (!best || (r.position || 0) > (best.position || 0)) best = r;
    });
    return best;
  }

  function ensureModals() {
    if (el('mg-modal-channel')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="modal" id="mg-modal-channel"><div class="modal-card" style="width:min(560px,94vw);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><h3 style="margin:0;">Channel Settings</h3><button class="header-btn" data-close="mg-modal-channel">' + arkIcon('close', 14) + '</button></div>' +
      '<div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;">' +
      '<button class="tab-btn active" data-ctab="general">General</button>' +
      '<button class="tab-btn" data-ctab="permissions">Permissions</button>' +
      '<button class="tab-btn" data-ctab="webhooks">Webhooks</button>' +
      '<button class="tab-btn" data-ctab="pins">Pins</button>' +
      '<button class="tab-btn" data-ctab="invites">Invites</button></div>' +
      '<input type="hidden" id="mg-ch-id">' +
      '<div id="mg-ctab-general">' +
      '<div class="form-group"><label>Name</label><input id="mg-ch-name"></div>' +
      '<div class="form-group"><label>Topic</label><textarea id="mg-ch-topic" rows="2"></textarea></div>' +
      '<div class="form-group"><label>Category</label><select id="mg-ch-category"></select></div>' +
      '<div class="form-group"><label>Slowmode (seconds)</label><input type="number" id="mg-ch-slowmode" value="0"></div>' +
      '<div class="form-group" style="display:flex;gap:16px;align-items:center;"><span>Age Restricted</span><div class="toggle-switch" id="mg-ch-nsfw"></div><span>Private</span><div class="toggle-switch" id="mg-ch-private"></div></div>' +
      '<div style="display:flex;gap:8px;"><button class="primary-btn" id="mg-ch-save">Save</button><button class="danger-btn" id="mg-ch-delete">Delete Channel</button></div></div>' +
      '<div id="mg-ctab-permissions" style="display:none;"><div style="display:flex;gap:8px;margin-bottom:8px;"><button class="secondary-btn" id="mg-perm-add-role">Add Role</button><button class="secondary-btn" id="mg-perm-add-member">Add Member</button></div><div id="mg-ch-perms"></div></div>' +
      '<div id="mg-ctab-webhooks" style="display:none;"><div style="margin-bottom:8px;"><button class="secondary-btn" id="mg-wh-create">Create Webhook</button></div><div id="mg-ch-webhooks"></div></div>' +
      '<div id="mg-ctab-pins" style="display:none;"><div id="mg-ch-pins"></div></div>' +
      '<div id="mg-ctab-invites" style="display:none;"><div id="mg-ch-invites"></div></div>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-create-channel"><div class="modal-card">' +
      '<h3>Create Channel</h3>' +
      '<div class="form-group"><label>Name</label><input id="mg-new-ch-name" placeholder="new-channel"></div>' +
      '<div class="form-group"><label>Type</label><select id="mg-new-ch-type"><option value="text">Text</option><option value="voice">Voice</option></select></div>' +
      '<div class="form-group"><label>Category</label><select id="mg-new-ch-category"></select></div>' +
      '<div class="form-group" style="display:flex;gap:8px;align-items:center;"><span>Private</span><div class="toggle-switch" id="mg-new-ch-private"></div></div>' +
      '<button class="primary-btn" id="mg-new-ch-create">Create</button>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-create-category"><div class="modal-card">' +
      '<h3>Create Category</h3>' +
      '<div class="form-group"><label>Name</label><input id="mg-new-cat-name" placeholder="New Category"></div>' +
      '<div class="form-group" style="display:flex;gap:8px;align-items:center;"><span>Private</span><div class="toggle-switch" id="mg-new-cat-private"></div></div>' +
      '<button class="primary-btn" id="mg-new-cat-create">Create</button>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-category"><div class="modal-card">' +
      '<h3>Category Settings</h3>' +
      '<input type="hidden" id="mg-cat-id">' +
      '<div class="form-group"><label>Name</label><input id="mg-cat-name"></div>' +
      '<div class="form-group"><label>Position</label><input type="number" id="mg-cat-position" value="0"></div>' +
      '<div id="mg-cat-perms-wrap" style="display:none;"><div id="mg-cat-perms"></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;"><button class="primary-btn" id="mg-cat-save">Save</button><button class="danger-btn" id="mg-cat-delete">Delete</button></div>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-perm-editor"><div class="modal-card" style="width:min(560px,94vw);">' +
      '<h3 id="mg-perm-title">Permissions</h3>' +
      '<div class="mg-perm-grid" id="mg-perm-list"></div>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-perm-add"><div class="modal-card">' +
      '<h3 id="mg-perm-add-title">Add</h3>' +
      '<select id="mg-perm-add-select"></select>' +
      '<button class="primary-btn" id="mg-perm-add-go">Add</button>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-member"><div class="modal-card">' +
      '<div id="mg-member-body"></div>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-webhook"><div class="modal-card">' +
      '<h3>Edit Webhook</h3>' +
      '<input type="hidden" id="mg-wh-id">' +
      '<div class="form-group"><label>Name</label><input id="mg-wh-name"></div>' +
      '<div class="form-group"><label>Channel</label><select id="mg-wh-channel"></select></div>' +
      '<button class="primary-btn" id="mg-wh-save">Save</button>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-role"><div class="modal-card" style="width:min(560px,94vw);">' +
      '<h3>Edit Role</h3>' +
      '<input type="hidden" id="mg-role-id">' +
      '<div class="form-group"><label>Name</label><input id="mg-role-name"></div>' +
      '<div class="form-group"><label>Color</label><input type="color" id="mg-role-color" value="#000000"></div>' +
      '<h4 style="margin:8px 0 4px;">Permissions</h4>' +
      '<div class="mg-perm-grid" id="mg-role-perms"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;"><button class="primary-btn" id="mg-role-save">Save</button><button class="danger-btn" id="mg-role-delete">Delete</button><button class="secondary-btn" id="mg-role-members">View Members</button></div>' +
      '<div id="mg-role-member-list" style="margin-top:10px;"></div>' +
      '</div></div>' +
      '<div class="modal" id="mg-modal-emoji"><div class="modal-card">' +
      '<h3>Edit Emoji</h3>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;"><img id="mg-em-preview" style="width:40px;height:40px;"><input id="mg-em-name"></div>' +
      '<div style="display:flex;gap:8px;"><button class="primary-btn" id="mg-em-save">Save</button><button class="danger-btn" id="mg-em-delete">Delete</button></div>' +
      '</div></div>';
    document.body.appendChild(wrap);
    document.addEventListener('click', function (e) {
      var c = e.target.closest('[data-close]');
      if (c) {
        closeModal(c.getAttribute('data-close'));
        if (c.getAttribute('data-close') === 'mg-modal-member') clearInterval(memberTimer);
        return;
      }
      var q = e.target.closest('[data-qmsg]');
      if (q) { toast(q.getAttribute('data-qmsg')); return; }
      var m = e.target.closest('.modal');
      if (m && m.classList.contains('show') && !e.target.closest('.modal-card')) {
        closeModal(m.id);
        if (m.id === 'mg-modal-member') clearInterval(memberTimer);
      }
    });
    el('mg-modal-channel').addEventListener('click', function (e) {
      var tab = e.target.closest('[data-ctab]');
      if (!tab) return;
      var name = tab.getAttribute('data-ctab');
      el('mg-modal-channel').querySelectorAll('[data-ctab]').forEach(function (b) {
        b.classList.toggle('active', b === tab);
      });
      ['general', 'permissions', 'webhooks', 'pins', 'invites'].forEach(function (t) {
        el('mg-ctab-' + t).style.display = t === name ? 'block' : 'none';
      });
      var cid = el('mg-ch-id').value;
      if (!cid) return;
      if (name === 'permissions') emit('channel_permissions_get', { channel_id: cid });
      if (name === 'webhooks') emit('channel_webhooks', { channel_id: cid });
      if (name === 'pins') emit('channel_pins', { channel_id: cid });
      if (name === 'invites') emit('channel_invites', { channel_id: cid });
    });
    el('mg-ch-save').onclick = saveChannel;
    el('mg-ch-delete').onclick = deleteChannel;
    el('mg-perm-add-role').onclick = function () { openPermAdd('role'); };
    el('mg-perm-add-member').onclick = function () { openPermAdd('member'); };
    el('mg-wh-create').onclick = function () {
      if (!gateClick('MANAGE_WEBHOOKS')) return;
      emit('webhook_create', { channel_id: el('mg-ch-id').value, name: 'Arklum Webhook' });
      setTimeout(function () { emit('channel_webhooks', { channel_id: el('mg-ch-id').value }); }, 500);
    };
    el('mg-new-ch-create').onclick = createChannel;
    el('mg-new-cat-create').onclick = createCategory;
    el('mg-cat-save').onclick = saveCategory;
    el('mg-cat-delete').onclick = deleteCategory;
    el('mg-perm-add-go').onclick = addPermTarget;
    el('mg-wh-save').onclick = saveWebhook;
    el('mg-role-save').onclick = saveRole;
    el('mg-role-delete').onclick = deleteRoleFromModal;
    el('mg-role-members').onclick = function () {
      emit('role_members_list', { role_id: el('mg-role-id').value });
    };
    el('mg-em-save').onclick = function () {
      if (!pendingEmoji) return;
      if (!gateClick('MANAGE_EMOJIS_AND_STICKERS')) return;
      emit('emoji_edit', { emoji_id: pendingEmoji.id, name: el('mg-em-name').value.trim() || pendingEmoji.name });
      closeModal('mg-modal-emoji');
      setTimeout(function () { emit('server_expression_list', {}); }, 600);
    };
    el('mg-em-delete').onclick = function () {
      if (!pendingEmoji) return;
      if (!gateClick('MANAGE_EMOJIS_AND_STICKERS')) return;
      customConfirm('Delete emoji :' + pendingEmoji.name + ':?').then(function (ok) {
        if (!ok) return;
        emit('emoji_delete', { emoji_id: pendingEmoji.id });
        closeModal('mg-modal-emoji');
        setTimeout(function () { emit('server_expression_list', {}); }, 600);
      });
    };
  }

  function categoryOptions(selected) {
    var html = '<option value="">No Category</option>';
    if (lastStructure && lastStructure.categories) {
      lastStructure.categories.forEach(function (c) {
        html += '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      });
    }
    return html;
  }

  function renderOverview() {
    if (!serverData) {
      root().innerHTML = '<div class="glass-card"><div class="empty-state"><div class="skeleton" style="width:60%;"></div></div></div>';
      return;
    }
    var g = serverData;
    var textCh = g.channels.filter(function (c) { return c.type === 'text'; });
    var voiceCh = g.channels.filter(function (c) { return c.type === 'voice'; });
    root().innerHTML =
      '<div class="mg-grid">' +
      '<div class="mg-box" data-go="members"><div class="v">' + g.member_count + '</div><div class="l">Members</div></div>' +
      '<div class="mg-box" data-go="channels"><div class="v">' + textCh.length + '</div><div class="l">Text</div></div>' +
      '<div class="mg-box" data-go="channels"><div class="v">' + voiceCh.length + '</div><div class="l">Voice</div></div>' +
      '<div class="mg-box" data-go="roles"><div class="v">' + g.roles.length + '</div><div class="l">Roles</div></div>' +
      '</div>' +
      '<div class="glass-card"><h3>Edit Server Profile</h3>' +
      '<div class="form-group"><label>Server Name</label><input id="ov-name" value="' + esc(g.name) + '"></div>' +
      '<div class="form-group"><label>Description</label><textarea id="ov-desc" rows="3">' + esc(g.description || '') + '</textarea></div>' +
      '<div class="form-group"><label>Server Icon</label><input type="file" id="ov-icon" accept="image/*"><img id="ov-icon-preview" style="max-width:64px;border-radius:50%;margin-top:6px;' + (g.icon_url ? '' : 'display:none;') + '" src="' + esc(g.icon_url || '') + '"></div>' +
      '<div class="form-group"><label>Banner</label><input type="file" id="ov-banner" accept="image/*"><img id="ov-banner-preview" style="max-width:100%;max-height:120px;border-radius:10px;margin-top:6px;' + (g.banner_url ? '' : 'display:none;') + '" src="' + esc(g.banner_url || '') + '"></div>' +
      '<div class="form-group"><label>Invite Splash</label><input type="file" id="ov-splash" accept="image/*"></div>' +
      '<div class="form-group"><label>Verification Level</label><select id="ov-verification">' + [0, 1, 2, 3, 4].map(function (v) {
        return '<option value="' + v + '"' + (g.verification_level === v ? ' selected' : '') + '>' + ['None', 'Low', 'Medium', 'High', 'Highest'][v] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group"><label>Explicit Content Filter</label><select id="ov-explicit">' + [0, 1, 2].map(function (v) {
        return '<option value="' + v + '"' + (g.explicit_content_filter === v ? ' selected' : '') + '>' + ['Disabled', 'Members without roles', 'All members'][v] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group"><label>AFK Channel</label><select id="ov-afk"><option value="">None</option>' + voiceCh.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group"><label>AFK Timeout (seconds)</label><input type="number" id="ov-afk-timeout" value="300"></div>' +
      '<div class="form-group"><label>System Channel</label><select id="ov-system"><option value="">None</option>' + textCh.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
      }).join('') + '</select></div>' +
      '<button class="primary-btn" id="ov-save">Save Changes</button>' +
      '</div>';
    root().querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () {
        Router.go('/server/' + guildId + '/' + b.getAttribute('data-go') + '/');
      };
    });
    el('ov-icon').onchange = function () { previewFile(this, 'ov-icon-preview'); };
    el('ov-banner').onchange = function () { previewFile(this, 'ov-banner-preview'); };
    el('ov-save').onclick = saveOverview;
    gateBtn(el('ov-save'), 'MANAGE_GUILD');
  }

  async function saveOverview() {
    if (!gateClick('MANAGE_GUILD')) return;
    var btn = el('ov-save');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    var params = {
      name: el('ov-name').value,
      description: el('ov-desc').value,
      verification_level: el('ov-verification').value,
      explicit_content_filter: el('ov-explicit').value,
      afk_channel_id: el('ov-afk').value || null,
      afk_timeout: el('ov-afk-timeout').value,
      system_channel_id: el('ov-system').value || null
    };
    var icon = await getFileBase64(el('ov-icon'));
    if (icon) params.icon_b64 = icon;
    var banner = await getFileBase64(el('ov-banner'));
    if (banner) params.banner_b64 = banner;
    var splash = await getFileBase64(el('ov-splash'));
    if (splash) params.splash_b64 = splash;
    emit('server_overview_save', params);
    setTimeout(function () {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
      Session.socket.emit('get_guild_details', { guild_id: guildId });
      Session.socket.emit('run_command', { cmd: 'server_bot_permissions', params: { guild_id: guildId } });
    }, 1200);
  }

  function renderChannels() {
    root().innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
      '<button class="primary-btn" id="mg-open-create-ch">+ Create Channel</button>' +
      '<button class="secondary-btn" id="mg-open-create-cat">+ Create Category</button></div>' +
      '<div class="mg-tree" id="mg-channel-tree"></div>';
    el('mg-open-create-ch').onclick = function () {
      if (!gateClick('MANAGE_CHANNELS')) return;
      el('mg-new-ch-category').innerHTML = categoryOptions('');
      openModal('mg-modal-create-channel');
    };
    el('mg-open-create-cat').onclick = function () {
      if (!gateClick('MANAGE_CHANNELS')) return;
      openModal('mg-modal-create-category');
    };
    gateBtn(el('mg-open-create-ch'), 'MANAGE_CHANNELS');
    gateBtn(el('mg-open-create-cat'), 'MANAGE_CHANNELS');
    emit('guild_structure', {});
  }

  function renderChannelTree(data) {
    lastStructure = data;
    var tree = el('mg-channel-tree');
    if (!tree) return;
    var html = '';
    var chanRow = function (ch) {
      return '<div class="mg-chan" data-channel-id="' + ch.id + '"><span>' + (ch.type === 'voice' ? '~' : '#') + ' ' + esc(ch.name) + '</span></div>';
    };
    (data.categories || []).forEach(function (cat) {
      html += '<div class="mg-cat"><div class="mg-cat-head" data-cat-id="' + cat.id + '"><span>' + esc(cat.name) + '</span><span class="mg-actions"><button class="secondary-btn" data-cat-settings="' + cat.id + '">Settings</button></span></div>';
      (cat.channels || []).forEach(function (ch) { html += chanRow(ch); });
      html += '</div>';
    });
    if (data.uncategorised && data.uncategorised.length) {
      html += '<div class="mg-cat"><div class="mg-cat-head">Uncategorised</div>';
      data.uncategorised.forEach(function (ch) { html += chanRow(ch); });
      html += '</div>';
    }
    if (!html) html = '<div class="empty-state">' + arkIcon('hash', 40) + '<p>No channels found.</p></div>';
    tree.innerHTML = html;
    initDrag();
    tree.querySelectorAll('[data-cat-settings]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        openCategorySettings(b.getAttribute('data-cat-settings'));
      };
    });
    tree.querySelectorAll('.mg-chan').forEach(function (row) {
      row.onclick = function () {
        if (dragState && dragState.moved) return;
        openChannelSettings(row.getAttribute('data-channel-id'));
      };
    });
  }

  function initDrag() {
    var tree = el('mg-channel-tree');
    if (!tree) return;
    tree.querySelectorAll('.mg-chan').forEach(function (item) {
      item.addEventListener('mousedown', function (e) { startDrag(e, item); });
      item.addEventListener('touchstart', function (e) { startDrag(e, item); }, { passive: false });
    });
  }

  function startDrag(e, item) {
    var isTouch = e.type === 'touchstart';
    var startX = isTouch ? e.touches[0].clientX : e.clientX;
    var startY = isTouch ? e.touches[0].clientY : e.clientY;
    var timer = setTimeout(function () {
      var clone = document.createElement('div');
      clone.className = 'mg-drag-clone';
      clone.textContent = item.textContent;
      clone.style.left = startX - 20 + 'px';
      clone.style.top = startY - 10 + 'px';
      document.body.appendChild(clone);
      dragState = { item: item, clone: clone, moved: false };
      item.classList.add('dragging');
    }, 450);
    function onMove(ev) {
      if (!dragState) return;
      if (ev.cancelable) ev.preventDefault();
      var cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      dragState.clone.style.top = cy - 10 + 'px';
      dragState.moved = true;
      var rows = Array.prototype.slice.call(document.querySelectorAll('.mg-chan'));
      rows.forEach(function (r) { r.classList.remove('drop-above', 'drop-below'); });
      var target = findRow(cy, rows);
      if (target && target !== item) {
        var rect = target.getBoundingClientRect();
        if (cy < rect.top + rect.height / 2) target.classList.add('drop-above');
        else target.classList.add('drop-below');
      }
    }
    function onEnd(ev) {
      clearTimeout(timer);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      if (!dragState) return;
      var cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      var rows = Array.prototype.slice.call(document.querySelectorAll('.mg-chan'));
      var target = findRow(cy, rows);
      dragState.clone.remove();
      item.classList.remove('dragging');
      rows.forEach(function (r) { r.classList.remove('drop-above', 'drop-below'); });
      if (target && target !== item) {
        if (!gateClick('MANAGE_CHANNELS')) { dragState = null; return; }
        var newIndex = rows.indexOf(target);
        var currentIndex = rows.indexOf(item);
        var newPos = newIndex > currentIndex ? newIndex - 1 : newIndex;
        emit('channel_move_absolute', { channel_id: item.getAttribute('data-channel-id'), position: newPos });
        setTimeout(function () { emit('guild_structure', {}); }, 500);
      }
      setTimeout(function () { dragState = null; }, 50);
    }
    function cancel(ev) {
      var cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      var cy2 = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (Math.abs(cx - startX) > 20 || Math.abs(cy2 - startY) > 20) clearTimeout(timer);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('mousemove', cancel);
    document.addEventListener('touchmove', cancel, { passive: false });
  }

  function findRow(y, rows) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return rows[i];
    }
    return null;
  }

  function openChannelSettings(channelId) {
    el('mg-ch-id').value = channelId;
    emit('channel_get', { channel_id: channelId });
    openModal('mg-modal-channel');
  }

  function saveChannel() {
    if (!gateClick('MANAGE_CHANNELS')) return;
    var cid = el('mg-ch-id').value;
    emit('channel_edit', {
      channel_id: cid,
      name: el('mg-ch-name').value.trim(),
      topic: el('mg-ch-topic').value.trim(),
      category_id: el('mg-ch-category').value || null,
      slowmode: parseInt(el('mg-ch-slowmode').value, 10) || 0,
      nsfw: switchOn(el('mg-ch-nsfw')),
      private: switchOn(el('mg-ch-private'))
    });
    closeModal('mg-modal-channel');
    setTimeout(function () { emit('guild_structure', {}); }, 500);
  }

  function deleteChannel() {
    if (!gateClick('MANAGE_CHANNELS')) return;
    var cid = el('mg-ch-id').value;
    customConfirm('Delete this channel permanently?').then(function (ok) {
      if (!ok) return;
      emit('channel_delete', { channel_id: cid });
      closeModal('mg-modal-channel');
      setTimeout(function () { emit('guild_structure', {}); }, 500);
    });
  }

  function createChannel() {
    if (!gateClick('MANAGE_CHANNELS')) return;
    emit('channel_create', {
      name: el('mg-new-ch-name').value.trim() || 'new-channel',
      type: el('mg-new-ch-type').value,
      category_id: el('mg-new-ch-category').value || undefined,
      private: switchOn(el('mg-new-ch-private'))
    });
    closeModal('mg-modal-create-channel');
    setTimeout(function () { emit('guild_structure', {}); }, 500);
  }

  function createCategory() {
    if (!gateClick('MANAGE_CHANNELS')) return;
    emit('category_create', {
      name: el('mg-new-cat-name').value.trim() || 'New Category',
      private: switchOn(el('mg-new-cat-private'))
    });
    closeModal('mg-modal-create-category');
    setTimeout(function () { emit('guild_structure', {}); }, 500);
  }

  function openCategorySettings(catId) {
    el('mg-cat-id').value = catId;
    var cat = lastStructure && (lastStructure.categories || []).filter(function (c) { return c.id === catId; })[0];
    if (cat) {
      el('mg-cat-name').value = cat.name;
      el('mg-cat-position').value = cat.position;
    }
    openModal('mg-modal-category');
    emit('category_permissions_get', { category_id: catId });
  }

  function saveCategory() {
    if (!gateClick('MANAGE_CHANNELS')) return;
    emit('category_edit', {
      category_id: el('mg-cat-id').value,
      name: el('mg-cat-name').value.trim(),
      position: parseInt(el('mg-cat-position').value, 10) || 0
    });
    closeModal('mg-modal-category');
    setTimeout(function () { emit('guild_structure', {}); }, 500);
  }

  function deleteCategory() {
    if (!gateClick('MANAGE_CHANNELS')) return;
    var catId = el('mg-cat-id').value;
    customConfirm('Delete this category and all its channels?').then(function (ok) {
      if (!ok) return;
      emit('category_delete', { category_id: catId });
      closeModal('mg-modal-category');
      setTimeout(function () { emit('guild_structure', {}); }, 500);
    });
  }

  function permRows(overwrites) {
    if (!overwrites || !overwrites.length) return '<div class="empty-state">' + arkIcon('shield', 40) + '<p>No custom permissions.</p></div>';
    return overwrites.map(function (ow) {
      return '<div class="mg-list-row"><span>' + esc(ow.name) + ' <span style="color:var(--primary);font-size:0.7rem;">(' + ow.type + ')</span></span>' +
        '<span class="mg-actions"><button class="secondary-btn" data-perm-edit="' + ow.id + '" data-perm-type="' + ow.type + '" data-perm-name="' + esc(ow.name) + '">Edit</button>' +
        '<button class="danger-btn" data-perm-remove="' + ow.id + '" data-perm-type="' + ow.type + '">Remove</button></span></div>';
    }).join('');
  }

  function wirePermButtons(container, isCategory, ownerId) {
    container.querySelectorAll('[data-perm-edit]').forEach(function (b) {
      b.onclick = function () {
        if (!gateClick('MANAGE_ROLES')) return;
        permEditor.open = true;
        permEditor.category = isCategory;
        permEditor.id = ownerId;
        permEditor.target = b.getAttribute('data-perm-edit');
        permEditor.type = b.getAttribute('data-perm-type');
        el('mg-perm-title').textContent = 'Permissions for ' + b.getAttribute('data-perm-name');
        if (isCategory) emit('category_permissions_get', { category_id: ownerId });
        else emit('channel_permissions_get', { channel_id: ownerId });
        openModal('mg-modal-perm-editor');
      };
    });
    container.querySelectorAll('[data-perm-remove]').forEach(function (b) {
      b.onclick = function () {
        if (!gateClick('MANAGE_ROLES')) return;
        var params = {
          target_id: b.getAttribute('data-perm-remove'),
          target_type: b.getAttribute('data-perm-type'),
          permission: 'view_channel',
          action: 'neutral'
        };
        if (isCategory) { params.category_id = ownerId; emit('category_permissions_set', params); }
        else { params.channel_id = ownerId; emit('channel_permissions_set', params); }
        setTimeout(function () {
          if (isCategory) emit('category_permissions_get', { category_id: ownerId });
          else emit('channel_permissions_get', { channel_id: ownerId });
        }, 400);
      };
    });
  }

  function renderPermEditor(overwrites) {
    var ow = (overwrites || []).filter(function (o) { return o.id === permEditor.target; })[0];
    var allowed = ow ? ow.allowed : [];
    var denied = ow ? ow.denied : [];
    var html = '';
    Object.keys(PERM_BITS).forEach(function (perm) {
      var state = 'neutral';
      if (allowed.indexOf(perm) >= 0) state = 'allow';
      if (denied.indexOf(perm) >= 0) state = 'deny';
      html += '<button class="perm-btn ' + state + '" data-perm="' + perm + '">' + perm.replace(/_/g, '_') + '</button>';
    });
    el('mg-perm-list').innerHTML = html;
    el('mg-perm-list').querySelectorAll('.perm-btn').forEach(function (b) {
      b.onclick = function () {
        if (!gateClick('MANAGE_ROLES')) return;
        var cur = b.classList.contains('allow') ? 'allow' : b.classList.contains('deny') ? 'deny' : 'neutral';
        var next = cur === 'neutral' ? 'allow' : cur === 'allow' ? 'deny' : 'neutral';
        var params = {
          target_id: permEditor.target,
          target_type: permEditor.type,
          permission: b.getAttribute('data-perm'),
          action: next
        };
        if (permEditor.category) { params.category_id = permEditor.id; emit('category_permissions_set', params); }
        else { params.channel_id = permEditor.id; emit('channel_permissions_set', params); }
        b.classList.remove('allow', 'deny', 'neutral');
        b.classList.add(next);
      };
    });
  }

  function openPermAdd(kind) {
    el('mg-perm-add-title').textContent = kind === 'role' ? 'Add Role' : 'Add Member';
    el('mg-perm-add-select').innerHTML = '';
    openModal('mg-modal-perm-add');
    if (kind === 'role') emit('server_roles_list', {});
    else emit('server_members_list', {});
  }

  function addPermTarget() {
    if (!gateClick('MANAGE_ROLES')) return;
    var sel = el('mg-perm-add-select');
    var targetId = sel.value;
    if (!targetId) return;
    var targetType = el('mg-perm-add-title').textContent === 'Add Role' ? 'role' : 'member';
    var cid = el('mg-ch-id').value;
    emit('channel_permissions_set', { channel_id: cid, target_id: targetId, target_type: targetType, permission: 'view_channel', action: 'neutral' });
    closeModal('mg-modal-perm-add');
    setTimeout(function () { emit('channel_permissions_get', { channel_id: cid }); }, 400);
  }

  function saveWebhook() {
    if (!gateClick('MANAGE_WEBHOOKS')) return;
    emit('webhook_edit', {
      id: el('mg-wh-id').value,
      name: el('mg-wh-name').value.trim(),
      channel_id: el('mg-wh-channel').value || undefined
    });
    closeModal('mg-modal-webhook');
    setTimeout(function () { emit('channel_webhooks', { channel_id: el('mg-ch-id').value }); }, 500);
  }

  function renderMembers() {
    root().innerHTML =
      '<div style="margin-bottom:12px;"><input id="mg-member-search" placeholder="Search members..." style="margin-bottom:0;"></div>' +
      '<div class="mg-scroll" id="mg-member-list"></div>';
    el('mg-member-search').oninput = function () { paintMembers(this.value); };
    paintMembers('');
  }

  function paintMembers(filter) {
    var box = el('mg-member-list');
    if (!box || !serverData || !serverData.members) return;
    var q = (filter || '').toLowerCase();
    var list = serverData.members.filter(function (m) {
      if (!q) return true;
      return (m.name || '').toLowerCase().indexOf(q) === 0 || (m.username || '').toLowerCase().indexOf(q) === 0;
    });
    box.innerHTML = list.map(function (m) {
      var tr = topRole(m);
      var pill = tr ? '<span class="mg-pill" style="background:#' + (tr.color || 0).toString(16).padStart(6, '0') + ';">' + esc(tr.name) + '</span>' : '';
      return '<div class="mg-member" data-user="' + m.id + '">' +
        '<span class="who">' +
        (m.avatar_url ? '<img src="' + esc(m.avatar_url) + '" loading="lazy">' : '') +
        '<span><strong>' + esc(m.name) + '</strong><br><small style="color:var(--text-muted);">' + esc(m.username || '') + '</small></span></span>' +
        '<span class="mg-mem-acts">' +
        '<span class="mg-dot" style="background:' + statusColor(m.status) + ';"></span>' +
        pill +
        '<button class="secondary-btn mg-more" data-more="' + m.id + '" type="button">more</button>' +
        '</span></div>';
    }).join('') || '<div class="empty-state">' + arkIcon('users', 40) + '<p>No members found.</p></div>';
    box.querySelectorAll('.mg-member').forEach(function (row) {
      row.onclick = function () { openMemberActions(row.getAttribute('data-user')); };
    });
  }

  function openMemberActions(userId) {
    openModal('mg-modal-member');
    el('mg-member-body').innerHTML = '<div class="empty-state"><div class="skeleton" style="width:60%;"></div></div>';
    emit('member_detail', { user_id: userId });
  }

  function paintMemberDetail(d) {
    lastMemberDetail = d;
    if (d.bot_name) botName = d.bot_name;
    var m = (serverData.members || []).filter(function (x) { return x.id === d.user_id; })[0] || {};
    var blocked = d.owner ? 'owner' : (d.above_bot ? 'higher' : null);
    var blockMsg = blocked === 'owner'
      ? (m.name || 'User') + ' is the guild owner, you cannot proceed with this action'
      : (m.name || 'User') + ' has higher role than ' + botName + ', you cannot proceed with this action';
    var html =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
      (m.avatar_url ? '<img src="' + esc(m.avatar_url) + '" style="width:48px;height:48px;border-radius:50%;">' : '') +
      '<div><strong>' + esc(m.name || d.user_id) + '</strong><br><small style="color:var(--primary);">' + esc(m.username || '') + '</small></div></div>' +
      '<div class="form-group"><label>Nickname</label><div style="display:flex;gap:8px;"><input id="mg-nick" value="' + esc(d.nick || '') + '" placeholder="No nickname">' +
      (blocked ? qBtn(blockMsg) : '<button class="secondary-btn" id="mg-nick-save">Save</button>') + '</div></div>' +
      '<div class="form-group"><label>Timeout</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><span id="mg-td-left" class="mg-td-left"></span>';
    if (blocked) html += qBtn(blockMsg);
    else if ((d.timeout_until || 0) > Date.now()) html += '<button class="secondary-btn" id="mg-act-untimeout">Untimeout</button>';
    else html += '<input type="number" id="mg-timeout-secs" value="60" style="width:90px;margin-bottom:0;"><button class="secondary-btn" id="mg-act-timeout">Timeout</button>';
    html += '</div></div>' +
      '<div class="form-group"><label>Roles</label><div id="mg-role-toggles"></div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;">';
    if (blocked) html += qBtn(blockMsg);
    else {
      if (can('KICK_MEMBERS')) html += '<button class="secondary-btn" id="mg-act-kick">Kick</button>';
      else html += qBtn(botName + " doesn't have kick members permission");
      if (can('BAN_MEMBERS')) html += '<button class="danger-btn" id="mg-act-ban">Ban</button>';
      else html += qBtn(botName + " doesn't have ban members permission");
    }
    html += '</div>';
    el('mg-member-body').innerHTML = html;
    paintRoleToggles(d, blocked, blockMsg);
    updateTimeoutLabel();
    clearInterval(memberTimer);
    memberTimer = setInterval(updateTimeoutLabel, 1000);
    var ns = el('mg-nick-save');
    if (ns) ns.onclick = function () { if (!gateClick('MANAGE_NICKNAMES')) return; emit('member_nick', { user_id: d.user_id, nick: el('mg-nick').value }); };
    var to = el('mg-act-timeout');
    if (to) to.onclick = function () { if (!gateClick('MODERATE_MEMBERS')) return; emit('member_timeout', { user_id: d.user_id, duration: parseInt(el('mg-timeout-secs').value, 10) || 60 }); };
    var ut = el('mg-act-untimeout');
    if (ut) ut.onclick = function () { if (!gateClick('MODERATE_MEMBERS')) return; emit('member_timeout', { user_id: d.user_id, duration: 0 }); };
    var kk = el('mg-act-kick');
    if (kk) kk.onclick = function () { if (!gateClick('KICK_MEMBERS')) return; customConfirm('Kick ' + (m.name || '') + '?').then(function (ok) { if (ok) emit('member_kick', { user_id: d.user_id }); }); };
    var bb = el('mg-act-ban');
    if (bb) bb.onclick = function () { if (!gateClick('BAN_MEMBERS')) return; customConfirm('Ban ' + (m.name || '') + '?').then(function (ok) { if (ok) emit('member_ban', { user_id: d.user_id }); }); };
  }

  function paintRoleToggles(d, blocked, blockMsg) {
    var box = el('mg-role-toggles');
    if (!box) return;
    var have = {};
    (d.roles || []).forEach(function (r) { have[r.id] = true; });
    var roles = (serverData.roles || []).slice().sort(function (a, b) { return (b.position || 0) - (a.position || 0); });
    box.innerHTML = roles.map(function (r) {
      if (r.name === '@everyone') return '';
      var locked = !!blocked || (r.position || 0) >= botHighest || r.managed;
      var has = !!have[r.id];
      return '<div class="mg-role-row2' + (locked ? ' locked' : '') + '">' +
        '<span style="color:#' + (r.color || 0).toString(16).padStart(6, '0') + ';">@' + esc(r.name) + '</span>' +
        (locked ? qBtn(blockMsg || (r.name + ' is above ' + botName + ' or managed')) :
          (has ? '<button class="secondary-btn" data-role-remove="' + r.id + '">Remove</button>' : '<button class="secondary-btn" data-role-add="' + r.id + '">Add</button>')) +
        '</div>';
    }).join('');
    box.querySelectorAll('[data-role-add],[data-role-remove]').forEach(function (b) {
      b.onclick = function () {
        if (!gateClick('MANAGE_ROLES')) return;
        var rid = b.getAttribute('data-role-add') || b.getAttribute('data-role-remove');
        emit('member_roles_edit', { user_id: d.user_id, role_id: rid, action: b.hasAttribute('data-role-add') ? 'add' : 'remove' });
      };
    });
  }

  function updateTimeoutLabel() {
    var lab = el('mg-td-left');
    if (!lab || !lastMemberDetail) return;
    var left = (lastMemberDetail.timeout_until || 0) - Date.now();
    if (left > 0) {
      var s = Math.floor(left / 1000);
      var mm = Math.floor(s / 60), ss = s % 60;
      lab.textContent = 'timed out · ' + mm + ':' + (ss < 10 ? '0' : '') + ss + ' left';
    } else lab.textContent = '';
  }

  function renderRoles() {
    if (!serverData) {
      root().innerHTML = '<div class="glass-card"><div class="empty-state"><div class="skeleton" style="width:60%;"></div></div></div>';
      return;
    }
    var html = '<div class="glass-card"><h3>Roles</h3><button class="primary-btn" id="mg-role-create" style="margin-bottom:12px;">Create Role</button>';
    serverData.roles.forEach(function (r) {
      html += '<div class="mg-role-row"><span style="color:#' + r.color.toString(16).padStart(6, '0') + ';">@' + esc(r.name) + '</span>' +
        '<span class="mg-actions"><button class="secondary-btn" data-role-edit="' + r.id + '">Edit</button><button class="danger-btn" data-role-delete="' + r.id + '">Delete</button></span></div>';
    });
    html += '</div>';
    root().innerHTML = html;
    el('mg-role-create').onclick = function () {
      if (!gateClick('MANAGE_ROLES')) return;
      customPrompt('Role name:').then(function (name) {
        if (!name) return;
        emit('server_roles_create', { name: name, color: 0, hoist: false, mentionable: false });
        setTimeout(function () { Session.socket.emit('get_guild_details', { guild_id: guildId }); }, 600);
      });
    };
    gateBtn(el('mg-role-create'), 'MANAGE_ROLES');
    root().querySelectorAll('[data-role-edit]').forEach(function (b) {
      b.onclick = function () { openRoleEditor(b.getAttribute('data-role-edit')); };
    });
    root().querySelectorAll('[data-role-delete]').forEach(function (b) {
      b.onclick = function () {
        if (!gateClick('MANAGE_ROLES')) return;
        customConfirm('Delete this role?').then(function (ok) {
          if (!ok) return;
          emit('server_roles_delete', { id: b.getAttribute('data-role-delete') });
          setTimeout(function () { Session.socket.emit('get_guild_details', { guild_id: guildId }); }, 600);
        });
      };
    });
  }

  function openRoleEditor(roleId) {
    var role = (serverData.roles || []).filter(function (r) { return r.id === roleId; })[0];
    if (!role) return;
    el('mg-role-id').value = role.id;
    el('mg-role-name').value = role.name;
    el('mg-role-color').value = '#' + role.color.toString(16).padStart(6, '0');
    el('mg-role-member-list').innerHTML = '';
    var html = '';
    Object.keys(PERM_BITS).forEach(function (perm) {
      var bit = 1n << BigInt(PERM_BITS[perm]);
      var on = (BigInt(role.permissions) & bit) === bit;
      html += '<button class="perm-btn ' + (on ? 'allow' : 'neutral') + '" data-perm="' + perm + '">' + perm.replace(/_/g, '_') + '</button>';
    });
    el('mg-role-perms').innerHTML = html;
    el('mg-role-perms').querySelectorAll('.perm-btn').forEach(function (b) {
      b.onclick = function () {
        if (b.classList.contains('allow')) { b.classList.remove('allow'); b.classList.add('deny'); }
        else if (b.classList.contains('deny')) { b.classList.remove('deny'); b.classList.add('neutral'); }
        else { b.classList.remove('neutral'); b.classList.add('allow'); }
      };
    });
    openModal('mg-modal-role');
  }

  function saveRole() {
    if (!gateClick('MANAGE_ROLES')) return;
    var perms = 0n;
    el('mg-role-perms').querySelectorAll('.perm-btn.allow').forEach(function (b) {
      var bit = PERM_BITS[b.getAttribute('data-perm')];
      if (bit !== undefined) perms |= (1n << BigInt(bit));
    });
    emit('server_roles_edit', {
      id: el('mg-role-id').value,
      name: el('mg-role-name').value,
      color: parseInt(el('mg-role-color').value.slice(1), 16),
      permissions: perms.toString()
    });
    closeModal('mg-modal-role');
    setTimeout(function () { Session.socket.emit('get_guild_details', { guild_id: guildId }); }, 600);
  }

  function deleteRoleFromModal() {
    if (!gateClick('MANAGE_ROLES')) return;
    var id = el('mg-role-id').value;
    customConfirm('Delete this role?').then(function (ok) {
      if (!ok) return;
      emit('server_roles_delete', { id: id });
      closeModal('mg-modal-role');
      setTimeout(function () { Session.socket.emit('get_guild_details', { guild_id: guildId }); }, 600);
    });
  }

  function renderBans() {
    if (!can('BAN_MEMBERS')) { root().innerHTML = permNotice('BAN_MEMBERS'); return; }
    root().innerHTML = '<div class="mg-scroll" id="mg-ban-list"><div class="empty-state"><div class="skeleton" style="width:60%;"></div></div></div>';
    emit('server_bans_list', {});
  }

  function renderAudit() {
    if (!can('VIEW_AUDIT_LOG')) { root().innerHTML = permNotice('VIEW_AUDIT_LOG'); return; }
    root().innerHTML = '<div class="mg-log" id="mg-audit-list">Loading…</div>';
    emit('server_audit_log', {});
  }

  function renderExpressions() {
    root().innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:12px;"><button class="primary-btn" id="mg-add-emoji">Add Emoji</button><button class="secondary-btn" id="mg-add-sticker">Add Sticker</button></div>' +
      '<div class="glass-card"><h3>Emojis</h3><div class="mg-expr" id="mg-emoji-grid"></div></div>' +
      '<div class="glass-card"><h3>Stickers</h3><div class="mg-expr" id="mg-sticker-grid"></div></div>';
    el('mg-add-emoji').onclick = function () { pickAndUpload('emoji'); };
    el('mg-add-sticker').onclick = function () { pickAndUpload('sticker'); };
    gateBtn(el('mg-add-emoji'), 'MANAGE_EMOJIS_AND_STICKERS');
    gateBtn(el('mg-add-sticker'), 'MANAGE_EMOJIS_AND_STICKERS');
    emit('server_expression_list', {});
    emit('server_sticker_list', {});
  }

  function pickAndUpload(kind) {
    if (!gateClick('MANAGE_EMOJIS_AND_STICKERS')) return;
    customPrompt(kind === 'emoji' ? 'Emoji name:' : 'Sticker name:').then(function (name) {
      if (!name) return;
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async function () {
        var file = input.files[0];
        if (!file) return;
        var b64 = await getFileBase64({ files: [file] });
        if (!b64) return;
        if (kind === 'emoji') emit('emoji_upload', { name: name, image: b64 });
        else emit('sticker_upload', { name: name, description: '', emoji: '', image: b64 });
        setTimeout(function () {
          emit('server_expression_list', {});
          emit('server_sticker_list', {});
        }, 900);
      };
      input.click();
    });
  }

  function renderInvites() {
    if (!can('MANAGE_GUILD')) { root().innerHTML = permNotice('MANAGE_GUILD'); return; }
    root().innerHTML =
      '<div style="margin-bottom:12px;"><button class="primary-btn" id="mg-invite-create">Generate Invite</button></div>' +
      '<div class="mg-scroll" id="mg-invite-list"><div class="empty-state"><div class="skeleton" style="width:60%;"></div></div></div>';
    el('mg-invite-create').onclick = function () {
      var ch = serverData && serverData.channels.filter(function (c) { return c.type === 'text'; })[0];
      if (!ch) { toast('No text channel found'); return; }
      emit('invite_create', { channel_id: ch.id, max_uses: 0, max_age: 0, temporary: false });
      setTimeout(function () { emit('server_invites_list', {}); }, 900);
    };
    emit('server_invites_list', {});
  }

  function enterByKey(key) {
    currentKey = key;
    if (key === 'overview') renderOverview();
    else if (key === 'channels') renderChannels();
    else if (key === 'members') renderMembers();
    else if (key === 'roles') renderRoles();
    else if (key === 'bans') renderBans();
    else if (key === 'audit') renderAudit();
    else if (key === 'expressions') renderExpressions();
    else if (key === 'invites') renderInvites();
  }

  function enter(key, params) {
    guildId = params.gid;
    State.set('session.mgmtLastGuild', guildId);
    serverData = null;
    State.set('session.perGuild.' + guildId + '.page', key);
    Shell.setTitle(LABELS[key]);
    Shell.setActions('<button class="header-btn" id="mg-refresh" title="Refresh">' + arkIcon('refresh', 16) + '</button>');
    el('mg-refresh').onclick = function () {
      Session.socket.emit('get_guild_details', { guild_id: guildId });
      if (currentKey === 'channels') emit('guild_structure', {});
      enterByKey(currentKey);
    };
    Session.socket.emit('get_guild_details', { guild_id: guildId });
    Session.socket.emit('run_command', { cmd: 'server_bot_permissions', params: { guild_id: guildId } });
    enterByKey(key);
    setTimeout(function () { syncRailActive(key); }, 0);
  }

  var wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    Session.on('guild_details', function (d) {
      if (!guildId || d.id !== guildId) return;
      serverData = d;
      if (currentKey === 'overview' || currentKey === 'members' || currentKey === 'roles' || currentKey === 'invites') enterByKey(currentKey);
    });
    Session.on('server_bot_permissions', function (d) {
      botPerms = d.permissions || [];
      botName = d.bot_name || 'Bot';
      botHighest = d.highest_role_position || 0;
      if (currentKey) enterByKey(currentKey);
      if (el('mg-modal-member') && el('mg-modal-member').classList.contains('show') && lastMemberDetail) paintMemberDetail(lastMemberDetail);
    });
    Session.on('member_detail', function (d) {
      if (el('mg-modal-member') && el('mg-modal-member').classList.contains('show')) paintMemberDetail(d);
    });
    Session.on('member_detail_refresh', function (d) { emit('member_detail', { user_id: d.user_id }); });
    Session.on('guild_structure', function (d) {
      lastStructure = d;
      if (currentKey === 'channels') renderChannelTree(d);
      var sel = el('mg-ch-category');
      if (sel && el('mg-modal-channel').classList.contains('show')) sel.innerHTML = categoryOptions(sel.value);
    });
    Session.on('channel_info', function (d) {
      el('mg-ch-name').value = d.name || '';
      el('mg-ch-topic').value = d.topic || '';
      el('mg-ch-slowmode').value = d.slowmode || 0;
      el('mg-ch-nsfw').classList.toggle('active', !!d.nsfw);
      el('mg-ch-private').classList.toggle('active', !!d.private);
      el('mg-ch-category').innerHTML = categoryOptions(d.category_id);
    });
    Session.on('channel_permissions', function (d) {
      if (permEditor.open && !permEditor.category) { renderPermEditor(d.overwrites); return; }
      var box = el('mg-ch-perms');
      if (!box) return;
      box.innerHTML = permRows(d.overwrites);
      wirePermButtons(box, false, d.channel_id);
    });
    Session.on('category_permissions', function (d) {
      if (permEditor.open && permEditor.category) { renderPermEditor(d.overwrites); return; }
      var box = el('mg-cat-perms');
      if (!box) return;
      el('mg-cat-perms-wrap').style.display = 'block';
      box.innerHTML = permRows(d.overwrites);
      wirePermButtons(box, true, d.category_id);
    });
    Session.on('channel_webhooks', function (d) {
      var box = el('mg-ch-webhooks');
      if (!box) return;
      box.innerHTML = (d.webhooks || []).map(function (wh) {
        return '<div class="mg-list-row"><span><strong>' + esc(wh.name) + '</strong></span><span class="mg-actions">' +
          '<button class="secondary-btn" data-wh-copy="' + esc(wh.url) + '">Copy URL</button>' +
          '<button class="secondary-btn" data-wh-edit="' + wh.id + '" data-wh-name="' + esc(wh.name) + '">Edit</button>' +
          '<button class="danger-btn" data-wh-delete="' + wh.id + '">Delete</button></span></div>';
      }).join('') || '<div class="empty-state">' + arkIcon('link', 40) + '<p>No webhooks.</p></div>';
      box.querySelectorAll('[data-wh-copy]').forEach(function (b) {
        b.onclick = function () { copyToClipboard(b.getAttribute('data-wh-copy')); };
      });
      box.querySelectorAll('[data-wh-edit]').forEach(function (b) {
        b.onclick = function () {
          el('mg-wh-id').value = b.getAttribute('data-wh-edit');
          el('mg-wh-name').value = b.getAttribute('data-wh-name');
          var html = '<option value="">Same Channel</option>';
          if (lastStructure) {
            (lastStructure.categories || []).forEach(function (c) {
              (c.channels || []).forEach(function (ch) { html += '<option value="' + ch.id + '">' + esc(ch.name) + '</option>'; });
            });
            (lastStructure.uncategorised || []).forEach(function (ch) { html += '<option value="' + ch.id + '">' + esc(ch.name) + '</option>'; });
          }
          el('mg-wh-channel').innerHTML = html;
          openModal('mg-modal-webhook');
        };
      });
      box.querySelectorAll('[data-wh-delete]').forEach(function (b) {
        b.onclick = function () {
          if (!gateClick('MANAGE_WEBHOOKS')) return;
          customConfirm('Delete this webhook?').then(function (ok) {
            if (!ok) return;
            emit('webhook_delete', { id: b.getAttribute('data-wh-delete') });
            setTimeout(function () { emit('channel_webhooks', { channel_id: el('mg-ch-id').value }); }, 500);
          });
        };
      });
    });
    Session.on('channel_pins', function (d) {
      var box = el('mg-ch-pins');
      if (!box) return;
      box.innerHTML = (d.pins || []).map(function (p) {
        return '<div class="mg-list-row"><span>' + esc(p.author) + ': ' + esc(p.content) + '</span><span class="mg-actions"><button class="secondary-btn" data-unpin="' + p.id + '">Unpin</button></span></div>';
      }).join('') || '<div class="empty-state">' + arkIcon('down', 40) + '<p>No pinned messages.</p></div>';
      box.querySelectorAll('[data-unpin]').forEach(function (b) {
        b.onclick = function () {
          if (!gateClick('MANAGE_MESSAGES')) return;
          emit('channel_unpin', { channel_id: el('mg-ch-id').value, message_id: b.getAttribute('data-unpin') });
          setTimeout(function () { emit('channel_pins', { channel_id: el('mg-ch-id').value }); }, 500);
        };
      });
    });
    Session.on('channel_invites', function (d) {
      var box = el('mg-ch-invites');
      if (!box) return;
      box.innerHTML = (d.invites || []).map(function (inv) {
        return '<div class="mg-list-row"><span>' + esc(inv.url) + ' (' + inv.uses + '/' + (inv.max_uses || '∞') + ')</span><span class="mg-actions">' +
          '<button class="secondary-btn" data-inv-copy="' + esc(inv.url) + '">Copy</button>' +
          '<button class="danger-btn" data-inv-revoke="' + esc(inv.code) + '">Revoke</button></span></div>';
      }).join('') || '<div class="empty-state">' + arkIcon('link', 40) + '<p>No active invites.</p></div>';
      box.querySelectorAll('[data-inv-copy]').forEach(function (b) {
        b.onclick = function () { copyToClipboard(b.getAttribute('data-inv-copy')); };
      });
      box.querySelectorAll('[data-inv-revoke]').forEach(function (b) {
        b.onclick = function () {
          if (!gateClick('MANAGE_GUILD')) return;
          customConfirm('Revoke this invite?').then(function (ok) {
            if (!ok) return;
            emit('channel_invite_revoke', { code: b.getAttribute('data-inv-revoke') });
            setTimeout(function () { emit('channel_invites', { channel_id: el('mg-ch-id').value }); }, 500);
          });
        };
      });
    });
    Session.on('server_bans', function (d) {
      var box = el('mg-ban-list');
      if (!box) return;
      box.innerHTML = (d.bans || []).map(function (b) {
        return '<div class="mg-list-row"><span style="display:flex;align-items:center;gap:8px;">' +
          (b.avatar_url ? '<img src="' + esc(b.avatar_url) + '" style="width:32px;height:32px;border-radius:50%;" loading="lazy">' : '') +
          '<span><strong>' + esc(b.user_name) + '</strong><br><small>' + esc(b.reason || 'No reason') + '</small></span></span>' +
          '<span class="mg-actions"><button class="secondary-btn" data-unban="' + b.user_id + '">Unban</button></span></div>';
      }).join('') || '<div class="empty-state">' + arkIcon('ban', 40) + '<p>No banned users.</p></div>';
      box.querySelectorAll('[data-unban]').forEach(function (b) {
        b.onclick = function () {
          if (!gateClick('BAN_MEMBERS')) return;
          customConfirm('Unban this user?').then(function (ok) {
            if (!ok) return;
            emit('member_unban', { user_id: b.getAttribute('data-unban') });
            setTimeout(function () { emit('server_bans_list', {}); }, 500);
          });
        };
      });
    });
    Session.on('server_audit_log', function (d) {
      var box = el('mg-audit-list');
      if (!box) return;
      box.textContent = (d.entries || []).map(function (e) {
        return '[' + e.created_at + '] ' + e.action + ' | by ' + e.user + ' | target ' + e.target + (e.reason ? ' | reason ' + e.reason : '');
      }).join('\n') || 'No audit entries found.';
    });
    Session.on('server_expression_data', function (d) {
      var grid = el('mg-emoji-grid');
      if (!grid) return;
      grid.innerHTML = (d.emojis || []).map(function (e) {
        return '<div class="expression-chip" data-emoji-del="' + e.id + '" data-emoji-name="' + esc(e.name) + '"><img src="' + esc(e.url) + '" style="width:24px;height:24px;" loading="lazy"><span>:' + esc(e.name) + ':</span></div>';
      }).join('') || '<div class="empty-state" style="width:100%;">' + arkIcon('smile', 40) + '<p>No emojis.</p></div>';
      grid.querySelectorAll('[data-emoji-del]').forEach(function (chip) {
        chip.onclick = function () {
          pendingEmoji = { id: chip.getAttribute('data-emoji-del'), name: chip.getAttribute('data-emoji-name'), url: chip.querySelector('img').src };
          el('mg-em-preview').src = pendingEmoji.url;
          el('mg-em-name').value = pendingEmoji.name;
          openModal('mg-modal-emoji');
        };
      });
    });
    Session.on('server_sticker_data', function (d) {
      var grid = el('mg-sticker-grid');
      if (!grid) return;
      grid.innerHTML = (d.stickers || []).map(function (s) {
        return '<div class="expression-chip" data-sticker-del="' + s.id + '"><img src="' + esc(s.url) + '" style="width:48px;height:48px;object-fit:contain;" loading="lazy"><span>' + esc(s.name) + '</span></div>';
      }).join('') || '<div class="empty-state" style="width:100%;">' + arkIcon('file', 40) + '<p>No stickers.</p></div>';
      grid.querySelectorAll('[data-sticker-del]').forEach(function (chip) {
        chip.onclick = function () {
          if (!gateClick('MANAGE_EMOJIS_AND_STICKERS')) return;
          customConfirm('Delete this sticker?').then(function (ok) {
            if (!ok) return;
            emit('sticker_delete', { sticker_id: chip.getAttribute('data-sticker-del') });
            setTimeout(function () { emit('server_sticker_list', {}); }, 500);
          });
        };
      });
    });
    Session.on('server_invites', function (d) {
      var box = el('mg-invite-list');
      if (!box) return;
      box.innerHTML = (d.invites || []).map(function (inv) {
        return '<div class="mg-list-row"><span><strong>' + esc(inv.url) + '</strong><br><small>Created by ' + esc(inv.inviter) + ' in #' + esc(inv.channel) + ' | Uses: ' + inv.uses + '/' + (inv.max_uses || '∞') + '</small></span>' +
          '<span class="mg-actions"><button class="secondary-btn" data-sinv-copy="' + esc(inv.url) + '">Copy</button><button class="danger-btn" data-sinv-revoke="' + esc(inv.code) + '">Revoke</button></span></div>';
      }).join('') || '<div class="empty-state">' + arkIcon('link', 40) + '<p>No active invites.</p></div>';
      box.querySelectorAll('[data-sinv-copy]').forEach(function (b) {
        b.onclick = function () { copyToClipboard(b.getAttribute('data-sinv-copy')); };
      });
      box.querySelectorAll('[data-sinv-revoke]').forEach(function (b) {
        b.onclick = function () {
          if (!gateClick('MANAGE_GUILD')) return;
          customConfirm('Revoke this invite?').then(function (ok) {
            if (!ok) return;
            emit('invite_revoke', { code: b.getAttribute('data-sinv-revoke') });
            setTimeout(function () { emit('server_invites_list', {}); }, 500);
          });
        };
      });
    });
    Session.on('server_roles_data', function (d) {
      var sel = el('mg-perm-add-select');
      if (!sel || el('mg-perm-add-title').textContent !== 'Add Role') return;
      sel.innerHTML = (d.roles || []).filter(function (r) { return r.name !== '@everyone'; }).map(function (r) {
        return '<option value="' + r.id + '">' + esc(r.name) + '</option>';
      }).join('');
    });
    Session.on('server_members_list', function (d) {
      var sel = el('mg-perm-add-select');
      if (!sel || el('mg-perm-add-title').textContent !== 'Add Member') return;
      sel.innerHTML = (d.members || []).map(function (m) {
        return '<option value="' + m.id + '">' + esc(m.name) + ' (' + esc(m.username) + ')</option>';
      }).join('');
    });
    Session.on('role_members', function (d) {
      var box = el('mg-role-member-list');
      if (!box) return;
      box.innerHTML = (d.members || []).map(function (m) {
        return '<div style="padding:4px 0;border-bottom:1px solid var(--glass-border);"><strong>' + esc(m.name) + '</strong> <span style="color:var(--text-muted);">(' + esc(m.username) + ')</span></div>';
      }).join('') || '<div class="empty-state">' + arkIcon('users', 40) + '<p>No members have this role.</p></div>';
    });
  }

  ensureModals();
  wire();
  KEYS.forEach(function (key) {
    Router.add('/server/:gid/' + key, function (params) {
      enter(key, params);
    }, {
      guard: 'auth',
      css: ['management.css'],
      onExit: function () { currentKey = null; }
    });
    Router.add('/' + key, function () {
      var g = lastGuildId();
      Router.replace(g ? '/server/' + g + '/' + key + '/' : '/servers/');
    }, { guard: 'auth' });
    Shell.registerNav({
      page: key,
      label: LABELS[key],
      icon: NICONS[key],
      ac: '#8a92ff',
      dock: false,
      ctx: 'server',
      group: 'management'
    });
  });
  Router.add('/server/:gid/', function (params) {
    var mem = State.get('session.perGuild.' + params.gid, null);
    var page = mem && mem.page && KEYS.indexOf(mem.page) >= 0 ? mem.page : 'chat';
    Router.replace('/server/' + params.gid + '/' + page + '/');
  }, { guard: 'auth' });
})();