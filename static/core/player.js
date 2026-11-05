(function () {
  var ov = null, media = null, raf = null, kind = 'audio';
  var IC = {
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
    vol: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    mute: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    full: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>'
  };
  function fmt(t) { if (!isFinite(t) || t < 0) return '0:00'; var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  function build() {
    if (ov) return;
    ov = document.createElement('div');
    ov.id = 'pl-overlay';
    ov.innerHTML =
      '<div class="pl-top"><span id="pl-title" class="pl-title"></span><button id="pl-close" class="lb-btn" type="button">' + IC.close + '</button></div>' +
      '<div class="pl-stage" id="pl-stage"></div>' +
      '<div class="pl-controls">' +
      '<button id="pl-play" class="pl-play" type="button">' + IC.play + '</button>' +
      '<span id="pl-cur" class="pl-time">0:00</span>' +
      '<div class="pl-seek" id="pl-seek"><div class="pl-fill" id="pl-fill"></div><div class="pl-knob" id="pl-knob"></div></div>' +
      '<span id="pl-dur" class="pl-time">0:00</span>' +
      '<button id="pl-mute" class="lb-btn" type="button">' + IC.vol + '</button>' +
      '<button id="pl-full" class="lb-btn" type="button">' + IC.full + '</button>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('pl-close').onclick = close;
    document.getElementById('pl-play').onclick = function () { if (!media) return; if (media.paused) media.play(); else media.pause(); };
    document.getElementById('pl-mute').onclick = function () { if (!media) return; media.muted = !media.muted; this.innerHTML = media.muted ? IC.mute : IC.vol; };
    document.getElementById('pl-full').onclick = function () { if (!media) return; if (document.fullscreenElement) document.exitFullscreen(); else if (media.requestFullscreen) media.requestFullscreen(); };
    document.getElementById('pl-seek').addEventListener('pointerdown', function (e) {
      if (!media || !media.duration) return;
      var r = this.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      media.currentTime = p * media.duration;
    });
  }
  function tick() {
    if (!media) return;
    var d = media.duration || 0, c = media.currentTime || 0;
    document.getElementById('pl-cur').textContent = fmt(c);
    document.getElementById('pl-dur').textContent = fmt(d);
    var p = d ? (c / d) * 100 : 0;
    document.getElementById('pl-fill').style.width = p + '%';
    document.getElementById('pl-knob').style.left = p + '%';
    document.getElementById('pl-play').innerHTML = media.paused ? IC.play : IC.pause;
    raf = requestAnimationFrame(tick);
  }
  function close() {
    if (media) { media.pause(); media.removeAttribute('src'); media.load(); media = null; }
    if (raf) cancelAnimationFrame(raf);
    if (ov) ov.classList.remove('open');
    var st = document.getElementById('pl-stage');
    if (st) st.innerHTML = '';
  }
  window.openPlayer = function (url, k, title) {
    build();
    kind = k || 'audio';
    var st = document.getElementById('pl-stage');
    st.innerHTML = '';
    media = document.createElement(kind === 'video' ? 'video' : 'audio');
    media.src = url;
    media.preload = 'metadata';
    media.className = kind === 'video' ? 'pl-video' : 'pl-audio';
    st.appendChild(media);
    if (kind === 'audio') {
      var vis = document.createElement('div');
      vis.className = 'pl-audiovis';
      vis.innerHTML = '<div class="pl-bar"></div><div class="pl-bar"></div><div class="pl-bar"></div><div class="pl-bar"></div><div class="pl-bar"></div>';
      st.appendChild(vis);
      media.addEventListener('play', function () { vis.classList.add('on'); });
      media.addEventListener('pause', function () { vis.classList.remove('on'); });
      media.addEventListener('ended', function () { vis.classList.remove('on'); });
    }
    document.getElementById('pl-title').textContent = title || (kind === 'video' ? 'Video' : 'Audio');
    document.getElementById('pl-full').style.display = kind === 'video' ? '' : 'none';
    ov.classList.add('open');
    tick();
    media.play().catch(function () {});
  };
  window.closePlayer = close;
})();