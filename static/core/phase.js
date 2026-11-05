(function () {
  var overlay = document.getElementById('connecting-overlay');
  var phaseEl = document.getElementById('boot-phase');
  var hidden = false;
  var hideTimer = null;
  function setPhase(t) {
    if (phaseEl) phaseEl.textContent = t;
  }
  function show(t) {
    if (!overlay) return;
    clearTimeout(hideTimer);
    hidden = false;
    overlay.classList.remove('boot-done');
    overlay.classList.remove('boot-fail');
    overlay.classList.remove('hidden');
    if (t) setPhase(t);
  }
  function hide(delay) {
    if (!overlay || hidden) return;
    hidden = true;
    overlay.classList.add('boot-done');
    hideTimer = setTimeout(function () {
      overlay.classList.add('hidden');
    }, (delay || 500) + 80);
  }
  function fail(t) {
    if (!overlay) return;
    clearTimeout(hideTimer);
    hidden = false;
    overlay.classList.remove('hidden');
    overlay.classList.remove('boot-done');
    overlay.classList.add('boot-fail');
    setPhase(t || 'Failed');
    hideTimer = setTimeout(function () {
      hidden = true;
      overlay.classList.add('boot-done');
      setTimeout(function () {
        overlay.classList.add('hidden');
      }, 520);
    }, 1000);
  }
  function wrapLogin() {
    if (!window.Session) return;
    ['loginWithToken', 'loginWithRaw'].forEach(function (m) {
      var orig = Session[m];
      if (typeof orig !== 'function') return;
      Session[m] = function () {
        show('Authenticating');
        return orig.apply(Session, arguments);
      };
    });
  }
  function tick() {
    if (!window.Session) return;
    if (Session.booting) {
      show('Connecting');
      return;
    }
    if (Session.connected) {
      if (!hidden) {
        setPhase('Restoring session');
        hide(500);
      }
      return;
    }
    hide(0);
  }
  function parallax() {
    var fine = window.matchMedia && matchMedia('(pointer:fine)').matches;
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (!fine || calm) return;
    var el = document.querySelector('.ld-tilt');
    if (!el) return;
    var tx = 0, ty = 0, cx = 0, cy = 0;
    addEventListener('pointermove', function (e) {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
    });
    (function loop() {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      el.style.setProperty('--px', cx.toFixed(3));
      el.style.setProperty('--py', cy.toFixed(3));
      requestAnimationFrame(loop);
    })();
  }
  if (window.Session) {
    wrapLogin();
    if (Session.onChange) Session.onChange(tick);
    if (Session.on) {
      Session.on('login_success', function () {
        setPhase('Ready');
        hide(400);
      });
      Session.on('login_failed', function () {
        fail('Login failed');
      });
      Session.on('disconnect', function () {
        if (!Session.booting) show('Reconnecting');
      });
    }
    tick();
  }
  document.addEventListener('DOMContentLoaded', function () {
    wrapLogin();
    tick();
    parallax();
  });
  parallax();
  window.Phase = { show: show, hide: hide, set: setPhase, fail: fail };
})();