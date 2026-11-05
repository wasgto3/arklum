(function () {
  var FENCE = '\u0000F';
  var CODE = '\u0000C';
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtTs(sec, style) {
    var d = new Date(parseInt(sec, 10) * 1000);
    var t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var ds = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    if (style === 't') return t;
    if (style === 'T') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (style === 'd') return ds;
    if (style === 'D') return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    if (style === 'f') return ds + ' ' + t;
    if (style === 'F') return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ' ' + t;
    if (style === 'R') {
      var m = Math.round((Date.now() - d.getTime()) / 60000);
      if (Math.abs(m) < 1) return 'just now';
      if (Math.abs(m) < 60) return m > 0 ? m + ' min ago' : 'in ' + (-m) + ' min';
      var h = Math.round(m / 60);
      if (Math.abs(h) < 24) return h > 0 ? h + ' hr ago' : 'in ' + (-h) + ' hr';
      var dd = Math.round(h / 24);
      return dd > 0 ? dd + ' d ago' : 'in ' + (-dd) + ' d';
    }
    return ds + ' ' + t;
  }
  function inviteCard(code, url) {
    return '<span class="invite-card" data-invite="' + code + '" data-url="' + url.replace(/"/g, '&quot;') + '"><span class="inv-ph">Invite · ' + code + '</span></span>';
  }
  function mediaTag(url) {
    var m = url.match(/\.(png|jpe?g|gif|webp|mp4|webm|mov|mp3|ogg|wav)(\?|$)/i);
    if (!m) return null;
    var ext = m[1].toLowerCase();
    var safe = url.replace(/"/g, '&quot;');
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp') return '<img class="md-media" src="' + safe + '" loading="lazy" onerror="this.remove()">';
    if (ext === 'mp4' || ext === 'webm' || ext === 'mov') return '<video class="md-media" src="' + safe + '" controls preload="metadata" onerror="this.remove()"></video>';
    return '<audio class="md-media-audio" src="' + safe + '" controls></audio>';
  }
  function inline(s, ctx) {
    ctx = ctx || {};
    var members = ctx.members || [];
    var roles = ctx.roles || [];
    var channels = ctx.channels || [];
    s = s.replace(/&lt;(a?):([A-Za-z0-9_]+):(\d+)&gt;/g, function (m, a, name, id) {
      return '<img class="md-emoji" src="https://cdn.discordapp.com/emojis/' + id + '.' + (a ? 'gif' : 'png') + '" alt=":' + name + ':" loading="lazy">';
    });
    s = s.replace(/&lt;@!?(\d+)&gt;/g, function (m, id) {
      var mm = null;
      for (var i = 0; i < members.length; i++) if (members[i].id === id) { mm = members[i]; break; }
      return '<span class="mention" data-mention="' + id + '">@' + (mm ? mm.name : 'unknown-user') + '</span>';
    });
    s = s.replace(/&lt;@&(\d+)&gt;/g, function (m, id) {
      var rr = null;
      for (var i = 0; i < roles.length; i++) if (roles[i].id === id) { rr = roles[i]; break; }
      var col = rr && rr.color ? ' style="color:#' + ('00000' + rr.color.toString(16)).slice(-6) + '"' : '';
      return '<span class="mention-role" data-role="' + id + '"' + col + '>@' + (rr ? rr.name : 'unknown-role') + '</span>';
    });
    s = s.replace(/&lt;#(\d+)&gt;/g, function (m, id) {
      var cc = null;
      for (var i = 0; i < channels.length; i++) if (channels[i].id === id) { cc = channels[i]; break; }
      return '<span class="chan-link" data-chan="' + id + '">#' + (cc ? cc.name : 'deleted-channel') + '</span>';
    });
    s = s.replace(/(^|[\s(])#([A-Za-z0-9-_]+)/g, function (m, pre, name) {
      var cc = null;
      var low = name.toLowerCase();
      for (var i = 0; i < channels.length; i++) if (channels[i].name.toLowerCase() === low) { cc = channels[i]; break; }
      if (!cc) return m;
      return pre + '<span class="chan-link" data-chan="' + cc.id + '">#' + cc.name + '</span>';
    });
    s = s.replace(/@(here|everyone)/g, '<span class="mention-hot">@$1</span>');
    s = s.replace(/&lt;([tTdDfFR]):(\d+)(?::([tTdDfFR]))?&gt;/g, function (m, st, sec, mod) {
      return '<span class="md-ts" title="' + escHtml(fmtTs(sec, 'f')) + '">' + escHtml(fmtTs(sec, mod || st)) + '</span>';
    });
     s = s.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, function (m, text, url) {
      var inv = url.match(/(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/([A-Za-z0-9-]+)/);
      if (inv) return inviteCard(inv[1], url);
      var media = mediaTag(url);
      if (media) return media;
      if (/^[\s\u00a0\u200b\u2800_]*$/.test(text)) return '';
      return '<a class="md-link" href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
    });
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<).,;!?'"])/g, function (m, pre, url) {
      var inv = url.match(/(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/([A-Za-z0-9-]+)/);
      if (inv) return pre + inviteCard(inv[1], url);
      var media = mediaTag(url);
      if (media) return pre + media;
      return pre + '<a class="md-link" href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
    });
    s = s.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler">$1</span>');
    s = s.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([\s\S]+?)__/g, '<u>$1</u>');
    s = s.replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
    s = s.replace(/(^|[\s*_(~])\*([^*\n]+)\*(?=$|[\s*_(~])/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s*_~])_([^_\n]+)_(?=$|[\s*_~])/g, '$1<em>$2</em>');
    return s;
  }
  window.renderDiscordMarkdown = function (text, ctx) {
    if (text === null || text === undefined) return '';
    var src = String(text);
    var fences = [];
    var codes = [];
    var blockAll = false;
    if (src.indexOf('>>> ') === 0) {
      blockAll = true;
      src = src.slice(4);
    }
    src = src.replace(/```([\w-]*)[ \t]*\n?([\s\S]*?)```/g, function (m, lang, code) {
      fences.push({ lang: lang || '', code: code });
      return FENCE + (fences.length - 1) + '\u0001';
    });
    src = src.replace(/`([^`\n]+)`/g, function (m, code) {
      codes.push(code);
      return CODE + (codes.length - 1) + '\u0001';
    });
    src = escHtml(src);
    var lines = src.split('\n');
    var out = [];
    var quoteBuf = [];
    function flushQuote() {
      if (!quoteBuf.length) return;
      out.push('<div class="md-quote">' + quoteBuf.map(function (l) { return inline(l, ctx); }).join('<br>') + '</div>');
      quoteBuf = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var bq = ln.match(/^&gt;\s?(.*)$/);
      if (bq) { quoteBuf.push(bq[1]); continue; }
      flushQuote();
      var h3 = ln.match(/^###\s+(.*)$/);
      var h2 = ln.match(/^##\s+(.*)$/);
      var h1 = ln.match(/^#\s+(.*)$/);
      var sub = ln.match(/^-#\s+(.*)$/);
      var bul = ln.match(/^(\s*)([-*•])\s+(.*)$/);
      var num = ln.match(/^(\s*)(\d+[.)])\s+(.*)$/);
      if (h3) out.push('<div class="md-h3">' + inline(h3[1], ctx) + '</div>');
      else if (h2) out.push('<div class="md-h2">' + inline(h2[1], ctx) + '</div>');
      else if (h1) out.push('<div class="md-h1">' + inline(h1[1], ctx) + '</div>');
      else if (sub) out.push('<div class="md-sub">' + inline(sub[1], ctx) + '</div>');
      else if (bul) out.push('<div class="md-li" style="padding-left:' + (bul[1].length * 14) + 'px"><span class="md-bullet">•</span><span>' + inline(bul[3], ctx) + '</span></div>');
      else if (num) out.push('<div class="md-li" style="padding-left:' + (num[1].length * 14) + 'px"><span class="md-bullet">' + num[2] + '</span><span>' + inline(num[3], ctx) + '</span></div>');
      else out.push(inline(ln, ctx));
    }
    flushQuote();
    var html = out.join('\n');
    if (blockAll) html = '<div class="md-blockquote">' + html + '</div>';
    html = html.replace(new RegExp(FENCE + '(\\d+)\u0001', 'g'), function (m, idx) {
      var f = fences[parseInt(idx, 10)];
      return '<div class="code-block-wrapper">' + (f.lang ? '<span class="code-lang">' + escHtml(f.lang) + '</span>' : '') + '<button class="code-copy-btn" type="button">copy</button><pre class="code-block">' + escHtml(f.code) + '</pre></div>';
    });
    html = html.replace(new RegExp(CODE + '(\\d+)\u0001', 'g'), function (m, idx) {
      return '<code class="inline-code">' + escHtml(codes[parseInt(idx, 10)]) + '</code>';
    });
    return html;
  };
  document.addEventListener('click', function (e) {
    var sp = e.target.closest('.spoiler');
    if (sp) { sp.classList.toggle('open'); return; }
    var cb = e.target.closest('.code-copy-btn');
    if (cb) {
      var pre = cb.parentNode.querySelector('.code-block');
      if (pre && window.copyToClipboard) copyToClipboard(pre.textContent);
    }
  });
})();