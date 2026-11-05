'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getBot, registerCommand, logger } = require('../bot');

const PORT = 8200;
const MAIN_PORT = parseInt(process.env.PORT, 10) || 8000;
const STATIC_ROOT = path.join(__dirname, '..', 'static');
const STUDIO_FILE = path.join(STATIC_ROOT, 'webhooks-studio.html');

// device images reach Discord by way of the bot owner's DM: the attachment url
// returned there is the only public url available without exposing this host
const AVATAR_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const AVATAR_MAX = 8 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let server = null;

function log(m) { if (logger && logger.info) logger.info(m); else console.log(m); }
function warn(m) { if (logger && logger.error) logger.error(m); else console.error(m); }

function reqProto(req) {
  const h = (req && req.headers) || {};
  const fp = String(h['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (fp === 'https' || h['x-forwarded-ssl'] === 'on') return 'https';
  return 'http';
}
function reqHost(req) {
  let host = String(((req && req.headers) || {}).host || 'localhost');
  if (host.startsWith('[')) { const e = host.indexOf(']'); if (e > -1) return host.slice(1, e); }
  return host.split(':')[0] || 'localhost';
}
function mainOrigin(req) { return reqProto(req) + '://' + reqHost(req) + ':' + MAIN_PORT; }

function resolveStatic(pathname) {
  try {
    const rel = decodeURIComponent(String(pathname || '').replace(/^\/+/, ''));
    if (!rel) return null;
    const abs = path.resolve(STATIC_ROOT, rel);
    const root = path.resolve(STATIC_ROOT);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    const st = fs.statSync(abs);
    return st.isFile() ? abs : null;
  } catch (e) { return null; }
}

function serveStatic(req, res, pathname) {
  const abs = resolveStatic(pathname);
  if (!abs) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(abs).pipe(res);
  return true;
}

function studioPage(req) {
  let html = '';
  try { html = fs.readFileSync(STUDIO_FILE, 'utf8'); }
  catch (e) {
    warn('[WEBSITE] missing static/webhooks-studio.html');
    return '<!doctype html><html><head><meta charset="utf-8"><title>Webhook Studio</title></head><body style="font-family:sans-serif;padding:20px;background:#242424;color:#ececec">Missing static/webhooks-studio.html</body></html>';
  }
  return html.split('__ARKLUM_MAIN__').join(mainOrigin(req));
}

function startServer() {
  if (server) return;
  server = http.createServer(function (req, res) {
    try {
      const url = String(req.url || '/').split('?')[0];
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (url.startsWith('/css/') || url.startsWith('/core/') || url.startsWith('/fonts/') || url === '/favicon.ico' || url === '/arklum.png' || url === '/arklum-broken.svg') {
        if (serveStatic(req, res, url)) return;
      }
      if (url === '/' || url === '' || url === '/index.html' || url.indexOf('/studio') === 0 || url.indexOf('/webhook-studio') === 0) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(studioPage(req));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    } catch (e) {
      warn('[WEBSITE] request error: ' + ((e && e.message) || String(e)));
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
    }
  });
  server.on('error', function (e) {
    if (e && e.code === 'EADDRINUSE') warn('[WEBSITE] webhook studio port busy: ' + PORT);
    else warn('[WEBSITE] webhook studio error: ' + ((e && e.message) || String(e)));
  });
  server.listen(PORT, '0.0.0.0', function () { log('[WEBSITE] webhooks studio live on :' + PORT); });
}

registerCommand('webhooks_open')(async (params, ctx) => {
  startServer();
  if (ctx && ctx.socket) ctx.socket.emit('webhooks_opened', { port: PORT, path: '/' });
});

registerCommand('whs_guilds')(async (params, ctx) => {
  const socket = ctx && ctx.socket; if (!socket) return;
  const bot = getBot();
  if (!bot || typeof bot.isReady !== 'function' || !bot.isReady()) { socket.emit('whs_guilds', { guilds: [] }); return; }
  socket.emit('whs_guilds', { guilds: bot.guilds.cache.map(g => ({ id: String(g.id), name: g.name })) });
});

registerCommand('utility_upload_avatar')(async (params, ctx) => {
  const socket = ctx && ctx.socket; if (!socket) return;
  const fail = (message) => socket.emit('utility_upload_avatar_result', { error: message });

  const bot = getBot();
  if (!bot || typeof bot.isReady !== 'function' || !bot.isReady()) { fail('Bot not connected'); return; }

  const b64 = String((params && params.image) || '');
  const ext = String((params && params.ext) || 'png').toLowerCase();
  if (!b64) { fail('No image data'); return; }
  if (!AVATAR_EXT.has(ext)) { fail('Unsupported avatar type'); return; }

  let buf;
  try { buf = Buffer.from(b64, 'base64'); } catch (e) { fail('Bad image data'); return; }
  if (!buf.length || buf.length > AVATAR_MAX) { fail('Image empty or over 8MB'); return; }

  try {
    let owner = bot.owner || (bot.application && bot.application.owner) || null;
    if (!owner && bot.application && typeof bot.application.fetch === 'function') {
      const app = await bot.application.fetch();
      owner = app && app.owner;
    }
    if (!owner || !owner.id) { fail('Bot owner unavailable'); return; }

    const msg = await owner.send({ files: [{ attachment: buf, name: 'arklum-avatar.' + ext }] });
    const att = msg && msg.attachments && typeof msg.attachments.first === 'function' ? msg.attachments.first() : null;
    const url = att && att.url ? String(att.url) : '';
    if (!url) { fail('Discord returned no attachment URL'); return; }

    socket.emit('utility_upload_avatar_result', { url: url });
  } catch (e) {
    warn('[WEBSITE] avatar upload failed: ' + ((e && e.message) || String(e)));
    fail('Owner DM closed or send failed');
  }
});

try { startServer(); } catch (e) { warn('[WEBSITE] failed to start webhook studio: ' + ((e && e.message) || String(e))); }

module.exports = {};