(function () {
if (window.NS_UPDATE_READY) return;
window.NS_UPDATE_READY = true;
var payload = null;

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureModal() {
  if (document.getElementById('ns-upd-backdrop')) return;
  var wrap = document.createElement('div');
  wrap.id = 'ns-upd-backdrop';
  wrap.className = 'ns-upd-backdrop';
  wrap.innerHTML =
    '<div class="ns-upd-card">' +
      '<h2>Update Required</h2>' +
      '<p>A new version is available.</p>' +
      '<p class="ns-upd-ver"><span id="ns-upd-cur">?</span> <span>→</span> <span id="ns-upd-lat">?</span></p>' +
      '<div class="ns-upd-btns">' +
        '<button class="ns-upd-how" id="ns-upd-how">How to update</button>' +
        '<button class="ns-upd-det" id="ns-upd-det">Details</button>' +
        '<button class="ns-upd-close" id="ns-upd-close">Later</button>' +
      '</div>' +
      '<div class="ns-upd-panel" id="ns-upd-panel"></div>' +
    '</div>';
  document.body.appendChild(wrap);

  document.getElementById('ns-upd-how').onclick = function () {
    var p = document.getElementById('ns-upd-panel');
    p.style.display = 'block';
    p.innerHTML =
      '<div class="ns-upd-instructions">' +
        '<p>1. Turn off Arklum (stop the process / close the terminal).</p>' +
        '<p>2. Run <code>1kd check</code> to check for updates.</p>' +
        '<p>3. Run <code>1kd update</code> to update Arklum.</p>' +
        '<p>4. Start Arklum again with <code>npm start</code>.</p>' +
      '</div>';
  };

  document.getElementById('ns-upd-det').onclick = function () {
    var p = document.getElementById('ns-upd-panel');
    p.style.display = 'block';
    p.innerHTML = '';

    var notes = payload && payload.notes;
    if (notes && Array.isArray(notes) && notes.length > 0) {
      var acc = document.createElement('div');
      acc.className = 'arkv-acc';
      var openIdx = -1;

      notes.forEach(function (group, idx) {
        var card = document.createElement('div');
        card.className = 'arkv-card';

        var head = document.createElement('button');
        head.className = 'arkv-card-h';
        var titleSpan = document.createElement('span');
        titleSpan.className = 'arkv-card-t';
        titleSpan.textContent = group.title;
        var actSpan = document.createElement('span');
        actSpan.className = 'arkv-card-a';
        actSpan.textContent = 'View';
        head.appendChild(titleSpan);
        head.appendChild(actSpan);

        var body = document.createElement('div');
        body.className = 'arkv-card-b';
        body.style.display = 'none';
        var ul = document.createElement('ul');
        (group.lines || []).forEach(function (line) {
          var li = document.createElement('li');
          li.textContent = line;
          ul.appendChild(li);
        });
        body.appendChild(ul);

        head.onclick = function () {
          if (openIdx === idx) {
            body.style.display = 'none';
            actSpan.textContent = 'View';
            openIdx = -1;
          } else {
            var cards = acc.querySelectorAll('.arkv-card');
            for (var i = 0; i < cards.length; i++) {
              cards[i].querySelector('.arkv-card-b').style.display = 'none';
              cards[i].querySelector('.arkv-card-a').textContent = 'View';
            }
            body.style.display = 'block';
            actSpan.textContent = 'Show less';
            openIdx = idx;
          }
        };

        card.appendChild(head);
        card.appendChild(body);
        acc.appendChild(card);
      });
      p.appendChild(acc);
    } else {
      var c = payload ? (payload.commitMsg || '') : '';
      p.textContent = c ? ('Commit: ' + c) : 'No commit details for this release.';
    }
  };

  document.getElementById('ns-upd-close').onclick = function () {
    wrap.classList.remove('show');
  };
  wrap.addEventListener('click', function (e) {
    if (e.target === wrap) wrap.classList.remove('show');
  });
}

function line(msg) {
  var p = document.getElementById('ns-upd-panel');
  if (p && p.style.display === 'block') {
    p.textContent += msg + '\n';
    p.scrollTop = p.scrollHeight;
  } else if (window.pushNotification) {
    window.pushNotification(msg, '', 'info', 2000);
  }
}

if (window.Session && Session.on) {
  Session.on('update_available', function (d) {
    payload = d;
    ensureModal();
    document.getElementById('ns-upd-cur').textContent = d.current || '?';
    document.getElementById('ns-upd-lat').textContent = d.latest || '?';
    document.getElementById('ns-upd-backdrop').classList.add('show');
  });
  Session.on('update_not_available', function (d) {
    if (window.pushNotification) window.pushNotification(d.message || 'Up to date.', '', 'success', 2000);
  });
  Session.on('update_progress', function (d) {
    line(d.step + ' (' + d.percent + '%)');
  });
  Session.on('update_complete', function (d) {
    line(d.message || 'Done.');
  });
  Session.on('update_error', function (d) {
    line('Error: ' + (d.message || 'unknown'));
  });
}
})();