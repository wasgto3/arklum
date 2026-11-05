(function () {
  var BROKEN = '/arklum-broken.svg';
  var gallery = [];
  var index = 0;
  var zoom = 1;
  var overlay = null;
  var stage = null;
  var counter = null;
  var capEl = null;
  var strip = null;
  var prevBtn = null;
  var nextBtn = null;
  var swipeX = null;
  var swipeY = null;
  window.mediaFail = function (el) {
    if (!el || el.dataset.failed) return;
    el.dataset.failed = '1';
    if (el.tagName === 'IMG') {
      el.src = BROKEN;
      el.classList.add('media-broken');
    } else if (el.tagName === 'VIDEO') {
      var img = document.createElement('img');
      img.src = BROKEN;
      img.className = 'media-broken';
      if (el.parentNode) el.parentNode.replaceChild(img, el);
    }
  };
  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'lb-overlay';
    overlay.innerHTML =
      '<div class="lb-top">' +
      '<span id="lb-counter" class="lb-counter"></span>' +
      '<span id="lb-cap" class="lb-cap"></span>' +
      '<div class="lb-btns">' +
      '<button id="lb-zoom-out" class="lb-btn" type="button">−</button>' +
      '<button id="lb-zoom-in" class="lb-btn" type="button">+</button>' +
      '<button id="lb-dl" class="lb-btn" type="button">⤓</button>' +
      '<button id="lb-close" class="lb-btn" type="button">✕</button>' +
      '</div></div>' +
      '<button id="lb-prev" class="lb-nav lb-prev" type="button">‹</button>' +
      '<div id="lb-stage" class="lb-stage"></div>' +
      '<button id="lb-next" class="lb-nav lb-next" type="button">›</button>' +
      '<div id="lb-strip" class="lb-strip"></div>';
    document.body.appendChild(overlay);
    stage = document.getElementById('lb-stage');
    counter = document.getElementById('lb-counter');
    capEl = document.getElementById('lb-cap');
    strip = document.getElementById('lb-strip');
    prevBtn = document.getElementById('lb-prev');
    nextBtn = document.getElementById('lb-next');
    document.getElementById('lb-close').onclick = closeLightbox;
    document.getElementById('lb-zoom-in').onclick = function () { setZoom(zoom + 0.5); };
    document.getElementById('lb-zoom-out').onclick = function () { setZoom(zoom - 0.5); };
    document.getElementById('lb-dl').onclick = function () {
      var it = gallery[index];
      if (!it) return;
      var a = document.createElement('a');
      a.href = it.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = it.name || 'media';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    prevBtn.onclick = function () { go(index - 1); };
    nextBtn.onclick = function () { go(index + 1); };
    stage.addEventListener('touchstart', function (e) {
      swipeX = e.touches[0].clientX;
      swipeY = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (swipeX === null) return;
      var dx = e.changedTouches[0].clientX - swipeX;
      var dy = e.changedTouches[0].clientY - swipeY;
      swipeX = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { go(index + (dx < 0 ? 1 : -1)); return; }
      if (dy > 90) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === '+' || e.key === '=') setZoom(zoom + 0.5);
      else if (e.key === '-') setZoom(zoom - 0.5);
    });
  }
  function setZoom(z) {
    zoom = Math.max(0.5, Math.min(4, z));
    var m = stage.querySelector('img,video');
    if (m) m.style.transform = 'scale(' + zoom + ')';
  }
  function go(i) {
    if (i < 0 || i >= gallery.length) return;
    index = i;
    render();
  }
  function render() {
    var it = gallery[index];
    if (!it) return;
    zoom = 1;
    stage.innerHTML = '';
    var el;
    if (it.type === 'video') {
      el = document.createElement('video');
      el.src = it.url;
      el.controls = true;
      el.playsInline = true;
      el.onerror = function () { window.mediaFail(el); };
    } else if (it.type === 'audio') {
      var wrap = document.createElement('div');
      wrap.className = 'lb-audio';
      var ic = document.createElement('img');
      ic.src = BROKEN;
      ic.className = 'media-broken';
      el = document.createElement('audio');
      el.src = it.url;
      el.controls = true;
      wrap.appendChild(ic);
      wrap.appendChild(el);
      stage.appendChild(wrap);
      el = null;
    } else {
      el = document.createElement('img');
      el.src = it.url;
      el.onerror = function () { window.mediaFail(el); };
    }
    if (el) stage.appendChild(el);
    counter.textContent = (index + 1) + ' / ' + gallery.length;
    capEl.textContent = it.name || '';
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= gallery.length - 1;
    prevBtn.style.display = gallery.length > 1 ? '' : 'none';
    nextBtn.style.display = gallery.length > 1 ? '' : 'none';
    strip.innerHTML = '';
    if (gallery.length > 1) {
      gallery.forEach(function (g, i) {
        var t = document.createElement('img');
        t.src = g.type === 'audio' ? BROKEN : g.url;
        t.className = i === index ? 'active' : '';
        t.loading = 'lazy';
        t.onclick = function () { go(i); };
        strip.appendChild(t);
      });
    }
  }
  window.openLightbox = function (url, type, fromEl) {
    build();
    gallery = [];
    index = 0;
    var scope = fromEl && fromEl.closest ? fromEl.closest('.msg-row') : null;
    var cells = scope ? scope.querySelectorAll('.att-cell') : [];
    Array.prototype.forEach.call(cells, function (c) {
      var v = c.querySelector('video');
      var u = c.getAttribute('data-url') || (v ? v.getAttribute('src') : null);
      var ty = c.getAttribute('data-type') || (v ? 'video' : 'image');
      if (!u) return;
      gallery.push({ url: u, type: ty, name: c.getAttribute('data-name') || '' });
      if (u === url) index = gallery.length - 1;
    });
    if (!gallery.length) gallery = [{ url: url, type: type || 'image', name: '' }];
    overlay.classList.add('open');
    render();
  };
  window.closeLightbox = function () {
    if (overlay) overlay.classList.remove('open');
  };
})();