(function () {
  var timer = null;
  var TILES = [
    { key: 'ping', label: 'Ping', icon: 'pulse' },
    { key: 'uptime', label: 'Uptime', icon: 'refresh' },
    { key: 'cpu', label: 'CPU', icon: 'sliders' },
    { key: 'ram', label: 'RAM', icon: 'grid' },
    { key: 'guilds', label: 'Servers', icon: 'book' },
    { key: 'users', label: 'Users', icon: 'users' }
  ];
  function click(id, fn) {
    var n = document.getElementById(id);
    if (n) n.onclick = fn;
  }
  function fmtUptime(s) {
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + m + 'm';
    return m + 'm';
  }
  function valFor(key, info) {
    if (key === 'ping') return info.ping + 'ms';
    if (key === 'uptime') return fmtUptime(info.uptime || 0);
    if (key === 'cpu') return info.cpu_percent + '%';
    if (key === 'ram') return info.memory_percent + '%';
    if (key === 'guilds') return String(info.guilds || 0);
    return String(info.users || 0);
  }
  function buildTiles() {
    return TILES.map(function (t) {
      return '<div class="stat-box">' +
        '<div class="stat-ic">' + arkIcon(t.icon, 18) + '</div>' +
        '<div class="stat-value" data-k="' + t.key + '"><div class="skeleton" style="width:70%"></div></div>' +
        '<div class="stat-label">' + t.label + '</div></div>';
    }).join('');
  }
  function applyStats(info) {
    if (!info) return;
    TILES.forEach(function (t) {
      var node = document.querySelector('.stat-value[data-k="' + t.key + '"]');
      if (node) node.textContent = valFor(t.key, info);
    });
    var up = document.getElementById('hm-up');
    if (up) up.textContent = 'UP ' + fmtUptime(info.uptime || 0);
  }
  function fetchStats() {
    Session.call('get_system_stats', {});
  }
  function startTimer() {
    if (timer) clearInterval(timer);
    var interval = (State.get('ui.refreshInterval', 3) || 3) * 1000;
    timer = setInterval(fetchStats, interval);
  }
  function renderHome() {
    Shell.setTitle('Home');
    Shell.setActions('<button class="header-btn" id="home-refresh" title="Refresh">' + arkIcon('refresh', 16) + '</button>');
    var b = Session.bot || {};
    document.getElementById('page-root').innerHTML =
      '<div class="hm-card anim-in">' +
      '<div class="hm-avwrap"><img src="' + esc(b.avatar_url || '/arklum.png') + '" alt=""><span class="hm-up" id="hm-up">UP —</span></div>' +
      '<div class="hm-id"><b>' + esc(b.name || 'Arklum') + '</b><small>online · ready</small><br>' +
      '<span class="hm-idpill">ID ' + esc(b.id || '—') + '</span></div></div>' +
      '<div class="stats-grid anim-in" id="home-stats">' + buildTiles() + '</div>';
    click('home-refresh', fetchStats);
    startTimer();
    fetchStats();
  }
  Session.on('system_stats', applyStats);
  Router.add('/home', renderHome, {
    guard: 'auth',
    css: ['home.css'],
    onExit: function () {
      if (timer) clearInterval(timer);
      timer = null;
    }
  });
  Shell.registerNav({ page: 'home', label: 'Home', icon: 'home', dock: true, ctx: 'both', group: 'general' });
})();