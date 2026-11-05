(function () {
var currentTab = 'appearance';
var activeArklumCard = null;
var pluginTabs = [];
var pluginSections = [];
var wired = false;
var FEATURES = ['management', 'devportal', 'status', 'utility', 'plugins'];
var FEATURE_LABELS = {
  management: 'Management',
  devportal: 'Developer Portal',
  status: 'Status',
  utility: 'Utility',
  plugins: 'Plugins'
};
var FEEDBACK_WEBHOOK = 'https://discord.com/api/webhooks/1539698977094635540/tIpHzxJWcPssEup-c5Ko2ALdq9Elmg2JjRRdASkgDWzk8SkWgdmS7XXev6RJ7vf8dM7k';
var PINNABLE_TABS = [
  { key: 'home', label: 'Home' },
  { key: 'servers', label: 'Servers' },
  { key: 'dms', label: 'DMs' },
  { key: 'settings', label: 'Settings' },
  { key: 'bot/identity', label: 'Bot Identity' },
  { key: 'bot/presence', label: 'Presence' },
  { key: 'bot/app', label: 'Developer Portal' },
  { key: 'bot/webhooks', label: 'Webhooks' },
  { key: 'bot/access', label: 'Bot Access' },
  { key: 'plugins/browse', label: 'Plugin Store' },
  { key: 'plugins/installed', label: 'Installed Plugins' },
  { key: 'utility/authorized', label: 'Authorized Users' }
];

function el(id) { return document.getElementById(id); }
function features() { return State.get('ui.features', FEATURES.slice()); }
function saveFeatures(list) {
  State.set('ui.features', list);
  Session.call('dashboard_save_pref', { key: 'features_enabled', value: list });
  Shell.syncActive();
}
function tabBar() {
  var base = [
    ['appearance', 'Appearance'],
    ['tabs', 'Tabs'],
    ['behaviour', 'Behaviour'],
    ['bot', 'Bot'],
    ['data', 'Data'],
    ['background', 'Background Tasks'],
    ['arklum', 'Arklum']
  ];
  var html = '<div class="set-tabs">';
  base.forEach(function (t) {
    html += '<button class="module-tab' + (currentTab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
  });
  pluginTabs.forEach(function (t) {
    html += '<button class="module-tab' + (currentTab === t.key ? ' active' : '') + '" data-tab="' + esc(t.key) + '">' + esc(t.title) + '</button>';
  });
  html += '</div>';
  return html;
}
function wireTabs() {
  document.querySelectorAll('.set-tabs .module-tab').forEach(function (b) {
    b.onclick = function () {
      currentTab = b.getAttribute('data-tab');
      Router.replace('/settings/' + currentTab + '/');
    };
  });
}
function renderSettings(params) {
  currentTab = (params && params.tab) || currentTab || 'appearance';
  Shell.setTitle('Settings');
  Shell.setActions('<button class="header-btn" id="set-refresh" title="Refresh">' + arkIcon('refresh', 16) + '</button>');
  el('page-root').innerHTML =
    '<div id="set-tabs-holder">' + tabBar() + '</div>' +
    '<div class="set-wall"><div class="wall-corner wall-tl"></div><div class="wall-corner wall-br"></div>' +
    '<div id="set-content"></div></div>';
  el('set-refresh').onclick = function () { renderTab(currentTab); };
  wireTabs();
  renderTab(currentTab);
  Session.call('plugin_get_settings_registry', {});
}
function renderTab(tab) {
  var c = el('set-content');
  if (!c) return;
  document.querySelectorAll('.set-tabs .module-tab').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  var pt = null;
  pluginTabs.forEach(function (t) { if (t.key === tab) pt = t; });
  if (pt) {
    c.innerHTML = '<div class="glass-card">' + pt.html + '</div>';
    appendSections(tab);
    return;
  }
  if (tab === 'appearance') renderAppearance(c);
  else if (tab === 'tabs') renderTabs(c);
  else if (tab === 'behaviour') renderBehaviour(c);
  else if (tab === 'bot') renderBot(c);
  else if (tab === 'data') renderData(c);
  else if (tab === 'background') renderBackground(c);
  else if (tab === 'arklum') renderArklum(c);
  else c.innerHTML = '<div class="glass-card"><div class="empty-state">' + arkIcon('warn', 40) + '<p>Unknown tab.</p></div></div>';
  appendSections(tab);
}
function appendSections(tab) {
  var c = el('set-content');
  if (!c) return;
  pluginSections.forEach(function (s) {
    if (s.tab !== tab) return;
    c.insertAdjacentHTML('beforeend', '<div class="glass-card"><h3>' + esc(s.title) + '</h3>' + s.html + '</div>');
  });
}

function parseArkvSections(content) {
  var sections = [];
  var current = null;
  var lines = String(content || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\[#\s*([^\]]+)\]/);
    if (m) {
      if (current) sections.push(current);
      current = { name: m[1].trim(), content: [] };
    } else if (current) {
      current.content.push(lines[i]);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderAppearance(c) {
  var ui = State.get('ui', {});
  var customFont = State.get('ui.customFont', '');
  c.innerHTML =
    '<div class="glass-card"><h3>Theme</h3><div class="theme-row" style="display:flex;gap:10px;flex-wrap:wrap;">' +
    ['dark', 'oled', 'light'].map(function (t) {
      return '<div class="theme-card' + (ui.theme === t && !ui.themePath ? ' active' : '') + '" data-theme="' + t + '" style="min-width:110px;padding:14px 18px;border-radius:var(--radius-sm);background:var(--glass-bg-light);border:2px solid ' + (ui.theme === t && !ui.themePath ? 'var(--primary)' : 'transparent') + ';cursor:pointer;font-weight:700;text-align:center;">' + t + '</div>';
    }).join('') +
    '</div></div>' +
    '<div class="glass-card"><h3>Font</h3>' +
    '<div class="set-row"><span>Current: ' + (customFont ? 'Custom' : (ui.font || 'Inter')) + '</span></div>' +
    '<div class="set-row" style="gap:10px;">' +
    '<button class="secondary-btn" id="set-font-reset">Reset to Default</button>' +
    '<button class="primary-btn" id="set-font-import">Import Font (.ttf)</button>' +
    '<input type="file" id="set-font-file" accept=".ttf,.otf,.woff,.woff2" style="display:none;">' +
    '</div>' +
    '<small class="muted" style="display:block;margin-top:8px;">Upload a custom font file. It will be applied globally.</small>' +
    '</div>';
  c.querySelectorAll('[data-theme]').forEach(function (card) {
    card.onclick = function () { Theme.setTheme(card.getAttribute('data-theme')); renderTab('appearance'); };
  });
  el('set-font-reset').onclick = function () {
    State.set('ui.customFont', '');
    Theme.setFont('Inter');
    document.documentElement.style.removeProperty('--font');
    document.documentElement.style.removeProperty('--font-heading');
    var style = document.getElementById('custom-font-style');
    if (style) style.remove();
    renderTab('appearance');
  };
  el('set-font-import').onclick = function () { el('set-font-file').click(); };
  el('set-font-file').onchange = function () {
    var file = this.files[0];
    if (!file) return;
    getFileBase64({ files: [file] }).then(function (b64) {
      if (b64) Session.call('settings_upload_font', { data: b64, filename: file.name });
    });
  };
}

function renderTabs(c) {
  var pinned = State.get('ui.dockTabs', ['home', 'servers', 'dms', 'settings']);
  c.innerHTML =
    '<div class="glass-card"><h3>Navigation Tabs</h3>' +
    '<p class="muted" style="margin-bottom:12px;">Choose which tabs appear in the bottom dock. Default: Home, Servers, DMs, Settings.</p>' +
    PINNABLE_TABS.map(function (t) {
      var on = pinned.indexOf(t.key) >= 0;
      return '<div class="set-row"><span>' + t.label + '</span><div class="toggle-switch' + (on ? ' active' : '') + '" data-pin="' + t.key + '"></div></div>';
    }).join('') +
    '</div>';
  c.querySelectorAll('[data-pin]').forEach(function (t) {
    t.onclick = function () {
      var key = t.getAttribute('data-pin');
      var list = State.get('ui.dockTabs', ['home', 'servers', 'dms', 'settings']);
      var idx = list.indexOf(key);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(key);
      State.set('ui.dockTabs', list);
      t.classList.toggle('active', list.indexOf(key) >= 0);
      Shell.syncActive();
    };
  });
}

function renderBehaviour(c) {
  var ri = State.get('ui.refreshInterval', 3);
  var conf = State.get('ui.confirmations', true);
  c.innerHTML =
    '<div class="glass-card"><h3>Auto-refresh Home Stats</h3>' +
    '<div class="set-row"><input type="number" id="set-refresh-interval" min="1" max="30" value="' + ri + '" style="width:80px;margin-bottom:0;"><span>seconds</span><button class="secondary-btn" id="set-refresh-save">Save</button></div></div>' +
    '<div class="glass-card"><h3>Confirmation Dialogs</h3>' +
    '<div class="set-row"><span>Show confirmation before kick/ban/delete</span><div class="toggle-switch' + (conf ? ' active' : '') + '" id="set-confirm"></div></div></div>';
  el('set-refresh-save').onclick = function () {
    var val = parseInt(el('set-refresh-interval').value, 10) || 3;
    State.set('ui.refreshInterval', val);
    Session.call('dashboard_save_pref', { key: 'refresh_interval', value: val });
  };
  el('set-confirm').onclick = function () {
    var next = !State.get('ui.confirmations', true);
    State.set('ui.confirmations', next);
    Session.call('dashboard_save_pref', { key: 'confirmations', value: next });
    this.classList.toggle('active', next);
  };
}

function renderBot(c) {
  c.innerHTML =
    '<div class="glass-card"><h3>Bot Tokens</h3><div id="set-token-list"></div>' +
    '<div class="set-row" style="margin-top:8px;"><input type="password" id="set-new-token" placeholder="Paste new bot token" autocomplete="off" style="margin-bottom:0;">' +
    '<button class="secondary-btn" id="set-verify-token">Verify</button>' +
    '<button class="primary-btn" id="set-add-token">Add Token</button></div>' +
    '<div class="fb-status muted" id="set-token-status"></div></div>';
  paintTokens();
  el('set-verify-token').onclick = function () {
    var token = el('set-new-token').value.trim();
    var status = el('set-token-status');
    if (!token) { status.textContent = 'Token required.'; return; }
    Session.verifyToken(token).then(function (d) { status.textContent = 'Valid: ' + (d.name || 'bot'); }).catch(function (e) { status.textContent = 'Invalid: ' + e.message; });
  };
  el('set-add-token').onclick = function () {
    var token = el('set-new-token').value.trim();
    var status = el('set-token-status');
    if (!token) { status.textContent = 'Token required.'; return; }
    Session.addToken(token);
    el('set-new-token').value = '';
    status.textContent = 'Token saved to vault.';
  };
}

function paintTokens() {
  var list = el('set-token-list');
  if (!list) return;
  if (!Session.tokens || !Session.tokens.length) {
    list.innerHTML = '<div class="muted" style="font-size:0.8rem;padding:6px;">No tokens saved.</div>';
    return;
  }
  list.innerHTML = Session.tokens.map(function (t) {
    var active = t.index === Session.activeIndex;
    return '<div class="set-token-row"><span><strong>' + esc(t.name || ('Token ' + (t.index + 1))) + '</strong>' +
      (active ? '<span class="set-pill">active</span>' : '') + '</span>' +
      '<span class="set-btns"><button class="secondary-btn" data-switch="' + t.index + '">Switch</button>' +
      '<button class="danger-btn" data-remove="' + t.index + '">Remove</button></span></div>';
  }).join('');
  list.querySelectorAll('[data-switch]').forEach(function (b) {
    b.onclick = function () { Session.loginWithToken(parseInt(b.getAttribute('data-switch'), 10)); };
  });
  list.querySelectorAll('[data-remove]').forEach(function (b) {
    b.onclick = function () {
      customConfirm('Remove this token from the vault?').then(function (ok) {
        if (ok) Session.removeToken(parseInt(b.getAttribute('data-remove'), 10));
      });
    };
  });
}

function renderData(c) {
  c.innerHTML =
    '<div class="glass-card"><h3>Resource Usage</h3>' +
    '<div class="set-row"><span>RAM Usage</span><span id="data-ram" class="muted">Loading…</span></div>' +
    '<div class="set-row"><span>Folder Size</span><span id="data-size" class="muted">Loading…</span></div>' +
    '</div>' +
    '<div class="glass-card"><h3>Cache & Storage</h3>' +
    '<div class="set-row"><button class="secondary-btn" id="set-clear-cache">Clear Runtime Cache</button>' +
    '<button class="danger-btn" id="set-reset-system">Reset System</button></div>' +
    '<div class="fb-status muted" id="set-data-status"></div></div>';
  Session.call('get_arklum_stats', {});
  el('set-clear-cache').onclick = function () {
    Session.call('clear_runtime_cache', {});
    el('set-data-status').textContent = 'Runtime cache cleared.';
  };
  el('set-reset-system').onclick = function () {
    customConfirm('This wipes tokens, prefs and all bot config. Continue?').then(function (ok) {
      if (!ok) return;
      Session.call('reset_system', {});
      el('set-data-status').textContent = 'System reset requested.';
    });
  };
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function renderBackground(c) {
  c.innerHTML =
    '<div class="glass-card"><h4 style="margin:0 0 4px;">Meme Generator</h4>' +
    '<small class="muted">Commands like $hell, $kms, etc.</small>' +
    '<div class="set-row" style="margin-top:10px;"><input type="text" id="bg-prefix-memes" value="$" style="width:60px;margin-bottom:0;">' +
    '<div class="toggle-switch" id="bg-toggle-memes"></div>' +
    '<span class="muted" id="bg-status-memes" style="font-size:0.8rem;">…</span></div></div>';
  el('bg-toggle-memes').onclick = function () {
    var next = !this.classList.contains('active');
    this.classList.toggle('active', next);
    el('bg-status-memes').textContent = next ? 'ON' : 'OFF';
    Session.call('toggle_background_task', { key: 'memes', enabled: next });
  };
  el('bg-prefix-memes').onchange = function () {
    Session.call('set_bg_prefix', { key: 'memes', prefix: this.value });
  };
  Session.call('get_meme_config', {});
}

function renderArklum(c) {
  c.innerHTML =
    '<div class="ark-header" style="text-align:center;padding:20px 0;margin-bottom:16px;">' +
    '<img src="/arklum.png" alt="Arklum" style="width:64px;height:64px;border-radius:16px;margin-bottom:10px;">' +
    '<h2 style="margin:0 0 4px;font:700 1.5rem var(--font-heading);color:var(--text);">Arklum</h2>' +
    '<small class="muted" id="ark-version" style="display:block;margin-bottom:12px;">Loading…</small>' +
    '<button class="ark-update-btn" id="ark-update-btn" type="button">Check for Updates</button>' +
    '</div>' +
    '<div class="ark-grid-wrapper" id="ark-grid-wrapper">' +
    '<div class="ark-grid" id="ark-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--gap-ui);">' +
    '<div class="ark-card" id="ark-card-version"><h4>Version</h4><div class="val" id="ark-val-version">—</div></div>' +
    '<div class="ark-card" id="ark-card-uptime"><h4>Uptime</h4><div class="val" id="ark-val-uptime">—</div></div>' +
    '</div>' +
    '<div class="ark-fade"></div>' +
    '<button class="ark-see-more-btn" id="ark-see-more-btn" type="button">See more</button>' +
    '</div>' +
    '<div class="ark-list" style="background:var(--bg-card);border:1px solid var(--glass-border);border-radius:var(--radius);overflow:hidden;margin-bottom:var(--gap-ui);">' +
    '<div class="ark-list-item" id="ark-feedback" style="display:flex;align-items:center;justify-content:space-between;padding:14px var(--pad-card);border-bottom:1px solid var(--glass-border);cursor:pointer;color:var(--text);font-size:0.95rem;"><span>Send Feedback</span><span>›</span></div>' +
    '</div>' +
    '<div id="ark-panel" style="display:none;margin-top:12px;"></div>';

  var updateBtn = el('ark-update-btn');
  if (updateBtn) {
    updateBtn.onclick = function () {
      var p = el('ark-panel');
      p.style.display = 'block';
      p.textContent = 'Checking for updates…';
      Session.call('check_for_update', {});
    };
  }

  var wrapper = el('ark-grid-wrapper');
  var seeMoreBtn = el('ark-see-more-btn');
  if (seeMoreBtn && wrapper) {
    seeMoreBtn.onclick = function () {
      var p = el('ark-panel');
      if (activeArklumCard) {
        activeArklumCard = null;
        if (p) {
          p.style.display = 'none';
          p.innerHTML = '';
        }
        document.querySelectorAll('.ark-card').forEach(c => c.classList.remove('active'));
        this.textContent = 'See more';
      } else {
        wrapper.classList.toggle('expanded');
        this.textContent = wrapper.classList.contains('expanded') ? 'Show less' : 'See more';
      }
    };
  }

  el('ark-feedback').onclick = function () {
    var p = el('ark-panel');
    p.style.display = 'block';
    p.innerHTML = '<div class="glass-card"><h3>Send Feedback</h3>' +
      '<textarea id="fb-text" rows="4" placeholder="Type your feedback..." style="width:100%;margin-bottom:10px;"></textarea>' +
      '<button class="primary-btn" id="fb-send">Send</button>' +
      '<div class="fb-status muted" id="fb-status"></div></div>';
    el('fb-send').onclick = function () {
      var text = el('fb-text').value.trim();
      var status = el('fb-status');
      if (!text) { status.textContent = 'Feedback cannot be empty.'; return; }
      fetch(FEEDBACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Arklum Feedback', content: 'New Feedback from Dashboard\n```\n' + text + '\n```' })
      }).then(function (r) {
        if (r.ok) { status.textContent = 'Feedback sent successfully.'; el('fb-text').value = ''; }
        else { status.textContent = 'Failed to send feedback.'; }
      }).catch(function () { status.textContent = 'Error sending feedback.'; });
    };
  };

  Session.call('get_system_stats', {});
  Session.call('fetch_arkv_markup', {});
}

function wire() {
  if (wired) return;
  wired = true;

  Session.on('arklum_stats', function (d) {
    var ram = el('data-ram');
    var size = el('data-size');
    if (ram) ram.textContent = fmtBytes(d.ram_bytes);
    if (size) size.textContent = fmtBytes(d.folder_size_bytes);
  });

  Session.on('system_stats', function (d) {
    var v = el('ark-val-version');
    var u = el('ark-val-uptime');
    var ver = el('ark-version');
    if (v) v.textContent = 'v' + (d.core_version || '0.0.0');
    if (ver) ver.textContent = 'v' + (d.core_version || '0.0.0');
    if (u) {
      var s = d.uptime || 0;
      var dd = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60);
      u.textContent = (dd ? dd + 'd ' : '') + (hh ? hh + 'h ' : '') + mm + 'm';
    }
  });

  Session.on('arkv_content', function (d) {
    var grid = el('ark-grid');
    if (!grid) return;
    var sections = parseArkvSections(d.content || '');
    sections.forEach(function (sec) {
      var key = 'ark-card-' + sec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (document.getElementById(key)) return;
      var card = document.createElement('div');
      card.className = 'ark-card';
      card.id = key;
      card.innerHTML = '<h4>' + esc(sec.name) + '</h4><div class="val">View</div>';
      
      card.onclick = function () {
        var p = el('ark-panel');
        var seeMoreBtn = el('ark-see-more-btn');
        if (!p) return;
        if (activeArklumCard === key) {
          activeArklumCard = null;
          p.style.display = 'none';
          p.innerHTML = '';
          if (seeMoreBtn) seeMoreBtn.textContent = 'See more';
          document.querySelectorAll('.ark-card').forEach(c => c.classList.remove('active'));
          return;
        }
        activeArklumCard = key;
        document.querySelectorAll('.ark-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
  
        p.style.display = 'block';
        p.innerHTML = '<div class="glass-card"><h3>' + esc(sec.name) + '</h3>' +
          '<div class="ark-section-body">' + esc(sec.content.join('\n').trim() || 'No content.') + '</div></div>';
        
        if (seeMoreBtn) seeMoreBtn.textContent = 'Show less';
        p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      
      grid.appendChild(card);
    });
  });

  Session.on('font_uploaded', function (d) {
    if (d && d.url) {
      State.set('ui.customFont', d.url);
      var style = document.getElementById('custom-font-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'custom-font-style';
        document.head.appendChild(style);
      }
      style.textContent = '@font-face { font-family: "CustomFont"; src: url("' + d.url + '") format("truetype"); font-display: swap; }';
      document.documentElement.style.setProperty('--font', '"CustomFont"');
      document.documentElement.style.setProperty('--font-heading', '"CustomFont"');
      renderTab('appearance');
    }
  });

  Session.on('update_available', function (d) {
    var p = el('ark-panel');
    if (p) { p.style.display = 'block'; p.textContent = 'Update available: v' + d.current + ' → v' + d.latest; }
  });
  Session.on('update_not_available', function (d) {
    var p = el('ark-panel');
    if (p) { p.style.display = 'block'; p.textContent = d.message || 'Up to date.'; }
  });
  Session.on('update_error', function (d) {
    var p = el('ark-panel');
    if (p) { p.style.display = 'block'; p.textContent = 'Error: ' + (d.message || 'unknown'); }
  });

  Session.on('meme_config', function (cfg) {
    if (currentTab !== 'background' || !cfg) return;
    var enabled = cfg.enabled !== false;
    var toggle = el('bg-toggle-memes');
    var status = el('bg-status-memes');
    var prefix = el('bg-prefix-memes');
    if (toggle) toggle.classList.toggle('active', enabled);
    if (status) status.textContent = enabled ? 'ON' : 'OFF';
    if (prefix && document.activeElement !== prefix) prefix.value = cfg.prefix || '$';
  });

  Session.on('plugin_settings_registry', function (d) {
    pluginTabs = d.tabs || [];
    pluginSections = d.sections || [];
    var holder = el('set-tabs-holder');
    if (holder) { holder.innerHTML = tabBar(); wireTabs(); }
    var isPlugin = pluginTabs.some(function (t) { return t.key === currentTab; });
    if (isPlugin || pluginSections.some(function (s) { return s.tab === currentTab; })) renderTab(currentTab);
  });

  Session.onChange(function () { if (currentTab === 'bot') paintTokens(); });
}

Router.add('/settings/:tab?', renderSettings, { guard: 'auth', css: ['settings.css'] });
Shell.registerNav({ page: 'settings', label: 'Settings', icon: 'gear', ac: '#8b90a8', dock: true, ctx: 'global', group: 'general' });
wire();
})();