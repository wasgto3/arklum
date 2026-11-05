(function () {
  function pct(g) {
    return Math.min(100, Math.round(((g.presence_count || 0) / Math.max(1, g.member_count || 1)) * 100));
  }
  function barClass(p) {
    return p > 60 ? '' : p > 25 ? ' mid' : ' lo';
  }
  function openChatSite(gid) {
    Session.socket.emit('run_command', { cmd: 'chatsite_open', params: { guild_id: gid } });
  }
  function renderServers() {
    Shell.setTitle('Servers');
    Shell.setActions('<button class="header-btn" id="srv-refresh" title="Refresh">' + arkIcon('refresh', 16) + '</button>');
    var root = document.getElementById('page-root');
    var guilds = Session.guilds || [];
    if (!guilds.length) {
      root.innerHTML = '<div class="glass-card"><div class="empty-state">' + arkIcon('grid', 40) + '<p>No servers visible to this bot.</p></div></div>';
      return;
    }
    root.innerHTML = '<div class="srv-grid">' + guilds.map(function (g) {
      var p = pct(g);
      return '<div class="srv-card" data-gid="' + esc(g.id) + '">' +
        '<div class="srv-bn"' + (g.banner_url ? ' style="background-image:url(' + esc(g.banner_url) + ')"' : '') + '><span class="srv-ct">' + (g.member_count || 0).toLocaleString() + ' members</span></div>' +
        '<div class="srv-av">' + (g.icon_url ? '<img src="' + esc(g.icon_url) + '" alt="" loading="lazy">' : esc(g.name.charAt(0))) + '</div>' +
        '<div class="srv-bd"><h4>' + esc(g.name) + '</h4>' +
        '<div class="srv-bar"><i class="' + barClass(p).trim() + '" style="width:' + p + '%"></i></div>' +
        '<div class="srv-pc"><span>ONLINE</span><span>' + p + '%</span></div>' +
        '<div class="srv-actions"><button class="primary-btn" data-chat="' + esc(g.id) + '">Open Chat</button>' +
        '<button class="secondary-btn" data-manage="' + esc(g.id) + '">Manage</button></div>' +
        '<small class="srv-id">' + esc(g.id) + '</small></div></div>';
    }).join('') + '</div>';
    document.getElementById('srv-refresh').onclick = function () {
      Session.call('clear_runtime_cache', {}).then(function () {
        Router.replace('/servers/');
      });
    };
    root.querySelectorAll('[data-chat]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        openChatSite(b.getAttribute('data-chat'));
      };
    });
    root.querySelectorAll('[data-manage]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        Router.go('/server/' + b.getAttribute('data-manage') + '/overview/');
      };
    });
    root.querySelectorAll('.srv-card').forEach(function (card) {
      card.onclick = function () {
        Router.go('/server/' + card.getAttribute('data-gid') + '/overview/');
      };
    });
  }
  Session.on('chatsite_opened', function (d) {
    if (d && d.url) window.open(d.url, '_blank');
  });
  Router.add('/servers', renderServers, { guard: 'auth', css: ['servers.css'] });
  Shell.registerNav({ page: 'servers', label: 'Servers', icon: 'grid', dock: true, ctx: 'global', group: 'general' });
})();