(function () {
  var previewIndex = -1;
  var previewData = null;
  function el(id) {
    return document.getElementById(id);
  }
  function onLoginRoute() {
    var c = Router.current();
    return c && c.route.path === '/login';
  }
  function paintError() {
    var e = el('lg-err');
    if (e) e.textContent = Session.loginError || '';
  }
  function previewBox(t) {
    if (!previewData) {
      return '<div class="lg-verify" style="margin:-4px 0 10px;"><span class="spinner-inline"></span><span class="muted" style="font-size:.8rem;">Loading preview…</span></div>';
    }
    if (previewData.invalid) {
      return '<div class="lg-verify" style="margin:-4px 0 10px;border-color:var(--danger);">' +
        '<div style="color:var(--danger);font-size:.85rem;font-weight:700;">Token invalid or expired</div>' +
        '<div style="display:flex;gap:8px;margin-top:8px;"><button class="danger-btn" data-remove="' + t.index + '">Remove token</button></div></div>';
    }
    var av = previewData.avatar_url || previewData.saved_avatar || '';
    var name = previewData.name || previewData.saved_name || ('Token ' + (t.index + 1));
    return '<div class="lg-verify" style="margin:-4px 0 10px;display:block;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      (av ? '<img src="' + esc(av) + '" alt="">' : '<span class="sti-av">' + esc(name.charAt(0)) + '</span>') +
      '<div style="min-width:0;"><div style="font-weight:700;color:var(--text);">' + esc(name) + '</div>' +
      '<small class="muted" style="font:600 10px var(--font-mono);">' + esc(previewData.id || 'id unknown') + '</small></div></div>' +
      '<div class="muted" style="font-size:.8rem;margin-top:8px;">' + (previewData.active ? 'Currently connected' : 'Not connected') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;">' +
      '<button class="primary-btn" data-login="' + t.index + '">Login</button>' +
      '<button class="danger-btn" data-remove="' + t.index + '">Remove</button>' +
      '</div></div>';
  }
  function paintTokens() {
    var box = el('lg-tokens');
    if (!box) return;
    var tokens = Session.tokens || [];
    if (!tokens.length) {
      box.innerHTML = '<div class="muted" style="font-size:.8rem;padding:6px;">No tokens saved.</div>';
      return;
    }
    box.innerHTML = tokens.map(function (t) {
      var active = t.index === Session.activeIndex;
      var name = t.name || ('Token ' + (t.index + 1));
      return '<div class="saved-token-item' + (active ? ' active' : '') + '" data-idx="' + t.index + '" style="cursor:pointer;">' +
        (t.avatar ? '<span class="sti-av"><img src="' + esc(t.avatar) + '" alt="" onerror="this.style.display=\'none\'"></span>' : '<span class="sti-av">' + esc(name.charAt(0).toUpperCase()) + '</span>') +
        '<span class="sti-info"><b>' + esc(name) + '</b><small>token ' + (t.index + 1) + (active ? ' · active' : ' · saved') + '</small></span>' +
        (active ? '<span class="sti-dot"></span>' : '') +
        '<span class="sti-chev">›</span></div>' +
        (previewIndex === t.index ? previewBox(t) : '');
    }).join('');
    box.querySelectorAll('.saved-token-item').forEach(function (row) {
      row.onclick = function () {
        var idx = parseInt(row.getAttribute('data-idx'), 10);
        if (previewIndex === idx) {
          previewIndex = -1;
          previewData = null;
          paintTokens();
          return;
        }
        previewIndex = idx;
        previewData = null;
        paintTokens();
        Session.socket.emit('token_details_request', { index: idx });
      };
    });
    box.querySelectorAll('[data-login]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        Session.loginWithToken(parseInt(b.getAttribute('data-login'), 10));
      };
    });
    box.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var idx = parseInt(b.getAttribute('data-remove'), 10);
        customConfirm('Remove this token from the vault?').then(function (ok) {
          if (!ok) return;
          Session.removeToken(idx);
          previewIndex = -1;
          previewData = null;
        });
      };
    });
  }
  function renderLogin() {
    Shell.setTitle('Arklum');
    Shell.setActions('');
    previewIndex = -1;
    previewData = null;
    el('page-root').innerHTML =
      '<div class="lg-wrap"><div class="lg-card">' +
      '<div class="lg-head"><img src="/arklum.png" alt=""><h1>ARKLUM</h1><small>Discord · discord.js v14 · socket.io · plugins</small></div>' +
      '<div class="lg-sec">SAVED TOKENS</div><div id="lg-tokens"></div>' +
      '<div class="lg-sec">BOT TOKEN</div>' +
      '<input type="password" id="lg-token" placeholder="Paste bot token" autocomplete="off">' +
      '<div id="lg-verify-box" class="lg-verify" style="display:none"></div>' +
      '<div class="lg-btns" id="lg-btns"><button class="secondary-btn" id="lg-verify">Verify Token</button><button class="secondary-btn" id="lg-save">Save Token</button><button class="primary-btn" id="lg-login">Save & Login</button></div>' +
      '<div class="lg-err" id="lg-err"></div>' +
      '<small class="lg-credits">Made by 1KD [Y&B STUDIO]</small>' +
      '</div></div>';
    paintTokens();
    paintError();
    var tokenInput = el('lg-token');
    var btnRow = el('lg-btns');
    function syncBtns() {
      if (btnRow) btnRow.classList.toggle('show', !!tokenInput && tokenInput.value.trim().length > 0);
    }
    if (tokenInput) tokenInput.addEventListener('input', syncBtns);
    syncBtns();
    var verifyBox = el('lg-verify-box');
    var verifyBtn = el('lg-verify');
    var saveBtn = el('lg-save');
    var loginBtn = el('lg-login');
    if (verifyBtn) verifyBtn.onclick = function () {
      var token = tokenInput ? tokenInput.value.trim() : '';
      if (!token) {
        Session.loginError = 'Token required';
        paintError();
        return;
      }
      Session.verifyToken(token).then(function (d) {
        if (verifyBox) {
          verifyBox.style.display = 'flex';
          verifyBox.innerHTML = (d.avatar ? '<img src="' + esc(d.avatar) + '" alt="">' : '') + '<b>' + esc(d.name) + '</b>';
        }
        Session.loginError = '';
        paintError();
      }).catch(function (e) {
        if (verifyBox) verifyBox.style.display = 'none';
        Session.loginError = e.message;
        paintError();
      });
    };
    if (saveBtn) saveBtn.onclick = function () {
      var token = tokenInput ? tokenInput.value.trim() : '';
      if (!token) {
        Session.loginError = 'Token required';
        paintError();
        return;
      }
      Session.addToken(token);
      tokenInput.value = '';
      syncBtns();
    };
    if (loginBtn) loginBtn.onclick = function () {
      var token = tokenInput ? tokenInput.value.trim() : '';
      if (!token) {
        Session.loginError = 'Token required';
        paintError();
        return;
      }
      Session.addToken(token);
      Session.once('token_list', function (d) {
        Session.loginWithToken((d.tokens && d.tokens.length ? d.tokens.length : 1) - 1);
      });
    };
  }
  Session.on('token_details', function (d) {
    if (!onLoginRoute() || d.index !== previewIndex) return;
    previewData = d;
    paintTokens();
  });
  Session.on('token_list', function () {
    if (onLoginRoute()) paintTokens();
  });
  Session.on('login_failed', function () {
    if (onLoginRoute()) paintError();
  });
  Session.on('login_success', function () {
    Router.replace(State.get('session.lastRoute', '') || '/home/');
  });
  Router.add('/login', renderLogin, { guard: 'guest', css: ['login.css'], shell: false });
})();