(function () {
  var KEY = 'arklum.v1';
  function blank() {
    return {
      v: 1,
      migrated: false,
      session: { lastRoute: '', perGuild: {}, lastDm: null },
      ui: { theme: 'dark', themePath: '', font: 'Inter', density: 'cozy', radius: 'subtle', shadow: 'normal', animSpeed: '1', animEasing: 'ease', logo: '', railOpen: true },
      cache: { botLite: null, guildsLite: null, ts: 0 }
    };
  }
  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (parsed && parsed.v === 1) return parsed;
    } catch (e) {}
    return blank();
  }
  var data = load();
  var dirty = false;
  var lastSent = '';
  function migrate() {
    if (data.migrated) return;
    var map = {
      theme: 'arklum_theme',
      font: 'arklum_font',
      density: 'arklum_density',
      radius: 'arklum_border_radius',
      shadow: 'arklum_shadow_intensity',
      animSpeed: 'arklum_animation_speed',
      animEasing: 'arklum_animation_easing',
      logo: 'arklum_sidebar_logo_url'
    };
    for (var field in map) {
      var old = localStorage.getItem(map[field]);
      if (old) data.ui[field] = old;
    }
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('ns_srv') === 0) {
        var gid = k.slice(6);
        if (gid) {
          data.session.perGuild[gid] = data.session.perGuild[gid] || { page: '', channelId: '' };
          data.session.perGuild[gid].page = localStorage.getItem(k) || '';
        }
      }
    }
    var lastChannel = localStorage.getItem('lastChatChannel');
    var lastDm = localStorage.getItem('lastChatDM');
    if (lastDm) {
      try { data.session.lastDm = JSON.parse(lastDm).id || null; } catch (e) { data.session.lastDm = null; }
    }
    if (lastChannel) data.session.lastChannel = lastChannel;
    data.migrated = true;
    persist();
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  function get(path, fallback) {
    var cur = data;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return fallback;
      cur = cur[parts[i]];
    }
    return cur === undefined ? fallback : cur;
  }
  function set(path, value) {
    var parts = String(path).split('.');
    var cur = data;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    dirty = true;
    persist();
  }
  function sessionPayload() {
    return {
      lastRoute: data.session.lastRoute,
      perGuild: data.session.perGuild,
      lastDm: data.session.lastDm,
      lastChannel: data.session.lastChannel || ''
    };
  }
  function sendSnapshot(force) {
    if (window.STANDALONE_GUILD) return;
    if (!window.socket) return;
    var payload = JSON.stringify(sessionPayload());
    if (!force && payload === lastSent) return;
    lastSent = payload;
    window.socket.emit('run_command', { cmd: 'ui_state_save', params: { state: sessionPayload() } });
  }
  migrate();
  setInterval(function () {
    if (dirty) {
      dirty = false;
      sendSnapshot(false);
    }
  }, 10000);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) sendSnapshot(true);
  });
  window.addEventListener('pagehide', function () {
    sendSnapshot(true);
  });
  window.State = {
    get: get,
    set: set,
    all: function () { return data; },
    snapshot: sendSnapshot,
    session: sessionPayload
  };
})();