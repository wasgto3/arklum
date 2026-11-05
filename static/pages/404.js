(function () {
  function render404() {
    Shell.setTitle('Page Not Found');
    Shell.setActions('');
    var root = document.getElementById('page-root');
    if (!root) return;

    var isFile = location.protocol === 'file:';
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || /^192\.168\./.test(location.hostname);

    root.innerHTML =
      '<div class="nf-wrap">' +
        '<div class="nf-card anim-in">' +
          '<div class="nf-emoji">404</div>' +
          '<h1 class="nf-title">Oops! There\'s something wrong.</h1>' +
          '<p class="nf-sub">It\'s not your fault though. The page you\'re looking for doesn\'t exist or couldn\'t be loaded.</p>' +
          '<button class="secondary-btn nf-toggle" id="nf-why-btn" type="button">See why this happened</button>' +
          '<div class="nf-panel" id="nf-panel" style="display:none;">' +
            '<h3 class="nf-h">Possible causes</h3>' +
            '<ul class="nf-list">' +
              '<li><strong>Backend disconnected (ERR_CONNECTION_REFUSED):</strong> The Arklum Node.js process might have crashed, stopped, or restarted. Check your terminal, PM2, or systemd service status.</li>' +
              '<li><strong>Missing files (404 / ERR_FILE_NOT_FOUND):</strong> A file is missing from your Arklum codebase. This usually happens if an update didn\'t copy all files correctly, or a file was accidentally deleted. Try running a repair or reinstalling.</li>' +
              (isFile ? '<li><strong>Opened directly (file://):</strong> Browsers block the dashboard from loading scripts when opened as a local file. Always open it via <code>http://localhost:8000</code>.</li>' : '') +
              (!isLocal ? '<li><strong>Network / Proxy issue:</strong> If you\'re accessing this over a network, a reverse proxy might be dropping the connection or serving stale assets.</li>' : '') +
            '</ul>' +
            '<h3 class="nf-h">How to check</h3>' +
            '<p class="nf-p">Open <strong>Developer Tools</strong> (F12 on desktop, or "Inspect" / "Developer Mode" in mobile browsers) and check the <strong>Console</strong> and <strong>Network</strong> tabs for red error messages. Look for status codes like 404, 500, or network failures.</p>' +
          '</div>' +
          '<div class="nf-actions">' +
            '<button class="primary-btn" id="nf-home" type="button">Go Home</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('nf-why-btn').onclick = function () {
      var p = document.getElementById('nf-panel');
      var btn = document.getElementById('nf-why-btn');
      if (p.style.display === 'none') {
        p.style.display = 'block';
        btn.textContent = 'Hide details';
      } else {
        p.style.display = 'none';
        btn.textContent = 'See why this happened';
      }
    };

    document.getElementById('nf-home').onclick = function () {
      Router.go('/home/');
    };
  }

  Router.add('/404', render404, { css: ['404.css'], shell: false });
})();