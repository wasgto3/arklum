const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');
const { io, getBot, registerCommand, renderMessage, getAvatarUrl, embedToDict, classifyAttachment, logger } = require('../bot');
const SYS = path.join(__dirname, '..', '.arklum_sys');
const REG_FILE = path.join(SYS, 'dm_registry.json');
const HIST_DIR = path.join(SYS, 'dm_history');
const MAX_HIST = 300;
const SEED_CAP = 200;
const dmRegistry = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(REG_FILE, 'utf8')) || {};
  for (const [k, v] of Object.entries(raw)) {
    const uid = v && v.user_id ? String(v.user_id) : (/^\d{5,}$/.test(k) ? String(k) : null);
    if (!uid || !/^\d{5,}$/.test(uid)) continue;
    const cur = dmRegistry.get(uid);
    if (!cur || (v.last_activity || 0) > (cur.last_activity || 0)) dmRegistry.set(uid, Object.assign({}, v, { user_id: uid }));
  }
} catch (e) {}
let trackerBot = null;
let seeded = false;
function fail(socket, message) { socket.emit('error', { message }); }
function saveRegistry() { try { fs.mkdirSync(SYS, { recursive: true }); fs.writeFileSync(REG_FILE, JSON.stringify(Object.fromEntries(dmRegistry))); } catch (e) {} }
function tsOf(id) { try { return Math.floor(Number(id) / 4194304) + 1420070400000; } catch (e) { return Date.now(); } }
function histFile(uid) { return path.join(HIST_DIR, uid + '.json'); }
function loadHist(uid) { try { return JSON.parse(fs.readFileSync(histFile(uid), 'utf8')) || []; } catch (e) { return []; } }
function saveHist(uid, msgs) { try { fs.mkdirSync(HIST_DIR, { recursive: true }); fs.writeFileSync(histFile(uid), JSON.stringify(msgs.slice(-MAX_HIST))); } catch (e) {} }
function contactList(bot) {
  const out = [];
  for (const [uid, c] of dmRegistry.entries()) {
    const u = bot && bot.users.cache.get(uid);
    out.push({
      user_id: uid,
      channel_id: c.channel_id || null,
      name: (u && (u.displayName || u.username)) || c.name,
      username: (u && u.username) || c.username || c.name,
      avatar_url: (u ? getAvatarUrl(u) : c.avatar_url) || '/arklum.png',
      preview: c.preview || '',
      unread: c.unread || 0,
      last_activity: c.last_activity || 0
    });
  }
  out.sort((a, b) => (b.last_activity || 0) - (a.last_activity || 0));
  return out;
}
function ensureTracker() {
  const bot = getBot();
  if (!bot || trackerBot === bot) return;
  trackerBot = bot;
  bot.on('messageCreate', (m) => {
    try {
      if (!m.channel || m.channel.type !== ChannelType.DM || m.author.id === bot.user.id) return;
      const uid = String(m.author.id);
      const ts = m.createdTimestamp || Date.now();
      const preview = (m.content || (m.attachments && m.attachments.size ? '[attachment]' : '')).slice(0, 80);
      const c = dmRegistry.get(uid) || { user_id: uid, unread: 0, last_read: 0 };
      c.channel_id = String(m.channel.id);
      c.name = m.author.displayName || m.author.username;
      c.username = m.author.username;
      c.avatar_url = getAvatarUrl(m.author);
      c.last_activity = ts;
      c.preview = preview;
      c.unread = (c.unread || 0) + 1;
      dmRegistry.set(uid, c);
      saveRegistry();
      const hist = loadHist(uid);
      hist.push({ id: String(m.id), author_id: uid, display_name: c.name, avatar_url: c.avatar_url, content_raw: m.content || '', ts, timestamp: m.createdAt.toTimeString().slice(0, 8), attachments: m.attachments.map(a => ({ url: a.url, filename: a.filename, type: classifyAttachment(a), size: a.size })) });
      saveHist(uid, hist);
      renderMessage(m.content || '', null, bot).then((segments) => {
        io.emit('dm_incoming', {
          user_id: uid, channel_id: String(m.channel.id), preview, unread: c.unread,
          message: {
            channel_id: String(m.channel.id), author_id: uid, author: m.author.tag, display_name: c.name, avatar_url: c.avatar_url,
            content_raw: m.content || '', segments, timestamp: m.createdAt.toTimeString().slice(0, 8), id: String(m.id),
            attachments: m.attachments.map(a => ({ url: a.url, filename: a.filename, type: classifyAttachment(a), size: a.size })),
            embeds: m.embeds.map(embedToDict),
            reactions: m.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null, me: !!r.me })),
            edited: false
          }
        });
      }).catch(() => {});
    } catch (e) {}
  });
}
function ensureSeed() {
  const bot = getBot();
  if (!bot || !bot.isReady() || seeded) return;
  seeded = true;
  try {
    const seen = new Set(dmRegistry.keys());
    const ranked = [];
    for (const guild of bot.guilds.cache.values()) {
      for (const m of guild.members.cache.values()) {
        if (m.user.bot || seen.has(m.id)) continue;
        seen.add(m.id);
        const st = m.presence ? m.presence.status : 'offline';
        ranked.push({ u: m.user, w: st === 'online' ? 3 : (st === 'idle' || st === 'dnd') ? 2 : 1 });
      }
    }
    ranked.sort((a, b) => b.w - a.w);
    let added = 0;
    for (const r of ranked) {
      if (dmRegistry.size >= SEED_CAP || added >= SEED_CAP) break;
      dmRegistry.set(String(r.u.id), { user_id: String(r.u.id), name: r.u.displayName || r.u.username, username: r.u.username, avatar_url: getAvatarUrl(r.u), source: 'boot', added_at: Date.now(), unread: 0, last_read: 0, last_activity: 0, preview: '' });
      added++;
    }
    if (added) saveRegistry();
  } catch (e) { logger.error('dm seed: ' + e.message); }
}
io.on('connection', (socket) => {
  ensureTracker();
  ensureSeed();
  socket.on('open_dm', async (data) => {
    const bot = getBot();
    if (!bot || !bot.isReady() || !data || !data.user_id) return;
    try {
      const user = await bot.users.fetch(data.user_id);
      const dm = user.dmChannel || await user.createDM();
      const uid = String(user.id);
      const c = dmRegistry.get(uid) || { user_id: uid, unread: 0, last_read: 0 };
      c.channel_id = String(dm.id);
      c.name = user.displayName || user.username;
      c.username = user.username;
      c.avatar_url = getAvatarUrl(user);
      if (!c.last_activity) c.last_activity = Date.now();
      dmRegistry.set(uid, c);
      saveRegistry();
    } catch (e) {}
  });
});
registerCommand('dm_contacts')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  ensureTracker();
  ensureSeed();
  socket.emit('dm_contacts', contactList(bot));
});
registerCommand('dm_contact_remove')(async (params, { socket }) => {
  const bot = getBot();
  const uid = params && params.user_id;
  if (!uid) return;
  dmRegistry.delete(uid);
  saveRegistry();
  try { fs.unlinkSync(histFile(uid)); } catch (e) {}
  socket.emit('dm_contacts', contactList(bot));
});
registerCommand('dm_mark_read')(async (params, { socket }) => {
  const uid = params && params.user_id;
  const c = uid ? dmRegistry.get(uid) : null;
  if (c) { c.unread = 0; c.last_read = Date.now(); dmRegistry.set(uid, c); saveRegistry(); }
  socket.emit('dm_read', { user_id: uid });
});
registerCommand('dm_history_save')(async (params, { socket }) => {
  const uid = params && params.user_id;
  const msgs = (params && params.messages) || [];
  if (!uid || !msgs.length) return;
  const c = dmRegistry.get(uid);
  const hist = loadHist(uid);
  const have = new Set(hist.map(h => h.id));
  let newCount = 0;
  const lastRead = c ? (c.last_read || 0) : 0;
  for (const m of msgs) {
    if (!m || !m.id || have.has(m.id)) continue;
    const ts = m.ts || tsOf(m.id);
    hist.push({ id: m.id, author_id: m.author_id, display_name: m.display_name, avatar_url: m.avatar_url, content_raw: m.content_raw || '', ts, timestamp: m.timestamp, attachments: m.attachments || [] });
    if (ts > lastRead) newCount++;
  }
  hist.sort((a, b) => a.ts - b.ts);
  saveHist(uid, hist);
  if (c) {
    const latest = hist[hist.length - 1];
    if (latest) { c.last_activity = latest.ts; c.preview = (latest.content_raw || '[attachment]').slice(0, 80); }
    dmRegistry.set(uid, c);
    saveRegistry();
  }
  socket.emit('dm_sync', { user_id: uid, new_count: newCount });
});
