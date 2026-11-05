(function () {
  var t = new URLSearchParams(location.search).get('t') || '';
  if (!t) { try { t = localStorage.getItem('arklum_cs_ticket') || ''; } catch (e) {} }
  var cfg = null;
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/__config?t=' + encodeURIComponent(t), false);
    xhr.send();
    if (xhr.status === 200) cfg = JSON.parse(xhr.responseText);
  } catch (e) {}

  if (!cfg || !cfg.guild_id) {
    document.title = 'Arklum Chat — invalid session';
    document.addEventListener('DOMContentLoaded', function () {
      document.body.innerHTML = '<p style="padding:24px;font-family:var(--font);color:#ccc">Invalid or expired chat link. Open it again from Arklum.</p>';
    });
    window.STANDALONE_BROKEN = true;
    return;
  }

  try { if (t) localStorage.setItem('arklum_cs_ticket', t); } catch (e) {}
  window.STANDALONE_GUILD = cfg.guild_id;
  window.STANDALONE_MAIN = cfg.main_origin;
  document.write('<script src="' + cfg.main_origin + '/socket.io/socket.io.js"></script>');

  var clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  window.STANDALONE_CLIENT = clientId;

  if (window.State) State.set('session.lastRoute', '/server/' + cfg.guild_id + '/chat/');

  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('standalone');
  });

  function hb() {
    fetch('/__hb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: clientId }) }).catch(function () {});
  }
  hb();
  setInterval(hb, 20000);

  window.addEventListener('beforeunload', function () {
    navigator.sendBeacon('/__bye', JSON.stringify({ client: clientId }));
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      window.dispatchEvent(new CustomEvent('arklum-font-ready'));
    });
  } else {
    window.dispatchEvent(new CustomEvent('arklum-font-ready'));
  }
})();