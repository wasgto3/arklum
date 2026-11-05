(function () {
  if (window.NS_NOTIF_READY) return;
  window.NS_NOTIF_READY = true;
  var store = [];
  try {
    store = JSON.parse(localStorage.getItem('ns_notif_center') || '[]');
  } catch (e) {
    store = [];
  }
  var MAX = 50;
  var panelOpen = false;
  var ICONS = {
    mention: '@',
    dm: '💬',
    error: '⚠️',
    warning: '⚠️',
    update: '🛈',
    success: '✓',
    info: '🛈'
  };
  function save() {
    try {
      localStorage.setItem('ns_notif_center', JSON.stringify(store.slice(0, MAX)));
    } catch (e) {}
  }
  function escS(x) {
    return window.esc ? window.esc(x) : String(x);
  }
  function badge() {
    var n = 0;
    for (var i = 0; i < store.length; i++) {
      if (!store[i].read) n++;
    }
    var badges = document.querySelectorAll('.ns-notif-badge');
    for (var j = 0; j < badges.length; j++) {
      badges[j].textContent = n > 99 ? '99+' : String(n);
      badges[j].style.display = n > 0 ? 'flex' : 'none';
    }
  }
  function renderPanel(p) {
    var html = '<div class="ns-notif-head"><strong>Notifications</strong><button class="ns-notif-clear" id="ns-notif-clear">Clear</button></div><div class="ns-notif-list">';
    if (!store.length) {
      html += '<div class="ns-notif-empty">No notifications yet</div>';
    } else {
      for (var i = 0; i < store.length; i++) {
        var x = store[i];
        html += '<div class="ns-notif-item' + (x.read ? '' : ' unread') + '" data-idx="' + i + '">' +
          '<span class="ns-notif-ic">' + (ICONS[x.type] || '🛈') + '</span>' +
          '<div class="ns-notif-body"><div class="ns-notif-title">' + escS(x.title) + '</div>' +
          (x.body ? '<div class="ns-notif-sub">' + escS(x.body) + '</div>' : '') +
          '<div class="ns-notif-time">' + new Date(x.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div></div></div>';
      }
    }
    html += '</div>';
    p.innerHTML = html;
    var clear = document.getElementById('ns-notif-clear');
    if (clear) clear.onclick = function () { NS_NOTIF.clearAll(); };
    var items = p.querySelectorAll('.ns-notif-item');
    for (var k = 0; k < items.length; k++) {
      items[k].onclick = function () {
        NS_NOTIF.read(parseInt(this.getAttribute('data-idx'), 10));
      };
    }
  }
  function closePanel() {
    var p = document.getElementById('ns-notif-panel');
    if (p) p.remove();
    panelOpen = false;
  }
  function makeBell() {
    var b = document.createElement('button');
    b.id = 'ns-notif-btn';
    b.className = 'header-btn ns-notif-anchor';
    b.title = 'Notifications';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M12 3.2c-3.3 0-5.7 2.5-5.7 5.9v3.1l-1.5 2.6c-.3.5.1 1.2.7 1.2h13c.6 0 1-.7.7-1.2l-1.5-2.6V9.1c0-3.4-2.4-5.9-5.7-5.9z"/><path fill="currentColor" d="M12 1.4l1.2 1.2L12 3.8l-1.2-1.2z"/><path fill="var(--primary)" d="M12 17.6l1.7 2-1.7 2-1.7-2z"/></svg><span class="ns-notif-badge"></span>';
    b.onclick = function (e) {
      e.stopPropagation();
      NS_NOTIF.toggle(b);
    };
    return b;
  }
  function ensureUI() {
    var actions = document.getElementById('ns-actions');
    if (!actions) return;
    if (!document.getElementById('ns-notif-btn')) {
      actions.insertBefore(makeBell(), actions.firstChild);
    }
    badge();
  }
  window.NS_NOTIF = {
    push: function (type, title, body) {
      store.unshift({ type: type, title: title, body: body || '', ts: Date.now(), read: false });
      store = store.slice(0, MAX);
      save();
      badge();
      var p = document.getElementById('ns-notif-panel');
      if (p && panelOpen) renderPanel(p);
    },
    read: function (i) {
      if (store[i]) {
        store[i].read = true;
        save();
        badge();
        var p = document.getElementById('ns-notif-panel');
        if (p) renderPanel(p);
      }
    },
    clearAll: function () {
      store = [];
      save();
      badge();
      var p = document.getElementById('ns-notif-panel');
      if (p) renderPanel(p);
    },
    toggle: function (anchor) {
      var old = document.getElementById('ns-notif-panel');
      if (old) {
        closePanel();
        return;
      }
      var p = document.createElement('div');
      p.id = 'ns-notif-panel';
      p.className = 'ns-notif-panel';
      var r = anchor.getBoundingClientRect();
      p.style.top = Math.min(r.bottom + 8, window.innerHeight - 80) + 'px';
      p.style.left = Math.max(8, Math.min(r.left - 140, window.innerWidth - 330)) + 'px';
      document.body.appendChild(p);
      panelOpen = true;
      renderPanel(p);
      setTimeout(function () {
        document.addEventListener('click', function h(e) {
          if (!e.target.closest('#ns-notif-panel') && !e.target.closest('.ns-notif-anchor')) {
            closePanel();
            document.removeEventListener('click', h);
          }
        });
      }, 50);
    }
  };
  function toast(title, sub, type) {
    var t = document.createElement('div');
    t.className = 'ns-toast ns-toast-' + (type || 'info');
    t.innerHTML = '<strong>' + escS(title) + '</strong>' + (sub ? '<span>' + escS(sub) + '</span>' : '');
    document.body.appendChild(t);
    setTimeout(function () {
      t.classList.add('show');
    }, 10);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 250);
    }, 2600);
  }
  window.pushNotification = function (title, sub, type, duration) {
    toast(title, sub, type);
    var low = String(title || '').toLowerCase();
    var transient = /copied|sent|posted|idle|saved|loading|refresh|microphone|reaction/.test(low);
    var conn = /bot not connected|not connected|reconnect/.test(low);
    if (conn || (!transient && (type === 'error' || type === 'warning'))) {
      NS_NOTIF.push(type === 'warning' ? 'warning' : 'error', title, sub || '');
    }
  };
  window.showNotif = function (kind, msg) {
    if (!msg) return;
    var who = msg.display_name || msg.author || 'Someone';
    var text = msg.content_raw || '';
    NS_NOTIF.push(kind === 'dm' ? 'dm' : 'mention', (kind === 'dm' ? 'DM from ' : 'Mention from ') + who, text.slice(0, 80));
  };
  if (window.Session && Session.on) {
    Session.on('notification', function (m) {
      toast(m, '', 'success');
    });
    Session.on('error', function (d) {
      window.pushNotification(d && d.message ? d.message : 'Error', '', 'error', 3000);
    });
  }
  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(ensureUI, 200); });
    } else {
      setTimeout(ensureUI, 200);
    }
    setInterval(ensureUI, 1500);
  }
  boot();
})();