(function () {
  var MAP = [
    ['bot/presence', 'status'],
    ['bot/app', 'devportal'],
    ['bot/webhooks', 'utility'],
    ['utility/', 'utility'],
    ['plugins/', 'plugins'],
    ['plugin/', 'plugins'],
    ['server/', null]
  ];
  function enabled() {
    return State.get('ui.features', ['management', 'devportal', 'status', 'utility', 'plugins']);
  }
  function featureFor(page) {
    for (var i = 0; i < MAP.length; i++) {
      if (page.indexOf(MAP[i][0]) === 0) return MAP[i][1];
    }
    return null;
  }
  function apply() {
    var feats = enabled();
    var nodes = document.querySelectorAll('#ns-rail [data-page], #ns-dock [data-page], #ns-sheet [data-page]');
    Array.prototype.forEach.call(nodes, function (n) {
      var page = n.getAttribute('data-page') || '';
      var feat = featureFor(page);
      if (!feat) {
        n.style.display = '';
        return;
      }
      n.style.display = feats.indexOf(feat) >= 0 ? '' : 'none';
    });
  }
  var targets = ['ns-rail', 'ns-dock', 'ns-sheet'];
  var observer = new MutationObserver(function () { apply(); });
  function attach() {
    targets.forEach(function (id) {
      var node = document.getElementById(id);
      if (node) observer.observe(node, { childList: true, subtree: true });
    });
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
  Session.onChange(apply);
})();