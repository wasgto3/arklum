const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const {
  io,
  logger,
  getBot,
  commandHandlers,
  loadDashboardPrefs,
  saveDashboardPrefs
} = require('../bot');
const api = require('./api');
const API2_VERSION = '2.0.0';
const API2_MAJOR = 2;
const REST_PORT2 = 8002;
const MASTER_KEY_FILE = path.join('.arklum_sys', 'config', 'api_key.json');
const KEYS_FILE = path.join('.arklum_sys', 'config', 'api_keys_v2.json');
const EVENT_BUFFER = [];
const EVENT_BUFFER_MAX = 500;
const SSE_CLIENTS = new Set();
const RATE_BUCKETS = new Map();
let eventId = 0;
let eventsWired = false;

class V2Error extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status || 500;
  }
}

function v2err(code, message, status) {
  return new V2Error(code, message, status);
}

function coreVersion() {
  try {
    return require('../package.json').version;
  } catch (e) {
    return '0.0.0';
  }
}

function masterKey() {
  try {
    return JSON.parse(fs.readFileSync(MASTER_KEY_FILE, 'utf8')).key;
  } catch (e) {
    return null;
  }
}

function loadKeys() {
  try {
    const j = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    return Array.isArray(j.keys) ? j.keys : [];
  } catch (e) {
    return [];
  }
}

function saveKeys(keys) {
  fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
  fs.writeFileSync(KEYS_FILE + '.tmp', JSON.stringify({ keys: keys }, null, 2));
  fs.renameSync(KEYS_FILE + '.tmp', KEYS_FILE);
}

function resolveAuth(req, queryKey) {
  const provided = req.headers['x-arkulum-key'] || queryKey || '';
  if (!provided) return null;
  const mk = masterKey();
  if (mk && provided === mk) return { id: 'master', scopes: ['*'], master: true };
  const hit = loadKeys().find(k => k.key === provided);
  if (!hit) return null;
  return { id: hit.id, scopes: hit.scopes || ['read'], master: false };
}

function checkScope(auth, r) {
  if (!r.scopes) return true;
  if (!auth) return false;
  if (auth.scopes.includes('*')) return true;
  return r.scopes.some(s => auth.scopes.includes(s));
}

function rateCheck(keyId) {
  const now = Date.now() / 1000;
  let b = RATE_BUCKETS.get(keyId);
  if (!b) {
    b = { tokens: 30, last: now };
    RATE_BUCKETS.set(keyId, b);
  }
  const elapsed = now - b.last;
  b.tokens = Math.min(30, b.tokens + elapsed * 10);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, retryAfter: 0 };
  }
  return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - b.tokens) / 10)) };
}

function writeSse(client, ev) {
  try {
    client.res.write('id: ' + ev.id + '\nevent: ' + ev.name + '\ndata: ' + JSON.stringify(ev.data) + '\n\n');
  } catch (e) {
    SSE_CLIENTS.delete(client);
  }
}

function pushEvent(name, data) {
  eventId += 1;
  const ev = { id: eventId, name: name, data: data, ts: Date.now() };
  EVENT_BUFFER.push(ev);
  if (EVENT_BUFFER.length > EVENT_BUFFER_MAX) EVENT_BUFFER.shift();
  for (const client of SSE_CLIENTS) writeSse(client, ev);
}

function ensureEvents() {
  if (eventsWired) return;
  const bot = getBot();
  if (!bot || !bot.isReady()) return;
  eventsWired = true;
  bot.on('messageCreate', (msg) => {
    pushEvent('messages.create', { id: String(msg.id), channel_id: String(msg.channel.id), author_id: String(msg.author.id), content: msg.content });
  });
  bot.on('messageUpdate', (o, n) => {
    pushEvent('messages.update', { id: String(n.id), channel_id: String(n.channel.id), content: n.content });
  });
  bot.on('messageDelete', (msg) => {
    pushEvent('messages.delete', { id: String(msg.id), channel_id: String(msg.channel.id) });
  });
  bot.on('messageReactionAdd', (r, user) => {
    pushEvent('reactions.add', { message_id: String(r.message.id), emoji: String(r.emoji), user_id: user ? String(user.id) : null });
  });
  bot.on('guildMemberAdd', (m) => {
    pushEvent('members.join', { user_id: String(m.id), name: m.displayName });
  });
  bot.on('guildMemberRemove', (m) => {
    pushEvent('members.leave', { user_id: String(m.id), name: m.displayName });
  });
  bot.on('typingStart', (t) => {
    pushEvent('typing.start', { channel_id: t.channel ? String(t.channel.id) : null, user_id: t.user ? String(t.user.id) : null });
  });
  bot.on('voiceStateUpdate', (o, n) => {
    pushEvent('voice.state', { user_id: String(n.id), channel_id: n.channelId ? String(n.channelId) : null });
  });
  bot.on('presenceUpdate', (o, n) => {
    pushEvent('presence.update', { user_id: String(n.id), status: n.status });
  });
  logger.info('[API2] event bridge wired');
}

setInterval(ensureEvents, 5000);

async function cmdBridge(name, params, want) {
  const handler = commandHandlers[name];
  if (!handler) throw v2err('NOT_FOUND', 'Unknown command: ' + name, 404);
  const captured = [];
  const fake = {
    id: 'rest-v2',
    emit: (n, d) => captured.push([n, d]),
    on: () => {},
    once: () => {},
    to: () => ({ emit: () => {} })
  };
  await handler(params || {}, { socket: fake });
  if (!want) return { ok: true, emitted: captured.map(c => c[0]) };
  const hit = captured.find(c => c[0] === want);
  if (!hit) throw v2err('NOT_FOUND', 'No payload: ' + want, 404);
  return hit[1];
}

async function v1Bridge(key, params, scopes) {
  return api.run({ scopes: scopes || ['*'] }, key, params || {});
}

const ROUTES = [];

function route(method, pattern, scopes, desc, handler, meta) {
  ROUTES.push({ method: method, pattern: pattern, scopes: scopes, desc: desc, handler: handler, meta: meta || null });
}

function matchRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const rp = r.pattern.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].charAt(0) === ':') params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params: params };
  }
  return null;
}

route('GET', '/api/v2/health', null, 'Health probe', async () => ({ ok: true, api: API2_VERSION, core: coreVersion() }));
route('GET', '/api/v2/openapi.json', null, 'Generated OpenAPI document', async () => buildOpenApi());
route('GET', '/api/v2/docs', null, 'Human-readable route list', async () => buildDocsHtml(), { html: true });
route('GET', '/api/v2/messages/search', ['read'], 'Search messages in a channel', (ctx) => v1Bridge('messages.search', ctx.query, ctx.auth.scopes));
route('GET', '/api/v2/messages', ['read'], 'Fetch messages', (ctx) => v1Bridge('messages.fetch', ctx.query, ctx.auth.scopes));
route('POST', '/api/v2/messages', ['write'], 'Send a message', (ctx) => v1Bridge('messages.send', ctx.body, ctx.auth.scopes));
route('PATCH', '/api/v2/messages/:id', ['write'], 'Edit a message', (ctx) => v1Bridge('messages.edit', Object.assign({ message_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('DELETE', '/api/v2/messages/:id', ['moderate'], 'Delete a message', (ctx) => v1Bridge('messages.delete', Object.assign({ message_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('POST', '/api/v2/messages/:id/react', ['write'], 'Add a reaction', (ctx) => v1Bridge('messages.react', Object.assign({ message_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('POST', '/api/v2/messages/:id/pin', ['write'], 'Pin a message', (ctx) => v1Bridge('messages.pin', Object.assign({ message_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('GET', '/api/v2/channels', ['read'], 'List channels', (ctx) => v1Bridge('channels.list', ctx.query, ctx.auth.scopes));
route('POST', '/api/v2/channels', ['manage'], 'Create a channel', (ctx) => v1Bridge('channels.create', ctx.body, ctx.auth.scopes));
route('GET', '/api/v2/channels/:id', ['read'], 'Get a channel', (ctx) => v1Bridge('channels.get', Object.assign({ channel_id: ctx.params.id }, ctx.query), ctx.auth.scopes));
route('PATCH', '/api/v2/channels/:id', ['manage'], 'Edit a channel', (ctx) => v1Bridge('channels.edit', Object.assign({ channel_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('DELETE', '/api/v2/channels/:id', ['manage'], 'Delete a channel', (ctx) => v1Bridge('channels.delete', Object.assign({ channel_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('GET', '/api/v2/guilds/current', ['read'], 'Current guild info', (ctx) => v1Bridge('guilds.current', ctx.query, ctx.auth.scopes));
route('PATCH', '/api/v2/guilds/current', ['manage'], 'Edit current guild', (ctx) => v1Bridge('guilds.edit', ctx.body, ctx.auth.scopes));
route('GET', '/api/v2/guilds/stats', ['read'], 'Guild stats', (ctx) => v1Bridge('guilds.stats', ctx.query, ctx.auth.scopes));
route('GET', '/api/v2/guilds/audit', ['moderate'], 'Guild audit log', (ctx) => v1Bridge('guilds.audit', ctx.query, ctx.auth.scopes));
route('GET', '/api/v2/members/search', ['read'], 'Search members', (ctx) => v1Bridge('members.search', ctx.query, ctx.auth.scopes));
route('GET', '/api/v2/members', ['read'], 'List members', (ctx) => v1Bridge('members.list', ctx.query, ctx.auth.scopes));
route('GET', '/api/v2/members/:id', ['read'], 'Get a member', (ctx) => v1Bridge('members.get', Object.assign({ user_id: ctx.params.id }, ctx.query), ctx.auth.scopes));
route('POST', '/api/v2/members/:id/kick', ['moderate'], 'Kick a member', (ctx) => v1Bridge('members.kick', Object.assign({ user_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('POST', '/api/v2/members/:id/ban', ['moderate'], 'Ban a member', (ctx) => v1Bridge('members.ban', Object.assign({ user_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('DELETE', '/api/v2/members/:id/ban', ['moderate'], 'Unban a member', (ctx) => v1Bridge('members.unban', Object.assign({ user_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('POST', '/api/v2/members/:id/timeout', ['moderate'], 'Timeout a member', (ctx) => v1Bridge('members.timeout', Object.assign({ user_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('POST', '/api/v2/members/:id/nick', ['moderate'], 'Set nickname', (ctx) => v1Bridge('members.nick', Object.assign({ user_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('POST', '/api/v2/members/:id/roles', ['moderate'], 'Add role to member', (ctx) => v1Bridge('members.roleAdd', Object.assign({ user_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('DELETE', '/api/v2/members/:id/roles/:roleId', ['moderate'], 'Remove role from member', (ctx) => v1Bridge('members.roleRemove', Object.assign({ user_id: ctx.params.id, role_id: ctx.params.roleId }, ctx.body), ctx.auth.scopes));
route('GET', '/api/v2/roles', ['read'], 'List roles', (ctx) => v1Bridge('roles.list', ctx.query, ctx.auth.scopes));
route('POST', '/api/v2/roles', ['manage'], 'Create a role', (ctx) => v1Bridge('roles.create', ctx.body, ctx.auth.scopes));
route('DELETE', '/api/v2/roles/:id', ['manage'], 'Delete a role', (ctx) => v1Bridge('roles.delete', Object.assign({ role_id: ctx.params.id }, ctx.body), ctx.auth.scopes));
route('GET', '/api/v2/emojis', ['read'], 'List emojis', (ctx) => v1Bridge('emojis.list', ctx.query, ctx.auth.scopes));
route('GET', '/api/v2/users/:id/profile', ['read'], 'User profile', (ctx) => v1Bridge('users.profile', Object.assign({ user_id: ctx.params.id }, ctx.query), ctx.auth.scopes));
route('GET', '/api/v2/users/:id/presence', ['read'], 'User presence', (ctx) => v1Bridge('users.presence', Object.assign({ user_id: ctx.params.id }, ctx.query), ctx.auth.scopes));
route('POST', '/api/v2/dms/open', ['write'], 'Open a DM channel', (ctx) => v1Bridge('dms.open', ctx.body, ctx.auth.scopes));
route('POST', '/api/v2/dms/send', ['write'], 'Send a DM', (ctx) => v1Bridge('dms.send', ctx.body, ctx.auth.scopes));
route('GET', '/api/v2/storage/:scope/:key', ['read'], 'Read stored value', (ctx) => v1Bridge('storage.get', { scope: ctx.params.scope, key: ctx.params.key }, ctx.auth.scopes));
route('PUT', '/api/v2/storage/:scope/:key', ['write'], 'Write stored value', (ctx) => v1Bridge('storage.set', { scope: ctx.params.scope, key: ctx.params.key, value: ctx.body.value }, ctx.auth.scopes));
route('GET', '/api/v2/plugins', ['read'], 'List plugins', (ctx) => v1Bridge('plugins.list', {}, ctx.auth.scopes));
route('GET', '/api/v2/system/version', ['read'], 'API and core version', (ctx) => v1Bridge('system.version', {}, ctx.auth.scopes));
route('GET', '/api/v2/system/ping', ['read'], 'Ping probe', (ctx) => v1Bridge('system.ping', {}, ctx.auth.scopes));
route('GET', '/api/v2/system/uptime', ['read'], 'Process uptime', (ctx) => v1Bridge('system.uptime', {}, ctx.auth.scopes));
route('GET', '/api/v2/system/stats', ['read'], 'Live system stats', () => cmdBridge('get_system_stats', {}, 'system_stats'));
route('GET', '/api/v2/presence/rotation', ['read'], 'Status rotation config', () => cmdBridge('status_list_texts', {}, 'status_texts'));
route('POST', '/api/v2/presence/rotation', ['write'], 'Add rotation text', (ctx) => cmdBridge('status_add_text', ctx.body));
route('DELETE', '/api/v2/presence/rotation/:index', ['write'], 'Remove rotation text', (ctx) => cmdBridge('status_remove_text', { index: ctx.params.index }));
route('PUT', '/api/v2/presence/status', ['write'], 'Set bot status', (ctx) => cmdBridge('status_set_presence', ctx.body));
route('PUT', '/api/v2/presence/rpc', ['write'], 'Set rich presence', (ctx) => cmdBridge('status_set_rich_presence', ctx.body));
route('GET', '/api/v2/prefs', ['read'], 'Dashboard prefs', async () => loadDashboardPrefs());
route('PATCH', '/api/v2/prefs', ['write'], 'Update dashboard prefs', async (ctx) => {
  const prefs = loadDashboardPrefs();
  if (ctx.body && ctx.body.key !== undefined) {
    if (!(ctx.body.key in prefs)) throw v2err('VALIDATION', 'Unknown pref key', 400);
    prefs[ctx.body.key] = ctx.body.value;
    saveDashboardPrefs(prefs);
    io.emit('dashboard_prefs', prefs);
    return { ok: true, key: ctx.body.key };
  }
  if (ctx.body && typeof ctx.body === 'object') {
    let changed = 0;
    for (const k of Object.keys(ctx.body)) {
      if (k in prefs) {
        prefs[k] = ctx.body[k];
        changed++;
      }
    }
    saveDashboardPrefs(prefs);
    io.emit('dashboard_prefs', prefs);
    return { ok: true, changed: changed };
  }
  throw v2err('VALIDATION', 'Body required', 400);
});
route('GET', '/api/v2/themes', ['read'], 'List theme files', async () => {
  try {
    const files = fs.readdirSync(path.join('static', 'themes')).filter(f => f.endsWith('.json')).map(f => ({ name: f.replace('.json', ''), path: 'themes/' + f }));
    return { themes: files };
  } catch (e) {
    return { themes: [] };
  }
});
route('PUT', '/api/v2/themes', ['write'], 'Set global theme', (ctx) => cmdBridge('save_global_theme', { path: ctx.body.path || '' }));
route('GET', '/api/v2/memes/config', ['read'], 'Meme task config', () => cmdBridge('get_meme_config', {}, 'meme_config'));
route('PUT', '/api/v2/memes/config', ['write'], 'Update meme task config', (ctx) => {
  if (ctx.body.enabled !== undefined) return cmdBridge('toggle_background_task', { key: 'memes', enabled: !!ctx.body.enabled });
  if (ctx.body.prefix) return cmdBridge('set_bg_prefix', { key: 'memes', prefix: String(ctx.body.prefix) });
  throw v2err('VALIDATION', 'enabled or prefix required', 400);
});
route('POST', '/api/v2/updates/check', ['read'], 'Check for updates', () => cmdBridge('check_for_update', {}));
route('POST', '/api/v2/updates/perform', ['manage'], 'Perform update', () => cmdBridge('perform_update', {}));
route('POST', '/api/v2/updates/rollback', ['manage'], 'Rollback last update', () => cmdBridge('rollback_update', {}));
route('GET', '/api/v2/voice/state', ['read'], 'Voice connections state', async () => {
  const { getVoiceConnection } = require('@discordjs/voice');
  const bot = getBot();
  if (!bot || !bot.isReady()) throw v2err('CORE', 'Bot not connected', 500);
  const out = [];
  for (const g of bot.guilds.cache.values()) {
    const c = getVoiceConnection(g.id);
    if (c) out.push({ guild_id: g.id, status: c.state.status, channel_id: c.joinConfig.channelId });
  }
  return { connections: out };
});
route('GET', '/api/v2/keys', ['*'], 'List scoped keys', async (ctx) => {
  if (!ctx.auth.master) throw v2err('PERMISSION', 'Master key required', 403);
  return loadKeys().map(k => ({ id: k.id, label: k.label, scopes: k.scopes, created: k.created, key: k.key.slice(0, 6) + '...' }));
});
route('POST', '/api/v2/keys', ['*'], 'Create scoped key', async (ctx) => {
  if (!ctx.auth.master) throw v2err('PERMISSION', 'Master key required', 403);
  const keys = loadKeys();
  const entry = {
    id: crypto.randomBytes(6).toString('hex'),
    key: crypto.randomBytes(24).toString('hex'),
    label: String(ctx.body.label || 'key'),
    scopes: Array.isArray(ctx.body.scopes) ? ctx.body.scopes.filter(s => ['read', 'write', 'manage', 'moderate'].includes(s)) : ['read'],
    created: new Date().toISOString()
  };
  keys.push(entry);
  saveKeys(keys);
  return { id: entry.id, key: entry.key };
});
route('DELETE', '/api/v2/keys/:id', ['*'], 'Revoke scoped key', async (ctx) => {
  if (!ctx.auth.master) throw v2err('PERMISSION', 'Master key required', 403);
  saveKeys(loadKeys().filter(k => k.id !== ctx.params.id));
  return { ok: true };
});
route('POST', '/api/v2/call', ['read'], 'Facade over v1 methods and core commands', async (ctx) => {
  const key = ctx.body.key;
  const params = ctx.body.params || {};
  if (api.METHODS[key]) return v1Bridge(key, params, ctx.auth.scopes);
  if (commandHandlers[key]) return cmdBridge(key, params, ctx.body.want || null);
  throw v2err('NOT_FOUND', 'Unknown method: ' + key, 404);
});

function buildOpenApi() {
  const paths = {};
  for (const r of ROUTES) {
    if (!paths[r.pattern]) paths[r.pattern] = {};
    const params = [];
    for (const seg of r.pattern.split('/').filter(Boolean)) {
      if (seg.charAt(0) === ':') params.push({ name: seg.slice(1), in: 'path', required: true, schema: { type: 'string' } });
    }
    paths[r.pattern][r.method.toLowerCase()] = {
      summary: r.desc,
      scopes: r.scopes || [],
      parameters: params,
      responses: { '200': { description: 'ok' } }
    };
  }
  return {
    openapi: '3.0.0',
    info: { title: 'Arklum API v2', version: API2_VERSION },
    components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-arkulum-key' } } },
    paths: paths
  };
}

function buildDocsHtml() {
  const rows = ROUTES.map(r => '<tr><td>' + r.method + '</td><td><code>' + r.pattern + '</code></td><td>' + (r.scopes ? r.scopes.join(', ') : 'public') + '</td><td>' + r.desc + '</td></tr>').join('');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Arklum API v2</title><style>body{font-family:monospace;background:#0b0d14;color:#dfe2ff;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #2a2d3a;padding:6px 10px;font-size:12px;text-align:left}h1{font-size:18px}</style></head><body><h1>Arklum API v2 (' + API2_VERSION + ')</h1><table><tr><th>Method</th><th>Path</th><th>Scopes</th><th>Description</th></tr>' + rows + '</table></body></html>';
}

function handleSse(req, res, u) {
  const auth = resolveAuth(req, u.searchParams.get('key'));
  if (!auth) {
    res.writeHead(401);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.write('retry: 3000\n\n');
  const last = parseInt(req.headers['last-event-id'] || '0', 10);
  const client = { res: res };
  SSE_CLIENTS.add(client);
  for (const ev of EVENT_BUFFER) {
    if (ev.id > last) writeSse(client, ev);
  }
  const hb = setInterval(() => {
    try {
      res.write(': hb\n\n');
    } catch (e) {
      clearInterval(hb);
      SSE_CLIENTS.delete(client);
    }
  }, 25000);
  req.on('close', () => {
    clearInterval(hb);
    SSE_CLIENTS.delete(client);
  });
}

function startRest2() {
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const send = (status, obj, extra) => {
      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*'
      };
      if (extra) Object.assign(headers, extra);
      res.writeHead(status, headers);
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'OPTIONS') return send(200, { ok: true });
    if (u.pathname === '/api/v2/events') return handleSse(req, res, u);
    const hit = matchRoute(req.method, u.pathname);
    if (!hit) return send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown route' } });
    const queryKey = u.searchParams.get('key');
    const auth = hit.route.scopes ? resolveAuth(req, queryKey) : null;
    if (hit.route.scopes && !auth) return send(401, { ok: false, error: { code: 'AUTH', message: 'Bad or missing API key' } });
    if (hit.route.scopes && !checkScope(auth, hit.route)) return send(403, { ok: false, error: { code: 'SCOPE', message: 'Missing scope' } });
    const rl = rateCheck(auth ? auth.id : 'anon');
    if (!rl.ok) return send(429, { ok: false, error: { code: 'RATE_LIMITED', message: 'Slow down', retry_after: rl.retryAfter } }, { 'Retry-After': String(rl.retryAfter) });
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 5e6) req.destroy();
    });
    req.on('end', async () => {
      let parsed = {};
      if (body) {
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          return send(400, { ok: false, error: { code: 'VALIDATION', message: 'Bad JSON' } });
        }
      }
      const query = {};
      for (const [k, v] of u.searchParams) query[k] = v;
      try {
        const result = await hit.route.handler({ params: hit.params, query: query, body: parsed, auth: auth });
        if (hit.route.meta && hit.route.meta.html) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(result);
          return;
        }
        send(200, { ok: true, result: result === undefined ? null : result });
      } catch (e) {
        send(e.status || 500, { ok: false, error: { code: e.code || 'CORE', message: e.message, retry_after: e.retryAfter || 0 } });
      }
    });
  }).listen(REST_PORT2, '127.0.0.1', () => {
    logger.info('[API2] REST v2 listening on 127.0.0.1:' + REST_PORT2);
  });
}

try {
  startRest2();
} catch (e) {
  logger.error('[API2] REST failed to start: ' + e.message);
}

module.exports = { API2_VERSION, API2_MAJOR, ROUTES };