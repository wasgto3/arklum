(function () {
function call(cmd, params) {
  return Session.call(cmd, params || {});
}
function el(id) {
  return document.getElementById(id);
}

function renderIcon(icon) {
  if (!icon) return '⚡';
  if (/^https?:\/\//i.test(icon)) {
    return '<img src="' + esc(icon) + '" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:6px;display:block;">';
  }
  return esc(icon);
}

function renderBrowse() {
  Shell.setTitle('Plugin Marketplace');
  Shell.setActions('');
  el('page-root').innerHTML =
    '<div class="glass-card"><h3>Catalog</h3><div id="pl-catalog" class="muted">Loading catalog...</div>' +
    '<div class="pl-progress" id="pl-progress"></div></div>';
  call('plugin_fetch_catalog', {});
}

function renderInstalled() {
  Shell.setTitle('Installed Plugins');
  Shell.setActions('');
  el('page-root').innerHTML =
    '<div class="glass-card"><h3>Installed</h3><div id="pl-installed" class="muted">Loading...</div></div>';
  call('plugin_list_installed', {});
}

function renderTokens() {
  Shell.setTitle('Token Plugins');
  Shell.setActions('');
  el('page-root').innerHTML =
    '<div class="glass-card"><h3>Assignments</h3>' +
    '<div class="form-group"><label>Token</label><select id="pt-token"></select></div>' +
    '<div class="form-group"><label>Plugin</label><select id="pt-plugin"></select></div>' +
    '<button class="primary-btn" id="pt-assign">Assign</button>' +
    '<h4 style="margin:14px 0 6px;">Global plugins</h4><div id="pt-global"></div>' +
    '<h4 style="margin:14px 0 6px;">Token plugins</h4><div id="pt-list"></div></div>';
  el('pt-assign').onclick = function () {
    call('plugin_assign', { token_index: parseInt(el('pt-token').value, 10), plugin_key: el('pt-plugin').value });
  };
  call('plugin_get_token_list', {});
  call('plugin_list_installed', {});
}

function renderPluginPage(params) {
  Shell.setTitle('Plugin');
  Shell.setActions('');
  el('page-root').innerHTML = '<div class="glass-card" id="pl-page">Loading plugin page...</div>';
  call('plugin_get_page', { key: params.key });
}

var wired = false;
function wire() {
  if (wired) return;
  wired = true;

  Session.on('plugin_catalog', function (list) {
    var box = el('pl-catalog');
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = '<div class="muted">Catalog empty.</div>';
      return;
    }
    box.innerHTML = list.map(function (p) {
      return '<div class="pl-card">' +
        '<span class="pl-icon">' + renderIcon(p.icon) + '</span>' +
        '<span class="grow"><strong>' + esc(p.name || p.id) + '</strong>' +
        '<small class="muted">v' + esc(p.version || '') + ' by ' + esc(p.author || '') + '</small>' +
        '<br><small class="muted">' + esc(p.description || '') + '</small></span>' +
        (p.installed ? '<span class="set-pill">installed</span>' : '<button class="primary-btn" data-install="' + esc(p.id) + '">Install</button>') +
        '</div>';
    }).join('');
    box.querySelectorAll('[data-install]').forEach(function (b) {
      b.onclick = function () {
        el('pl-progress').style.display = 'block';
        el('pl-progress').textContent = 'Preparing...';
        call('plugin_install_remote', { id: b.getAttribute('data-install') });
      };
    });
  });

  Session.on('plugin_install_progress', function (d) {
    var box = el('pl-progress');
    if (!box) return;
    box.style.display = 'block';
    box.textContent = d.step + ' (' + d.percent + '%) ' + (d.message || '');
    if (d.percent >= 100) setTimeout(function () { box.style.display = 'none'; }, 2500);
  });

  Session.on('plugin_installed_list', function (list) {
    var box = el('pl-installed');
    if (box) {
      if (!list || !list.length) {
        box.innerHTML = '<div class="muted">No plugins installed.</div>';
      } else {
        box.innerHTML = list.map(function (p) {
          return '<div class="pl-card">' +
            '<span class="pl-icon">' + renderIcon(p.icon) + '</span>' +
            '<span class="grow"><strong>' + esc(p.name || p.key) + '</strong>' +
            '<small class="muted">v' + esc(p.version || '') + '</small>' +
            '<br><small class="muted">' + esc(p.description || '') + '</small></span>' +
            '<div class="toggle-switch' + (p.disabled ? '' : ' active') + '" data-enable="' + esc(p.key) + '" title="enabled"></div>' +
            '<button class="danger-btn" data-uninstall="' + esc(p.key) + '">Uninstall</button></div>';
        }).join('');
        box.querySelectorAll('[data-enable]').forEach(function (t) {
          t.onclick = function () {
            call('plugin_set_enabled', { id: t.getAttribute('data-enable'), enable: !t.classList.contains('active') });
          };
        });
        box.querySelectorAll('[data-uninstall]').forEach(function (b) {
          b.onclick = function () {
            customConfirm('Fully uninstall this plugin?').then(function (ok) {
              if (ok) call('plugin_uninstall', { key: b.getAttribute('data-uninstall') });
            });
          };
        });
      }
    }
    var sel = el('pt-plugin');
    if (sel) {
      sel.innerHTML = (list || []).map(function (p) {
        return '<option value="' + esc(p.key) + '">' + esc(p.name || p.key) + '</option>';
      }).join('');
    }
  });

  Session.on('plugin_token_list', function (d) {
    var sel = el('pt-token');
    if (!sel) return;
    sel.innerHTML = (d.tokens || []).map(function (t) {
      return '<option value="' + t.index + '">' + esc(t.name) + ' (' + t.plugin_count + ' plugins)</option>';
    }).join('');
    var g = el('pt-global');
    if (g) {
      g.innerHTML = (d.global_plugins || []).map(function (k) {
        return '<span class="pl-chip">' + esc(k) + '<button data-unglobal="' + esc(k) + '">✕</button></span>';
      }).join('') || '<span class="muted" style="font-size:.75rem;">none</span>';
      g.querySelectorAll('[data-unglobal]').forEach(function (b) {
        b.onclick = function () { call('plugin_set_global', { plugin_key: b.getAttribute('data-unglobal'), global: false }); };
      });
    }
    if (sel.value !== '') call('plugin_get_token_plugins', { token_index: parseInt(sel.value, 10) });
    sel.onchange = function () { call('plugin_get_token_plugins', { token_index: parseInt(sel.value, 10) }); };
  });

  Session.on('plugin_token_plugins', function (d) {
    var box = el('pt-list');
    if (!box) return;
    box.innerHTML = (d.plugins || []).map(function (p) {
      return '<span class="pl-chip">' + esc(p.key) + (p.global ? ' (global)' : '') +
        '<button data-unassign="' + esc(p.key) + '">✕</button></span>';
    }).join('') || '<span class="muted" style="font-size:.75rem;">none</span>';
    box.querySelectorAll('[data-unassign]').forEach(function (b) {
      b.onclick = function () {
        var sel = el('pt-token');
        call('plugin_unassign', { token_index: parseInt(sel.value, 10), plugin_key: b.getAttribute('data-unassign') });
      };
    });
  });

  Session.on('plugin_page_content', function (d) {
    var box = el('pl-page');
    if (box) box.innerHTML = d.html || '';
  });

  Session.on('plugin_sidebar_update', function (list) {
    (list || []).forEach(function (p) {
      if (!p.key) return;
      Shell.registerNav({ page: 'plugin/' + p.key, label: p.title || p.key, icon: 'plug', ac: '#ef4444', dock: false, ctx: 'global', group: 'plugins' });
    });
    Shell.syncActive();
  });
}

Router.add('/plugins/browse', renderBrowse, { guard: 'auth', css: ['plugins.css'] });
Router.add('/plugins/installed', renderInstalled, { guard: 'auth', css: ['plugins.css'] });
Router.add('/plugins/tokens', renderTokens, { guard: 'auth', css: ['plugins.css'] });
Router.add('/plugin/:key', renderPluginPage, { guard: 'auth', css: ['plugins.css'] });
Shell.registerNav({ page: 'plugins/browse', label: 'Browse', icon: 'plug', ac: '#ef4444', dock: false, ctx: 'global', group: 'plugins' });
Shell.registerNav({ page: 'plugins/installed', label: 'Installed', icon: 'grid', ac: '#ef4444', dock: false, ctx: 'global', group: 'plugins' });
Shell.registerNav({ page: 'plugins/tokens', label: 'Token Plugins', icon: 'shield', ac: '#ef4444', dock: false, ctx: 'global', group: 'plugins' });
wire();
})();