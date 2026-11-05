(function () {
  var FONTS = [
    { name: 'Inter', weight: '400;500;600;700' },
    { name: 'Roboto', weight: '400;500;700' },
    { name: 'Open Sans', weight: '400;600;700' },
    { name: 'Poppins', weight: '400;500;600;700' },
    { name: 'Nunito', weight: '400;600;700' },
    { name: 'Montserrat', weight: '400;500;600;700' }
  ];
  var RADII = {
    sharp: { radius: '2px', radiusSm: '2px' },
    subtle: { radius: '8px', radiusSm: '4px' },
    rounded: { radius: '16px', radiusSm: '8px' },
    pill: { radius: '999px', radiusSm: '16px' }
  };
  var SHADOWS = {
    none: 'none',
    subtle: '0 2px 8px rgba(0,0,0,0.1)',
    normal: '0 4px 16px rgba(0,0,0,0.15)',
    deep: '0 8px 32px rgba(0,0,0,0.25)'
  };
  var Theme = { fonts: FONTS, current: null };
  function root() { return document.documentElement; }
  function persist(key, value) {
    if (window.Session && Session.call) Session.call('dashboard_save_pref', { key: key, value: value });
  }
  function clearCustomDom() {
    var st = document.getElementById('custom-chat-style');
    if (st) st.remove();
    var ov = document.querySelector('.bg-overlay');
    if (ov) ov.remove();
    ['headerLeftImgSlot', 'headerRightImgSlot'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.src = ''; el.style.display = 'none'; }
    });
    ['chatCornerTL', 'chatCornerBR'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  }
  Theme.setTheme = function (name, save) {
    document.body.classList.remove('theme-dark', 'theme-oled', 'theme-light', 'custom-theme');
    document.body.classList.add('theme-' + name);
    clearCustomDom();
    root().style.removeProperty('--bg-image');
    root().style.removeProperty('--bg-overlay');
    Theme.current = null;
    State.set('ui.theme', name);
    State.set('ui.themePath', '');
    if (save !== false) { persist('theme', name); persist('theme_path', ''); }
  };
  Theme.setFont = function (name, save) {
    var font = FONTS.filter(function (f) { return f.name === name; })[0] || FONTS[0];
    var link = document.getElementById('google-fonts-link');
    if (link) link.href = 'https://fonts.googleapis.com/css2?family=' + font.name.replace(/ /g, '+') + ':wght@' + font.weight + '&display=swap';
    document.body.style.fontFamily = "var(--font)";
    State.set('ui.font', font.name);
    if (save !== false) persist('font', font.name);
  };
  Theme.setDensity = function (val, save) {
    document.body.classList.toggle('density-compact', val === 'compact');
    State.set('ui.density', val);
    if (save !== false) persist('density', val);
  };
  Theme.setRadius = function (val, save) {
    var r = RADII[val] || RADII.subtle;
    root().style.setProperty('--radius', r.radius);
    root().style.setProperty('--radius-sm', r.radiusSm);
    State.set('ui.radius', val);
    if (save !== false) persist('border_radius', val);
  };
  Theme.setShadow = function (val, save) {
    root().style.setProperty('--shadow', SHADOWS[val] || SHADOWS.normal);
    State.set('ui.shadow', val);
    if (save !== false) persist('shadow_intensity', val);
  };
  Theme.setAnimSpeed = function (val, save) {
    root().style.setProperty('--animation-speed', String(val));
    State.set('ui.animSpeed', String(val));
    if (save !== false) persist('animation_speed', parseFloat(val));
  };
  Theme.setAnimEasing = function (val, save) {
    root().style.setProperty('--animation-easing', val);
    State.set('ui.animEasing', val);
    if (save !== false) persist('animation_easing', val);
  };
  Theme.applyCustom = function (path, save) {
    fetch('/' + path).then(function (r) { return r.json(); }).then(function (theme) {
      Theme.current = theme;
      document.body.classList.remove('theme-dark', 'theme-oled', 'theme-light');
      document.body.classList.add('custom-theme');
      var rt = root();
      rt.style.setProperty('--bg-deep', theme.colors['bg-deep']);
      rt.style.setProperty('--primary', theme.colors.primary);
      rt.style.setProperty('--secondary', theme.colors.secondary);
      rt.style.setProperty('--text', theme.colors.text);
      rt.style.setProperty('--text-muted', theme.colors['text-muted']);
      if (theme.glass) {
        rt.style.setProperty('--glass-bg', 'rgba(24,24,27,' + theme.glass.opacity + ')');
        rt.style.setProperty('--blur', theme.glass.blur + 'px');
        rt.style.setProperty('--vibrancy', theme.glass.vibrancy + '%');
        rt.style.setProperty('--dispersion', theme.glass.shadow + 'px');
      }
      if (theme.fonts) {
        if (theme.fonts.body) { rt.style.setProperty('--font', theme.fonts.body); document.body.style.fontFamily = theme.fonts.body; }
        if (theme.fonts.heading) rt.style.setProperty('--font-heading', theme.fonts.heading);
      }
      rt.style.setProperty('--bg-image', 'none');
      rt.style.setProperty('--bg-overlay', 'transparent');
      var old = document.querySelector('.bg-overlay');
      if (old) old.remove();
      var assetsBase = '/' + path.substring(0, path.lastIndexOf('/') + 1);
      if (theme.background && theme.background.image) {
        rt.style.setProperty('--bg-image', 'url(' + assetsBase + theme.background.image + ')');
        if (theme.background.overlay) {
          rt.style.setProperty('--bg-overlay', theme.background.overlay);
          var ov = document.createElement('div');
          ov.className = 'bg-overlay';
          document.body.appendChild(ov);
        }
      }
      if (theme.assets) {
        if (theme.assets.loadingScreen) {
          var overlay = document.getElementById('connecting-overlay');
          if (overlay) overlay.innerHTML = '<img src="' + assetsBase + theme.assets.loadingScreen + '" style="max-width:160px;max-height:160px;object-fit:contain;margin-bottom:16px;">';
        }
        if (theme.assets.sidebarLogo) State.set('ui.logo', assetsBase + theme.assets.sidebarLogo);
      }
      if (theme.chat) {
        rt.style.setProperty('--chat-bg', theme.chat.bg);
        rt.style.setProperty('--chat-text', theme.chat.text);
        rt.style.setProperty('--chat-opacity', theme.chat.opacity);
        rt.style.setProperty('--chat-blur', theme.chat.blur + 'px');
        rt.style.setProperty('--chat-glow', theme.chat.glow + 'px');
      }
      var chatStyle = document.getElementById('custom-chat-style') || document.createElement('style');
      chatStyle.id = 'custom-chat-style';
      chatStyle.textContent = '.message-wrapper .msg-text{background:var(--chat-bg)!important;color:var(--chat-text)!important;opacity:var(--chat-opacity)!important;backdrop-filter:blur(var(--chat-blur))!important;box-shadow:0 0 var(--chat-glow) rgba(0,212,170,0.3)!important;border-radius:12px;padding:8px 14px;}';
      document.head.appendChild(chatStyle);
      Theme.applyVisuals();
      State.set('ui.themePath', path);
      if (save !== false) persist('theme_path', path);
    }).catch(function () {});
  };
  Theme.applyVisuals = function () {
    var theme = Theme.current;
    if (!theme || !theme.assets) return;
    var path = State.get('ui.themePath', '');
    var assetsBase = '/' + path.substring(0, path.lastIndexOf('/') + 1);
    if (theme.assets.cornerTL) {
      var tl = document.getElementById('chatCornerTL');
      if (tl) tl.innerHTML = '<img src="' + assetsBase + theme.assets.cornerTL + '" style="opacity:' + (theme.corner_tl ? theme.corner_tl.opacity : 1) + ';filter:blur(' + (theme.corner_tl ? theme.corner_tl.blur : 0) + 'px);">';
    }
    if (theme.assets.cornerBR) {
      var br = document.getElementById('chatCornerBR');
      if (br) br.innerHTML = '<img src="' + assetsBase + theme.assets.cornerBR + '" style="opacity:' + (theme.corner_br ? theme.corner_br.opacity : 1) + ';filter:blur(' + (theme.corner_br ? theme.corner_br.blur : 0) + 'px);">';
    }
    if (theme.assets.headerLeft) {
      var hl = document.getElementById('headerLeftImgSlot');
      if (hl) {
        hl.src = assetsBase + theme.assets.headerLeft;
        hl.style.display = 'inline-block';
        hl.style.opacity = theme.header_left ? theme.header_left.opacity : 1;
        hl.style.filter = 'blur(' + (theme.header_left ? theme.header_left.blur : 0) + 'px)';
      }
    }
    if (theme.assets.headerRight) {
      var hr = document.getElementById('headerRightImgSlot');
      if (hr) {
        hr.src = assetsBase + theme.assets.headerRight;
        hr.style.display = 'inline-block';
        hr.style.opacity = theme.header_right ? theme.header_right.opacity : 1;
        hr.style.filter = 'blur(' + (theme.header_right ? theme.header_right.blur : 0) + 'px)';
      }
    }
  };
  Theme.resetCustom = function () {
    clearCustomDom();
    document.body.classList.remove('custom-theme');
    Theme.current = null;
    State.set('ui.themePath', '');
    persist('theme_path', '');
    Theme.setTheme(State.get('ui.theme', 'dark'), false);
  };
  Theme.applyPrefs = function (prefs) {
    if (!prefs) return;
    if (prefs.theme_path) Theme.applyCustom(prefs.theme_path, false);
    else Theme.setTheme(prefs.theme || 'dark', false);
    if (prefs.font) Theme.setFont(prefs.font, false);
    Theme.setDensity(prefs.density || 'cozy', false);
    if (prefs.border_radius) Theme.setRadius(prefs.border_radius, false);
    if (prefs.shadow_intensity) Theme.setShadow(prefs.shadow_intensity, false);
    if (prefs.animation_speed !== undefined) Theme.setAnimSpeed(prefs.animation_speed, false);
    if (prefs.animation_easing) Theme.setAnimEasing(prefs.animation_easing, false);
    if (prefs.sidebar_logo_url !== undefined) State.set('ui.logo', prefs.sidebar_logo_url || '');
    if (prefs.refresh_interval) State.set('ui.refreshInterval', prefs.refresh_interval);
    var customFont = State.get('ui.customFont', '');
    if (customFont) {
      var style = document.createElement('style');
      style.id = 'custom-font-style';
      style.textContent = '@font-face { font-family: "CustomFont"; src: url("' + customFont + '") format("truetype"); font-display: swap; }';
      document.head.appendChild(style);
      document.documentElement.style.setProperty('--font', '"CustomFont"');
      document.documentElement.style.setProperty('--font-heading', '"CustomFont"');
    }
  };
  Theme.initFromCache = function () {
  var ui = State.get('ui', {});
  if (ui.themePath) Theme.applyCustom(ui.themePath, false);
  else if (ui.theme) Theme.setTheme(ui.theme, false);
  if (ui.font) Theme.setFont(ui.font, false);
  if (ui.density) Theme.setDensity(ui.density, false);
  if (ui.radius) Theme.setRadius(ui.radius, false);
  if (ui.shadow) Theme.setShadow(ui.shadow, false);
  if (ui.animSpeed) Theme.setAnimSpeed(ui.animSpeed, false);
  if (ui.animEasing) Theme.setAnimEasing(ui.animEasing, false);

  var customFont = ui.customFont || '';
  if (customFont) {
    var style = document.getElementById('custom-font-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'custom-font-style';
      document.head.appendChild(style);
    }
    style.textContent = '@font-face { font-family: "CustomFont"; src: url("' + customFont + '") format("truetype"); font-display: swap; }';
    document.documentElement.style.setProperty('--font', '"CustomFont"');
    document.documentElement.style.setProperty('--font-heading', '"CustomFont"');
  }
};
window.Theme = Theme;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Theme.initFromCache);
else Theme.initFromCache();
})();