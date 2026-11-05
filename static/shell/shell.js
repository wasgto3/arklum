(function () {
  var NAV = [];
  function el(id) {
    return document.getElementById(id);
  }
  function on(node, ev, fn) {
    if (node) node.addEventListener(ev, fn);
  }
  function isMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
  }
  function curPath() {
    return location.pathname;
  }
  function currentGuild() {
    var c = Router.current();
    if (c && c.params && c.params.gid) return c.params.gid;
    return null;
  }
  function shellHidden() {
    var c = Router.current();
    if (!c) return true;
    return c.route.opts.shell === false;
  }
  function registerNav(entry) {
    for (var i = 0; i < NAV.length; i++) {
      if (NAV[i].page === entry.page) {
        NAV[i] = entry;
        syncActive();
        return;
      }
    }
    NAV.push(entry);
    syncActive();
  }
  function entriesFor(ctx) {
    return NAV.filter(function (e) {
      return e.ctx === 'both' || e.ctx === ctx;
    });
  }
  function findEntry(page) {
    for (var i = 0; i < NAV.length; i++) {
      if (NAV[i].page === page) return NAV[i];
    }
    return null;
  }
  function matches(entry) {
    var p = curPath();
    return p === '/' + entry.page + '/' || p.indexOf('/' + entry.page + '/') === 0;
  }
  function renderServerRail() {
    var rail = el('ns-server-rail');
    if (!rail) return;
    var gid = currentGuild();
    var logo = State.get('ui.logo', '');
    var html = '<div class="nsr-logo"><img src="' + esc(logo || '/arklum.png') + '" alt=""></div>';
    html += '<button class="nsr-home' + (!gid ? ' active' : '') + '" data-nav-home title="Home">' + arkIcon('home', 18) + '</button>';
    html += '<div class="nsr-sep"></div>';
    (Session.guilds || []).forEach(function (g) {
      html += '<button class="nsr-srv' + (gid === g.id ? ' active' : '') + '" data-guild="' + esc(g.id) + '" title="' + esc(g.name) + '">' + (g.icon_url ? '<img src="' + esc(g.icon_url) + '" alt="">' : esc(g.name.charAt(0))) + '</button>';
    });
    html += '<button class="nsr-add" data-nav-servers title="Servers">+</button>';
    rail.innerHTML = html;
  }
  function renderModRail() {
    var rail = el('ns-rail');
    if (!rail) return;
    var gid = currentGuild();
    var ctx = gid ? 'server' : 'global';
    var g = null;
    (Session.guilds || []).forEach(function (x) {
      if (x.id === gid) g = x;
    });
    var html = '<div class="ns-head">' + (g && g.icon_url ? '<img src="' + esc(g.icon_url) + '" alt="">' : '<img src="/arklum.png" alt="">') + '<b>' + esc(g ? g.name : 'ARKLUM') + '</b><button class="ns-pin">' + arkIcon('dots', 12) + '</button></div>';
    var lastGroup = '';
    entriesFor(ctx).forEach(function (e) {
      var grp = e.group || 'general';
      if (grp !== lastGroup) {
        html += '<div class="ns-grp">' + esc(grp.toUpperCase()) + '</div>';
        lastGroup = grp;
      }
      html += '<div class="ns-it' + (matches(e) ? ' active' : '') + '" data-page="' + esc(e.page) + '" style="--ac:' + e.ac + '">' + arkIcon(e.icon, 18) + '<span class="ns-lbl">' + esc(e.label) + '</span></div>';
    });
    rail.innerHTML = html;
    if (State.get('ui.railOpen', false)) rail.classList.add('open');
    else rail.classList.remove('open');
  }
  function renderDock() {
    var dock = el('ns-dock');
    if (!dock) return;
    var ctx = currentGuild() ? 'server' : 'global';
    var pinned = State.get('ui.dockTabs', ['home', 'servers', 'dms', 'settings']);
    var items = entriesFor(ctx).filter(function (e) {
      if (!pinned || !pinned.length) return e.dock;
      return pinned.some(function (p) { return e.page === p || e.page.startsWith(p + '/'); });
    });
    var html = '';
    if (NAV.length > items.length) html += '<a href="#" data-more style="--ac:#8b90a8"><i class="ns-bump"></i>' + arkIcon('dots', 20) + '<span>More</span></a>';
    items.forEach(function (e) {
      html += '<a href="#" data-page="' + esc(e.page) + '" style="--ac:' + e.ac + '"><i class="ns-bump"></i>' + arkIcon(e.icon, 20) + '<span>' + esc(e.label) + '</span></a>';
    });
    dock.innerHTML = html;
  }
  function renderSheet() {
    var sheet = el('ns-sheet');
    if (!sheet) return;
    var ctx = currentGuild() ? 'server' : 'global';
    var html = '<div class="nsh-bar"></div>';
    var lastGroup = '';
    entriesFor(ctx).forEach(function (e) {
      var grp = e.group || 'general';
      if (grp !== lastGroup) {
        html += '<div class="nsh-grp">' + esc(grp.toUpperCase()) + '</div>';
        lastGroup = grp;
      }
      html += '<div class="nsh-it' + (matches(e) ? ' nsh-active' : '') + '" data-page="' + esc(e.page) + '" style="--ac:' + e.ac + '">' + arkIcon(e.icon, 18) + esc(e.label) + '</div>';
    });
    sheet.innerHTML = html;
  }
  function applyOffset() {
    var main = el('ns-main');
    if (!main) return;
    var off = (!shellHidden() && !isMobile()) ? 132 : 0;
    main.style.marginLeft = off + 'px';
    main.style.width = off ? 'calc(100vw - ' + off + 'px)' : '';
  }
  function syncActive() {
    var hide = shellHidden();
    document.body.classList.toggle('ns-hide', hide);
    if (hide) {
      applyOffset();
      return;
    }
    renderServerRail();
    renderModRail();
    renderDock();
    renderSheet();
    applyOffset();
  }
  function openSheet() {
    var s = el('ns-sheet');
    var b = el('ns-sheet-backdrop');
    if (s) s.classList.add('show');
    if (b) b.classList.add('show');
  }
  function closeSheet() {
    var s = el('ns-sheet');
    var b = el('ns-sheet-backdrop');
    if (s) s.classList.remove('show');
    if (b) b.classList.remove('show');
  }
  function setTitle(t) {
    var n = el('ns-title');
    if (n) n.textContent = t;
  }
  function setActions(html) {
    var a = el('ns-actions');
    if (a) a.innerHTML = html || '';
  }
  window.Shell = {
    registerNav: registerNav,
    setTitle: setTitle,
    setActions: setActions,
    syncActive: syncActive,
    openSheet: openSheet,
    closeSheet: closeSheet
  };
  function wire() {
    on(el('ns-server-rail'), 'click', function (e) {
      if (e.target.closest('[data-nav-home]')) {
        Router.go('/home/');
        return;
      }
      if (e.target.closest('[data-nav-servers]')) {
        Router.go('/servers/');
        return;
      }
      var srv = e.target.closest('.nsr-srv');
        if (srv) {
         openChatSite(srv.getAttribute('data-guild'));
         return;
       }
    });
    on(el('ns-rail'), 'click', function (e) {
      var rail = el('ns-rail');
      if (!rail) return;
      if (e.target.closest('.ns-pin')) {
        rail.classList.toggle('open');
        State.set('ui.railOpen', rail.classList.contains('open'));
        return;
      }
      var it = e.target.closest('.ns-it');
      if (it) {
        if (!rail.classList.contains('open')) {
          rail.classList.add('open');
          State.set('ui.railOpen', true);
          return;
        }
        var entry = findEntry(it.getAttribute('data-page'));
        if (entry && entry.act === 'chatsite') {
          openChatSite(currentGuild());
          return;
        }
        if (entry && entry.act === 'webhooks') {
          openWebhooksSite();
          return;
        }
        Router.go('/' + it.getAttribute('data-page') + '/');
        return;
      }
      rail.classList.toggle('open');
      State.set('ui.railOpen', rail.classList.contains('open'));
    });
    on(document, 'click', function (e) {
      var rail = el('ns-rail');
      if (!rail) return;
      if (rail.contains(e.target)) return;
      if (e.target.closest('#ns-server-rail')) return;
      rail.classList.remove('open');
    });
    on(el('ns-dock'), 'click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      closeSheet();
      if (a.hasAttribute('data-more')) {
        openSheet();
        return;
      }
      if (a.hasAttribute('data-page')) Router.go('/' + a.getAttribute('data-page') + '/');
    });
    on(el('ns-dock'), 'contextmenu', function (e) {
      e.preventDefault();
    });
    on(el('ns-sheet-backdrop'), 'click', closeSheet);
    on(el('ns-sheet'), 'click', function (e) {
      var it = e.target.closest('.nsh-it');
      if (!it) return;
      var entry = findEntry(it.getAttribute('data-page'));
      if (entry && entry.act === 'chatsite') {
        closeSheet();
        openChatSite(currentGuild());
        return;
      }
     if (entry && entry.act === 'webhooks') {
        closeSheet();
        openWebhooksSite();
        return;
      }
      closeSheet();
      Router.go('/' + it.getAttribute('data-page') + '/');
    });
    var origGo = Router.go;
    var origReplace = Router.replace;
    Router.go = function (p) {
      origGo(p);
      syncActive();
    };
    Router.replace = function (p) {
      origReplace(p);
      syncActive();
    };
    window.addEventListener('popstate', function () {
      setTimeout(syncActive, 0);
    });
    window.addEventListener('resize', function () {
      syncActive();
    });
    if (window.Session && Session.onChange) Session.onChange(function () {
      syncActive();
    });
  }
  var chatSiteWired = false;
    function openChatSite(gid) {
      if (!window.Session || !Session.socket) return;
      Session.socket.emit('run_command', { cmd: 'chatsite_open', params: { guild_id: gid } });
    }
    function openWebhooksSite() {
      if (!window.Session || !Session.socket) return;
      Session.socket.emit('run_command', { cmd: 'webhooks_open', params: {} });
    }
    if (!chatSiteWired && window.Session && Session.on) {
     chatSiteWired = true;
     function siteUrl(d) {
      var u = d && (d.url || '');
      if (!u && d && d.port) u = location.protocol + '//' + location.hostname + ':' + d.port + (d.path || '/');
      if (!u) return '';
      try {
        var a = document.createElement('a');
        a.href = u;
        if (a.hostname === 'localhost' || a.hostname === '127.0.0.1') a.hostname = location.hostname;
        return a.href;
      } catch (e) { return u; }
    }
    Session.on('chatsite_opened', function (d) {
      var u = siteUrl(d);
      if (u) window.open(u, '_blank');
    });
    Session.on('webhooks_opened', function (d) {
      var u = siteUrl(d);
      if (u) window.open(u, '_blank');
    });
  }
  wire();
  syncActive();
})();