(function () {
  var orig = window.pushNotification;
  function friendly(m) {
    m = String(m || '');
    if (/fetch failed|failed to fetch|network|eai_again|enotfound|etimedout|socket hang up/i.test(m)) return 'Network unreachable — check your connection';
    if (/timeout|timed out/i.test(m)) return 'Took too long — retry in a moment';
    if (/bot not connected/i.test(m)) return 'Bot not connected';
    if (/invalid token/i.test(m)) return 'Invalid token';
    return m;
  }
  window.pushNotification = function (title, sub, type, dur) {
    return orig ? orig(friendly(title), sub, type, dur) : undefined;
  };
})();