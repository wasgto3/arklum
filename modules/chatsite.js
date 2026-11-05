const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { registerCommand, logger, getBot, KEY_FILE } = require('../bot');
const PORT_MIN = 8100;
const PORT_MAX = 8199;
const IDLE_MS = 5 * 60 * 1000;
const HB_WINDOW = 45 * 1000;
const REVIVE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAIN_PORT = parseInt(process.env.PORT) || 8000;
function mainOrigin(req) {
  const h = (req && req.headers) || {};
  const host = h.host ? String(h.host).replace(/:\d+$/, '') : 'localhost';
  const proto = String(h['x-forwarded-proto'] || 'http').split(',')[0];
  return proto + '://' + host + ':' + MAIN_PORT;
}
const STATIC_ROOT = path.join('static');
const MAP_FILE = path.join('.arklum_sys', 'chatsites.json');
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
};
const sites = new Map();
function loadMap() {
  try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); } catch (e) { return {}; }
}
let portMap = loadMap();
function saveMap() {
  try {
    fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
    fs.writeFileSync(MAP_FILE, JSON.stringify(portMap));
  } catch (e) {}
}
function secretKey() {
  try { return fs.readFileSync(KEY_FILE); } catch (e) { return Buffer.from('arklum'); }
}
function ticketFor(guildId) {
  return crypto.createHmac('sha256', secretKey()).update('chatsite:' + guildId).digest('hex').slice(0, 32);
}
function lanIp() {
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const i of ifaces[name] || []) {
        if (i.family === 'IPv4' && !i.internal) return i.address;
      }
    }
  } catch (e) {}
  return '0.0.0.0';
}
function probeFree(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(800);
    sock.on('connect', () => done(false));
    sock.on('timeout', () => done(true));
    sock.on('error', () => done(true));
  });
}
async function pickPort(guildId) {
  const known = portMap[guildId];
  if (known && known.port && await probeFree(known.port)) return known.port;
  for (let p = PORT_MIN; p <= PORT_MAX; p++) {
    let reserved = false;
    for (const g of Object.keys(portMap)) if (portMap[g].port === p) reserved = true;
    if (reserved) continue;
    if (await probeFree(p)) return p;
  }
  for (let p = PORT_MIN; p <= PORT_MAX; p++) if (await probeFree(p)) return p;
  return null;
}
function serveFile(res, abs) {
  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}
function readBody(req, cb) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch (e) { cb({}); } });
}
function staticFile(rel) {
  const abs = path.join(STATIC_ROOT, rel);
  const norm = path.normalize(abs);
  if (!norm.startsWith(path.normalize(STATIC_ROOT))) return null;
  try { return fs.statSync(norm).isFile() ? norm : null; } catch (e) { return null; }
}
function makeSite(guildId, port) {
  const site = { guildId, port, alive: true, clients: new Map(), lastActive: Date.now(), server: null };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    if (req.method === 'POST' && u.pathname === '/__hb') {
      readBody(req, (b) => {
        if (b.client) site.clients.set(String(b.client), Date.now());
        site.lastActive = Date.now();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    if (req.method === 'POST' && u.pathname === '/__bye') {
      readBody(req, (b) => {
        if (b.client) site.clients.delete(String(b.client));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    if (req.method === 'GET' && u.pathname === '/__config') {
      const t = u.searchParams.get('t') || '';
      if (t !== ticketFor(guildId)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'bad ticket' })); return; }
      site.lastActive = Date.now();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, guild_id: guildId, main_origin: mainOrigin(req), port }));
      return;
    }
    if (u.pathname === '/arklum.png' || u.pathname === '/arklum.gif') { serveFile(res, path.join('arklum.png')); return; }
    if (u.pathname === '/arklum-broken.svg' || u.pathname === '/favicon.ico') {
      const f = staticFile('arklum-broken.svg');
      if (f) { serveFile(res, f); return; }
      res.writeHead(404); res.end(); return;
    }
    if (req.method === 'GET') {
      const rel = u.pathname.replace(/^\/+/, '');
      const file = rel ? staticFile(rel) : null;
      if (file) { serveFile(res, file); return; }
      if (/^(css|core|shell|pages|fonts)\//.test(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); return; }
      serveFile(res, path.join(STATIC_ROOT, 'chatsite.html'));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
  site.server = server;
  server.on('error', (e) => {
    logger.error('[CHATSITE] port ' + port + ' error: ' + e.message);
    site.alive = false;
    sites.delete(guildId);
  });
  server.listen(port, '0.0.0.0', () => { logger.info('[CHATSITE] guild ' + guildId + ' live on 0.0.0.0:' + port); });
  sites.set(guildId, site);
  portMap[guildId] = { port, lastActive: site.lastActive };
  saveMap();
  return site;
}
function closeSite(site) {
  site.alive = false;
  try { site.server.close(); } catch (e) {}
  sites.delete(site.guildId);
  if (portMap[site.guildId]) portMap[site.guildId].lastActive = site.lastActive;
  saveMap();
}
setInterval(() => {
  const now = Date.now();
  for (const site of Array.from(sites.values())) {
    for (const [cid, ts] of Array.from(site.clients)) if (now - ts > HB_WINDOW) site.clients.delete(cid);
    if (site.clients.size === 0 && now - site.lastActive > IDLE_MS) {
      logger.info('[CHATSITE] idle reap :' + site.port + ' (guild ' + site.guildId + ', port reserved)');
      closeSite(site);
    }
  }
}, 30000);
function revivePersisted() {
  const now = Date.now();
  for (const gid of Object.keys(portMap)) {
    const entry = portMap[gid];
    if (!entry || !entry.port) continue;
    if (now - (entry.lastActive || 0) > REVIVE_MAX_AGE) { delete portMap[gid]; continue; }
    if (!sites.has(gid)) makeSite(gid, entry.port);
  }
  saveMap();
}
revivePersisted();
registerCommand('chatsite_open')(async (params, { socket }) => {
  const gid = params.guild_id;
  const b = getBot();
  if (!b || !b.isReady() || !gid) { socket.emit('error', { message: 'Bot not connected' }); return; }
  let site = sites.get(gid);
  if (!site || !site.alive) {
    const port = await pickPort(gid);
    if (!port) { socket.emit('error', { message: 'No free chat ports in range' }); return; }
    site = makeSite(gid, port);
  }
  site.lastActive = Date.now();
  if (portMap[gid]) portMap[gid].lastActive = site.lastActive;
  saveMap();
  const t = ticketFor(gid);
  const reqHost = String((socket.handshake && socket.handshake.headers && socket.handshake.headers.host) || '').replace(/:\d+$/, '') || lanIp();
  socket.emit('chatsite_opened', {
    guild_id: gid,
    port: site.port,
    url: 'http://' + reqHost + ':' + site.port + '/?t=' + t,
    external: 'http://' + lanIp() + ':' + site.port + '/?t=' + t
  });
});
registerCommand('chatsite_close')(async (params, { socket }) => {
  const site = sites.get(params.guild_id);
  if (site) closeSite(site);
  socket.emit('notification', 'Chat site closed');
});
registerCommand('chatsite_list')(async (params, { socket }) => {
  socket.emit('chatsite_list', Array.from(sites.values()).map((s) => ({ guild_id: s.guildId, port: s.port, clients: s.clients.size })));
});
module.exports = { sites, ticketFor, lanIp };