(function () {
var guildId = null;
var channelId = null;
var serverData = null;
var messageCache = {};
var fetchMeta = {};
var unseen = 0;
var nearBottom = true;
var replyTarget = null;
var editTarget = null;
var pendingFiles = [];
var serverEmojis = [];
var globalEmojis = [];
var typingHide = null;
var acItems = [];
var acIndex = -1;
var acMode = '';
var wired = false;
var lpTimer = null;
var swipeX = null;
var swipeY = null;
var swipeRow = null;
var mediaRec = null;
var recChunks = [];
var recTimer = null;
var profilePos = { x: 0, y: 0 };
var chipSuppress = false;
var popupMsgId = null;
var roleLpTimer = null;
var chatSettings = Object.assign({ bubble: false, compact: false, h24: true, autoplay: false, alwaysComposer: false, reduceMotion: false }, State.get('chat.settings', {}));
if (State.get('chat.bubble', false)) { chatSettings.bubble = true; State.set('chat.settings', chatSettings); }
var profileData = null;
var profileTab = 'server';
var reactedCtx = null;
var inviteFront = {};
var searchQ = null;
var searchMatches = [];
var searchIdx = -1;
var emojiSlots = [];
var emojiReactTarget = null;
var lastMsgScroll = 0;
var composerHidden = false;
var IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
var dmMode = false;
var dmContacts = [];
var threadCache = {};
var threadAll = [];
var vcStates = {};
var vcSpeak = {};

(function ensureProfilePopup() {
  var bad = document.getElementById('profile-popup');
  if (bad && !bad.classList.contains('profile-popup')) bad.parentNode.removeChild(bad);
  if (!document.getElementById('profile-popup')) {
    var d = document.createElement('div');
    d.id = 'profile-popup';
    d.className = 'profile-popup';
    document.body.appendChild(d);
  }
})();

function el(id) { return document.getElementById(id); }
function on(id, ev, fn) { var n = el(id); if (n) n.addEventListener(ev, fn); }
function click(id, fn) { var n = el(id); if (n) n.onclick = fn; }
function channels() { return serverData && serverData.channels ? serverData.channels : []; }
function members() { return serverData && serverData.members ? serverData.members : []; }
function roles() { return serverData && serverData.roles ? serverData.roles : []; }
function mdCtx() { return { members: members(), roles: roles(), channels: channels() }; }
function mdRender(text) { return window.renderDiscordMarkdown ? window.renderDiscordMarkdown(text, mdCtx()) : esc(text); }

window.ChatHooks = {
  mention: function (id) { var input = el('chat-input'); if (input) input.value += '@' + id + ' '; },
  channel: function (id) { selectChannel(id); }
};

function arkToast(msg) {
  var t = document.createElement('div');
  t.className = 'ark-toast';
  t.textContent = msg; 
  document.body.appendChild(t);
  setTimeout(function () { t.classList.add('show'); }, 10);
  setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 200); }, 2200);
}

function openArkModal(opts) {
  var old = document.getElementById('ark-modal-ov');
  if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'ark-modal-ov';
  ov.className = 'ark-modal-ov';
  ov.innerHTML =
    '<div class="ark-modal">' +
    '<div class="ark-modal-h">' + esc(opts.title || '') + '</div>' +
    (opts.body ? '<div class="ark-modal-body">' + opts.body + '</div>' : '') +
    (opts.input === false ? '' : '<input id="ark-modal-input" class="ark-modal-input" type="text" placeholder="' + esc(opts.placeholder || '') + '" maxlength="' + (opts.maxlength || 100) + '" autocomplete="off">') +
    '<div class="ark-modal-btns">' +
    '<button id="ark-modal-cancel" type="button">' + esc(opts.cancelText || 'Cancel') + '</button>' +
    '<button id="ark-modal-ok" type="button">' + esc(opts.okText || 'OK') + '</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  var input = document.getElementById('ark-modal-input');
  function close() {
    document.removeEventListener('keydown', onKey, true);
    ov.classList.remove('open');
    setTimeout(function () { if (ov.parentNode) ov.remove(); }, 160);
  }
  function ok() {
    var val = input ? input.value.trim() : '';
    if (opts.require && !val) {
      if (input) { input.classList.remove('err'); void input.offsetWidth; input.classList.add('err'); input.focus(); }
      return;
    }
    close();
    if (opts.onOk) opts.onOk(val);
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Enter') { e.preventDefault(); ok(); }
  }
  document.getElementById('ark-modal-cancel').onclick = close;
  document.getElementById('ark-modal-ok').onclick = ok;
  ov.addEventListener('pointerdown', function (e) { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(function () { ov.classList.add('open'); });
  if (input) setTimeout(function () { input.focus(); }, 80);
  return { close: close };
}
window.ArkModal = openArkModal;

var zipWired = false;
var zipState = { url: null, name: '', tree: [], open: {} };

function zvFmtSize(n) { if (!isFinite(n) || n == null) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
function zvIcon(dir) {
  return dir
    ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
}
var ZV_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
var ZV_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

function zvIsImage(n) { return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n); }
function zvIsBinary(n) { return /\.(png|jpe?g|gif|webp|bmp|svg|mp3|ogg|wav|m4a|mp4|mkv|mov|webm|zip|rar|7z|tar|gz|bz2|xz|exe|apk|bin|so|dll|dylib|woff2?|ttf|otf|eot|pdf|docx?|xlsx?|pptx?|iso)$/i.test(n); }

function zvRenderTree(nodes, depth) {
  return nodes.map(function (n) {
    var pad = 'padding-left:' + (10 + depth * 16) + 'px;';
    if (n.type === 'dir') {
      var open = zipState.open[n.path];
      return '<div class="zv-row zv-dir" data-zdir="' + esc(n.path) + '" style="' + pad + '"><span class="zv-chev">' + (open ? '▾' : '▸') + '</span>' + zvIcon(true) + '<span class="zv-name">' + esc(n.name) + '</span></div>' +
        (open && n.children ? zvRenderTree(n.children, depth + 1) : '');
    }
    return '<div class="zv-row zv-file" data-zfile="' + esc(n.path) + '" style="' + pad + '">' + zvIcon(false) + '<span class="zv-name">' + esc(n.name) + '</span><span class="zv-size">' + zvFmtSize(n.size) + '</span></div>';
  }).join('');
}

function zvPaint() {
  var body = el('zv-body');
  if (!body) return;
  body.innerHTML = (zipState.tree.length ? zvRenderTree(zipState.tree, 0) : '<div class="muted" style="padding:12px;">Empty or unreadable archive.</div>') +
    '<div class="zv-preview" id="zv-preview" style="display:none;"></div>';
}

function zvB64ToBytes(b64) {
  var bin = atob(b64);
  var arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function zvLooksBinary(arr) {
  var bad = 0;
  var n = Math.min(arr.length, 4000);
  for (var i = 0; i < n; i++) {
    var c = arr[i];
    if (c === 0) return true;
    if (c === 0xFFFD || c < 9) bad++;
  }
  return n > 0 && (bad / n) > 0.12;
}

function zvShowPreview(d) {
  var pane = el('zv-preview');
  if (!pane) return;
  pane.style.display = 'block';
  if (d.error) {
    pane.innerHTML = '<div class="zv-p-head">' + esc(d.entry) + '</div><div class="zv-p-err">Preview failed: ' + esc(d.error) + '</div>';
    pane.scrollIntoView({ block: 'nearest' });
    return;
  }
  var arr = zvB64ToBytes(d.data);
  var name = d.entry.split('/').pop();
  if (zvIsImage(name)) {
    var blob = new Blob([arr], { type: 'image/' + (/\.png$/i.test(name) ? 'png' : /\.gif$/i.test(name) ? 'gif' : /\.webp$/i.test(name) ? 'webp' : 'jpeg') });
    pane.innerHTML = '<div class="zv-p-head">' + esc(d.entry) + ' · ' + zvFmtSize(d.size) + '</div><img class="zv-p-img" src="' + URL.createObjectURL(blob) + '">';
  } else if (zvIsBinary(name) || zvLooksBinary(arr)) {
    pane.innerHTML = '<div class="zv-p-head">' + esc(d.entry) + ' · ' + zvFmtSize(d.size) + '</div><div class="zv-p-bin">Binary file — no inline preview.</div>';
  } else {
    var text = new TextDecoder('utf-8', { fatal: false }).decode(arr);
    var lines = text.split('\n');
    var gutter = lines.map(function (_, i) { return '<span>' + (i + 1) + '</span>'; }).join('');
    pane.innerHTML = '<div class="zv-p-head">' + esc(d.entry) + ' · ' + zvFmtSize(d.size) + ' · ' + lines.length + ' lines</div>' +
      '<div class="zv-p-code"><div class="zv-p-gut">' + gutter + '</div><pre class="zv-p-pre">' + esc(text) + '</pre></div>';
  }
  pane.scrollIntoView({ block: 'nearest' });
}

function zvPartUrls(url, name) {
  var m = name.match(/^(.*?).part(\d+)of(\d+)(\.zip)?$/i);
  if (!m) return [url];
  var base = m[1];
  var total = parseInt(m[3], 10);
  var found = {};
  var list = messageCache[channelId] || [];
  for (var i = 0; i < list.length; i++) {
    var atts = list[i].attachments || [];
    for (var j = 0; j < atts.length; j++) {
      var pm = (atts[j].filename || '').match(/^(.*?).part(\d+)of(\d+)(\.zip)?$/i);
      if (pm && pm[1] === base && parseInt(pm[3], 10) === total) found[parseInt(pm[2], 10)] = atts[j].url;
    }
  }
  var out = [];
  for (var k = 1; k <= total; k++) if (found[k]) out.push(found[k]);
  return out.length === total ? out : [url];
}

function openZipView(url, name) {
  var old = el('zv-overlay');
  if (old) old.remove();
  var urls = zvPartUrls(url, name);
  var ov = document.createElement('div');
  ov.id = 'zv-overlay';
  ov.className = 'zv-overlay open';
  ov.innerHTML = '<div class="zv-top"><span class="zv-title">' + esc(name) + '</span>' +
    '<button id="zv-clear" class="lb-btn" type="button" title="Delete cached copy">' + ZV_TRASH + '</button>' +
    '<button id="zv-close" class="lb-btn" type="button" title="Close">' + ZV_X + '</button></div>' +
    '<div class="zv-status" id="zv-status">' + (urls.length > 1 ? ('Combining ' + urls.length + ' parts…') : 'Downloading archive…') + '</div>' +
    '<div class="zv-body" id="zv-body"></div>';
  document.body.appendChild(ov);
  zipState = { url: url, urls: urls, name: name, tree: [], open: {} };
  el('zv-close').onclick = function () { ov.remove(); };
  el('zv-clear').onclick = function () {
    Session.socket.emit('run_command', { cmd: 'zip_cache_clear', params: { url: url, urls: urls } });
    arkToast('Cached copy removed');
  };
  ov.addEventListener('click', function (e) {
    var dir = e.target.closest('[data-zdir]');
    if (dir) { var id = dir.getAttribute('data-zdir'); zipState.open[id] = !zipState.open[id]; zvPaint(); return; }
    var f = e.target.closest('[data-zfile]');
    if (f) {
      var st = el('zv-status');
      if (st) st.textContent = 'Extracting ' + f.getAttribute('data-zfile') + '…';
      Session.socket.emit('run_command', { cmd: 'zip_extract', params: { url: zipState.url, urls: zipState.urls, entry: f.getAttribute('data-zfile') } });
    }
  });
  if (!zipWired) {
    zipWired = true;
    Session.on('zip_list', function (d) {
      if (d.url !== zipState.url) return;
      zipState.tree = d.tree || [];
      var st = el('zv-status');
      if (st) st.textContent = d.error ? ('Error: ' + d.error) : ((d.count || 0) + ' entries · cached in .arklum_sys/cache' + ((zipState.urls || []).length > 1 ? ' (combined ' + zipState.urls.length + ' parts)' : ''));
      zvPaint();
    });
    Session.on('zip_extract', function (d) {
      if (d.url !== zipState.url) return;
      var st = el('zv-status'); 
      if (st) st.textContent = d.error ? ('Extract failed: ' + d.error) : ('Extracted ' + d.entry);
      zvShowPreview(d);
    });
  }
  Session.socket.emit('run_command', { cmd: 'zip_list', params: { url: url, urls: urls } });
}
window.openZipView = openZipView;

function resolveMentions(text) {
  var out = text;
  var cands = [];
  roles().forEach(function (r) { cands.push({ tok: '@' + r.name, repl: '<@&' + r.id + '>', len: r.name.length }); });
  members().forEach(function (m) {
    cands.push({ tok: '@' + m.name, repl: '<@' + m.id + '>', len: m.name.length });
    if (m.username && m.username !== m.name) cands.push({ tok: '@' + m.username, repl: '<@' + m.id + '>', len: m.username.length });
  });
  channels().forEach(function (c) { cands.push({ tok: '#' + c.name, repl: '<#' + c.id + '>', len: c.name.length }); });
  cands.sort(function (a, b) { return b.len - a.len; });
  cands.forEach(function (cd) {
    var escTok = cd.tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('(^|[\\s(])' + escTok + '(?=$|[\\s).,!?;:])', 'g');
    out = out.replace(re, function (m, pre) { return pre + cd.repl; });
  });
  return out;
}

function sameGroup(prev, cur) {
  if (!prev || prev.author_id !== cur.author_id) return false;
  if (cur.reply_ref || cur.reply_to) return false;
  var dp = snowflakeDate(prev.id);
  var dc = snowflakeDate(cur.id);
  if (!dp || !dc) return false;
  if (dp.toDateString() !== dc.toDateString()) return false;
  return (dc - dp) < 420000;
}

function hex6(n) { return ('00000' + (n || 0).toString(16)).slice(-6); }
function fmtDate(iso) { if (!iso) return ''; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtTime(ts) {
  if (!ts) return '';
  if (chatSettings.h24) return ts;
  var p = ts.split(':');
  var h = parseInt(p[0], 10);
  var am = h < 12 ? 'AM' : 'PM';
  return (h % 12 || 12) + ':' + p[1] + ' ' + am;
}

function mirrorHtml(val) {
  var s = esc(val);
  s = s.replace(/<(a?):([A-Za-z0-9_]+):(\d+)>/g, function (m, a, name, id) {
    return '<img class="mirror-emoji" src="https://cdn.discordapp.com/emojis/' + id + '.' + (a ? 'gif' : 'png') + '?size=40" alt=":' + name + ':" loading="lazy">';
  });
  var i = 0;
  s = s.replace(/\uE000/g, function () {
    var slot = emojiSlots[i];
    i++;
    return slot ? '<img class="mirror-emoji" src="' + esc(slot.url) + '" alt=" " loading="lazy">' : '';
  });
  return s;
}

function syncMirror() {
  var ta = el('chat-input');
  var mir = el('input-mirror');
  if (!ta || !mir) return;
  mir.innerHTML = mirrorHtml(ta.value) + (/\n$/.test(ta.value) ? ' ' : '');
  ta.style.height = 'auto';
  var newHeight = Math.min(ta.scrollHeight, 150) + 'px';
  ta.style.height = newHeight;
  mir.style.height = newHeight;
  mir.scrollTop = ta.scrollTop;
}

function syncSlots() {
  var ta = el('chat-input');
  if (!ta) return;
  var count = (ta.value.match(/\uE000/g) || []).length;
  if (emojiSlots.length > count) emojiSlots.length = count;
}

function expandSlots(text) {
  var i = 0;
  return text.replace(/\uE000/g, function () {
    var slot = emojiSlots[i];
    i++;
    return slot ? slot.code : '';
  });
}

function insertEmojiAtCaret(code, url) {
  var ta = el('chat-input');
  if (!ta) return;
  var s = ta.selectionStart || 0;
  emojiSlots.push({ code: code, url: url });
  ta.value = ta.value.substring(0, s) + '\uE000' + ta.value.substring(ta.selectionEnd || s);
  ta.selectionStart = ta.selectionEnd = s + 1;
  ta.focus();
  syncMirror();
}

function highlightHtml(html, q) {
  if (!q) return html;
  var rx = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  var parts = html.split(/(<[^>]*>)/g);
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].charAt(0) !== '<') parts[i] = parts[i].replace(rx, '<mark class="search-hit">$1</mark>');
  }
  return parts.join('');
}

function jumpTo(a) {
  var list = messageCache[channelId] || [];
  var target = null;
  if (/^\d{15,}$/.test(a)) target = document.querySelector('.msg-row[data-msg-id="' + a + '"]');
  else {
    var n = parseInt(a, 10);
    if (!isNaN(n) && list.length) {
      var m = list[Math.max(0, list.length - n)];
      target = document.querySelector('.msg-row[data-msg-id="' + m.id + '"]');
    }
  }
  if (target) target.scrollIntoView({ block: 'center' });
  else arkToast('Not found locally');
}

function applyChatFont() {
  var px = State.get('chat.font', 0);
  var root = el('chat-layout');
  if (root) root.style.setProperty('--chat-font', px ? px + 'px' : '');
}

function applyChatSettings() {
  var layout = el('chat-layout');
  if (!layout) return;
  layout.classList.toggle('bubble', !!chatSettings.bubble);
  layout.classList.toggle('compact', !!chatSettings.compact);
  layout.classList.toggle('reduce-motion', !!chatSettings.reduceMotion);
}

function setFont(a) {
  var px = parseInt(a, 10);
  if (isNaN(px) || px < 12 || px > 20) { arkToast('Usage: /font 12-20'); return; }
  State.set('chat.font', px);
  applyChatFont();
  arkToast('Font: ' + px + 'px');
}

function setTheme(a) {
  var mode = (a || '').toLowerCase();
  if (mode !== 'dark' && mode !== 'light') { arkToast('Usage: /theme dark|light'); return; }
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('theme-light', mode === 'light');
  State.set('theme.mode', mode);
  arkToast('Theme: ' + mode);
}

function setBubble(a) {
  var onv = (a || '') === 'on' ? true : (a || '') === 'off' ? false : null;
  if (onv === null) { arkToast('Usage: /bubble on|off'); return; }
  chatSettings.bubble = onv;
  State.set('chat.settings', chatSettings);
  applyChatSettings();
  arkToast('Bubble: ' + (onv ? 'on' : 'off'));
}

function updateTypingMode() {
  var row = document.querySelector('.chat-input-row');
  var ta = el('chat-input');
  if (!row || !ta) return;
  row.classList.toggle('typing', document.activeElement === ta || ta.value.length > 0);
}

function setComposer(hidden) {
  if (composerHidden === hidden) return;
  composerHidden = hidden;
  var wrap = document.querySelector('.chat-input-wrap');
  var main = document.querySelector('.chat-main');
  if (wrap) wrap.classList.toggle('composer-hidden', hidden);
  if (main) main.classList.toggle('composer-hidden', hidden);
}

function positionAc() {
  var pop = el('chat-ac');
  var wrap = document.querySelector('.chat-input-wrap');
  if (!pop || !wrap || pop.style.display !== 'block') return;
  var r = wrap.getBoundingClientRect();
  pop.style.maxHeight = Math.max(120, Math.min(320, r.top - 12)) + 'px';
}

var ARK_CMDS = {
  shrug: { args: '[text]', desc: 'Append ¯\\_(ツ)_/¯', exec: function (a) { return (a ? a + ' ' : '') + '¯\\_(ツ)_/¯'; } },
  tableflip: { args: '', desc: 'Flip the table', exec: function () { return '(╯°□°)╯︵ ┻━┻'; } },
  unflip: { args: '', desc: 'Put it back', exec: function () { return '┬─┬ノ( º _ ºノ)'; } },
  me: { args: '<action>', desc: 'Send as action', exec: function (a) { return '_' + a + '_'; } },
  tts: { args: '<text>', desc: 'Send with text-to-speech', tts: true, exec: function (a) { return a; } },
  clear: { args: '', desc: 'Refetch channel from server', exec: function () { messageCache[channelId] = []; fetchMeta[channelId] = { fetching: true, hasMore: true, prepending: false }; Session.socket.emit('fetch_chat', { channel_id: channelId, limit: 500 }); arkToast('Channel refetched'); return null; } },
  jump: { args: '<id|n>', desc: 'Jump to message id or n from bottom', exec: function (a) { jumpTo(a); return null; } },
  search: { args: '<q|clear>', desc: 'Filter messages locally', exec: function (a) { if (!a || a === 'clear') { exitSearchMode(); arkToast('Search cleared'); return null; } searchQ = a.toLowerCase(); renderMessages(); return null; } },
  theme: { args: '<dark|light>', desc: 'Switch theme', exec: function (a) { setTheme(a); return null; } },
  font: { args: '<px>', desc: 'Chat font size 12-20', exec: function (a) { setFont(a); return null; } },
  bubble: { args: '<on|off>', desc: 'Bubble message style', exec: function (a) { setBubble(a); return null; } },
  vm: { args: '', desc: 'Start/stop voicemail', exec: function () { toggleVoice(); return null; } },
  copylast: { args: '', desc: 'Copy your last message', exec: function () { var list = messageCache[channelId] || []; for (var i = list.length - 1; i >= 0; i--) { if (Session.bot && list[i].author_id === Session.bot.id) { copyToClipboard(list[i].content_raw || ''); arkToast('Copied'); return null; } } arkToast('No own message'); return null; } },
  ping: { args: '', desc: 'Socket status', exec: function () { var s = Session.socket; arkToast('socket: ' + (s.connected ? 'connected' : 'offline') + ' · ' + (s.io && s.io.engine ? s.io.engine.transport.name : '?')); return null; } },
  help: { args: '', desc: 'Show all commands', exec: function () { var input = el('chat-input'); if (input) { input.value = '/'; onInputChange(); input.focus(); } return null; } }
};

function embedHtml(embed) {
  var hasContent = embed.title || embed.description || (embed.fields && embed.fields.length) || embed.footer || (embed.provider && embed.provider.name) || (embed.author && embed.author.name);
  var mediaOnly = !hasContent && (embed.image || embed.video || embed.thumbnail);
  if (mediaOnly) return '';
  var inner = '';
  var thumb = false;
  if (embed.thumbnail && embed.thumbnail.url) { inner += '<img class="embed-thumb" src="' + esc(embed.thumbnail.url) + '" loading="lazy">'; thumb = true; }
  if (embed.provider && embed.provider.name) inner += '<div class="embed-provider">' + esc(embed.provider.name) + '</div>';
  if (embed.author && embed.author.name) inner += '<div class="embed-author">' + (embed.author.icon_url ? '<img src="' + esc(embed.author.icon_url) + '">' : '') + '<span>' + esc(embed.author.name) + '</span></div>';
  if (embed.title) inner += '<div class="embed-title">' + mdRender(embed.title) + '</div>';
  if (embed.description) inner += '<div class="embed-desc">' + mdRender(embed.description) + '</div>';
  if (embed.fields && embed.fields.length) {
    inner += '<div class="embed-fields">' + embed.fields.map(function (f) {
      return '<div class="embed-field"><b>' + mdRender(f.name) + '</b><br><span>' + mdRender(f.value) + '</span></div>';
    }).join('') + '</div>';
  }
  if (embed.type === 'rich' && embed.image && embed.image.url) inner += '<img class="embed-media" src="' + esc(embed.image.url) + '" loading="lazy">';
  if (embed.footer) inner += '<div class="embed-foot">' + (embed.footer.icon_url ? '<img src="' + esc(embed.footer.icon_url) + '">' : '') + '<span>' + esc(embed.footer.text) + '</span></div>';
  if (!inner) return '';
  return '<div class="embed-card' + (thumb ? ' embed-thumbpad' : '') + '">' + inner + '</div>';
}

function attName(a) {
  if (a && a.filename) return a.filename;
  if (a && a.name) return a.name;
  if (a && a.url) {
    var seg = a.url.split('/').pop() || '';
    seg = seg.split('?')[0];
    try { seg = decodeURIComponent(seg); } catch (e) {}
    if (seg) return seg;
  }
  return 'file';
}

function attachmentsHtml(list) {
  if (!list || !list.length) return '';
  var visual = list.filter(function (a) { return a.type === 'image' || a.type === 'video' || a.type === 'audio'; });
  var other = list.filter(function (a) { return a.type !== 'image' && a.type !== 'video' && a.type !== 'audio'; });
  var html = '';
  if (visual.length) {
    html += '<div class="attachment-grid" style="grid-template-columns:' + (visual.length === 1 ? '1fr' : '1fr 1fr') + ';">';
    html += visual.map(function (a) {
      if (a.type === 'image') return '<div class="att-cell" data-name="' + esc(a.filename) + '" data-type="image" data-url="' + esc(a.url) + '" onclick="openLightbox(\'' + esc(a.url) + '\',\'image\',this)"><img src="' + esc(a.url) + '" loading="lazy" onerror="mediaFail(this)"></div>';
      if (a.type === 'audio') return '<div class="att-cell att-audio" data-name="' + esc(a.filename) + '" data-type="audio" data-url="' + esc(a.url) + '" onclick="openPlayer(\'' + esc(a.url) + '\',\'audio\',\'' + esc(a.filename) + '\')"><img src="/arklum-broken.svg" class="media-broken"><div class="att-play"><i>' + arkIcon('volume', 24) + '</i></div><span class="att-name">' + esc(a.filename) + '</span></div>';
      return '<div class="att-cell" style="height:240px;" data-name="' + esc(a.filename) + '" data-type="video" data-url="' + esc(a.url) + '" onclick="openPlayer(\'' + esc(a.url) + '\',\'video\',\'' + esc(a.filename) + '\')"><video src="' + esc(a.url) + '" muted preload="metadata"' + (chatSettings.autoplay ? ' autoplay loop' : '') + ' onerror="mediaFail(this)"></video><div class="att-play"><i>' + arkIcon('play', 24) + '</i></div></div>';
    }).join('') + '</div>';
  }
  html += other.map(function (a) {
    var fname = attName(a);
    var isZip = /\.zip$/i.test(fname);
    var oc = isZip ? 'openZipView(\'' + esc(a.url) + '\',\'' + esc(fname) + '\')' : 'openFileView(\'' + esc(a.url) + '\',\'' + esc(fname) + '\')';
    return '<div class="file-card' + (isZip ? ' fc-zip' : '') + '" onclick="' + oc + '">' +
      '<span class="fc-ico">' + arkIcon('file', 24) + '</span>' +
      '<span class="fc-name">' + esc(fname) + '</span>' +
      '<span class="fc-size">' + (a.size ? formatFileSize(a.size) : '') + '</span>' + (isZip ? '<span class="fc-tag">ZIP</span>' : '') +
      '<button class="secondary-btn fv-eye" type="button">' + arkIcon('book', 14) + '</button>' +
      '<a class="secondary-btn" href="' + esc(a.url) + '" download="' + esc(fname) + '" style="text-decoration:none;" onclick="event.stopPropagation()">DL</a></div>';
  }).join('');
  return html;
}

function messageRow(m, prev) {
  var compact = !!prev && sameGroup(prev, m);
  var isOwn = !!(Session.bot && m.author_id === Session.bot.id);
  var avatar = compact
    ? '<div class="msg-avatar-spacer"></div><span class="hover-time">' + esc((m.timestamp || '').slice(0, 5)) + '</span>'
    : '<img class="msg-avatar" src="' + esc(m.avatar_url || '/arklum.png') + '" loading="lazy" onerror="this.style.display=\'none\'">';
  var head = compact ? '' : '<div class="msg-head"><strong>' + esc(m.display_name || m.author) + '</strong><span class="msg-time">[' + esc(fmtTime(m.timestamp)) + ']' + (m.edited ? ' (edited)' : '') + '</span></div>';
  var reply = m.reply_ref ? '<div class="reply-ref">Replying to <strong>' + esc(m.reply_ref.author) + '</strong>: ' + esc(m.reply_ref.content) + '</div>' : '';
  var body = m.segments && m.segments.length
    ? m.segments.map(function (seg) {
      if (seg.type === 'text') return mdRender(seg.content);
      if (seg.type === 'mention') return '<span class="mention">@' + esc(seg.display) + '</span>';
      if (seg.type === 'role') {
        var rcol = seg.color ? ' style="color:#' + hex6(seg.color) + '"' : '';
        return '<span class="mention-role" data-role="' + esc(seg.role_id) + '"' + rcol + '>' + esc(seg.name) + '</span>';
      }
      if (seg.type === 'channel') return '<span class="chan-link" data-chan="' + esc(seg.channel_id) + '">' + esc(seg.name) + '</span>';
      if (seg.type === 'emoji') return '<img src="' + esc(seg.url) + '" alt=":' + esc(seg.name) + ':" style="height:1.4em;width:auto;vertical-align:bottom;" loading="lazy">';
      return esc(seg.content || '');
    }).join('')
    : mdRender(m.content_raw || '');
  if (searchQ) body = highlightHtml(body, searchQ);
  var reactions = '';
  if (m.reactions && m.reactions.length) {
    reactions = '<div class="reactions">' + m.reactions.map(function (r) {
      var icon = r.emoji_id ? '<img src="https://cdn.discordapp.com/emojis/' + r.emoji_id + '.png" loading="lazy" onerror="this.style.display=\'none\'">' : esc(r.emoji_name);
      return '<span class="reaction-chip' + (r.me ? ' mine' : '') + '" data-react="' + esc(m.id) + '" data-emoji="' + esc(r.emoji_name) + '">' + icon + '<span>' + r.count + '</span></span>';
    }).join('') + '</div>';
  }
  var comps = '';
  if (m.components && m.components.length) {
    comps = '<div class="comp-rows">' + m.components.map(function (row) {
      return '<div class="comp-row">' + row.map(function (b) {
        return '<button class="comp-btn comp-style-' + (b.style || 1) + '" type="button" disabled>' + (b.emoji ? '<span>' + esc(b.emoji) + '</span>' : '') + (b.label ? esc(b.label) : '') + (b.url ? ' ↗' : '') + '</button>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }
  var actions = '<div class="msg-actions">' +
    '<button data-act="react" data-id="' + esc(m.id) + '">' + arkIcon('react', 14) + '</button>' +
    '<button data-act="reply" data-id="' + esc(m.id) + '">' + arkIcon('reply', 14) + '</button>' +
    (isOwn ? '<button data-act="edit" data-id="' + esc(m.id) + '">' + arkIcon('edit', 14) + '</button>' : '') +
    '<button data-act="copy" data-id="' + esc(m.id) + '">' + arkIcon('copy', 14) + '</button>' +
    '</div>';
  return '<div class="msg-row' + (compact ? ' msg-compact' : '') + (isOwn ? ' own' : '') + '" data-msg-id="' + esc(m.id) + '" data-author="' + esc(m.author_id) + '">' +
    actions +
    '<div class="msg-content">' + avatar +
    '<div class="msg-body" style="flex:1;min-width:0;">' + head + reply +
    '<div class="msg-text">' + body + '</div>' +
    (m.embeds && m.embeds.length ? m.embeds.map(embedHtml).join('') : '') +
    attachmentsHtml(m.attachments) + comps +
    reactions +
    '</div></div></div>';
}

function safeRow(m, prev) {
  try {
    return messageRow(m, prev);
  } catch (e) {
    return '<div class="msg-row' + (Session.bot && m.author_id === Session.bot.id ? ' own' : '') + '" data-msg-id="' + esc(m.id) + '" data-author="' + esc(m.author_id) + '"><div class="msg-content"><div class="msg-avatar-spacer"></div><div class="msg-body" style="flex:1;min-width:0;"><div class="msg-head"><strong>' + esc(m.display_name || m.author || '?') + '</strong></div><div class="msg-text">' + esc(m.content_raw || '') + '</div></div></div></div>';
  }
}

function fillInvite(card, d) {
  if (!d || d.error) {
    card.innerHTML = '<span class="inv-ph">Invite · ' + esc(card.getAttribute('data-invite')) + ' (invalid)</span>';
    return;
  }
  card.innerHTML = (d.icon_url ? '<img src="' + esc(d.icon_url) + '">' : '<span class="inv-ico">▣</span>') +
    '<span class="inv-body"><b>' + esc(d.server_name || 'Invite') + '</b><small>' + (d.member_count || 0) + ' members</small></span>' +
    '<a class="inv-join" href="https://discord.gg/' + esc(card.getAttribute('data-invite')) + '" target="_blank" rel="noopener">Join</a>';
  card.classList.add('resolved');
}

function resolveInvites(scope) {
  (scope || document).querySelectorAll('.invite-card[data-invite]').forEach(function (card) {
    var code = card.getAttribute('data-invite');
    if (card.dataset.done) return;
    card.dataset.done = '1';
    if (inviteFront[code]) { fillInvite(card, inviteFront[code]); return; }
    Session.socket.emit('resolve_invite', { code: code });
  });
}

Session.on('invite_resolved', function (d) {
  if (!d || !d.code) return;
  inviteFront[d.code] = d;
  document.querySelectorAll('.invite-card[data-invite="' + d.code + '"]').forEach(function (c) { fillInvite(c, d); });
});

function collectSearchMatches() {
  searchMatches = [].slice.call(document.querySelectorAll('#chat-list .msg-row')).filter(function (r) { return r.querySelector('.search-hit'); });
  searchIdx = -1;
  updateSearchHeader();
}

function updateSearchHeader() {
  Shell.setTitle('search : ' + (searchQ || '') + ' = total : ' + searchMatches.length);
  Shell.setActions(
    '<button class="header-btn" id="srch-up" title="Previous match">' + arkIcon('down', 16) + '</button>' +
    '<button class="header-btn" id="srch-down" title="Next match">' + arkIcon('down', 16) + '</button>' +
    '<button class="header-btn" id="srch-x" title="Exit search"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>'
  );
  click('srch-up', function () { searchStep(-1); });
  click('srch-down', function () { searchStep(1); });
  click('srch-x', function () { exitSearchMode(); });
}

function searchStep(dir) {
  if (!searchMatches.length) return;
  searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
  searchMatches.forEach(function (m, i) { m.classList.toggle('search-active', i === searchIdx); });
  searchMatches[searchIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function exitSearchMode() {
  searchQ = null;
  searchMatches = [];
  searchIdx = -1;
  renderMessages();
  Shell.setActions(HEADER_ACTIONS);
  wireHeader();
  if (dmMode) {
    var c = contactByChannel(channelId);
    Shell.setTitle(c ? c.name : 'Direct Messages');
  } else {
    var ch = channels().filter(function (cc) { return cc.id === channelId; })[0];
    Shell.setTitle('#' + (ch ? ch.name : 'chat'));
  }
}

function renderMessages() {
  var list = el('chat-list');
  if (!list) return;
  var msgs = messageCache[channelId] || [];
  if (searchQ) msgs = msgs.filter(function (m) { return ((m.content_raw || '') + ' ' + (m.display_name || m.author || '')).toLowerCase().indexOf(searchQ) >= 0; });
  var seen = State.get('chatSeen.' + channelId, '');
  var html = searchQ ? '<div class="search-banner">Filter: ' + esc(searchQ) + ' · ' + msgs.length + ' result(s) — /search clear to exit</div>' : '';
  var prev = null;
  var prevDay = '';
  msgs.forEach(function (m) {
    var d = snowflakeDate(m.id);
    var day = d ? d.toDateString() : '';
    if (d && day !== prevDay) {
      html += '<div class="date-divider">' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + '</div>';
    }
    if (day) prevDay = day;
    if (seen && prev && prev.id === seen) html += '<div class="new-divider">NEW</div>';
    html += safeRow(m, prev);
    prev = m;
  });
  list.innerHTML = html || '<div class="empty-state">' + arkIcon('chat', 40) + '<p>No messages yet.</p></div>';
  resolveInvites(list);
  if (searchQ) collectSearchMatches();
}

function scrollBottom(force) {
  var box = el('chat-msgs');
  if (!box) return;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
}

function statusColor(s) {
  return s === 'online' ? '#9ccb9c' : s === 'idle' ? '#d9b380' : s === 'dnd' ? '#d98c8c' : '#6f6f6f';
}

function pushMsg(msg) {
  var cid = msg.channel_id;
  if (!cid) return;
  if (!messageCache[cid]) messageCache[cid] = [];
  for (var d0 = 0; d0 < messageCache[cid].length; d0++) if (messageCache[cid][d0].id === msg.id) return;
  var text = (msg.content_raw || '').trim();
  for (var i = messageCache[cid].length - 1; i >= 0; i--) {
    if (messageCache[cid][i].temp && (messageCache[cid][i].content_raw || '').trim() === text) { messageCache[cid].splice(i, 1); break; }
  }
  messageCache[cid].push(msg);
  if (messageCache[cid].length > 600) messageCache[cid].shift();
  if (cid === channelId) { renderMessages(); if (nearBottom) scrollBottom(true); else unseen++; }
}

function contactByUser(uid) { for (var i = 0; i < dmContacts.length; i++) if (dmContacts[i].user_id === uid) return dmContacts[i]; return null; }
function contactByChannel(cid) { for (var i = 0; i < dmContacts.length; i++) if (dmContacts[i].channel_id === cid) return dmContacts[i]; return null; }
function openDmUser(uid) { Session.socket.emit('open_dm', { user_id: uid }); }

function renderContacts(q) {
  var box = el('chat-member-list');
  if (!box) return;
  var query = (q || '').toLowerCase();
  var list = dmContacts.filter(function (c) { return !query || (c.name || '').toLowerCase().indexOf(query) >= 0 || (c.username || '').toLowerCase().indexOf(query) >= 0 || (c.user_id || '').indexOf(query) >= 0; });
  box.innerHTML = list.map(function (c) {
    return '<div class="chat-chan dm-chan' + (channelId === c.channel_id ? ' active' : '') + '" data-user="' + c.user_id + '">' +
      '<img src="' + (c.avatar_url || '/arklum.png') + '" loading="lazy" onerror="this.src=\'/arklum.png\'">' +
      '<span style="flex:1;min-width:0;">' + esc(c.name) + (c.preview ? '<small class="dm-prev">' + esc(c.preview) + '</small>' : '') + '</span>' +
      (c.unread ? '<span class="dm-unread">' + c.unread + '</span>' : '') + '</div>';
  }).join('') || '<div class="muted" style="padding:6px 8px;font-size:.75rem;">No contacts yet.</div>';
}

function contactPopup(uid) {
  var pop = el('msg-popup');
  if (!pop) return;
  var c = contactByUser(uid) || {};
  pop.innerHTML = '<div class="msg-popup-head">' + esc(c.name || 'User') + '</div>' +
    '<div class="msg-popup-item" data-cact="open">Open conversation</div>' +
    '<div class="msg-popup-item" data-cact="copy">Copy user ID</div>' +
    '<div class="msg-popup-item" data-cact="remove">Remove from list</div>';
  pop.style.display = 'block';
  pop.classList.remove('show');
  pop.style.left = '12px';
  pop.style.top = Math.max(8, innerHeight - 220) + 'px';
  requestAnimationFrame(function () { pop.classList.add('show'); });
  pop.onclick = function (ev) {
    var it = ev.target.closest('[data-cact]');
    if (!it) return;
    closeMsgPopup();
    var k = it.getAttribute('data-cact');
    if (k === 'open') openDmUser(uid);
    else if (k === 'copy') copyToClipboard(uid);
    else if (k === 'remove') Session.socket.emit('run_command', { cmd: 'dm_contact_remove', params: { user_id: uid } });
  };
}

function updateThreadBanner() {
  var b = el('thread-banner');
  if (!b) return;
  var t = null;
  for (var i = 0; i < threadAll.length; i++) if (threadAll[i].id === channelId) { t = threadAll[i]; break; }
  if (!t) { b.style.display = 'none'; b.innerHTML = ''; return; }
  var parentName = '';
  var chs = channels();
  for (var k = 0; k < chs.length; k++) if (chs[k].id === t.parent_id) parentName = chs[k].name;
  b.style.display = 'flex';
  b.innerHTML = '<span class="tb-name">' + esc(t.name) + '</span>' +
    '<span class="tb-parent">in #' + esc(parentName || 'channel') + '</span>' +
    (t.archived ? '<span class="tb-arch">archived</span>' : '') +
    (t.locked ? '<span class="tb-arch">locked</span>' : '') +
    '<button id="tb-parent-btn" class="secondary-btn" type="button">View parent</button>';
  var btn = el('tb-parent-btn');
  if (btn) btn.onclick = function () { selectChannel(t.parent_id); };
}

function buildSidebar() {
  var aside = el('chat-chans');
  if (!aside) return; 
  if (dmMode) {
    aside.innerHTML = '<div class="chat-cat">DIRECT MESSAGES</div>' +
      '<input id="chat-member-search" placeholder="Search name or ID..." style="margin-bottom:6px;">' +
      '<div id="chat-member-list"></div>';
    renderContacts('');
    return;
  }
  if (!serverData) return;
  var cats = serverData.categories || [];
  var html = '<div class="chat-cat">CHANNELS</div>';
  var chanItem = function (ch) {
    var ic = ch.type === 'voice' ? arkIcon('volume', 14) : arkIcon('hash', 14);
    var jb = ch.type === 'voice' ? '<button class="chat-join" data-vc="' + ch.id + '">JOIN</button>' : '';
    var row = '<div class="chat-chan' + (channelId === ch.id ? ' active' : '') + '" data-chan="' + ch.id + '" data-type="' + ch.type + '">' + ic + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(ch.name) + '</span>' + jb + '</div>';
    if (ch.type !== 'voice') {
      row += (threadCache[ch.id] || []).map(function (t) {
        return '<div class="chat-chan thread-row' + (channelId === t.id ? ' active' : '') + '" data-chan="' + t.id + '" data-type="thread">' + arkIcon('hash', 12) + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.name) + (t.archived ? ' (archived)' : '') + '</span></div>';
      }).join('');
    }
    return row;
  };
  channels().filter(function (c) { return !c.category_id; }).forEach(function (ch) { html += chanItem(ch); });
  cats.forEach(function (cat) {
    var inCat = channels().filter(function (c) { return c.category_id === cat.id; });
    if (!inCat.length) return;
    html += '<div class="chat-cat">' + esc(cat.name) + '</div>';
    inCat.forEach(function (ch) { html += chanItem(ch); });
  });
  html += '<div class="chat-cat">MEMBERS</div><input id="chat-member-search" placeholder="Search members..." style="margin-bottom:6px;"><div id="chat-member-list"></div>';
  aside.innerHTML = html;
  renderMemberList('');
}

function renderMemberList(q) {
  if (dmMode) { renderContacts(q); return; }
  var box = el('chat-member-list');
  if (!box) return;
  var query = (q || '').toLowerCase();
  var list = members().filter(function (m) {
    return !query || (m.name || '').toLowerCase().indexOf(query) === 0 || (m.username || '').toLowerCase().indexOf(query) === 0;
  });
  box.innerHTML = list.map(function (m) {
    return '<div class="chat-member" data-user="' + m.id + '"><span class="cm-av"><img src="' + esc(m.avatar_url || '') + '" loading="lazy" onerror="this.style.display=\'none\'"><span class="cm-dot" style="background:' + statusColor(m.status) + ';"></span></span><span style="min-width:0;"><strong>' + esc(m.name) + '</strong></span></div>';
  }).join('') || '<div class="muted" style="padding:6px 8px;font-size:.8rem;">No members.</div>';
}

function selectChannel(cid) {
  channelId = cid;
  unseen = 0;
  nearBottom = true;
  lastMsgScroll = 0;
  if (dmMode) {
    var c = contactByChannel(cid);
    Shell.setTitle(c ? c.name : 'DM');
    if (c) Session.socket.emit('run_command', { cmd: 'dm_mark_read', params: { user_id: c.user_id } });
  } else {
    var ch = channels().filter(function (cc) { return cc.id === cid; })[0];
    Shell.setTitle('#' + (ch ? ch.name : 'chat'));
    State.set('session.perGuild.' + guildId + '.page', 'chat');
    State.set('session.perGuild.' + guildId + '.channel', cid);
    if (!window.STANDALONE_GUILD || true) history.replaceState(null, '', '/server/' + guildId + '/chat/' + cid + '/');
  }
  document.querySelectorAll('.chat-chan').forEach(function (n) {
    n.classList.toggle('active', (n.getAttribute('data-chan') === cid) || (dmMode && contactByUser(n.getAttribute('data-user') || '') && contactByUser(n.getAttribute('data-user')).channel_id === cid));
    n.classList.remove('has-unread');
  });
  var list = el('chat-list');
  if (messageCache[cid] && messageCache[cid].length) {
    renderMessages();
    scrollBottom(true);
    State.set('chatSeen.' + cid, messageCache[cid][messageCache[cid].length - 1].id);
  } else {
    if (list) list.innerHTML = '<div class="empty-state"><div class="skeleton" style="width:60%;"></div><div class="skeleton" style="width:80%;margin-top:8px;"></div><div class="skeleton" style="width:50%;margin-top:8px;"></div></div>';
    fetchMeta[cid] = { fetching: true, hasMore: true, prepending: false };
    var _lim = dmMode ? 100 : 500, _cid = cid;
    Session.socket.emit('fetch_chat', { channel_id: _cid, limit: _lim });
    setTimeout(function () {
      if (channelId === _cid && fetchMeta[_cid] && fetchMeta[_cid].fetching) Session.socket.emit('fetch_chat', { channel_id: _cid, limit: _lim });
    }, 4000);
  }
  var layout = el('chat-layout');
  if (layout) layout.classList.remove('chans-open');
  setComposer(false);
  applyChatFont();
  applyChatSettings();
  updateThreadBanner();
  if (dmMode && IS_TOUCH && layout) {
    layout.classList.remove('dm-list');
    layout.classList.add('dm-chat');
    var bb = el('dm-back');
    if (bb) bb.style.display = '';
  }
}

function dmGoList() {
  var layout = el('chat-layout');
  if (layout) { layout.classList.add('dm-list'); layout.classList.remove('dm-chat'); }
  var bb = el('dm-back');
  if (bb) bb.style.display = 'none';
  Shell.setTitle('Direct Messages');
  renderContacts('');
}

function splitLong(text, limit) {
  if (!text || text.length <= limit) return [text];
  var chunks = [];
  var rest = text;
  while (rest.length > limit) {
    var cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}

function compressImage(file) {
  return new Promise(function (resolve) {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(img.src);
      var w = img.width;
      var h = img.height;
      if (w <= 1280 && h <= 720) { resolve(file); return; }
      if (w > 1280) { h = Math.round((1280 / w) * h); w = 1280; }
      if (h > 720) { w = Math.round((720 / h) * w); h = 720; }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(function (blob) { resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.7);
    };
    img.onerror = function () { resolve(file); };
    img.src = URL.createObjectURL(file);
  });
}

function processFile(file) {
  return compressImage(file).then(function (f) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function (ev) { resolve({ filename: f.name, data: ev.target.result.split(',')[1] }); };
      reader.readAsDataURL(f);
    });
  });
}

function insertTemp(text) {
  var now = new Date();
  var temp = {
    temp: true,
    author_id: Session.bot ? Session.bot.id : '0',
    author: Session.bot ? Session.bot.name : 'Bot',
    display_name: Session.bot ? Session.bot.name : 'Bot',
    avatar_url: Session.bot ? Session.bot.avatar_url : null,
    content_raw: text,
    timestamp: now.toTimeString().slice(0, 8),
    id: 'local-' + Date.now(),
    attachments: [],
    embeds: [],
    reactions: [],
    edited: false
  };
  if (!messageCache[channelId]) messageCache[channelId] = [];
  messageCache[channelId].push(temp);
  renderMessages();
  scrollBottom(true); 
}

function paintChips() {
  var box = el('attach-chips');
  if (!box) return;
  box.innerHTML = pendingFiles.map(function (f, i) {
    return '<span class="attach-chip">' + esc(f.name) + '<button data-rm="' + i + '">✕</button></span>';
  }).join('');
  box.querySelectorAll('[data-rm]').forEach(function (b) {
    b.onclick = function () {
      pendingFiles.splice(parseInt(b.getAttribute('data-rm'), 10), 1);
      paintChips();
    };
  });
}

function paintReply() {
  var box = el('reply-preview');
  if (!box) return;
  box.style.display = replyTarget ? 'flex' : 'none';
  if (replyTarget) {
    var row = document.querySelector('.msg-row[data-msg-id="' + replyTarget + '"]');
    var name = row && row.querySelector('.msg-head strong') ? row.querySelector('.msg-head strong').textContent : '';
    var text = row && row.querySelector('.msg-text') ? row.querySelector('.msg-text').textContent.slice(0, 50) : '';
    var t = el('reply-text');
    if (t) t.textContent = (name ? name + ': ' : '') + (text || '…');
  }
}

function send() {
  var input = el('chat-input');
  if (!input) return;
  var raw = input.value.trim();
  var ttsFlag = false;
  if (raw.charAt(0) === '/') {
    var pm = raw.match(/^\/([a-z0-9_-]+)\s*([\s\S]*)$/i);
    var cmd = pm ? ARK_CMDS[pm[1].toLowerCase()] : null;
    if (pm && !cmd) { arkToast('Unknown Arklum command: /' + pm[1]); input.value = ''; syncMirror(); updateTypingMode(); return; }
    if (cmd) {
      var out = cmd.exec(pm[2] || '');
      if (out === null) { input.value = ''; input.style.height = 'auto'; syncMirror(); updateTypingMode(); updateSlashHint(''); return; }
      raw = out;
      ttsFlag = !!cmd.tts;
    }
  }
  var content = resolveMentions(expandSlots(raw));
  if (!content && !pendingFiles.length) return;
  if (editTarget) {
    Session.socket.emit('edit_message', { channel_id: channelId, message_id: editTarget, content: content });
    editTarget = null;
    input.value = '';
    input.style.height = 'auto';
    emojiSlots = [];
    syncMirror();
    void input.offsetHeight;
    updateTypingMode();
    setComposer(false);
    updateSlashHint('');
    return;
  }
  if (!channelId) return;
  var files = pendingFiles;
  pendingFiles = [];
  paintChips();
  var replyTo = replyTarget;
  replyTarget = null;
  paintReply();
  if (!files.length) {
    splitLong(content, 1900).forEach(function (part, i) {
      var payload = { channel_id: channelId, content: part, tts: ttsFlag };
      if (i === 0 && replyTo) payload.reply_to = replyTo;
      Session.socket.emit('send_chat_message', payload);
      insertTemp(part);
    });
  } else {
    Promise.all(files.map(processFile)).then(function (processed) {
      var batches = [];
      for (var i = 0; i < processed.length; i += 10) batches.push(processed.slice(i, i + 10));
      batches.forEach(function (batch, bi) {
        var payload = { channel_id: channelId, content: bi === 0 ? content : ' ', attachments: batch, tts: ttsFlag };
        if (bi === 0 && replyTo) payload.reply_to = replyTo;
        Session.socket.emit('send_chat_message', payload);
        if (bi === 0) insertTemp(content);
      });
    });
  }
  input.value = '';
  input.style.height = 'auto';
  emojiSlots = [];
  syncMirror();
  updateTypingMode();
  setComposer(false);
  updateSlashHint('');
}

function showAc(mode, items) {
  acMode = mode;
  acItems = items;
  acIndex = items.length ? 0 : -1;
  var pop = el('chat-ac');
  if (!pop) return;
  if (!items.length) { pop.style.display = 'none'; return; }
  pop.innerHTML = items.map(function (it, i) {
    var icon = '';
    if (mode === 'mention') icon = it.avatar_url ? '<img src="' + esc(it.avatar_url) + '" loading="lazy">' : '<span style="width:24px;height:24px;border-radius:50%;background:#3a3a3a;display:inline-block;"></span>';
    if (mode === 'channel') icon = '<span style="color:var(--text);font-weight:700;">#</span>';
    if (mode === 'slash') icon = '<span style="color:var(--text);font-weight:700;">/</span>';
    if (mode === 'emoji') icon = it.url ? '<img src="' + esc(it.url) + '" style="border-radius:4px;" loading="lazy">' : '<span style="font-size:18px;">' + it.char + '</span>';
    return '<div class="ac-item' + (i === acIndex ? ' active' : '') + '" data-i="' + i + '">' + icon + '<span>' + esc(it.label) + '</span>' + (it.tag ? '<span class="ac-tag">' + esc(it.tag) + '</span>' : '') + '</div>';
  }).join('');
  pop.style.display = 'block';
  positionAc();
}

function hideAc() {
  var pop = el('chat-ac');
  if (pop) pop.style.display = 'none';
  acItems = [];
  acIndex = -1;
  acMode = '';
}

function applyAc() {
  if (acIndex < 0 || !acItems[acIndex]) return;
  var it = acItems[acIndex];
  var input = el('chat-input');
  if (!input) return;
  var pos = input.selectionStart != null ? input.selectionStart : input.value.length;
  var before = input.value.substring(0, pos);
  var start = -1;
  if (acMode === 'mention') {
    var m1 = before.match(/@(\S*)$/);
    start = m1 ? m1.index : pos;
    input.value = input.value.substring(0, start) + '@' + it.label + ' ' + input.value.substring(pos);
  } else if (acMode === 'channel') {
    var m2 = before.match(/#([\w-]*)$/);
    start = m2 ? m2.index : pos;
    input.value = input.value.substring(0, start) + '#' + it.label + ' ' + input.value.substring(pos);
  } else if (acMode === 'slash') {
    input.value = '/' + it.slash + ' ' + input.value.substring(pos);
  } else if (acMode === 'emoji') {
    var m3 = before.match(/:([a-z0-9_+-]{2,})$/i);
    start = m3 ? m3.index : pos;
    if (it.insert && it.insert.startsWith('<:') && it.insert.endsWith('>')) {
      insertEmojiAtCaret(it.insert, it.url);
    } else {
      input.value = input.value.substring(0, start) + it.insert + input.value.substring(pos);
      input.focus();
      syncMirror();
    }
  }
  hideAc();
  input.focus();
  syncMirror();
  updateSlashHint(input.value);
}

function updateSlashHint(val) {
  var h = el('slash-hint');
  if (!h) return;
  var m = (val || '').match(/^\/([a-z0-9_-]+)\s*([\s\S]*)$/i);
  var cmd = m ? ARK_CMDS[m[1].toLowerCase()] : null;
  if (m && cmd) { h.textContent = '/' + m[1].toLowerCase() + ' ' + (cmd.args || '') + ' — ' + cmd.desc; h.style.display = 'block'; }
  else h.style.display = 'none';
}

function onInputChange() {
  var input = el('chat-input');
  if (!input) return;
  var before = input.value.substring(0, input.selectionStart || 0);
  if (before.charAt(0) === '/' && before.indexOf(' ') === -1) {
    var qs = before.slice(1).toLowerCase();
    var sitems = [];
    for (var ck in ARK_CMDS) if (ck.indexOf(qs) === 0) sitems.push({ label: '/' + ck, tag: ARK_CMDS[ck].args || '', slash: ck });
    showAc('slash', sitems.slice(0, 8));
    updateSlashHint(before);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    return;
  }
  var mM = before.match(/@(\S*)$/);
  var mC = before.match(/#([\w-]*)$/);
  var mE = before.match(/:([a-z0-9_+-]{2,})$/i);
  if (mM) {
    var q = mM[1].toLowerCase();
    var ms = members().filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) === 0; }).slice(0, 8).map(function (m) { return { label: m.name, avatar_url: m.avatar_url }; });
    var rs = roles().filter(function (r) { return r.name !== '@everyone' && r.name.toLowerCase().indexOf(q) === 0; }).slice(0, 4).map(function (r) { return { label: r.name, tag: 'ROLE' }; });
    showAc('mention', ms.concat(rs));
  } else if (mC) {
    var qc = mC[1].toLowerCase();
    showAc('channel', channels().filter(function (c) { return c.type !== 'voice' && c.name.indexOf(qc) === 0; }).slice(0, 8).map(function (c) { return { label: c.name }; }));
  } else if (mE) {
    var qe = mE[1].toLowerCase();
    showAc('emoji', (globalEmojis.length ? globalEmojis : serverEmojis).filter(function (e) { return e.name.indexOf(qe) === 0; }).slice(0, 8).map(function (e) { return { label: e.name, url: e.url, insert: '<:' + e.name + ':' + e.id + '>', char: '' }; }));
  } else {
    hideAc();
  }
  updateSlashHint(input.value);
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  if (input.value.trim()) {
    Session.socket.emit('typing_start', { channel_id: channelId, user_name: Session.bot ? Session.bot.name : 'Bot' });
  }
}

function buildEmojiPicker() {
  var pop = el('emoji-picker');
  if (!pop) return;
  var src = globalEmojis.length ? globalEmojis : serverEmojis;
  var html = '';
  if (src.length) html += '<div class="emoji-cat">ALL SERVERS</div><div class="emoji-grid">' + src.map(function (e) {
    return '<img src="' + esc(e.url) + '" data-emo="&lt;:' + e.name + ':' + e.id + '&gt;" loading="lazy">';
  }).join('') + '</div>';
  (window.EMOJI_DATA ? EMOJI_DATA.categories : []).forEach(function (cat) {
    html += '<div class="emoji-cat">' + esc(cat.name.toUpperCase()) + '</div><div class="emoji-grid">' + cat.emojis.map(function (e) {
      return '<span data-emo="' + e + '">' + e + '</span>';
    }).join('') + '</div>';
  });
  pop.innerHTML = html;
}

function openEmojiPop(forMsgId) {
  var pop = el('emoji-picker');
  if (!pop) return;
  if (pop.style.display === 'block') { pop.style.display = 'none'; emojiReactTarget = null; return; }
  emojiReactTarget = forMsgId || null;
  if (!globalEmojis.length) Session.socket.emit('run_command', { cmd: 'global_expression_list', params: {} });
  buildEmojiPicker();
  pop.style.display = 'block';
}

function closeMsgPopup() {
  var pop = el('msg-popup');
  if (!pop) return;
  pop.classList.remove('show');
  setTimeout(function () { pop.style.display = 'none'; }, 160);
}

function findMsg(id) {
  var list = messageCache[channelId] || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function buildPopupContent(msgId) {
  var pop = el('msg-popup');
  var quick = (window.EMOJI_DATA && EMOJI_DATA.quick) || ['😀', '👍', '❤️'];
  var msg = findMsg(msgId);
  var reactsRow = '';
  if (msg && msg.reactions && msg.reactions.length) {
    reactsRow = '<div class="msg-popup-reacts">' + msg.reactions.map(function (r) {
      var icon = r.emoji_id ? '<img src="https://cdn.discordapp.com/emojis/' + r.emoji_id + '.png" loading="lazy">' : esc(r.emoji_name);
      return '<span class="mpr-chip' + (r.me ? ' mine' : '') + '" data-pr="' + esc(r.emoji_name) + '">' + icon + '<span>' + r.count + '</span></span>';
    }).join('') + '</div>';
  }
  pop.innerHTML = reactsRow + '<div class="msg-popup-quick">' + quick.map(function (e) {
    return '<span data-q="' + e + '">' + e + '</span>';
  }).join('') + '</div>' +
    '<div class="msg-popup-item" data-m="reply">' + arkIcon('reply', 14) + ' Reply</div>' +
    '<div class="msg-popup-item" data-m="edit">' + arkIcon('edit', 14) + ' Edit</div>' +
    '<div class="msg-popup-item" data-m="copytext">' + arkIcon('copy', 14) + ' Copy Text</div>' +
    '<div class="msg-popup-item" data-m="copy">' + arkIcon('copy', 14) + ' Copy ID</div>' +
    '<div class="msg-popup-item" data-m="react">' + arkIcon('react', 14) + ' React…</div>' +
    '<div class="msg-popup-item" data-m="thread">' + arkIcon('hash', 14) + ' Start Thread</div>';
  pop.onclick = function (ev) {
    var pr = ev.target.closest('[data-pr]');
    if (pr) {
      if (chipSuppress) return;
      Session.call('react_message', { channel_id: channelId, message_id: msgId, emoji: pr.getAttribute('data-pr') });
      closeMsgPopup();
      return;
    }
    var q = ev.target.closest('[data-q]');
    var m = ev.target.closest('[data-m]');
    if (q) {
      Session.call('react_message', { channel_id: channelId, message_id: msgId, emoji: q.getAttribute('data-q') });
      closeMsgPopup();
      return;
    }
    if (!m) return;
    var kind = m.getAttribute('data-m');
    closeMsgPopup();
    if (kind === 'reply') {
      replyTarget = msgId;
      paintReply();
      var inp = el('chat-input');
      if (inp) inp.focus();
    } else if (kind === 'edit') {
      editTarget = msgId;
      var row = document.querySelector('.msg-row[data-msg-id="' + msgId + '"]');
      var txt = row && row.querySelector('.msg-text') ? row.querySelector('.msg-text').textContent : '';
      var in2 = el('chat-input');
      if (in2) { in2.value = txt; in2.focus(); syncMirror(); }
    } else if (kind === 'copytext') {
      var cm2 = findMsg(msgId);
      copyToClipboard(cm2 ? cm2.content_raw : '');
    } else if (kind === 'copy') {
      copyToClipboard(msgId); 
    } else if (kind === 'react') {
      openEmojiPop(msgId);
    } else if (kind === 'thread') {
      openArkModal({
        title: 'Create Thread',
        placeholder: 'Thread name',
        okText: 'Create',
        require: true,
        maxlength: 100,
        onOk: function (val) {
          Session.socket.emit('run_command', { cmd: 'thread_create', params: { channel_id: channelId, message_id: msgId, name: val } });
        }
      });
    }
  };
}

function openMsgPopup(msgId, rowEl) {
  var pop = el('msg-popup');
  if (!pop) return;
  buildPopupContent(msgId);
  popupMsgId = msgId;
  pop.style.display = 'block';
  pop.classList.remove('show');
  var r = rowEl.getBoundingClientRect();
  var pw = pop.offsetWidth || 190;
  var ph = pop.offsetHeight || 210;
  pop.style.left = Math.max(8, Math.min(r.left + 8, innerWidth - pw - 8)) + 'px';
  var top = r.top - ph - 8;
  if (top < 8) top = Math.min(r.bottom + 8, innerHeight - ph - 8);
  pop.style.top = top + 'px';
  requestAnimationFrame(function () { pop.classList.add('show'); });
}

function openReactedSheet(msgId, emojiName) {
  reactedCtx = { msgId: msgId, emoji: emojiName };
  var pop = el('msg-popup');
  if (!pop) return;
  pop.innerHTML = '<div class="msg-popup-head">Loading…</div>';
  pop.style.display = 'block';
  pop.classList.remove('show');
  pop.style.left = '12px';
  pop.style.top = Math.max(8, innerHeight - 340) + 'px';
  requestAnimationFrame(function () { pop.classList.add('show'); });
  Session.socket.emit('run_command', { cmd: 'reactions_list', params: { channel_id: channelId, message_id: msgId, emoji_name: emojiName } });
}

function parseEmojiName(str) {
  var m = /^<(a?):(.+?):(\d+)>$/.exec(str || '');
  if (m) return { id: m[3], animated: m[1] === 'a', name: m[2] };
  return { id: null, animated: false, name: str || '' };
}

function emojiVisual(e, cls) {
  if (e.id) return '<img class="' + cls + '" src="https://cdn.discordapp.com/emojis/' + e.id + '.' + (e.animated ? 'gif' : 'png') + '" loading="lazy" onerror="this.style.display=\'none\'">';
  return '<span class="' + cls + '">' + esc(e.name) + '</span>';
}

function fillReactedSheet(d) {
  var pop = el('msg-popup');
  if (!pop || !reactedCtx || d.message_id !== reactedCtx.msgId || d.emoji_name !== reactedCtx.emoji) return;
  var e = parseEmojiName(d.emoji_name);
  pop.innerHTML = '<div class="reacted-head">' + emojiVisual(e, 'rh-emoji') + '<span class="rh-count">' + d.users.length + '</span>' +
    '<button class="rh-clear" type="button" title="Remove my reaction"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button></div>' +
    '<div class="reacted-list">' + (d.users.length ? d.users.map(function (u) {
      return '<div class="reacted-item" data-uid="' + u.id + '"><img src="' + esc(u.avatar_url || '') + '" loading="lazy" onerror="this.style.display=\'none\'">' +
        '<span class="ri-name">' + esc(u.display_name || u.name) + (u.bot ? ' <span class="ri-badge">APP</span>' : '') + (u.me ? ' <span class="ri-you">you</span>' : '') + '</span>' +
        '<button data-rx="' + u.id + '" type="button"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button></div>';
    }).join('') : '<div class="muted" style="padding:8px 12px;font-size:.8rem;">No reactions.</div>') + '</div>';
  pop.onclick = function (ev) {
    if (ev.target.closest('.rh-clear')) {
      if (Session.bot) Session.call('reaction_remove', { channel_id: channelId, message_id: reactedCtx.msgId, emoji_name: reactedCtx.emoji, user_id: Session.bot.id });
      return;
    }
    var bx = ev.target.closest('[data-rx]');
    if (!bx) return;
    Session.call('reaction_remove', { channel_id: channelId, message_id: reactedCtx.msgId, emoji_name: reactedCtx.emoji, user_id: bx.getAttribute('data-rx') });
  };
}

Session.on('reactions_list', fillReactedSheet);
Session.on('reaction_removed', function (d) {
  var list = messageCache[channelId];
  if (list) {
    list.forEach(function (m) {
      if (m.id !== d.message_id) return;
      m.reactions = (m.reactions || []).map(function (r) {
        if (r.emoji_name !== d.emoji_name) return r;
        r.count = r.count - 1;
        if (Session.bot && d.user_id === Session.bot.id) r.me = false;
        return r;
      }).filter(function (r) { return r.count > 0; });
    });
    renderMessages();
  }
  if (reactedCtx && reactedCtx.msgId === d.message_id && d.emoji_name === reactedCtx.emoji) {
    openReactedSheet(d.message_id, d.emoji_name);
  }
});

function openRoleSheet(roleId) {
  var r = roles().filter(function (x) { return x.id === roleId; })[0];
  var holders = members().filter(function (m) { return (m.roles || []).indexOf(roleId) >= 0; });
  var pop = el('msg-popup');
  if (!pop) return;
  pop.innerHTML = '<div class="msg-popup-head">' + esc(r ? r.name : 'Role') + ' · ' + holders.length + '</div>' +
    '<div class="role-sheet-list">' + (holders.length ? holders.map(function (m) {
      return '<div class="role-sheet-item" data-user="' + m.id + '"><img src="' + esc(m.avatar_url || '') + '" loading="lazy" onerror="this.style.display=\'none\'"><span>' + esc(m.name) + '</span></div>';
    }).join('') : '<div class="muted" style="padding:8px 12px;font-size:.8rem;">No members with this role.</div>') + '</div>';
  pop.style.display = 'block';
  pop.classList.remove('show');
  pop.style.left = '12px';
  pop.style.top = Math.max(8, innerHeight - 320) + 'px';
  requestAnimationFrame(function () { pop.classList.add('show'); });
  pop.onclick = function (ev) {
    var it = ev.target.closest('.role-sheet-item');
    if (it) {
      closeMsgPopup();
      openProfile(it.getAttribute('data-user'), ev.clientX, ev.clientY);
    }
  };
}

var PP_ICONS = {
  msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  mention: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'
};

function renderProfileCard() {
  var pp = el('profile-popup');
  if (!pp || !profileData) return;
  var g = profileData.global || {};
  var m = profileData.member || null;
  var tab = (profileTab === 'server' && m) ? 'server' : 'global';
  var banner = (tab === 'server' && m && m.banner_url) ? m.banner_url : g.banner_url;
  var accent = g.accent_color ? '#' + hex6(g.accent_color) : null;
  var avatar = (tab === 'server' && m && m.avatar_url) ? m.avatar_url : (g.avatar_url || '/arklum.png');
  var deco = g.avatar_decoration_url;
  var name = tab === 'server' && m ? (m.nickname || m.display_name || g.global_name || g.username) : (g.global_name || g.username || '');
  var nameColor = tab === 'server' && m && m.display_color ? ' style="color:#' + hex6(m.display_color) + '"' : '';
  var st = null;
  var mList = members();
  for (var i = 0; i < mList.length; i++) if (mList[i].id === g.id) { st = mList[i].status; break; }
  var badges = (g.badges || []).map(function (b) { return '<span class="pp-badge" title="' + esc(b) + '">' + esc(b) + '</span>'; }).join('');
  var sec = '';
  if (tab === 'server' && m) {
    sec = '<div class="pp-sec"><div class="pp-sec-h">SERVER PROFILE</div>' +
      (m.nickname ? '<div class="pp-kv"><span>Nickname</span><b>' + esc(m.nickname) + '</b></div>' : '') +
      (m.roles && m.roles.length ? '<div class="pp-roles">' + m.roles.slice(0, 8).map(function (r) {
        return '<span class="pp-role"' + (r.color ? ' style="border-color:#' + hex6(r.color) + '66;color:#' + hex6(r.color) + '"' : '') + '>' + esc(r.name) + '</span>';
      }).join('') + '</div>' : '') +
      (m.joined_at ? '<div class="pp-kv"><span>Member since</span><b>' + fmtDate(m.joined_at) + '</b></div>' : '') +
      (m.boost_since ? '<div class="pp-kv"><span>Boosting since</span><b>' + fmtDate(m.boost_since) + '</b></div>' : '') +
      (m.timeout_until ? '<div class="pp-timeout">Timed out until ' + fmtDate(m.timeout_until) + '</div>' : '') +
      '</div>';
  } else {
    sec = '<div class="pp-sec"><div class="pp-sec-h">ABOUT ME</div>' +
      (g.bio ? '<div class="pp-bio">' + mdRender(g.bio) + '</div>' : '<div class="pp-bio muted">Nothing here.</div>') +
      '<div class="pp-kv"><span>Created</span><b>' + fmtDate(g.created_at) + '</b></div>' +
      '<div class="pp-kv"><span>Mutual servers</span><b>' + (profileData.mutual_count || 0) + '</b></div>' +
      (g.premium ? '<div class="pp-kv"><span>Nitro</span><b class="pp-nitro">SUBSCRIBER</b></div>' : '') +
      '</div>';
  }
  pp.innerHTML =
    '<div class="pp-tabs"><button type="button" data-ptab="server"' + (m ? '' : ' disabled') + (tab === 'server' ? ' class="on"' : '') + '>SERVER</button><button type="button" data-ptab="global"' + (tab === 'global' ? ' class="on"' : '') + '>GLOBAL</button></div>' +
    '<div class="pp-banner" style="' + (banner ? 'background-image:url(' + esc(banner) + ');' : (accent ? 'background:' + accent + ';' : '')) + '"></div>' +
    '<div class="pp-body">' +
    '<div class="pp-avwrap">' + (deco ? '<img class="pp-deco" src="' + esc(deco) + '" alt=" " onerror="this.remove()">' : '') + '<img class="pp-av" src="' + esc(avatar) + '" onerror="this.src=\'/arklum.png\'">' + (st ? '<span class="pp-dot" style="background:' + statusColor(st) + '"></span>' : '') + '</div>' +
    '<div class="pp-name"' + nameColor + '>' + esc(name) + (g.bot ? ' <span class="ri-badge">APP</span>' : '') + (g.premium ? ' <span class="pp-nitro">NITRO</span>' : '') + '</div>' +
    '<div class="pp-sub">@' + esc(g.username || '') + '</div>' +
    sec +
    (badges ? '<div class="pp-badges">' + badges + '</div>' : '') +
    '<div class="pp-actions">' +
    '<button type="button" data-pact="msg" title="Message">' + PP_ICONS.msg + '</button>' +
    '<button type="button" data-pact="mention" title="Mention">' + PP_ICONS.mention + '</button>' +
    '<button type="button" data-pact="copy" title="Copy ID">' + PP_ICONS.copy + '</button>' +
    '<button type="button" data-pact="avatar" title="View avatar">' + PP_ICONS.image + '</button>' +
    '</div></div>';
  pp.onclick = function (ev) {
    var tb = ev.target.closest('[data-ptab]');
    if (tb && !tb.disabled) { profileTab = tb.getAttribute('data-ptab'); renderProfileCard(); return; }
    var ac = ev.target.closest('[data-pact]');
    if (!ac) return;
    var kind = ac.getAttribute('data-pact');
    if (kind === 'msg') { Session.socket.emit('open_dm', { user_id: g.id }); closeProfile(); }
    else if (kind === 'mention') { var inp = el('chat-input'); if (inp) { inp.value += '@' + (name || g.username) + ' '; inp.focus(); syncMirror(); } closeProfile(); }
    else if (kind === 'copy') copyToClipboard(g.id);
    else if (kind === 'avatar' && window.openLightbox) openLightbox(avatar, 'image');
  };
}

function openProfile(authorId, x, y) {
  profileTab = 'server';
  profilePos = { x: x, y: y };
  Session.socket.emit('run_command', { cmd: 'fetch_user_profile_full', params: { user_id: authorId, guild_id: guildId } });
}

function closeProfile() {
  var pp = el('profile-popup');
  if (pp) pp.classList.remove('show');
}

function stopRecording() {
  if (mediaRec && mediaRec.state === 'recording') mediaRec.stop();
}

function sendRecording(blob, tts) {
  var reader = new FileReader();
  reader.onload = function (ev) {
    var b64 = ev.target.result.split(',')[1];
    var done = false;
    var finish = function (att) {
      if (done) return;
      done = true;
      var input = el('chat-input');
      Session.socket.emit('send_chat_message', {
        channel_id: channelId,
        content: input ? resolveMentions(expandSlots(input.value.trim())) : '',
        attachments: [att],
        tts: !!tts
      });
      if (input) { input.value = ''; emojiSlots = []; syncMirror(); updateTypingMode(); }
    };
    Session.socket.once('audio_transcoded', function (r) {
      if (r && r.ok) finish({ filename: r.filename, data: r.data });
      else finish({ filename: 'voicemail-' + Date.now() + '.webm', data: b64 });
    });
    Session.socket.emit('transcode_audio', { data: b64, filename: 'voicemail-' + Date.now() });
    setTimeout(function () { finish({ filename: 'voicemail-' + Date.now() + '.webm', data: b64 }); }, 8000);
  };
  reader.readAsDataURL(blob);
}

function showRecPreview(blob) {
  var wrap = document.querySelector('.chat-input-wrap');
  if (!wrap) return;
  var old = document.getElementById('rec-preview');
  if (old) old.remove();
  var url = URL.createObjectURL(blob);
  var div = document.createElement('div');
  div.id = 'rec-preview';
  div.className = 'rec-preview';
  div.innerHTML = '<button class="secondary-btn" id="rec-play" type="button">' + arkIcon('volume', 16) + ' Play</button>' +
    '<div class="rec-actions">' +
    '<button class="secondary-btn" data-rs="vm">Send VM</button>' +
    '<button class="secondary-btn" data-rs="tts">Send TTS</button>' +
    '<button class="danger-btn" data-rs="drop">Discard</button>' +
    '</div>';
  wrap.insertBefore(div, wrap.querySelector('.chat-input-row'));
  div.querySelector('#rec-play').onclick = function () { if (window.openPlayer) openPlayer(url, 'audio', 'Voicemail preview'); };
  div.querySelector('[data-rs="drop"]').onclick = function () { div.remove(); URL.revokeObjectURL(url); };
  div.querySelector('[data-rs="vm"]').onclick = function () { sendRecording(blob, false); div.remove(); };
  div.querySelector('[data-rs="tts"]').onclick = function () { sendRecording(blob, true); div.remove(); };
}

function toggleVoice() {
  var btn = el('chat-voice');
  if (mediaRec && mediaRec.state === 'recording') { stopRecording(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) return;
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    recChunks = [];
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
    mediaRec.onstop = function () {
      stream.getTracks().forEach(function (tr) { tr.stop(); });
      clearTimeout(recTimer);
      if (btn) btn.classList.remove('recording');
      showRecPreview(new Blob(recChunks, { type: mediaRec.mimeType || 'audio/webm' }));
      mediaRec = null;
    };
    mediaRec.start();
    if (btn) btn.classList.add('recording'); 
    var limit = ((window.State && State.get('chat.vmLimit', 60)) || 60) * 1000;
    recTimer = setTimeout(stopRecording, limit);
  }).catch(function () {});
}

function drawFooter() {
  return '<div class="draw-footer">' +
    '<button class="draw-btn" data-draw="settings" type="button">' + arkIcon('sliders', 14) + ' Settings</button>' +
    '<button class="draw-btn" data-draw="ext" type="button">' + arkIcon('link', 14) + ' External link</button>' +
    '<button class="draw-btn" data-draw="theme" type="button">' + arkIcon('pulse', 14) + ' Theme</button>' +
    '</div>';
}

function copyExternal() {
  Session.socket.emit('run_command', { cmd: 'chatsite_open', params: { guild_id: guildId } });
  Session.socket.once('chatsite_opened', function (d) {
    var link = d.external || d.url || '';
    if (link && window.copyToClipboard) { copyToClipboard(link); arkToast('External link copied'); }
  });
}

function toggleTheme() {
  var mode = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('theme-light', mode === 'light');
  State.set('theme.mode', mode);
}

function settingsHtml() {
  var row = function (key, label) {
    return '<label class="set-row"><span>' + label + '</span><span class="set-switch"><input type="checkbox" data-set="' + key + '"' + (chatSettings[key] ? ' checked' : '') + '><i></i></span></label>';
  };
  return '<div class="set-head">Chat Settings<button id="set-close" type="button">✕</button></div>' +
    row('bubble', 'Bubble messages') +
    row('compact', 'Compact spacing') +
    row('h24', '24-hour timestamps') +
    row('autoplay', 'Autoplay media') +
    row('alwaysComposer', 'Always show composer') +
    row('reduceMotion', 'Reduce motion') +
    '<label class="set-row"><span>Font size</span><input type="range" min="12" max="20" step="1" data-set="font" value="' + (State.get('chat.font', 0) || 14) + '"></label>' +
    '<div class="set-actions"><button id="set-ext" type="button">Copy external</button><button id="set-theme" type="button">Theme</button></div>';
}

function wireSettings() {
  var sheet = el('chat-settings');
  if (!sheet) return;
  click('set-close', function () { sheet.style.display = 'none'; });
  click('set-ext', copyExternal);
  click('set-theme', toggleTheme);
  sheet.querySelectorAll('[data-set]').forEach(function (inp) {
    var handler = function () {
      var k = inp.getAttribute('data-set');
      if (k === 'font') { State.set('chat.font', parseInt(inp.value, 10)); applyChatFont(); return; }
      chatSettings[k] = inp.checked;
      State.set('chat.settings', chatSettings);
      applyChatSettings();
      if (k === 'alwaysComposer' && chatSettings.alwaysComposer) setComposer(false);
      renderMessages();
    };
    inp.addEventListener('change', handler);
    if (inp.type === 'range') inp.addEventListener('input', handler);
  });
}

function openSettings() {
  var sheet = el('chat-settings');
  if (!sheet) return;
  sheet.innerHTML = settingsHtml();
  sheet.style.display = sheet.style.display === 'block' ? 'none' : 'block';
  if (sheet.style.display === 'block') wireSettings();
}

var HEADER_ACTIONS = '<button class="header-btn" id="chat-chans-btn" title="Channels">' + arkIcon('hash', 16) + '</button>' +
  '<button class="header-btn" id="chat-settings-btn" title="Settings">' + arkIcon('sliders', 16) + '</button>' +
  '<button class="header-btn" id="chat-home" title="Home">' + arkIcon('home', 16) + '</button>' +
  '<button class="header-btn" id="chat-refresh" title="Refresh">' + arkIcon('refresh', 16) + '</button>';

function wireHeader() {
  click('chat-chans-btn', function () {
    var layout = el('chat-layout');
    if (!layout) return;
    if (window.matchMedia('(max-width: 900px)').matches) layout.classList.toggle('chans-open');
    else State.set('chat.chansCollapsed', layout.classList.toggle('chans-collapsed'));
  });
  click('chat-settings-btn', openSettings);
  click('chat-home', function () { if (window.STANDALONE_MAIN) location.href = window.STANDALONE_MAIN + '/'; else Router.go('/home/'); });
  click('chat-refresh', function () {
    if (!channelId) return;
    fetchMeta[channelId] = { fetching: true, hasMore: true, prepending: false };
    Session.socket.emit('fetch_chat', { channel_id: channelId, limit: 500 });
  });
}

function renderChat(params) {
  dmMode = !!params.dm;
  guildId = dmMode ? null : params.gid;
  var want = params.cid || (dmMode ? '' : State.get('session.perGuild.' + guildId + '.channel', ''));
  serverData = null;
  Shell.setTitle(dmMode ? 'Direct Messages' : 'Chat');
  if (dmMode) {
    Shell.setActions(
      (IS_TOUCH ? '<button class="header-btn" id="dm-back" style="display:none;" title="Back"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' : '<button class="header-btn" id="chat-home" title="Home">' + arkIcon('home', 16) + '</button>') +
      '<button class="header-btn" id="chat-settings-btn" title="Chat Settings">' + arkIcon('sliders', 16) + '</button>' +
      '<button class="header-btn" id="chat-refresh" title="Refresh">' + arkIcon('refresh', 16) + '</button>'
    );
  } else {
    Shell.setActions(HEADER_ACTIONS);
  }
  el('page-root').innerHTML =
    '<div class="chat-layout" id="chat-layout">' +
    '<aside class="chat-chans" id="chat-chans"></aside>' +
    '<div class="chat-main">' +
    '<div class="thread-banner" id="thread-banner" style="display:none;"></div>' +
    '<div class="chat-msgs" id="chat-msgs"><div id="chat-list"></div></div>' +
    '<button id="jump-present" style="display:none;">' + arkIcon('down', 16) + '<span class="jp-count"></span></button>' +
    '<div class="chat-input-wrap">' +
    '<div class="typing-bar" id="typing-bar" style="display:none;"></div>' +
    '<div class="slash-hint" id="slash-hint" style="display:none;"></div>' +
    '<div class="reply-preview" id="reply-preview" style="display:none;"><span id="reply-text"></span><button id="reply-cancel">✕</button></div>' +
    '<div class="attach-chips" id="attach-chips"></div>' +
    '<div class="chat-input-row">' +
    '<button class="secondary-btn" id="chat-attach">' + arkIcon('plus', 16) + '</button>' +
    '<button class="secondary-btn" id="chat-emoji">' + arkIcon('react', 16) + '</button>' +
    '<button class="secondary-btn" id="chat-voice">' + arkIcon('mic', 16) + '</button>' +
    '<div class="ta-wrap"><div class="input-mirror" id="input-mirror" aria-hidden="true"></div><textarea id="chat-input" rows="1" placeholder="' + (dmMode ? 'Message...' : 'Type a message...') + '"></textarea></div>' +
    '<button class="primary-btn" id="chat-send">' + arkIcon('send', 16) + '</button>' +
    '</div>' +
    '<input type="file" id="chat-file" multiple style="display:none;">' +
    '<div class="autocomplete" id="chat-ac"></div>' +
    '</div>' +
    '<div class="chat-settings" id="chat-settings" style="display:none;"></div>' +
    '</div></div>';
  replyTarget = null;
  editTarget = null;
  pendingFiles = [];
  wireHeader();
  if (!dmMode && State.get('chat.chansCollapsed', false)) {
    var _cl = el('chat-layout');
    if (_cl) _cl.classList.add('chans-collapsed');
  }
  applyChatSettings();
  applyChatFont();
  if (!globalEmojis.length) Session.socket.emit('run_command', { cmd: 'global_expression_list', params: {} });
  if (dmMode) {
    click('dm-back', dmGoList);
    var lay0 = el('chat-layout');
    if (lay0 && IS_TOUCH) { lay0.classList.add('dm-list'); lay0.classList.remove('dm-chat'); }
  }
  click('chat-send', send);
  click('chat-attach', function () { var f = el('chat-file'); if (f) f.click(); });
  click('chat-emoji', function () { openEmojiPop(null); });
  click('chat-voice', toggleVoice);
  click('reply-cancel', function () { replyTarget = null; paintReply(); });
  on('chat-file', 'change', function (e) {
    Array.prototype.forEach.call(e.target.files, function (f) { pendingFiles.push(f); });
    paintChips();
    e.target.value = '';
  });
  on('chat-input', 'input', function () { syncSlots(); onInputChange(); syncMirror(); updateTypingMode(); });
  on('chat-input', 'scroll', syncMirror);
  on('chat-input', 'focus', function () { 
    updateTypingMode(); 
    setComposer(false); 
    var ta = el('chat-input');
    if (ta) {
      setTimeout(function() { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
    }
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      var ta = el('chat-input');
      if (ta && document.activeElement === ta) { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
  }
  on('chat-input', 'blur', function () { setTimeout(updateTypingMode, 120); }); 
  on('chat-input', 'keydown', function (e) {
    if (acItems.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = Math.min(acIndex + 1, acItems.length - 1); showAc(acMode, acItems); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = Math.max(acIndex - 1, 0); showAc(acMode, acItems); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyAc(); return; }
      if (e.key === 'Escape') { hideAc(); return; }
    }
    if (e.key === 'Enter') {
      if (IS_TOUCH) return;
      if (!e.shiftKey) { e.preventDefault(); send(); }
    }
  });
  on('chat-ac', 'click', function (e) {
    var it = e.target.closest('.ac-item');
    if (!it) return;
    acIndex = parseInt(it.getAttribute('data-i'), 10);
    applyAc();
  });
  on('chat-chans', 'click', function (e) {
    var jb = e.target.closest('[data-vc]');
    var chRow = e.target.closest('.chat-chan');
    if (jb || (chRow && chRow.getAttribute('data-type') === 'voice' && !chRow.classList.contains('vc-member-row'))) {
      e.stopPropagation();
      var cid2 = jb ? jb.getAttribute('data-vc') : chRow.getAttribute('data-chan');
      if (window.Voice && Voice.joinedChannel && Voice.joinedChannel() === cid2) Voice.leave();
      else if (window.Voice) Voice.join(cid2);
      return;
    }
    var dmc = e.target.closest('[data-user]');
    if (dmc && dmMode) { openDmUser(dmc.getAttribute('data-user')); return; }
    var th = e.target.closest('[data-thread]');
    if (th) { selectChannel(th.getAttribute('data-thread')); return; }
    if (chRow && chRow.getAttribute('data-type') !== 'voice') selectChannel(chRow.getAttribute('data-chan'));
  });
  on('chat-chans', 'touchstart', function (e) {
    var dmc = e.target.closest('[data-user]');
    if (!dmc || !dmMode) return;
    var uid = dmc.getAttribute('data-user');
    clearTimeout(roleLpTimer);
    roleLpTimer = setTimeout(function () { contactPopup(uid); }, 450);
  }, { passive: true });
  on('chat-chans', 'touchmove', function () { clearTimeout(roleLpTimer); }, { passive: true });
  on('chat-chans', 'touchend', function () { clearTimeout(roleLpTimer); }, { passive: true });
  on('chat-member-search', 'input', function () { renderMemberList(this.value); });
  on('chat-member-list', 'click', function (e) {
    var m = e.target.closest('.chat-member');
    if (m) Session.socket.emit('open_dm', { user_id: m.getAttribute('data-user') });
  });
  on('chat-msgs', 'scroll', function () {
    var box = el('chat-msgs');
    if (!box) return;
    nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    var pill = el('jump-present');
    if (pill) {
      if (nearBottom) {
        unseen = 0;
        pill.style.display = 'none';
        if (channelId && messageCache[channelId] && messageCache[channelId].length) {
          State.set('chatSeen.' + channelId, messageCache[channelId][messageCache[channelId].length - 1].id);
        }
      } else {
        pill.style.display = 'flex';
        var c = pill.querySelector('.jp-count');
        if (c) c.textContent = unseen > 0 ? String(unseen) : '';
      }
    }
    var st = box.scrollTop;
    var delta = st - lastMsgScroll;
    lastMsgScroll = st;
    if (IS_TOUCH) {
      if (nearBottom) setComposer(false);
      else if (delta < -10 && !chatSettings.alwaysComposer) setComposer(true);
      else if (delta > 6) setComposer(false);
    }
    if (st < 50 && channelId) {
      var meta = fetchMeta[channelId];
      if (meta && meta.hasMore && !meta.fetching && messageCache[channelId] && messageCache[channelId].length) {
        meta.fetching = true;
        meta.prepending = true;
        Session.socket.emit('fetch_chat', { channel_id: channelId, before_id: messageCache[channelId][0].id, limit: 500 });
      }
    }
  });
  click('jump-present', function () { scrollBottom(true); });
  on('chat-list', 'click', function (e) {
    var cl = e.target.closest('.chan-link');
    if (cl) { selectChannel(cl.getAttribute('data-chan')); return; }
    var av = e.target.closest('.msg-avatar');
    var nm = e.target.closest('.msg-head strong');
    if (av || nm) {
      if (chipSuppress) return;
      var prow = e.target.closest('.msg-row');
      if (prow) openProfile(prow.getAttribute('data-author'), e.clientX, e.clientY);
      return;
    }
    var act = e.target.closest('[data-act]');
    if (act) {
      var id = act.getAttribute('data-id');
      var kind = act.getAttribute('data-act');
      if (kind === 'reply') {
        replyTarget = id;
        paintReply();
        var inp = el('chat-input');
        if (inp) inp.focus();
      } else if (kind === 'edit') {
        editTarget = id;
        var row = document.querySelector('.msg-row[data-msg-id="' + id + '"]');
        var txt = row && row.querySelector('.msg-text') ? row.querySelector('.msg-text').textContent : '';
        var in2 = el('chat-input');
        if (in2) { in2.value = txt; in2.focus(); syncMirror(); }
      } else if (kind === 'copy') {
        var cm = findMsg(id);
        copyToClipboard(cm ? cm.content_raw : '');
      } else if (kind === 'react') {
        openEmojiPop(id);
      }
      return;
    }
    var rc = e.target.closest('[data-react]');
    if (rc) {
      if (chipSuppress) return;
      Session.call('react_message', { channel_id: channelId, message_id: rc.getAttribute('data-react'), emoji: rc.getAttribute('data-emoji') });
    }
  });
  on('chat-list', 'touchstart', function (e) {
    var chip = e.target.closest('.reaction-chip');
    if (chip) {
      clearTimeout(roleLpTimer);
      roleLpTimer = setTimeout(function () {
        chipSuppress = true;
        var row = chip.closest('.msg-row');
        openReactedSheet(row ? row.getAttribute('data-msg-id') : null, chip.getAttribute('data-emoji'));
        setTimeout(function () { chipSuppress = false; }, 350);
      }, 450);
      return;
    }
    var roleEl = e.target.closest('.mention-role');
    if (roleEl) {
      clearTimeout(roleLpTimer);
      roleLpTimer = setTimeout(function () { openRoleSheet(roleEl.getAttribute('data-role')); }, 450);
      return;
    }
    var pv = e.target.closest('.msg-avatar') || e.target.closest('.msg-head strong');
    if (pv) {
      clearTimeout(roleLpTimer);
      var prow2 = pv.closest('.msg-row');
      var px = e.touches[0].clientX, py = e.touches[0].clientY;
      roleLpTimer = setTimeout(function () {
        chipSuppress = true;
        if (prow2) openProfile(prow2.getAttribute('data-author'), px, py);
        setTimeout(function () { chipSuppress = false; }, 350);
      }, 450);
      return;
    }
    var row = e.target.closest('.msg-row');
    if (!row) return;
    swipeRow = row;
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
    row.classList.add('dragging');
    clearTimeout(lpTimer);
    lpTimer = setTimeout(function () {
      openMsgPopup(row.getAttribute('data-msg-id'), row);
      swipeRow = null;
      row.classList.remove('dragging');
      row.style.transform = '';
      row.style.setProperty('--sw', 0);
    }, 500);
  }, { passive: true });
  on('chat-list', 'touchmove', function (e) {
    clearTimeout(roleLpTimer);
    clearTimeout(lpTimer);
    if (!swipeRow) return;
    var dx = e.touches[0].clientX - swipeX;
    var dy = e.touches[0].clientY - swipeY;
    if (Math.abs(dy) > Math.abs(dx)) {
      swipeRow.classList.remove('dragging');
      swipeRow.style.transform = '';
      swipeRow.style.setProperty('--sw', 0);
      swipeRow = null;
      return;
    }
    var clamped = Math.max(0, Math.min(dx, 90));
    swipeRow.style.transform = 'translateX(' + clamped + 'px)';
    swipeRow.style.setProperty('--sw', (clamped / 90).toFixed(2));
  }, { passive: true });
  on('chat-list', 'touchend', function (e) {
    clearTimeout(roleLpTimer);
    clearTimeout(lpTimer);
    if (swipeRow) {
      var dx = e.changedTouches[0].clientX - swipeX;
      swipeRow.classList.remove('dragging');
      if (dx > 70) {
        swipeRow.classList.add('swipe-commit');
        var target = swipeRow;
        setTimeout(function () {
          replyTarget = target.getAttribute('data-msg-id');
          paintReply();
          target.classList.remove('swipe-commit');
          target.style.transform = '';
          target.style.setProperty('--sw', 0);
        }, 160);
      } else {
        swipeRow.style.transform = '';
        swipeRow.style.setProperty('--sw', 0);
      }
    }
    swipeRow = null;
  });
  if (!wired) {
    wired = true;
    document.addEventListener('pointerdown', function (e) {
      var pop = el('msg-popup');
      if (pop && pop.classList.contains('show') && !pop.contains(e.target)) closeMsgPopup();
      var pp = el('profile-popup');
      if (pp && pp.classList.contains('show') && !pp.contains(e.target)) pp.classList.remove('show');
    });
    document.addEventListener('contextmenu', function (e) {
      if (e.target.closest && e.target.closest('.chat-layout') && !e.target.closest('textarea, input')) e.preventDefault();
    });
    on('msg-popup', 'touchstart', function (e) {
      var pr = e.target.closest('[data-pr]');
      if (!pr) return;
      clearTimeout(roleLpTimer);
      roleLpTimer = setTimeout(function () {
        chipSuppress = true;
        openReactedSheet(popupMsgId, pr.getAttribute('data-pr'));
        setTimeout(function () { chipSuppress = false; }, 350);
      }, 450);
    }, { passive: true });
    on('emoji-picker', 'click', function (e) {
      var item = e.target.closest('[data-emo]');
      if (!item) return;
      var v = item.getAttribute('data-emo');
      if (emojiReactTarget) {
        Session.call('react_message', { channel_id: channelId, message_id: emojiReactTarget, emoji: v });
        emojiReactTarget = null;
        var pop = el('emoji-picker');
        if (pop) pop.style.display = 'none';
        return;
      }
      var input = el('chat-input');
      if (input) {
        if (v.startsWith('<:') && v.endsWith('>')) {
          // FIX: item IS the img tag, so use item.src directly
          var url = item.src || item.getAttribute('src');
          
          // Fallback: construct URL from shortcode if src is missing
          if (!url) {
            var match = v.match(/<:?(a?):([^:]+):(\d+)>/);
            if (match) {
              var id = match[3];
              var ext = match[1] === 'a' ? 'gif' : 'png';
              url = 'https://cdn.discordapp.com/emojis/' + id + '.' + ext + '?size=40';
            }
          }
          insertEmojiAtCaret(v, url);
        } else {
          var s = input.selectionStart || 0;
          input.value = input.value.substring(0, s) + v + input.value.substring(input.selectionEnd || s);
          input.focus();
          syncMirror();
        }
      }
    });
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', positionAc);
      visualViewport.addEventListener('scroll', positionAc);
    }
    window.addEventListener('resize', positionAc);
    Session.on('guild_details', function (d) {
      if (!guildId || d.id !== guildId) return;
      serverData = d;
      if (window.STANDALONE_GUILD) {
        document.title = d.name || 'Arklum Chat';
        var link = document.querySelector('link[rel="icon"]');
        if (link && d.icon_url && /^https?:/.test(d.icon_url)) link.href = d.icon_url;
      }
      Session.socket.emit('run_command', { cmd: 'thread_list', params: { guild_id: guildId } });
      buildSidebar();
      if (!channelId) {
        var first = channels().filter(function (c) { return c.type !== 'voice'; })[0];
        if (first) selectChannel(first.id);
      } else {
        selectChannel(channelId);
      }
    });
    Session.on('chat_messages', function (d) {
      var cid = d.channel_id;
      if (!cid) return;
      var box = el('chat-msgs');
      var meta = fetchMeta[cid] || (fetchMeta[cid] = {});
      meta.fetching = false;
      var incoming = d.messages || [];
      meta.hasMore = incoming.length >= 500;
      var existing = messageCache[cid] || [];
      var ids = {};
      existing.forEach(function (m) { ids[m.id] = 1; });
      var fresh = incoming.filter(function (m) { return !ids[m.id]; });
      var wasPrepend = meta.prepending && existing.length && fresh.length;
      var prevHeight = box ? box.scrollHeight : 0;
      var prevTop = box ? box.scrollTop : 0;
      if (wasPrepend) messageCache[cid] = fresh.concat(existing);
      else if (incoming.length && fresh.length === incoming.length) messageCache[cid] = incoming.slice(-500);
      else if (fresh.length) messageCache[cid] = fresh.concat(existing);
      else if (!existing.length) messageCache[cid] = [];
      meta.prepending = false;
      if (dmMode && cid === channelId) {
        var cu = contactByChannel(cid);
        if (cu) Session.socket.emit('run_command', { cmd: 'dm_history_save', params: { user_id: cu.user_id, messages: incoming.map(function (m) { return { id: m.id, author_id: m.author_id, display_name: m.display_name, avatar_url: m.avatar_url, content_raw: m.content_raw, timestamp: m.timestamp, attachments: m.attachments }; }) } });
      }
      if (cid === channelId) {
        renderMessages();
        if (wasPrepend && box) box.scrollTop = box.scrollHeight - prevHeight + prevTop;
        else scrollBottom(false);
      }
    });
    Session.on('new_chat_message', function (msg) { pushMsg(msg); });
    Session.on('message_edited', function (d) {
      var list = messageCache[channelId];
      if (!list) return;
      list.forEach(function (m) {
        if (m.id === d.message_id) {
          m.content_raw = d.new_content;
          m.edited = true;
        }
      });
      renderMessages();
    });
    Session.on('message_deleted', function (d) {
      if (!messageCache[channelId]) return;
      messageCache[channelId] = messageCache[channelId].filter(function (m) { return m.id !== d.message_id; });
      renderMessages();
    });
    Session.on('typing_indicator', function (d) {
      var bar = el('typing-bar');
      if (!bar || d.channel_id !== channelId) return;
      bar.textContent = d.user_name + ' is typing…';
      bar.style.display = 'block';
      clearTimeout(typingHide);
      typingHide = setTimeout(function () { bar.style.display = 'none'; }, 2500);
    });
    Session.on('server_expression_data', function (d) {
      if (d && d.emojis) serverEmojis = d.emojis;
    });
    Session.on('vc_states', function (d) { vcStates[d.channel_id] = d.members || []; if (!dmMode) buildSidebar(); });
    Session.on('vc_speaking', function (d) { vcSpeak[d.user_id] = d.speaking; if (!dmMode) buildSidebar(); });
    Session.on('vc_audio', function (d) {
      if (window.Voice) {
        Voice.playChunk(d.user_id, d.data);
      }
    });
    Session.on('global_expression_data', function (d) {
      globalEmojis = (d && d.emojis) || [];
      var pop = el('emoji-picker');
      if (pop && pop.style.display === 'block') buildEmojiPicker();
    });
    Session.on('thread_list', function (d) {
      threadAll = (d && d.threads) || [];
      threadCache = {};
      threadAll.forEach(function (t) {
        (threadCache[t.parent_id] = threadCache[t.parent_id] || []).push(t);
      });
      if (!dmMode) buildSidebar();
      updateThreadBanner();
    });
    Session.on('thread_created', function (d) {
      if (guildId) Session.socket.emit('run_command', { cmd: 'thread_list', params: { guild_id: guildId } });
      if (d && d.id) selectChannel(d.id);
    });
    Session.on('thread_message', function (msg) { pushMsg(msg); });
    Session.on('dm_contacts', function (list) {
      dmContacts = list || [];
      if (dmMode) buildSidebar();
    });
    Session.on('dm_opened', function (d) {
      if (!dmMode) { Router.go('/dms/' + d.channel_id); return; }
      var c = contactByUser(d.user_id);
      if (c) c.channel_id = d.channel_id;
      selectChannel(d.channel_id);
    });
    Session.on('dm_incoming', function (d) {
      var c = contactByUser(d.user_id);
      if (c) { c.preview = d.preview; c.unread = d.unread; c.channel_id = d.channel_id; }
      if (dmMode) {
        buildSidebar();
        if (d.channel_id === channelId) pushMsg(d.message);
      }
    });
    Session.on('dm_sync', function (r) {
      var c = contactByUser(r.user_id);
      if (!c) return;
      if (dmMode && channelId === c.channel_id) { c.unread = 0; Session.socket.emit('run_command', { cmd: 'dm_mark_read', params: { user_id: r.user_id } }); }
      else c.unread = r.new_count || 0;
      if (dmMode) buildSidebar();
    });
    Session.on('presence_update', function (d) {
      var list = members();
      for (var i = 0; i < list.length; i++) if (list[i].id === d.user_id) { list[i].status = d.status; break; }
      var q = el('chat-member-search');
      renderMemberList(q ? q.value : '');
    });
    Session.on('user_profile_full', function (p) {
      var pp = el('profile-popup');
      if (!pp || !p) return;
      if (!p.global && p.id) {
        p = {
          global: {
            id: String(p.id),
            username: p.username || '',
            global_name: p.display_name || p.username || '',
            avatar_url: p.avatar_url || '',
            avatar_decoration_url: p.decoration_url || null,
            banner_url: p.banner_url || null,
            accent_color: p.accent_color || null,
            bio: p.bio || '',
            badges: p.badges || [],
            premium: !!p.nitro,
            bot: !!p.bot,
            system: false,
            created_at: p.created_at || null
          },
          member: p.member || null,
          mutual_count: p.mutual_count || 0
        };
      }
      if (!p.global) return;
      profileData = p;
      renderProfileCard();
      pp.style.left = Math.max(8, Math.min(profilePos.x - 140, innerWidth - 320)) + 'px';
      pp.style.top = Math.max(8, Math.min(profilePos.y - 60, innerHeight - 460)) + 'px';
      pp.classList.add('show');
    });
  }
  if (dmMode) {
    Session.socket.emit('run_command', { cmd: 'dm_contacts', params: {} });
    if (want) selectChannel(want);
  } else {
    Session.socket.emit('get_guild_details', { guild_id: guildId });
    if (want) selectChannel(want);
  }
}

Router.add('/server/:gid/chat/:cid?', renderChat, {
  guard: 'auth',
  css: ['chat.css'],
  onExit: function () {
    hideAc();
    closeMsgPopup();
    closeProfile();
    emojiReactTarget = null;
    var pop = el('emoji-picker');
    if (pop) pop.style.display = 'none';
  }
});
Router.add('/dms/:cid?', function (p) { renderChat({ gid: null, cid: p.cid, dm: true }); }, {
  guard: 'auth',
  css: ['chat.css'],
  onExit: function () {
    hideAc();
    closeMsgPopup();
    closeProfile();
    emojiReactTarget = null;
    dmMode = false;
    var pop = el('emoji-picker');
    if (pop) pop.style.display = 'none';
  }
});
Shell.registerNav({ page: 'chat', label: 'Chat', icon: 'chat', dock: false, ctx: 'server', group: 'general', act: 'chatsite' });
Shell.registerNav({ page: 'dms', label: 'DMs', icon: 'chat', dock: true, ctx: 'global', group: 'general' });
})();