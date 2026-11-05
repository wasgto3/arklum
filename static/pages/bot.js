(function () {
  var wired = false;
  var rpcFocus = null;
  var rpcRotTexts = [];
  var rpcTimer = null;
  var invitePerms = 0n;
  var INVITE_PERMS = [
    ['Administrator', 3], ['Manage Server', 5], ['Manage Roles', 28], ['Manage Channels', 16],
    ['Kick Members', 1], ['Ban Members', 2], ['Create Invite', 0], ['Manage Webhooks', 29],
    ['Read Messages', 10], ['Send Messages', 11], ['Manage Messages', 13], ['Embed Links', 14],
    ['Attach Files', 15], ['Read Message History', 17], ['Mention Everyone', 18],
    ['Use External Emojis', 19], ['Connect', 20], ['Speak', 21], ['Mute Members', 22],
    ['Deafen Members', 23], ['Move Members', 24], ['Use Voice Activity', 25],
    ['Priority Speaker', 32], ['Stream', 33]
  ];
  var PLACEHOLDERS = ['{server}', '{server_count}', '{users}', '{members}', '{channels}', '{online}', '{bot_name}'];
  function call(cmd, params) {
    return Session.call(cmd, params || {});
  }
  function el(id) {
    return document.getElementById(id);
  }
  function guilds() {
    return Session.guilds || [];
  }
  function guildSelect(id, selected) {
    var html = '<select id="' + id + '"><option value="">Select server</option>';
    guilds().forEach(function (g) {
      html += '<option value="' + g.id + '"' + (g.id === selected ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    });
    return html + '</select>';
  }
  function resolvePh(text) {
    var g = guilds()[0];
    return String(text || '').replace(/\{(\w+)\}/g, function (m) {
      if (!g) return '?';
      if (m === '{server}') return g.name;
      if (m === '{server_count}') return String(guilds().length);
      if (m === '{users}') return String(guilds().reduce(function (s, x) { return s + (x.member_count || 0); }, 0));
      if (m === '{members}') return String(g.member_count || 0);
      if (m === '{channels}') return '?';
      if (m === '{online}') return String(g.presence_count || 0);
      if (m === '{bot_name}') return Session.bot ? Session.bot.name : 'Bot';
      return m;
    });
  }
  function renderIdentity() {
    Shell.setTitle('Bot Identity');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="bot-grid">' +
      '<div class="glass-card"><h3>Global Identity</h3>' +
      '<div style="display:flex;gap:12px;align-items:center;">' +
      '<div class="bot-avwrap"><img id="bi-g-av" alt="" style="display:none;"></div>' +
      '<div style="flex:1;"><label>Avatar</label><input type="file" id="bi-g-av-file" accept="image/*" style="margin-bottom:4px;">' +
      '<label>Banner</label><input type="file" id="bi-g-banner-file" accept="image/*" style="margin-bottom:0;"></div></div>' +
      '<img id="bi-g-banner" class="bot-banner" alt="" style="display:none;">' +
      '<div class="form-group"><label>Bio</label><textarea id="bi-g-bio" rows="2"></textarea></div>' +
      '<button class="primary-btn" id="bi-g-save">Save global identity</button></div>' +
      '<div class="glass-card"><h3>Per-Server Profile</h3>' +
      '<div class="form-group"><label>Server</label>' + guildSelect('bi-s-guild', '') + '</div>' +
      '<div style="display:flex;gap:12px;align-items:center;">' +
      '<div class="bot-avwrap"><img id="bi-s-av" alt="" style="display:none;"></div>' +
      '<div style="flex:1;"><label>Avatar</label><input type="file" id="bi-s-av-file" accept="image/*" style="margin-bottom:4px;">' +
      '<label>Banner</label><input type="file" id="bi-s-banner-file" accept="image/*" style="margin-bottom:0;"></div></div>' +
      '<img id="bi-s-banner" class="bot-banner" alt="" style="display:none;">' +
      '<div class="form-group"><label>Nickname</label><input id="bi-s-nick"></div>' +
      '<div class="form-group"><label>Bio</label><textarea id="bi-s-bio" rows="2"></textarea></div>' +
      '<div style="display:flex;gap:8px;"><button class="primary-btn" id="bi-s-save">Save server profile</button>' +
      '<button class="secondary-btn" id="bi-s-clear">Remove avatar</button></div></div></div>';
    el('bi-g-av-file').onchange = function () { previewFile(this, 'bi-g-av'); };
    el('bi-g-banner-file').onchange = function () { previewFile(this, 'bi-g-banner'); };
    el('bi-s-av-file').onchange = function () { previewFile(this, 'bi-s-av'); };
    el('bi-s-banner-file').onchange = function () { previewFile(this, 'bi-s-banner'); };
    el('bi-s-guild').onchange = function () {
      if (this.value) call('bot_server_profile_get', { guild_id: this.value });
    };
    el('bi-g-save').onclick = async function () {
      var params = { bio: el('bi-g-bio').value };
      var av = await getFileBase64(el('bi-g-av-file'));
      if (av) params.avatar = av;
      var bn = await getFileBase64(el('bi-g-banner-file'));
      if (bn) params.banner = bn;
      call('bot_profile_save', params);
    };
    el('bi-s-save').onclick = async function () {
      var gid = el('bi-s-guild').value;
      if (!gid) return;
      var params = { guild_id: gid, nickname: el('bi-s-nick').value, bio: el('bi-s-bio').value };
      var av = await getFileBase64(el('bi-s-av-file'));
      if (av) params.avatar = av;
      var bn = await getFileBase64(el('bi-s-banner-file'));
      if (bn) params.banner = bn;
      call('bot_server_profile_save', params);
    };
    el('bi-s-clear').onclick = function () {
      var gid = el('bi-s-guild').value;
      if (!gid) return;
      call('bot_server_profile_save', { guild_id: gid, avatar: null });
    };
    call('bot_profile_get', {});
  }
  function rpcVerb(type) {
    if (type === 'listening') return 'Listening to';
    if (type === 'watching') return 'Watching';
    if (type === 'streaming') return 'Streaming';
    if (type === 'competing') return 'Competing in';
    return 'Playing';
  }
  function rpcElapsed(startStr) {
    var s = parseInt(startStr, 10);
    if (!s) return '';
    var ms = s < 1e12 ? s * 1000 : s;
    var diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    var h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), ss = diff % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? (h + ':' + pad(m) + ':' + pad(ss)) : (m + ':' + pad(ss) + ' elapsed');
  }
  function rpcAssetUrl(key) {
    if (!key) return '';
    if (/^https?:\/\//.test(key)) return key;
    return 'https://cdn.discordapp.com/app-assets/0/' + encodeURIComponent(key) + '.png';
  }
  function ensureRpcStyle() {
    if (document.getElementById('rpc-style')) return;
    var s = document.createElement('style');
    s.id = 'rpc-style';
    s.textContent =
      '.pv-profile{background:#232428;border-radius:12px;overflow:hidden;max-width:420px;box-shadow:0 8px 24px rgba(0,0,0,.35);margin-top:10px;}' +
      '.pv-banner{height:60px;background:#000;}' +
      '.pv-top{padding:0 16px;margin-top:-26px;}' +
      '.pv-avatar{width:64px;height:64px;border-radius:50%;background:#232428;border:4px solid #232428;position:relative;}' +
      '.pv-avatar img,.pv-avatar span{width:100%;height:100%;border-radius:50%;object-fit:cover;display:flex;align-items:center;justify-content:center;background:#3a3b40;color:#fff;font:700 24px var(--font);}' +
      '.pv-dot{position:absolute;right:-2px;bottom:-2px;width:16px;height:16px;border-radius:50%;background:#23a55a;border:3px solid #232428;}' +
      '.pv-idline{padding:8px 16px 0;display:flex;align-items:center;gap:8px;}' +
      '.pv-name{font:800 20px var(--font);color:#f2f3f5;}' +
      '.pv-app{background:#5865f2;color:#fff;font:700 10px var(--font);padding:2px 6px;border-radius:4px;}' +
      '.pv-sub{padding:0 16px 4px;color:#b5bac1;font:400 14px var(--font);}' +
      '.pv-custom{padding:0 16px 8px;color:#dbdee1;font:400 13px var(--font);}' +
      '.pv-activity{margin:8px 16px 16px;background:#1e1f22;border-radius:8px;padding:12px;}' +
      '.pv-head{color:#b5bac1;font:400 13px var(--font);margin-bottom:8px;}' +
      '.pv-body{display:flex;gap:12px;}' +
      '.pv-assets{position:relative;flex-shrink:0;}' +
      '.pv-large{width:80px;height:80px;border-radius:8px;object-fit:cover;background:#3a3b40;display:block;}' +
      '.pv-small{position:absolute;right:-6px;bottom:-6px;width:28px;height:28px;border-radius:50%;border:3px solid #1e1f22;object-fit:cover;background:#3a3b40;}' +
      '.pv-text{min-width:0;}' +
      '.pv-aname{color:#f2f3f5;font:700 15px var(--font);margin-bottom:2px;}' +
      '.pv-line{color:#dbdee1;font:400 13px var(--font);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.pv-time{color:#949ba4;}' +
      '.pv-dim{color:#949ba4;font-style:italic;}';
    document.head.appendChild(s);
  }
  function updateRpcPreview() {
    var box = el('rpc-preview');
    if (!box) return;
    ensureRpcStyle();
    var g = function (id) { var n = el(id); return n ? n.value : ''; };
    var type = g('rpc-type') || 'playing';
    var name = resolvePh(g('rpc-name'));
    var state = resolvePh(g('rpc-state'));
    var details = resolvePh(g('rpc-details'));
    var largeKey = g('rpc-large-image');
    var largeText = resolvePh(g('rpc-large-text'));
    var smallKey = g('rpc-small-image');
    var smallText = resolvePh(g('rpc-small-text'));
    var party = g('rpc-party-size');
    var elapsed = rpcElapsed(g('rpc-start'));
    var bot = (window.Session && Session.bot) || null;
    var custom = (rpcRotTexts && rpcRotTexts.length) ? resolvePh(rpcRotTexts[0]) : '';
    var hasAssets = largeKey || smallKey;
    box.innerHTML =
      '<div class="pv-profile">' +
      '<div class="pv-banner"></div>' +
      '<div class="pv-top"><div class="pv-avatar">' +
      (bot && bot.avatar_url ? '<img src="' + esc(bot.avatar_url) + '">' : '<span>' + esc(((bot && bot.name) || 'B').charAt(0)) + '</span>') +
      '<i class="pv-dot"></i></div></div>' +
      '<div class="pv-idline"><span class="pv-name">' + esc((bot && bot.name) || 'Bot') + '</span><span class="pv-app">APP</span></div>' +
      '<div class="pv-sub">' + esc((bot && bot.name) || 'bot') + '#' + esc((bot && bot.discriminator) || '0000') + '</div>' +
      (custom ? '<div class="pv-custom">' + esc(custom) + '</div>' : '') +
      '<div class="pv-activity"><div class="pv-head">' + esc(rpcVerb(type)) + '</div><div class="pv-body">' +
      (hasAssets ? '<div class="pv-assets">' +
        (largeKey ? '<img class="pv-large" src="' + esc(rpcAssetUrl(largeKey)) + '" onerror="this.style.visibility=\'hidden\'">' : '<div class="pv-large"></div>') +
        (smallKey ? '<img class="pv-small" src="' + esc(rpcAssetUrl(smallKey)) + '" onerror="this.style.visibility=\'hidden\'">' : '') +
        '</div>' : '') +
      '<div class="pv-text">' +
      (name ? '<div class="pv-aname">' + esc(name) + '</div>' : '') +
      (details ? '<div class="pv-line">' + esc(details) + '</div>' : '') +
      (state ? '<div class="pv-line">' + esc(state) + '</div>' : '') +
      (party ? '<div class="pv-line">' + esc(party) + '</div>' : '') +
      (elapsed ? '<div class="pv-line pv-time" id="rpc-time">' + esc(elapsed) + '</div>' : '') +
      ((largeText || smallText) ? '<div class="pv-line pv-dim">' + esc(smallText || largeText) + '</div>' : '') +
      '</div></div></div></div>';
  }
  function renderPresence() {
    Shell.setTitle('Presence');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="bot-grid">' +
      '<div class="glass-card"><h3>Online Presence</h3><div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="primary-btn" data-presence="online" style="background:var(--success);">Online</button>' +
      '<button class="primary-btn" data-presence="idle" style="background:var(--warning);color:#000;">Idle</button>' +
      '<button class="primary-btn" data-presence="dnd" style="background:var(--danger);">Do Not Disturb</button>' +
      '<button class="secondary-btn" data-presence="invisible">Invisible</button></div></div>' +
      '<div class="glass-card"><h3>Custom Status Rotation</h3>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;"><input id="rot-text" placeholder="New status text..." style="margin-bottom:0;">' +
      '<button class="primary-btn" id="rot-add">Add</button></div>' +
      '<div id="rot-list" class="muted">Loading...</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;"><label style="margin:0;">Interval</label>' +
      '<input type="number" id="rot-interval" value="10" min="5" style="width:80px;margin-bottom:0;">' +
      '<button class="secondary-btn" id="rot-set">Set</button></div></div>' +
      '<div class="glass-card"><h3>Rich Presence Editor</h3>' +
      '<div class="form-group"><label>Activity Type</label><select id="rpc-type">' +
      '<option value="playing">Playing</option><option value="listening">Listening</option>' +
      '<option value="watching">Watching</option><option value="streaming">Streaming</option>' +
      '<option value="competing">Competing</option></select></div>' +
      '<div class="form-group"><label>Name</label><input id="rpc-name"></div>' +
      '<div class="form-group"><label>State</label><input id="rpc-state"></div>' +
      '<div class="form-group"><label>Details</label><input id="rpc-details"></div>' +
      '<div class="form-group"><label>Large Image Key</label><input id="rpc-large-image"></div>' +
      '<div class="form-group"><label>Large Image Tooltip</label><input id="rpc-large-text"></div>' +
      '<div class="form-group"><label>Small Image Key</label><input id="rpc-small-image"></div>' +
      '<div class="form-group"><label>Small Image Tooltip</label><input id="rpc-small-text"></div>' +
      '<div class="form-group"><label>Start (unix)</label><input id="rpc-start"></div>' +
      '<div class="form-group"><label>End (unix)</label><input id="rpc-end"></div>' +
      '<div class="form-group"><label>Party Size (cur, max)</label><input id="rpc-party-size"></div>' +
      '<div>' + PLACEHOLDERS.map(function (p) { return '<span class="ph-chip" data-ph="' + p + '">' + p + '</span>'; }).join('') + '</div>' +
      '<button class="primary-btn" id="rpc-set" style="margin-top:10px;">Set Rich Presence</button>' +
      '<div class="bot-prev" id="rpc-preview" style="margin-top:10px;"></div></div></div>';
    el('page-root').querySelectorAll('[data-presence]').forEach(function (b) {
      b.onclick = function () { call('status_set_presence', { status: b.getAttribute('data-presence') }); };
    });
    el('rot-add').onclick = function () {
      var t = el('rot-text').value.trim();
      if (!t) return;
      call('status_add_text', { text: t });
      el('rot-text').value = '';
    };
    el('rot-set').onclick = function () {
      call('status_set_interval', { interval: parseInt(el('rot-interval').value, 10) || 10 });
    };
    el('page-root').querySelectorAll('.ph-chip').forEach(function (c) {
      c.onclick = function () {
        if (rpcFocus) rpcFocus.value += c.getAttribute('data-ph');
        updateRpcPreview();
      };
    });
    ['rpc-type', 'rpc-name', 'rpc-state', 'rpc-details', 'rpc-large-image', 'rpc-large-text', 'rpc-small-image', 'rpc-small-text', 'rpc-start', 'rpc-end', 'rpc-party-size'].forEach(function (id) {
      var node = el(id);
      node.addEventListener('input', updateRpcPreview);
      node.addEventListener('focus', function () { rpcFocus = node; });
    });
    el('rpc-set').onclick = function () {
      var payload = {
        type: el('rpc-type').value,
        name: el('rpc-name').value,
        state: el('rpc-state').value,
        details: el('rpc-details').value,
        large_image: el('rpc-large-image').value,
        large_text: el('rpc-large-text').value,
        small_image: el('rpc-small-image').value,
        small_text: el('rpc-small-text').value,
        start: el('rpc-start').value,
        end: el('rpc-end').value,
        party_size: el('rpc-party-size').value
      };
      if (!payload.name) return;
      call('status_set_rich_presence', payload);
    };
    call('status_list_texts', {});
    updateRpcPreview();
    clearInterval(rpcTimer);
    rpcTimer = setInterval(function () {
      var t = el('rpc-time');
      if (t) t.textContent = rpcElapsed(el('rpc-start') ? el('rpc-start').value : '');
    }, 1000);
  }
  function appTabBar(tab) {
    var tabs = [
      ['app-settings', 'App Settings'], ['installation', 'Installation'], ['token', 'Bot Token'],
      ['emojis', 'App Emojis'], ['webhooks', 'Webhooks'], ['assets', 'RPC Assets'], ['tester', 'Tester']
    ];
    return '<div class="app-tabs">' + tabs.map(function (t) {
      return '<button class="module-tab' + (t[0] === tab ? ' active' : '') + '" data-atab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function renderApp(params) {
    var tab = params.tab || 'app-settings';
    Shell.setTitle('Developer Portal');
    Shell.setActions('');
    var body = '';
    if (tab === 'app-settings') {
      body = '<div class="glass-card"><h3>General Information</h3>' +
        '<div style="display:flex;gap:12px;align-items:center;"><div class="bot-avwrap"><img id="dev-icon" alt="" style="display:none;"></div>' +
        '<div style="flex:1;"><label>Icon</label><input type="file" id="dev-icon-file" accept="image/*" style="margin-bottom:0;"></div></div>' +
        '<div class="form-group"><label>Name</label><input id="dev-name"></div>' +
        '<div class="form-group"><label>Description</label><textarea id="dev-description" rows="2"></textarea></div>' +
        '<div class="form-group"><label>Application ID</label><input id="dev-client-id" readonly></div>' +
        '<div class="form-group"><label>Public Key</label><input id="dev-public-key" readonly></div>' +
        '<button class="primary-btn" id="dev-save">Save Changes</button></div>' +
        '<div class="glass-card"><h3>Security & Legal</h3>' +
        '<div class="form-group"><label>Interactions Endpoint</label><input id="dev-interactions"></div>' +
        '<div class="form-group"><label>Linked Roles URL</label><input id="dev-linked"></div>' +
        '<div class="form-group"><label>Terms of Service</label><input id="dev-tos"></div>' +
        '<div class="form-group"><label>Privacy Policy</label><input id="dev-privacy"></div></div>' +
        '<div class="glass-card"><h3>Bot Settings</h3>' +
        '<div class="set-row"><span>Public Bot</span><div class="toggle-switch" id="dev-public"></div></div>' +
        '<div class="set-row"><span>Requires OAuth2 Code Grant</span><div class="toggle-switch" id="dev-code"></div></div></div>';
    } else if (tab === 'installation') {
      body = '<div class="glass-card"><h3>Invite Generator</h3><div class="mg-perm-grid" id="dev-perms"></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;"><input id="dev-invite" readonly style="margin-bottom:0;">' +
        '<button class="secondary-btn" id="dev-invite-copy">Copy</button></div></div>';
    } else if (tab === 'token') {
      body = '<div class="glass-card"><h3>Bot Token</h3><input id="dev-token" readonly>' +
        '<div style="display:flex;gap:8px;margin-top:8px;"><button class="secondary-btn" id="dev-token-copy">Copy Token</button>' +
        '<button class="danger-btn" id="dev-token-reset">Regenerate</button></div></div>';
    } else if (tab === 'emojis') {
      body = '<div class="glass-card"><h3>App Emojis</h3><button class="primary-btn" id="dev-emoji-add" style="margin-bottom:10px;">Add App Emoji</button>' +
        '<div id="dev-emoji-grid" class="mg-expr"></div></div>';
    } else if (tab === 'webhooks') {
      body = '<div class="glass-card"><h3>Application Webhooks</h3><div id="dev-webhook-list"></div></div>';
    } else if (tab === 'assets') {
      body = '<div class="glass-card"><h3>Rich Presence Assets</h3><button class="primary-btn" id="dev-asset-add" style="margin-bottom:10px;">Add Asset</button>' +
        '<div id="dev-asset-grid" class="mg-expr"></div></div>';
    } else {
      body = '<div class="glass-card"><h3>App Tester</h3><div class="form-group"><label>Client ID</label><input id="dev-tester-id" readonly></div>' +
        '<p class="muted">Enable App Test Mode in the Discord client: Settings → Advanced → Enter Application ID.</p></div>';
    }
    el('page-root').innerHTML = appTabBar(tab) + body;
    el('page-root').querySelectorAll('[data-atab]').forEach(function (b) {
      b.onclick = function () { Router.go('/bot/app/' + b.getAttribute('data-atab') + '/'); };
    });
    if (tab === 'app-settings') {
      el('dev-icon-file').onchange = function () { previewFile(this, 'dev-icon'); };
      el('dev-save').onclick = async function () {
        var params = {
          name: el('dev-name').value.trim(),
          description: el('dev-description').value.trim(),
          interactions_endpoint_url: el('dev-interactions').value.trim(),
          linked_roles_verification_url: el('dev-linked').value.trim(),
          terms_of_service_url: el('dev-tos').value.trim(),
          privacy_policy_url: el('dev-privacy').value.trim(),
          bot_public: el('dev-public').classList.contains('active'),
          bot_require_code_grant: el('dev-code').classList.contains('active')
        };
        var icon = await getFileBase64(el('dev-icon-file'));
        if (icon) params.icon_b64 = icon;
        call('developer_portal_save', params);
      };
      call('developer_portal_info', {});
    } else if (tab === 'installation') {
      invitePerms = 0n;
      el('dev-perms').innerHTML = INVITE_PERMS.map(function (p) {
        return '<button class="perm-btn neutral" data-bit="' + p[1] + '">' + p[0] + '</button>';
      }).join('');
      el('dev-perms').querySelectorAll('.perm-btn').forEach(function (b) {
        b.onclick = function () {
          var bit = BigInt(b.getAttribute('data-bit'));
          if (b.classList.contains('allow')) {
            b.classList.remove('allow');
            b.classList.add('neutral');
            invitePerms &= ~(1n << bit);
          } else {
            b.classList.remove('neutral');
            b.classList.add('allow');
            invitePerms |= 1n << bit;
          }
          updateInviteUrl();
        };
      });
      el('dev-invite-copy').onclick = function () { copyToClipboard(el('dev-invite').value); };
      call('developer_portal_install_info', {});
    } else if (tab === 'token') {
      el('dev-token-copy').onclick = function () { copyToClipboard(window._fullToken || ''); };
      el('dev-token-reset').onclick = function () {
        customConfirm('This will invalidate the current token. Continue?').then(function (ok) {
          if (ok) call('developer_portal_reset_token', {});
        });
      };
      call('developer_portal_token_info', {});
    } else if (tab === 'emojis') {
      el('dev-emoji-add').onclick = function () {
        customPrompt('Emoji name:').then(function (name) {
          if (!name) return;
          var input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = async function () {
            var b64 = await getFileBase64({ files: [input.files[0]] });
            if (b64) call('developer_app_emoji_upload', { name: name, image: b64 });
            setTimeout(function () { call('developer_app_emojis_list', {}); }, 800);
          };
          input.click();
        });
      };
      call('developer_app_emojis_list', {});
    } else if (tab === 'webhooks') {
      call('developer_webhooks_list', {});
    } else if (tab === 'assets') {
      el('dev-asset-add').onclick = function () {
        customPrompt('Asset name:').then(function (name) {
          if (!name) return;
          var input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = async function () {
            var b64 = await getFileBase64({ files: [input.files[0]] });
            if (b64) call('developer_rich_presence_asset_upload', { name: name, image: b64 });
            setTimeout(function () { call('developer_rich_presence_assets', {}); }, 800);
          };
          input.click();
        });
      };
      call('developer_rich_presence_assets', {});
    } else {
      call('developer_app_tester_info', {});
    }
  }
  function updateInviteUrl() {
    var inp = el('dev-invite');
    if (!inp || !inp.dataset.base) return;
    inp.value = inp.dataset.base + '&permissions=' + invitePerms.toString();
  }
  function renderWebhooks() {
    Shell.setTitle('Webhooks');
    Shell.setActions('<button class="header-btn" id="wh-open-site" title="Open standalone site">' + arkIcon('link', 16) + '</button>');
    el('page-root').innerHTML =
      '<div class="bot-grid">' +
      '<div class="glass-card"><h3>Impersonation <span class="muted" style="font-size:.7rem;">(global — any server)</span></h3>' +
      '<div class="form-group"><label>Server</label><select id="imp-guild"></select></div>' +
      '<div class="form-group"><label>Target (name or id)</label><input id="imp-target"></div>' +
      '<div class="form-group"><label>Control user (name or id)</label><input id="imp-control"></div>' +
      '<div class="form-group"><label>Prefix</label><input id="imp-prefix" value="!" style="width:70px;"></div>' +
      '<div class="form-group"><label>Channel</label><select id="imp-channel"></select></div>' +
      '<button class="primary-btn" id="imp-add">Add entry</button>' +
      '<div id="imp-list" style="margin-top:12px;"></div></div>' +
      '<div class="glass-card"><h3>Webhook Studio</h3>' +
      '<div class="form-group"><label>Webhook URL (optional)</label><input id="ws-url"></div>' +
      '<div class="form-group"><label>Or server</label><select id="ws-guild"></select></div>' +
      '<div class="form-group"><label>Or channel</label><select id="ws-channel"></select></div>' +
      '<div class="form-group"><label>Username</label><input id="ws-user"></div>' +
      '<div class="form-group"><label>Avatar URL</label><input id="ws-avatar"></div>' +
      '<div class="form-group"><label>Thread name</label><input id="ws-thread"></div>' +
      '<div class="form-group"><label>Content</label><textarea id="ws-content" rows="3"></textarea></div>' +
      '<div class="set-row"><span>TTS</span><div class="toggle-switch" id="ws-tts"></div></div>' +
      '<button class="primary-btn" id="ws-send">Send</button></div></div>';
    var gsel = el('imp-guild');
    var wsel = el('ws-guild');
    var opts = '<option value="">Select server</option>' + guilds().map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + '</option>'; }).join('');
    gsel.innerHTML = opts;
    wsel.innerHTML = opts;
    var fillChannels = function (gid, struct) {
      var html = '<option value="">Select channel</option>';
      (struct.categories || []).forEach(function (c) {
        (c.channels || []).forEach(function (ch) {
          if (ch.type === 'text') html += '<option value="' + ch.id + '">' + esc(c.name + ' / ' + ch.name) + '</option>';
        });
      });
      (struct.uncategorised || []).forEach(function (ch) {
        if (ch.type === 'text') html += '<option value="' + ch.id + '">' + esc(ch.name) + '</option>';
      });
      el('imp-channel').innerHTML = html;
      el('ws-channel').innerHTML = html;
    };
    var loadStruct = function (gid) {
      if (!gid) return;
      Session.socket.emit('run_command', { cmd: 'guild_structure', params: { guild_id: gid } });
      Session.once('guild_structure', function (s) { fillChannels(gid, s); });
    };
    gsel.onchange = function () { loadStruct(this.value); };
    wsel.onchange = function () { loadStruct(this.value); };
    if (guilds()[0]) { gsel.value = guilds()[0].id; wsel.value = guilds()[0].id; loadStruct(guilds()[0].id); }
    el('wh-open-site').onclick = function () {
      Session.socket.emit('run_command', { cmd: 'webhooks_open', params: {} });
    };
    el('imp-add').onclick = function () {
      call('utility_impersonation_add', {
        guild_id: gsel.value,
        target: el('imp-target').value.trim(),
        control: el('imp-control').value.trim(),
        prefix: el('imp-prefix').value.trim() || '!',
        channel_id: el('imp-channel').value
      });
    };
    el('ws-send').onclick = function () {
      call('utility_send_webhook', {
        url: el('ws-url').value.trim(),
        guild_id: wsel.value,
        channel_id: el('ws-channel').value,
        username: el('ws-user').value.trim(),
        avatar_url: el('ws-avatar').value.trim(),
        thread_name: el('ws-thread').value.trim(),
        content: el('ws-content').value,
        tts: el('ws-tts').classList.contains('active')
      });
    };
    call('utility_impersonation_list', {});
  }
  function paintAccess() {
    var box = el('acc-list');
    if (!box) return;
    if (!Session.tokens || !Session.tokens.length) {
      box.innerHTML = '<div class="muted" style="font-size:.8rem;">No tokens saved.</div>';
      return;
    }
    box.innerHTML = Session.tokens.map(function (t) {
      return '<div class="imp-row"><span class="grow"><strong>' + esc(t.name || ('Token ' + (t.index + 1))) + '</strong>' +
        (t.index === Session.activeIndex ? ' <span class="set-pill">active</span>' : '') + '</span>' +
        '<span class="set-btns"><button class="secondary-btn" data-switch="' + t.index + '">Switch</button>' +
        '<button class="danger-btn" data-remove="' + t.index + '">Remove</button></span></div>';
    }).join('');
    box.querySelectorAll('[data-switch]').forEach(function (b) {
      b.onclick = function () { Session.loginWithToken(parseInt(b.getAttribute('data-switch'), 10)); };
    });
    box.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = function () {
        customConfirm('Remove this token from the vault?').then(function (ok) {
          if (ok) Session.removeToken(parseInt(b.getAttribute('data-remove'), 10));
        });
      };
    });
  }
  function renderAccess() {
    Shell.setTitle('Bot Access');
    Shell.setActions('');
    el('page-root').innerHTML =
      '<div class="glass-card"><h3>Token Vault</h3><div id="acc-list"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;"><input type="password" id="acc-new" placeholder="Paste new bot token" autocomplete="off" style="margin-bottom:0;">' +
      '<button class="secondary-btn" id="acc-verify">Verify</button>' +
      '<button class="primary-btn" id="acc-add">Add Token</button></div>' +
      '<div class="fb-status muted" id="acc-status"></div></div>';
    el('acc-verify').onclick = function () {
      var token = el('acc-new').value.trim();
      if (!token) return;
      Session.verifyToken(token).then(function (d) {
        el('acc-status').textContent = 'Valid: ' + (d.name || 'bot');
      }).catch(function (e) {
        el('acc-status').textContent = 'Invalid: ' + e.message;
      });
    };
    el('acc-add').onclick = function () {
      var token = el('acc-new').value.trim();
      if (!token) return;
      Session.addToken(token);
      el('acc-new').value = '';
      el('acc-status').textContent = 'Token saved to vault.';
    };
    paintAccess();
  }
  function wire() {
    if (wired) return;
    wired = true;
    Session.on('bot_profile', function (d) {
      if (el('bi-g-bio')) el('bi-g-bio').value = d.bio || '';
      var av = el('bi-g-av');
      if (av && d.avatar_url) { av.src = d.avatar_url; av.style.display = 'block'; }
      var bn = el('bi-g-banner');
      if (bn && d.banner_url) { bn.src = d.banner_url; bn.style.display = 'block'; }
    });
    Session.on('bot_server_profile', function (d) {
      if (el('bi-s-nick')) el('bi-s-nick').value = d.nickname || '';
      if (el('bi-s-bio')) el('bi-s-bio').value = d.bio || '';
      var av = el('bi-s-av');
      if (av && d.avatar_url) { av.src = d.avatar_url; av.style.display = 'block'; }
      var bn = el('bi-s-banner');
      if (bn && d.banner_url) { bn.src = d.banner_url; bn.style.display = 'block'; }
    });
    Session.on('status_texts', function (d) {
      rpcRotTexts = (d && d.texts) || [];
      var list = el('rot-list');
      if (!list) { updateRpcPreview(); return; }
      var iv = el('rot-interval');
      if (iv) iv.value = d.interval || 10;
      if (!d.texts || !d.texts.length) {
        list.innerHTML = '<div class="muted">No status texts added.</div>';
        updateRpcPreview();
        return;
      }
      list.innerHTML = d.texts.map(function (t, i) {
        return '<div class="imp-row"><span class="grow">' + esc(t) + '</span>' +
          '<button class="secondary-btn" data-rot-del="' + i + '">Remove</button></div>';
      }).join('');
      list.querySelectorAll('[data-rot-del]').forEach(function (b) {
        b.onclick = function () { call('status_remove_text', { index: parseInt(b.getAttribute('data-rot-del'), 10) }); };
      });
      updateRpcPreview();
    });
    Session.on('developer_portal_data', function (d) {
      if (!el('dev-name')) return;
      el('dev-name').value = d.name || '';
      el('dev-description').value = d.description || '';
      el('dev-client-id').value = d.id || '';
      el('dev-public-key').value = d.public_key || '';
      el('dev-interactions').value = d.interactions_endpoint_url || '';
      el('dev-linked').value = d.linked_roles_verification_url || '';
      el('dev-tos').value = d.terms_of_service_url || '';
      el('dev-privacy').value = d.privacy_policy_url || '';
      el('dev-public').classList.toggle('active', !!d.bot_public);
      el('dev-code').classList.toggle('active', !!d.bot_require_code_grant);
      var ic = el('dev-icon');
      if (ic && d.icon_url) { ic.src = d.icon_url; ic.style.display = 'block'; }
    });
    Session.on('developer_portal_install_data', function (d) {
      var inp = el('dev-invite');
      if (!inp) return;
      inp.dataset.base = d.invite_url_base;
      updateInviteUrl();
    });
    Session.on('developer_portal_token_data', function (d) {
      if (el('dev-token')) el('dev-token').value = d.masked || '';
      window._fullToken = d.full || '';
    });
    Session.on('developer_app_emojis', function (d) {
      var grid = el('dev-emoji-grid');
      if (!grid) return;
      grid.innerHTML = (d.emojis || []).map(function (e) {
        return '<div class="expression-chip" data-emoji-del="' + e.id + '"><img src="https://cdn.discordapp.com/emojis/' + e.id + '.png" style="width:24px;height:24px;" loading="lazy"><span>:' + esc(e.name) + ':</span></div>';
      }).join('') || '<div class="muted">No app emojis.</div>';
      grid.querySelectorAll('[data-emoji-del]').forEach(function (c) {
        c.onclick = function () {
          customConfirm('Delete this app emoji?').then(function (ok) {
            if (!ok) return;
            call('developer_app_emoji_delete', { emoji_id: c.getAttribute('data-emoji-del') });
            setTimeout(function () { call('developer_app_emojis_list', {}); }, 500);
          });
        };
      });
    });
    Session.on('developer_webhooks', function (d) {
      var list = el('dev-webhook-list');
      if (!list) return;
      list.innerHTML = (d.webhooks || []).map(function (w) {
        return '<div class="imp-row"><span class="grow"><strong>' + esc(w.name) + '</strong><br><small class="muted">' + esc(w.channel) + '</small></span>' +
          '<button class="danger-btn" data-wh-del="' + w.id + '">Delete</button></div>';
      }).join('') || '<div class="muted">No webhooks found.</div>';
      list.querySelectorAll('[data-wh-del]').forEach(function (b) {
        b.onclick = function () {
          customConfirm('Delete this webhook?').then(function (ok) {
            if (!ok) return;
            call('developer_webhook_delete', { webhook_id: b.getAttribute('data-wh-del') });
            setTimeout(function () { call('developer_webhooks_list', {}); }, 500);
          });
        };
      });
    });
    Session.on('developer_rich_presence_assets', function (d) {
      var grid = el('dev-asset-grid');
      if (!grid) return;
      grid.innerHTML = (d.assets || []).map(function (a) {
        return '<div class="expression-chip" data-asset-del="' + a.id + '"><img src="https://cdn.discordapp.com/app-assets/' + a.application_id + '/' + a.id + '.png" style="width:48px;height:48px;object-fit:contain;" loading="lazy"><span>' + esc(a.name) + '</span></div>';
      }).join('') || '<div class="muted">No assets.</div>';
      grid.querySelectorAll('[data-asset-del]').forEach(function (c) {
        c.onclick = function () {
          customConfirm('Delete this asset?').then(function (ok) {
            if (!ok) return;
            call('developer_rich_presence_asset_delete', { asset_id: c.getAttribute('data-asset-del') });
            setTimeout(function () { call('developer_rich_presence_assets', {}); }, 500);
          });
        };
      });
    });
    Session.on('developer_app_tester_data', function (d) {
      if (el('dev-tester-id')) el('dev-tester-id').value = d.client_id || '';
    });
    Session.on('utility_impersonation_list', function (d) {
      var list = el('imp-list');
      if (!list) return;
      list.innerHTML = (d.entries || []).map(function (e, i) {
        return '<div class="imp-row"><span class="grow"><strong>' + esc(e.control_name) + '</strong> → ' + esc(e.target_name) +
          '<br><small class="muted">' + esc(e.prefix) + ' in ' + esc(e.channel_name) + (e.enabled ? '' : ' (disabled)') + '</small></span>' +
          '<div class="toggle-switch' + (e.enabled ? ' active' : '') + '" data-imp-toggle="' + i + '"></div>' +
          '<button class="danger-btn" data-imp-del="' + i + '">Remove</button></div>';
      }).join('') || '<div class="muted" style="font-size:.8rem;">No impersonation entries.</div>';
      list.querySelectorAll('[data-imp-toggle]').forEach(function (t) {
        t.onclick = function () { call('utility_impersonation_toggle', { index: parseInt(t.getAttribute('data-imp-toggle'), 10) }); };
      });
      list.querySelectorAll('[data-imp-del]').forEach(function (b) {
        b.onclick = function () { call('utility_impersonation_remove', { index: parseInt(b.getAttribute('data-imp-del'), 10) }); };
      });
    });
    Session.onChange(function () {
      var cur = Router.current();
      if (cur && cur.route.path.indexOf('/bot/access') === 0) paintAccess();
    });
  }
  Router.add('/bot/identity', renderIdentity, { guard: 'auth', css: ['bot.css'] });
  Router.add('/bot/presence', renderPresence, { guard: 'auth', css: ['bot.css'] });
  Router.add('/bot/app/:tab?', renderApp, { guard: 'auth', css: ['bot.css', 'management.css'] });
  Router.add('/bot/webhooks', renderWebhooks, { guard: 'auth', css: ['bot.css'] });
  Router.add('/bot/projection', function () { Router.replace('/bot/webhooks/'); }, { guard: 'auth' });
  Router.add('/bot/access', renderAccess, { guard: 'auth', css: ['bot.css'] });
  Shell.registerNav({ page: 'bot/identity', label: 'Identity', icon: 'smile', ac: '#7c5cff', dock: false, ctx: 'global', group: 'bot' });
  Shell.registerNav({ page: 'bot/presence', label: 'Presence', icon: 'pulse', ac: '#22c55e', dock: false, ctx: 'global', group: 'status' });
  Shell.registerNav({ page: 'bot/app', label: 'Developer Portal', icon: 'code', ac: '#7c5cff', dock: false, ctx: 'global', group: 'devportal' });
  Shell.registerNav({ page: 'bot/webhooks', label: 'Webhooks', icon: 'bolt', ac: '#f97316', dock: false, ctx: 'global', group: 'utility', act: 'webhooks' });
  Shell.registerNav({ page: 'bot/access', label: 'Bot Access', icon: 'shield', ac: '#454af8', dock: false, ctx: 'global', group: 'bot' });
  wire();
})();