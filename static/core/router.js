(function () {
  var routes = [];
  var guards = {};
  var current = null;
  var cssLoaded = {};
  function compile(path) {
    var keys = [];
    var src = path.split('/').filter(Boolean).map(function (seg) {
      if (seg.charAt(0) === ':') {
        var opt = seg.charAt(seg.length - 1) === '?';
        keys.push(seg.slice(1, opt ? seg.length - 1 : seg.length));
        return opt ? '(?:/([^/]+))?' : '/([^/]+)';
      }
      return '/' + seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return { re: new RegExp('^' + src + '/?$'), keys: keys };
  }
  function add(path, render, opts) {
    var c = compile(path);
    routes.push({ path: path, re: c.re, keys: c.keys, render: render, opts: opts || {} });
  }
  function match(pathname) {
    for (var i = 0; i < routes.length; i++) {
      var m = routes[i].re.exec(pathname);
      if (!m) continue;
      var params = {};
      for (var k = 0; k < routes[i].keys.length; k++) {
        if (m[k + 1] !== undefined) params[routes[i].keys[k]] = decodeURIComponent(m[k + 1]);
      }
      return { route: routes[i], params: params };
    }
    return null;
  }
  function loadCss(list, done) {
    var pending = 0;
    list.forEach(function (file) {
      var href = '/css/' + file;
      if (cssLoaded[href]) return;
      cssLoaded[href] = true;
      pending++;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = function () { pending--; if (!pending) done(); };
      link.onerror = function () { pending--; if (!pending) done(); };
      document.head.appendChild(link);
    });
    if (!pending) done();
  }
  function resolve() {
    var hit = match(location.pathname);
    if (!hit) {
      if (current && current.route.opts.onExit) current.route.opts.onExit();
      current = null;
      if (guards.notFound) guards.notFound(location.pathname);
      return;
    }
    var g = hit.route.opts.guard;
    if (g && guards[g] && !guards[g](hit)) return;
    if (current && current.route !== hit.route && current.route.opts.onExit) current.route.opts.onExit();
    current = hit;
    if (hit.route.opts.shell !== false && window.State) State.set('session.lastRoute', location.pathname);
    var css = hit.route.opts.css || [];
    if (css.length) loadCss(css, function () { hit.route.render(hit.params); });
    else hit.route.render(hit.params);
  }
  function go(path, replace) {
    var clean = '/' + String(path).split('/').filter(Boolean).join('/') + '/';
    if (clean === location.pathname) {
      resolve();
      return;
    }
    if (replace) history.replaceState(null, '', clean);
    else history.pushState(null, '', clean);
    resolve();
  }
  window.addEventListener('popstate', resolve);
  window.Router = {
    add: add,
    go: function (path) { go(path, false); },
    replace: function (path) { go(path, true); },
    resolve: resolve,
    setGuard: function (name, fn) { guards[name] = fn; },
    current: function () { return current; },
    params: function () { return current ? current.params : {}; }
  };
})();