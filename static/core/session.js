(function () {
  var HASH_RULES = [
    [/^#server\/(\d+)\/?$/, '/server/$1/'],
    [/^#servers\/?$/, '/servers/'],
    [/^#chat\/?$/, '/chat/'],
    [/^#settings\/([\w-]+)\/?$/, '/settings/$1/'],
    [/^#settings\/?$/, '/settings/'],
    [/^#home\/?$/, '/home/'],
    [/^#login\/?$/, '/login/']
  ];

  function migrateHash() {
    var h = location.hash || '';
    if (!h || h === '#') return;
    for (var i = 0; i < HASH_RULES.length; i++) {
      if (HASH_RULES[i][0].test(h)) {
        history.replaceState(null, '', h.replace(HASH_RULES[i][0], HASH_RULES[i][1]));
        return;
      }
    }
    history.replaceState(null, '', location.pathname);
  }

  var changeListeners = [];
  var bootTimer = null;
  var refuseCount = 0;

  var Session = {
    socket: null,
    live: false,
    connected: false,
    booting: true,
    hasReceipts: false,
    tokens: [],
    activeIndex: -1,
    bot: State.get('cache.botLite', null),
    guilds: State.get('cache.guildsLite', []),
    prefs: {},
    uiState: null,
    loginError: ''
  };

  var resolveReady = null;
  Session.ready = new Promise(function (res) { resolveReady = res; });

  function emitChange() {
    for (var i = 0; i < changeListeners.length; i++) changeListeners[i](Session);
  }

  Session.onChange = function (fn) { changeListeners.push(fn); };

  // stub socket: keeps every module alive when the server is unreachable
  function deadSocket() {
    var noop = function () {};
    return {
      connected: false,
      on: noop, once: noop, off: noop, emit: noop,
      to: function () { return { emit: noop }; },
      io: { engine: { transport: { name: 'none' } } }
    };
  }

  function cachePaint() {
    State.set('cache.botLite', Session.bot);
    State.set('cache.guildsLite', Session.guilds);
    State.set('cache.ts', Date.now());
  }

  function hideOverlay() {
    var ov = document.getElementById('connecting-overlay');
    if (ov) ov.classList.add('hidden');
  }

  function finishBoot() {
    if (!Session.booting) return;
    Session.booting = false;
    resolveReady(Session);
    if (Session.connected) {
      var deep = location.pathname !== '/' ? location.pathname : '';
      var last = deep || State.get('session.lastRoute', '') || (Session.uiState && Session.uiState.lastRoute) || '/home/';
      Router.replace(last);
    } else {
      Router.replace('/login/');
    }
    setTimeout(hideOverlay, 300);
    emitChange();
  }

  function requestWhoami() {
    if (Session.activeIndex < 0) return;
    Session.socket.emit('token_details_request', { index: Session.activeIndex });
  }

  Session.on = function (ev, fn) { Session.socket.on(ev, fn); };
  Session.once = function (ev, fn) { Session.socket.once(ev, fn); };

  Session.call = function (cmd, params, timeoutMs) {
    return new Promise(function (resolve) {
      if (!Session.socket || !Session.live) {
        resolve(null);
        return;
      }
      if (!Session.hasReceipts) {
        Session.socket.emit('run_command', { cmd: cmd, params: params || {} });
        resolve(null);
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(null);
      }, timeoutMs || 30000);
      Session.socket.emit('run_command', { cmd: cmd, params: params || {} }, function (ack) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ack && ack.ok) resolve(ack.result === undefined ? null : ack.result);
        else resolve(null);
      });
    });
  };

  Session.loginWithToken = function (index) { Session.socket.emit('login', { token_index: index }); };
  Session.loginWithRaw = function (token) { Session.socket.emit('login', { token: token }); };
  Session.addToken = function (token) { Session.socket.emit('add_token', { token: token }); };
  Session.removeToken = function (index) { Session.socket.emit('remove_token_request', { index: index }); };

  Session.verifyToken = function (token) {
    return new Promise(function (resolve, reject) {
      if (!Session.live) {
        reject(new Error('Server unreachable'));
        return;
      }
      Session.socket.once('token_verified', function (d) { resolve(d); });
      Session.socket.once('token_verification_failed', function (d) { reject(new Error((d && d.error) || 'invalid token')); });
      Session.socket.emit('verify_token', { token: token });
    });
  };

  function wire(base) {
    var s = Session.socket;

    s.on('connect', function () {
      refuseCount = 0;
      clearTimeout(bootTimer);
      bootTimer = setTimeout(finishBoot, 1500);
    });

    s.on('connect_error', function () {
      refuseCount++;
      if (refuseCount === 4 && window.Phase) {
        Phase.fail('Cannot reach server at ' + base);
      }
    });

    s.on('disconnect', function () {
      Session.connected = false;
      emitChange();
    });

    s.on('session_snapshot', function (d) {
      Session.hasReceipts = true;
      clearTimeout(bootTimer);
      Session.connected = !!d.connected;
      Session.bot = d.bot || Session.bot;
      Session.guilds = d.guilds || Session.guilds;
      Session.activeIndex = d.active_index !== undefined ? d.active_index : Session.activeIndex;
      Session.prefs = d.prefs || {};
      Session.uiState = d.ui_state || null;
      if (window.Theme) Theme.applyPrefs(Session.prefs);
      cachePaint();
      finishBoot();
    });

    s.on('token_list', function (d) {
      Session.tokens = d.tokens || [];
      Session.activeIndex = d.active_index !== undefined ? d.active_index : -1;
      emitChange();
    });

    s.on('bot_status', function (d) {
      Session.connected = !!d.connected;
      Session.guilds = d.guilds || [];
      cachePaint();
      if (d.connected && !Session.bot) requestWhoami();
      if (Session.booting) {
        clearTimeout(bootTimer);
        bootTimer = setTimeout(finishBoot, 400);
      }
      emitChange();
    });

    s.on('token_details', function (d) {
      if (d && d.id && (!Session.bot || Session.bot.id !== d.id)) {
        Session.bot = { id: d.id, name: d.name || d.saved_name || 'Bot', avatar_url: d.avatar_url || null };
        cachePaint();
        emitChange();
      }
    });

    s.on('login_success', function (d) {
      clearTimeout(bootTimer);
      Session.connected = true;
      Session.bot = d.bot || Session.bot;
      Session.guilds = d.guilds || [];
      Session.activeIndex = d.active_index !== undefined ? d.active_index : Session.activeIndex;
      Session.loginError = '';
      cachePaint();
      finishBoot();
    });

    s.on('login_failed', function (d) {
      Session.loginError = (d && d.error) || 'Login failed';
      if (Session.booting) finishBoot();
      emitChange();
    });

    s.on('dashboard_prefs', function (p) {
      Session.prefs = p || {};
      if (window.Theme) Theme.applyPrefs(p);
      emitChange();
    });
  }

  migrateHash();

  var proto = location.protocol;
  var hostName = location.hostname; // Never rewrite to 127.0.0.1
  var computed = proto + '//' + hostName + (location.port ? ':' + location.port : '');
  var base = window.STANDALONE_MAIN
    ? String(window.STANDALONE_MAIN) // Stop replacing localhost
    : computed;
  
  var ioOpts = {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 12000,
    transports: ['polling', 'websocket'],
    upgrade: true
  };

  // expose Session immediately so no module can ever see "Session is not defined"
  if (typeof window.io !== 'function') {
    Session.socket = deadSocket();
    window.socket = Session.socket;
    window.Session = Session;
    if (window.Phase) Phase.fail('Server unreachable — socket.io missing');
    return;
  }

  Session.live = true;
  Session.socket = io(base, ioOpts);
  window.socket = Session.socket;
  window.Session = Session;

  wire(base);

  Router.setGuard('auth', function () {
    if (Session.connected) return true;
    Router.replace('/login/');
    return false;
  });

  Router.setGuard('guest', function () {
    if (!Session.connected) return true;
    Router.replace('/home/');
    return false;
  });
  Router.setGuard('notFound', function (pathname) {
    if (pathname === '/404/') return;
    if (window.STANDALONE_GUILD) Router.replace('/server/' + window.STANDALONE_GUILD + '/chat/');
    else Router.replace('/404/');
  });
})();