const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { Buffer } = require('buffer');
const { ChannelType } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  EndBehaviorType,
  getVoiceConnection
} = require('@discordjs/voice');
const prism = require('prism-media');
let micOwner = null;
const {
  io,
  getBot,
  registerCommand,
  rateInfo,
  validateId,
  checkRateLimit,
  validateMessageContent,
  renderMessage,
  getAvatarUrl,
  embedToDict,
  classifyAttachment,
  componentsToDict,
  logger
} = require('../bot');
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const sidChannelMap = new Map();
const inviteCache = new Map();
let micAudioSource = null;
let micRxPackets = 0;
let micRxLogTimer = null;
let typingListenerBot = null;
let presenceListenerBot = null;
let voiceBridgeBot = null;
function voiceStatesFor(bot, channelId) {
  const ch = bot.channels.cache.get(channelId);
  if (!ch || !ch.members) return [];
  return ch.members.map(m => ({
    id: String(m.id),
    name: m.displayName || m.user.username,
    avatar: getAvatarUrl(m.user),
    mute: !!(m.voice && (m.voice.mute || m.voice.selfMute)),
    deaf: !!(m.voice && (m.voice.deaf || m.voice.selfDeaf))
  }));
}
function ensureVoiceStateBridge() {
  const bot = getBot();
  if (!bot || voiceBridgeBot === bot) return;
  voiceBridgeBot = bot;
  bot.on('voiceStateUpdate', (oldS, newS) => {
    const cid = newS.channelId || oldS.channelId;
    if (!cid) return;
    io.emit('vc_states', { channel_id: String(cid), members: voiceStatesFor(bot, cid) });
    if (oldS.channelId && oldS.channelId !== cid) {
      io.emit('vc_states', { channel_id: String(oldS.channelId), members: voiceStatesFor(bot, oldS.channelId) });
    }
  });
}


function fail(socket, message, retryAfter) {
  const payload = { message: message };
  if (retryAfter) payload.retry_after = retryAfter;
  socket.emit('error', payload);
}
function limit(socket, key, max, refill) {
  const rl = rateInfo(key, max, refill);
  if (!rl.ok) {
    fail(socket, 'Rate limited. Slow down.', rl.retryAfter);
    return false;
  }
  return true;
}
function ensureTypingListener() {
  const bot = getBot();
  if (!bot || typingListenerBot === bot) return;
  typingListenerBot = bot;
  bot.on('typingStart', (typing) => {
    try {
      if (!typing.user || typing.user.id === bot.user.id) return;
      const channelId = typing.channel ? String(typing.channel.id) : null;
      if (!channelId) return;
      const name = (typing.member && typing.member.displayName) || typing.user.displayName || typing.user.username || 'Someone';
      io.emit('typing_indicator', { user_name: name, channel_id: channelId });
    } catch (e) {}
  });
}
function ensurePresenceListener() {
  const bot = getBot();
  if (!bot || presenceListenerBot === bot) return;
  presenceListenerBot = bot;
  bot.on('presenceUpdate', (oldP, newP) => {
    try {
      io.emit('presence_update', { user_id: String(newP.user.id), status: newP.status });
    } catch (e) {}
  });
}

let threadBridgeBot = null;
function ensureThreadBridge() {
  const bot = getBot();
  if (!bot || threadBridgeBot === bot) return;
  threadBridgeBot = bot;
  bot.on('messageCreate', async (m) => {
    try {
      if (!m.channel || !m.channel.isThread || !m.channel.isThread()) return;
      const rendered = await renderMessage(m.content, m.guild, bot);
      io.emit('thread_message', {
        channel_id: String(m.channel.id),
        author_id: String(m.author.id),
        author: m.author.tag,
        display_name: m.member ? m.member.displayName : m.author.displayName,
        avatar_url: getAvatarUrl(m.author),
        content_raw: m.content,
        segments: rendered,
        timestamp: m.createdAt.toTimeString().slice(0, 8),
        id: String(m.id),
        attachments: m.attachments.map(att => ({ url: att.url, filename: att.filename, type: classifyAttachment(att), size: att.size })),
        embeds: m.embeds.map(embedToDict),
        reactions: m.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null, me: !!r.me })),
        edited: false
      });
    } catch (e) {}
  });
}

class MicAudioStream extends Readable {
  constructor() {
    super({ highWaterMark: 3840 });
    this.buffer = Buffer.alloc(0);
    this.FRAME = 3840;
    this.PRIME = 3840 * 5;
    this.MAX = 3840 * 30;
    this.TARGET = 3840 * 12;
    this.primed = false;
  }
  _read() {
    const F = this.FRAME;
    if (!this.primed && this.buffer.length >= this.PRIME) this.primed = true;
    if (this.primed && this.buffer.length >= F) {
      const chunk = Buffer.from(this.buffer.subarray(0, F));
      this.buffer = this.buffer.subarray(F);
      this.push(chunk);
      return;
    }
    if (this.buffer.length === 0) this.primed = false;
    this.push(Buffer.alloc(F));
  }
  pushData(pcmBytes) {
    const samples = pcmBytes.length >> 1;
    const stereo = Buffer.alloc(samples * 4);
    for (let i = 0; i < samples; i++) {
      const s = pcmBytes.readInt16LE(i * 2);
      stereo.writeInt16LE(s, i * 4);
      stereo.writeInt16LE(s, i * 4 + 2);
    }
    this.buffer = Buffer.concat([this.buffer, stereo]);
    if (this.buffer.length > this.MAX) this.buffer = this.buffer.subarray(this.buffer.length - this.TARGET);
  }
}
function toBuf(d) {
  if (Buffer.isBuffer(d)) return d;
  if (d instanceof ArrayBuffer) return Buffer.from(d);
  if (ArrayBuffer.isView(d)) return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
  if (d && d.type === 'Buffer' && Array.isArray(d.data)) return Buffer.from(d.data);
  return null;
}

function onMicAudio(socket, data) {
  if (!micAudioSource) return;
  if (micOwner && socket.id !== micOwner) return;
  const buffer = toBuf(data);
  if (!buffer || buffer.length < 2) return;
  micAudioSource.pushData(buffer);
}
async function getOrCreateDM(user) {
  if (user.dmChannel) return user.dmChannel;
  return await user.createDM();
}
function fetchWithTimeout(url, timeoutMs) {
  const ms = timeoutMs || 10000;
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    fetch(url, { signal: controller.signal })
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

io.on('connection', (socket) => {
  ensurePresenceListener();
  ensureThreadBridge();
  ensureVoiceStateBridge();
  socket.on('fetch_chat', (data) => onFetchChat(socket, data));
  socket.on('send_chat_message', (data) => onSendChatMessage(socket, data));
  socket.on('send_dm_message', (data) => onSendDmMessage(socket, data));
  socket.on('open_dm', (data) => onOpenDm(socket, data));
  socket.on('fetch_dm_messages', (data) => onFetchDmMessages(socket, data));
  socket.on('join_vc', (data) => onJoinVc(socket, data));
  socket.on('leave_vc', () => onLeaveVc(socket));
  socket.on('edit_message', (data) => onEditMessage(socket, data));
  socket.on('delete_message', (data) => onDeleteMessage(socket, data));
  socket.on('pin_message', (data) => onPinMessage(socket, data));
  socket.on('mic_audio', (data) => onMicAudio(socket, data));
  socket.on('typing_start', (data) => onTypingStart(socket, data));
  socket.on('resolve_invite', (data) => onResolveInvite(socket, data));
  socket.on('upload_file', (data) => onUploadFile(socket, data));
  socket.on('transcode_audio', (data) => onTranscodeAudio(socket, data));
  socket.on('disconnect', () => { sidChannelMap.delete(socket.id); });
  socket.on('vc_mute', async (data) => { const bot = getBot(); if (!bot || !bot.isReady()) return; for (const guild of bot.guilds.cache.values()) { const conn = getVoiceConnection(guild.id); if (conn) { try { await guild.members.me.voice.setMute(!!data.muted); } catch (e) { logger.error('vc_mute: ' + e.message); } break; } } });
});

async function fetchMessagesChunked(channel, requested, beforeId) {
  let collected = [];
  let before = beforeId || null;
  while (collected.length < requested) {
    const chunkSize = Math.min(100, requested - collected.length);
    const options = { limit: chunkSize };
    if (before) options.before = before;
    const fetched = await channel.messages.fetch(options);
    const arr = Array.from(fetched.values());
    if (!arr.length) break;
    collected = collected.concat(arr);
    if (arr.length < chunkSize) break;
    before = arr[arr.length - 1].id;
  }
  return collected;
}

async function onFetchChat(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { socket.emit('error', { message: 'Bot not connected' }); return; }
  if (!checkRateLimit(`fetch_chat:${socket.id}`, 12, 10)) { socket.emit('chat_messages', { channel_id: data.channel_id, messages: [] }); return; }
  const channelId = data.channel_id;
  const beforeId = data.before_id;
  const limitCount = Math.min(data.limit || 100, 500);
  if (!validateId(channelId)) return;
  const channel = bot.channels.cache.get(channelId) || await bot.channels.fetch(channelId).catch(() => null);
  if (!channel) { socket.emit('chat_messages', { channel_id: channelId, messages: [] }); return; }
  try {
    const collected = await fetchMessagesChunked(channel, limitCount, (beforeId && validateId(beforeId)) ? beforeId : null);
    const msgs = [];
    for (const msg of collected) {
      const rendered = await renderMessage(msg.content, msg.guild, bot);
      const attachments = msg.attachments.map(att => ({ url: att.url, filename: att.filename, type: classifyAttachment(att), size: att.size }));
      const reactions = msg.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null, me: !!r.me }));
      const stickers = (msg.stickers || []).map(sticker => {
        const url = sticker.url || null;
        if (url) return { url, filename: sticker.name };
        return null;
      }).filter(Boolean);
      const replyTo = msg.reference && msg.reference.messageId ? String(msg.reference.messageId) : null;
      msgs.push({
        author_id: String(msg.author.id),
        author: msg.author.tag,
        display_name: msg.member ? msg.member.displayName : msg.author.displayName,
        avatar_url: getAvatarUrl(msg.author),
        content_raw: msg.content,
        segments: rendered,
        timestamp: msg.createdAt.toTimeString().slice(0, 8),
        id: String(msg.id),
        attachments,
        embeds: msg.embeds.map(embedToDict),
        stickers,
        components: componentsToDict(msg),
        reactions,
        reply_to: replyTo,
        edited: msg.editedAt !== null
      });
    }
    msgs.sort((a, b) => a.id.localeCompare(b.id));
    socket.emit('chat_messages', { channel_id: channelId, messages: msgs });
  } catch (e) {
    logger.error(`Fetch chat error: ${e.message}`);
    socket.emit('error', { message: 'Failed to fetch messages' });
  }
}

async function onSendChatMessage(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = data.channel_id;
  const content = data.content || '';
  const replyTo = data.reply_to;
  const attachments = data.attachments || [];
  if (!validateId(channelId) || !(validateMessageContent(content) || attachments.length > 0)) { fail(socket, 'Invalid channel or content'); return; }
  if (!limit(socket, `send:${socket.id}`, 5, 5)) return;
  const channel = bot.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const messagePayload = {};
    if (content) messagePayload.content = content;
    if (data.tts) messagePayload.tts = true;
    if (attachments.length > 0) {
      messagePayload.files = attachments.map(att => ({
        attachment: Buffer.from(att.data, 'base64'),
        name: att.filename
      }));
    }
    if (replyTo && validateId(replyTo)) {
      try {
        const referenced = await channel.messages.fetch(replyTo);
        messagePayload.reply = { messageReference: referenced };
      } catch (e) {}
    }
    const sent = await channel.send(messagePayload);
    const rendered = await renderMessage(sent.content, sent.guild, bot);
    const reactions = sent.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null, me: !!r.me }));
    io.emit('new_chat_message', {
      channel_id: String(sent.channel.id),
      author_id: String(sent.author.id),
      author: sent.author.tag,
      display_name: sent.member ? sent.member.displayName : sent.author.displayName,
      avatar_url: getAvatarUrl(sent.author),
      content_raw: sent.content,
      segments: rendered,
      timestamp: sent.createdAt.toTimeString().slice(0, 8),
      id: String(sent.id),
      attachments: sent.attachments.map(att => ({ url: att.url, filename: att.filename, type: classifyAttachment(att), size: att.size })),
      embeds: sent.embeds.map(embedToDict),
      stickers: (sent.stickers || []).map(s => s.url ? { url: s.url, filename: s.name } : null).filter(Boolean),
      reactions,
      reply_to: sent.reference && sent.reference.messageId ? String(sent.reference.messageId) : null,
      edited: false
    });
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to send messages');
    else { logger.error(`Failed to send message: ${e.message}`); fail(socket, 'Failed to send message'); }
  }
}

async function onSendDmMessage(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = data.channel_id;
  const content = data.content || '';
  const replyTo = data.reply_to;
  const attachments = data.attachments || [];
  if (!validateId(channelId) || !(validateMessageContent(content) || attachments.length > 0)) { fail(socket, 'Invalid channel or content'); return; }
  if (!limit(socket, `send:${socket.id}`, 5, 5)) return;
  const channel = bot.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const messagePayload = {};
    if (content) messagePayload.content = content;
    if (data.tts) messagePayload.tts = true;
    if (attachments.length > 0) {
      messagePayload.files = attachments.map(att => ({
        attachment: Buffer.from(att.data, 'base64'),
        name: att.filename
      }));
    }
    if (replyTo && validateId(replyTo)) {
      try {
        const referenced = await channel.messages.fetch(replyTo);
        messagePayload.reply = { messageReference: referenced };
      } catch (e) {}
    }
    const sent = await channel.send(messagePayload);
    const rendered = await renderMessage(sent.content, null, bot);
    const reactions = sent.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null, me: !!r.me }));
    io.emit('new_dm_message', {
      channel_id: String(sent.channel.id),
      author_id: String(sent.author.id),
      author: sent.author.tag,
      display_name: sent.author.displayName,
      avatar_url: getAvatarUrl(sent.author),
      content_raw: sent.content,
      segments: rendered,
      timestamp: sent.createdAt.toTimeString().slice(0, 8),
      id: String(sent.id),
      attachments: sent.attachments.map(att => ({ url: att.url, filename: att.filename, type: classifyAttachment(att), size: att.size })),
      embeds: sent.embeds.map(embedToDict),
      stickers: (sent.stickers || []).map(s => s.url ? { url: s.url, filename: s.name } : null).filter(Boolean),
      reactions
    });
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to send messages');
    else { logger.error(`Failed to send DM: ${e.message}`); fail(socket, 'Failed to send message'); }
  }
}

async function onOpenDm(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const userId = data.user_id;
  if (!validateId(userId)) return;
  try {
    const user = await bot.users.fetch(userId);
    const dm = await getOrCreateDM(user);
    socket.emit('dm_opened', {
      channel_id: String(dm.id),
      user_id: String(user.id),
      display_name: user.displayName,
      username: user.username,
      avatar_url: getAvatarUrl(user)
    });
  } catch (e) {
    logger.error(`Failed to open DM: ${e.message}`);
    fail(socket, 'Failed to open DM');
  }
}

async function onFetchDmMessages(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  if (!limit(socket, `fetch_dm:${socket.id}`, 3, 10)) return;
  const channelId = data.channel_id;
  const beforeId = data.before_id;
  const limitCount = Math.min(data.limit || 50, 100);
  if (!validateId(channelId)) return;
  const channel = bot.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const options = { limit: limitCount };
    if (beforeId && validateId(beforeId)) options.before = beforeId;
    const fetched = await channel.messages.fetch(options);
    const msgs = [];
    for (const msg of fetched.values()) {
      const rendered = await renderMessage(msg.content, null, bot);
      const attachments = msg.attachments.map(att => ({ url: att.url, filename: att.filename, type: classifyAttachment(att), size: att.size }));
      const reactions = msg.reactions.cache.map(r => ({ emoji_name: String(r.emoji), count: r.count, emoji_id: r.emoji.id ? String(r.emoji.id) : null, me: !!r.me }));
      const stickers = (msg.stickers || []).map(sticker => {
        const url = sticker.url || null;
        if (url) return { url, filename: sticker.name };
        return null;
      }).filter(Boolean);
      msgs.push({
        author_id: String(msg.author.id),
        author: msg.author.tag,
        display_name: msg.author.displayName,
        avatar_url: getAvatarUrl(msg.author),
        content_raw: msg.content,
        segments: rendered,
        timestamp: msg.createdAt.toTimeString().slice(0, 8),
        id: String(msg.id),
        attachments,
        embeds: msg.embeds.map(embedToDict),
        stickers,
        components: componentsToDict(msg),
        reactions
      });
    }
    msgs.sort((a, b) => a.id.localeCompare(b.id));
    socket.emit('dm_messages', { channel_id: channelId, messages: msgs });
  } catch (e) {
    logger.error(`Fetch DM error: ${e.message}`);
    fail(socket, 'Failed to fetch messages');
  }
}

async function onJoinVc(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = data.channel_id;
  if (!validateId(channelId)) return;
  for (const guild of bot.guilds.cache.values()) {
    const existing = getVoiceConnection(guild.id);
    if (existing) existing.destroy();
  }
  const channel = bot.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  const perms = channel.permissionsFor(bot.user);
  if (!perms || !perms.has('Connect')) { fail(socket, 'Bot lacks Connect permission in ' + channel.name); return; }
  if (!perms.has('Speak')) { fail(socket, 'Bot lacks Speak permission in ' + channel.name + ' — it joins but sends silence. Grant Speak to fix mic.'); return; }
  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
      debug: false
    });
    const player = createAudioPlayer({ debug: false });
    const stream = new MicAudioStream();
    micAudioSource = stream;
    const resource = createAudioResource(stream, { inputType: StreamType.Raw });
    connection.on('stateChange', (o, n) => {
      socket.emit('vc_state', { state: String(n.status) });
      if (n.status === 'ready' && player.state.status !== 'playing') {
        try { player.play(resource); } catch (e) { logger.error('VC play error: ' + e.message); }
      }
    });
    connection.on('error', (e) => {
      logger.error('VC conn error: ' + e.message);
      socket.emit('vc_state', { state: 'error', message: e.message });
    });
    player.on('error', (e) => {
      logger.error('VC player error: ' + (e && e.message ? e.message : e));
      socket.emit('vc_state', { state: 'error', message: 'player: ' + (e && e.message ? e.message : e) });
    });
    connection.subscribe(player);
    if (connection.state.status === 'ready') player.play(resource);
    try {
      const receiver = connection.receiver;
      const pipes = new Map();
      const closeAll = () => { for (const p of pipes.values()) { try { p.opus.destroy(); } catch (e) {} try { p.dec.destroy(); } catch (e) {} } pipes.clear(); };
      socket.once('disconnect', closeAll);
      connection.once('stateChange', function onS(o, n) { if (n.status === 'destroyed') closeAll(); });
      receiver.speaking.on('start', (userId) => {
        io.emit('vc_speaking', { user_id: String(userId), speaking: true });
        if (String(userId) === String(bot.user.id) || pipes.has(userId)) return;
        try {
          const opus = receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 400 } });
          const dec = new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 });
          pipes.set(userId, { opus, dec });
          const cleanup = () => { pipes.delete(userId); try { opus.destroy(); } catch (e) {} try { dec.destroy(); } catch (e) {} };
          dec.on('data', (pcm) => socket.emit('vc_audio', { user_id: String(userId), data: Buffer.from(pcm) }));
          opus.once('end', cleanup);
          opus.once('error', cleanup);
          dec.once('error', (e) => { logger.error('VC decode: ' + e.message); cleanup(); });
          opus.pipe(dec);
        } catch (e) { logger.error('VC subscribe error: ' + e.message); }
      });
      receiver.speaking.on('end', (userId) => io.emit('vc_speaking', { user_id: String(userId), speaking: false }));
    } catch (e) { logger.error('VC receiver: ' + e.message); }
    socket.emit('vc_states', { channel_id: channelId, members: voiceStatesFor(bot, channelId) });
    socket.emit('vc_joined', { channel_id: channelId, channel_name: channel.name, guild_id: channel.guild.id });
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to join voice channel');
    else { logger.error(`Failed to join VC: ${e.message}`); fail(socket, 'VC join failed: ' + (e.message || 'unknown')); }
  }
}

function onLeaveVc(socket) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  for (const guild of bot.guilds.cache.values()) {
    const connection = getVoiceConnection(guild.id);
    if (connection) connection.destroy();
  }
  micAudioSource = null;
  micOwner = null;
  if (micRxLogTimer) { clearInterval(micRxLogTimer); micRxLogTimer = null; }
  micRxPackets = 0;
  socket.emit('vc_left', {});
}

async function onEditMessage(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = data.channel_id;
  const messageId = data.message_id;
  const newContent = data.content || '';
  if (!validateId(channelId) || !validateId(messageId) || !validateMessageContent(newContent)) { fail(socket, 'Invalid data'); return; }
  if (!limit(socket, `edit:${socket.id}`, 3, 10)) return;
  const channel = bot.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(messageId);
    if (msg.author.id === bot.user.id) {
      await msg.edit({ content: newContent });
      socket.emit('message_edited', { channel_id: channelId, message_id: messageId, new_content: newContent });
    } else {
      fail(socket, 'Can only edit own messages');
    }
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to edit message');
    else { logger.error(`Failed to edit message: ${e.message}`); fail(socket, 'Failed to edit message'); }
  }
}

async function onDeleteMessage(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = data.channel_id;
  const messageId = data.message_id;
  if (!validateId(channelId) || !validateId(messageId)) { fail(socket, 'Invalid data'); return; }
  if (!limit(socket, `delete:${socket.id}`, 3, 10)) return;
  const channel = bot.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(messageId);
    if (msg.author.id === bot.user.id) {
      await msg.delete();
      socket.emit('message_deleted', { channel_id: channelId, message_id: messageId });
    } else {
      fail(socket, 'Can only delete own messages');
    }
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to delete message');
    else { logger.error(`Failed to delete message: ${e.message}`); fail(socket, 'Failed to delete message'); }
  }
}

async function onPinMessage(socket, data) {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = data.channel_id;
  const messageId = data.message_id;
  if (!validateId(channelId) || !validateId(messageId)) return;
  const channel = bot.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(messageId);
    await msg.pin();
    socket.emit('notification', 'Message pinned');
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to pin messages');
    else { logger.error(`Failed to pin message: ${e.message}`); fail(socket, 'Failed to pin message'); }
  }
}


function onTypingStart(socket, data) {
  ensureTypingListener();
  const channelId = data.channel_id || sidChannelMap.get(socket.id);
  const userName = data.user_name || 'Someone';
  if (!channelId) return;
  for (const [otherSid, otherCh] of sidChannelMap.entries()) {
    if (otherCh === channelId && otherSid !== socket.id) {
      io.to(otherSid).emit('typing_indicator', { user_name: userName, channel_id: channelId });
    }
  }
  const bot = getBot();
  if (bot && bot.isReady()) {
    const channel = bot.channels.cache.get(channelId);
    if (channel && channel.isTextBased && channel.isTextBased()) {
      channel.sendTyping().catch(() => {});
    }
  }
}

async function onResolveInvite(socket, data) {
  const code = (data.code || '').trim();
  if (!code) return;
  const now = Date.now();
  if (inviteCache.has(code)) {
    const cached = inviteCache.get(code);
    if (now - cached.time < 300000) { socket.emit('invite_resolved', cached.data); return; }
  }
  const bot = getBot();
  if (!bot || !bot.isReady()) { socket.emit('invite_resolved', { code: code, error: 'Bot not connected' }); return; }
  try {
    const invite = await bot.fetchInvite(code);
    const guild = invite.guild;
    const dataObj = {
      code: code,
      server_name: guild ? guild.name : 'Unknown Server',
      icon_url: guild && guild.icon ? guild.iconURL({ format: 'png', size: 128 }) : null,
      member_count: invite.approximateMemberCount || 0,
      presence_count: invite.approximatePresenceCount || 0
    };
    inviteCache.set(code, { data: dataObj, time: now });
    socket.emit('invite_resolved', dataObj);
  } catch (e) {
    const dataObj = { code: code, error: e.message };
    inviteCache.set(code, { data: dataObj, time: now });
    socket.emit('invite_resolved', dataObj);
  }
}

async function onTranscodeAudio(socket, data) {
  try {
    const raw = Buffer.from(data.data || '', 'base64');
    if (!raw.length) { socket.emit('audio_transcoded', { ok: false }); return; }
    const tmp = os.tmpdir();
    const inP = path.join(tmp, `ark_vm_${Date.now()}.webm`);
    const outP = path.join(tmp, `ark_vm_${Date.now()}.mp3`);
    fs.writeFileSync(inP, raw);
    await new Promise((res, rej) => {
      const ff = spawn('ffmpeg', ['-y', '-i', inP, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outP], { stdio: 'ignore' });
      const t = setTimeout(() => { ff.kill('SIGKILL'); rej(new Error('timeout')); }, 30000);
      ff.on('close', (c) => { clearTimeout(t); c === 0 ? res() : rej(new Error('ff ' + c)); });
      ff.on('error', (e) => { clearTimeout(t); rej(e); });
    });
    const mp3 = fs.readFileSync(outP);
    socket.emit('audio_transcoded', { ok: true, data: mp3.toString('base64'), filename: String(data.filename || 'voicemail').replace(/\.\w+$/, '') + '.mp3' });
    try { fs.unlinkSync(inP); } catch (e) {}
    try { fs.unlinkSync(outP); } catch (e) {}
  } catch (e) {
    logger.error('transcode_audio: ' + e.message);
    socket.emit('audio_transcoded', { ok: false });
  }
}

async function onUploadFile(socket, data) {
  const fileName = data.filename || 'file';
  const fileDataB64 = data.data || '';
  if (!fileDataB64) { fail(socket, 'No file data'); return; }
  let raw;
  try {
    raw = Buffer.from(fileDataB64, 'base64');
  } catch (e) {
    fail(socket, 'Invalid file data');
    return;
  }
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `arklum_upload_${Date.now()}_${fileName}`);
  const outputPath = path.join(tmpDir, `arklum_compressed_${Date.now()}_${fileName}`);
  fs.writeFileSync(inputPath, raw);
  const ffmpegArgs = [
    '-y', '-i', inputPath,
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease',
    '-c:v', 'libx264', '-crf', '28',
    '-c:a', 'aac', '-b:a', '64k',
    '-movflags', '+faststart',
    '-fs', String(MAX_FILE_SIZE),
    outputPath
  ];
  const runFfmpeg = () => new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'ignore' });
    const timer = setTimeout(() => { ffmpeg.kill('SIGKILL'); resolve(false); }, 30000);
    ffmpeg.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    ffmpeg.on('error', () => { clearTimeout(timer); resolve(false); });
  });
  let compressed = null;
  try {
    const success = await runFfmpeg();
    if (success && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      compressed = fs.readFileSync(outputPath);
    }
  } catch (e) {}
  try {
    if (compressed) socket.emit('file_compressed', { filename: fileName, data: compressed.toString('base64') });
    else socket.emit('file_compressed', { filename: fileName, data: raw.toString('base64') });
  } finally {
    try { fs.unlinkSync(inputPath); } catch (e) {}
    try { fs.unlinkSync(outputPath); } catch (e) {}
  }
}

registerCommand('fetch_file_content')(async (params, { socket }) => {
  const url = params.url;
  if (!url) { fail(socket, 'No URL provided'); return; }
  if (!url.startsWith('https://cdn.discordapp.com/') && !url.startsWith('https://media.discordapp.net/')) { fail(socket, 'Invalid URL'); return; }
  try {
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) { fail(socket, `Failed to fetch file: ${res.status}`); return; }
    let text = await res.text();
    if (text.length > 500000) text = text.slice(0, 500000) + '\n... (truncated)';
    socket.emit('file_content', { url: url, content: text });
  } catch (e) {
    logger.error(`Fetch file content error: ${e.message}`);
    fail(socket, 'Failed to fetch file content');
  }
});

registerCommand('react_message')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = params.channel_id;
  const messageId = params.message_id;
  const emoji = params.emoji;
  if (!validateId(channelId) || !validateId(messageId) || !emoji) { fail(socket, 'Missing channel/message/emoji'); return; }
  const channel = bot.channels.cache.get(channelId);
  if (!channel) { fail(socket, 'Channel not found'); return; }
  try {
    const msg = await channel.messages.fetch(messageId);
    await msg.react(emoji);
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to add reactions');
    else if (e.code === 10008) fail(socket, 'Message not found');
    else { logger.error(`React error: ${e.message}`); fail(socket, 'Failed to react'); }
  }
});

registerCommand('reactions_list')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  if (!checkRateLimit('reactions_list:' + socket.id, 5, 10)) { fail(socket, 'Slow down'); return; }
  if (!validateId(params.channel_id) || !validateId(params.message_id)) return;
  const channel = bot.channels.cache.get(params.channel_id);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(params.message_id);
    const reaction = msg.reactions.cache.find(r => String(r.emoji) === params.emoji_name);
    if (!reaction) { socket.emit('reactions_list', { channel_id: params.channel_id, message_id: params.message_id, emoji_name: params.emoji_name, users: [] }); return; }
    const users = await reaction.users.fetch({ limit: 100 });
    socket.emit('reactions_list', {
      channel_id: params.channel_id,
      message_id: params.message_id,
      emoji_name: params.emoji_name,
      users: users.map(u => ({ id: String(u.id), name: u.username, display_name: u.displayName || u.username, avatar_url: getAvatarUrl(u), me: u.id === bot.user.id }))
    });
  } catch (e) { logger.error('Reactions list error: ' + e.message); fail(socket, 'Failed to list reactions'); }
});

registerCommand('reaction_remove')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  if (!checkRateLimit('reaction_remove:' + socket.id, 5, 10)) { fail(socket, 'Slow down'); return; }
  if (!validateId(params.channel_id) || !validateId(params.message_id) || !params.user_id) return;
  const channel = bot.channels.cache.get(params.channel_id);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(params.message_id);
    const reaction = msg.reactions.cache.find(r => String(r.emoji) === params.emoji_name);
    if (!reaction) { fail(socket, 'Reaction not found'); return; }
    if (params.user_id !== bot.user.id) {
      const perms = msg.guild ? msg.channel.permissionsFor(msg.guild.members.me) : null;
      if (!perms || !perms.has('ManageMessages')) { fail(socket, 'Missing Manage Messages permission'); return; }
    }
    await reaction.users.remove(params.user_id);
    socket.emit('reaction_removed', { channel_id: params.channel_id, message_id: params.message_id, emoji_name: params.emoji_name, user_id: params.user_id });
  } catch (e) { logger.error('Reaction remove error: ' + e.message); fail(socket, 'Failed to remove reaction'); }
});

const BADGE_LABELS = {
  Staff: 'Discord Staff',
  Partner: 'Partnered Server Owner',
  Hypesquad: 'HypeSquad Events',
  HypeSquadBravery: 'HypeSquad Bravery',
  HypeSquadBrilliance: 'HypeSquad Brilliance',
  HypeSquadBalance: 'HypeSquad Balance',
  BugHunterLevel1: 'Bug Hunter Level 1',
  BugHunterLevel2: 'Bug Hunter Level 2',
  EarlySupporter: 'Early Supporter',
  VerifiedBot: 'Verified Bot',
  VerifiedDeveloper: 'Early Verified Bot Dev',
  CertifiedModerator: 'Moderator Alumni',
  ActiveDeveloper: 'Active Developer',
  BotHTTPInteractions: 'HTTP Bot'
};

registerCommand('fetch_user_profile_full')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  if (!checkRateLimit('profile:' + socket.id, 6, 10)) { fail(socket, 'Slow down'); return; }
  const userId = params.user_id;
  if (!validateId(userId)) return;
  try {
    const user = await bot.users.fetch(userId);
    const flags = user.flags ? user.flags.toArray() : [];
    const badges = flags.map(f => BADGE_LABELS[f] || f);
    const premium = !!(user.avatar && user.avatar.startsWith('a_')) || !!user.avatarDecoration || !!(user.banner && user.banner.startsWith('a_'));
    if (premium) badges.unshift('Nitro');
    const global = {
      id: String(user.id),
      username: user.username,
      global_name: user.globalName || user.username,
      avatar_url: user.displayAvatarURL({ format: 'png', size: 128 }),
      avatar_animated: !!(user.avatar && user.avatar.startsWith('a_')),
      avatar_decoration_url: user.avatarDecoration ? user.avatarDecorationURL({ format: 'png', size: 128 }) : null,
      banner_url: user.banner ? user.bannerURL({ format: 'png', size: 512 }) : null,
      accent_color: user.accentColor || null,
      bio: user.bio || '',
      badges,
      premium,
      bot: !!user.bot,
      system: !!user.system,
      created_at: new Date(user.createdTimestamp).toISOString()
    };
    let member = null;
    const guild = params.guild_id ? bot.guilds.cache.get(params.guild_id) : null;
    if (guild) {
      const m = await guild.members.fetch(userId).catch(() => null);
      if (m) {
        member = {
          nickname: m.nickname,
          display_name: m.displayName,
          display_color: m.displayColor || 0,
          avatar_url: m.avatar ? m.avatarURL({ format: 'png', size: 128 }) : null,
          banner_url: m.banner ? m.bannerURL({ format: 'png', size: 512 }) : null,
          joined_at: m.joinedTimestamp ? new Date(m.joinedTimestamp).toISOString() : null,
          boost_since: m.premiumSinceTimestamp ? new Date(m.premiumSinceTimestamp).toISOString() : null,
          timeout_until: m.communicationDisabledUntilTimestamp ? new Date(m.communicationDisabledUntilTimestamp).toISOString() : null,
          pending: !!m.pending,
          roles: m.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => ({ id: String(r.id), name: r.name, color: r.color }))
        };
      }
    }
    let mutual = 0;
    for (const g of bot.guilds.cache.values()) if (g.members.cache.has(userId)) mutual++;
    socket.emit('user_profile_full', { global, member, mutual_count: mutual });
  } catch (e) {
    logger.error('Profile fetch error: ' + e.message);
    fail(socket, 'Failed to fetch profile');
  }
});
registerCommand('dm_list')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  ensureDmTracker();
  const out = [];
  const seen = new Set();
  for (const [cid, entry] of dmRegistry.entries()) {
    seen.add(cid);
    const ch = bot.channels.cache.get(cid);
    const rec = (ch && ch.recipient) || bot.users.cache.get(entry.user_id) || null;
    out.push({ channel_id: cid, user_id: entry.user_id, name: (rec && (rec.displayName || rec.username)) || entry.name, username: (rec && rec.username) || entry.username || entry.name, avatar_url: (rec ? getAvatarUrl(rec) : entry.avatar_url) || '/arklum.png', preview: entry.preview || '', unread: entry.unread || 0, last_activity: entry.last_activity || 0 });
  }
  for (const [cid, ch] of bot.channels.cache) {
    if (ch.type !== ChannelType.DM || seen.has(cid)) continue;
    const rec = ch.recipient || bot.users.cache.get(ch.recipientId);
    if (!rec) continue;
    const entry = { channel_id: cid, user_id: String(rec.id), name: rec.displayName || rec.username, username: rec.username, avatar_url: getAvatarUrl(rec), last: Date.now() };
    dmRegistry.set(cid, entry);
    out.push({ channel_id: cid, user_id: entry.user_id, name: entry.name, username: entry.username, avatar_url: entry.avatar_url, preview: '', unread: 0, last_activity: 0 });
  }
  out.sort((a, b) => (b.last_activity || 0) - (a.last_activity || 0));
  socket.emit('dm_list', out);
});
registerCommand('dm_contacts')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  ensureDmTracker();
  socket.emit('dm_contacts', []);
});
registerCommand('dm_mark_read')(async (params, { socket }) => {
  const c = params && params.user_id ? dmRegistry.get(params.user_id) : null;
  if (c) { c.unread = 0; c.last_read = Date.now(); dmRegistry.set(params.user_id, c); saveDmRegistry(); }
  socket.emit('dm_read', { user_id: params && params.user_id });
});
registerCommand('dm_history_save')(async (params, { socket }) => {
  socket.emit('dm_sync', { user_id: params && params.user_id, new_count: 0 });
});
registerCommand('dm_contact_remove')(async (params, { socket }) => {
  const uid = params && params.user_id;
  if (!uid) return;
  for (const [cid, c] of dmRegistry.entries()) if (c.user_id === uid) dmRegistry.delete(cid);
  saveDmRegistry();
  socket.emit('dm_contacts', []);
});
registerCommand('global_expression_list')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { socket.emit('global_expression_data', { emojis: [] }); return; }
  const out = [];
  const seen = new Set();
  for (const e of bot.emojis.cache.values()) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: String(e.id), name: e.name, animated: !!e.animated, url: e.url || ('https://cdn.discordapp.com/emojis/' + e.id + (e.animated ? '.gif' : '.png')) });
  }
  socket.emit('global_expression_data', { emojis: out });
});
registerCommand('global_expression_list')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { socket.emit('global_expression_data', { emojis: [] }); return; }
  const out = [];
  const seen = new Set();
  for (const e of bot.emojis.cache.values()) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: String(e.id), name: e.name, animated: !!e.animated, url: e.url || ('https://cdn.discordapp.com/emojis/' + e.id + (e.animated ? '.gif' : '.png')) });
  }
  socket.emit('global_expression_data', { emojis: out });
});
registerCommand('thread_list')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const guild = bot.guilds.cache.get(params.guild_id);
  if (!guild) { socket.emit('thread_list', { guild_id: params.guild_id, threads: [] }); return; }
  let coll = null;
  try { coll = await guild.channels.fetchActiveThreads(); } catch (e) {}
  const src = (coll && coll.size) ? coll : guild.channels.cache.filter(c => c.isThread && c.isThread());
  const out = [];
  for (const [id, ch] of src) {
    out.push({
      id: String(id),
      name: ch.name,
      parent_id: String(ch.parentId || ''),
      owner_id: ch.ownerId ? String(ch.ownerId) : null,
      message_count: ch.messageCount || 0,
      member_count: ch.memberCount || 0,
      archived: !!ch.archived,
      locked: !!ch.locked
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  socket.emit('thread_list', { guild_id: params.guild_id, threads: out });
});
registerCommand('thread_create')(async (params, { socket }) => {
  const bot = getBot();
  if (!bot || !bot.isReady()) { fail(socket, 'Bot not connected'); return; }
  const channelId = params.channel_id;
  const messageId = params.message_id;
  const name = String(params.name || 'Thread').slice(0, 100);
  const channel = bot.channels.cache.get(channelId);
  if (!channel) { fail(socket, 'Channel not found'); return; }
  try {
    let thread;
    if (messageId) {
      const msg = await channel.messages.fetch(messageId);
      thread = await msg.startThread({ name, autoArchiveDuration: 60, reason: 'Arklum thread' });
    } else {
      thread = await channel.threads.create({ name, autoArchiveDuration: 60, reason: 'Arklum thread' });
    }
    socket.emit('thread_created', { id: String(thread.id), name: thread.name, parent_id: String(thread.parentId || channelId) });
  } catch (e) {
    if (e.code === 50013) fail(socket, 'Missing permission to create threads');
    else { logger.error('Thread create error: ' + e.message); fail(socket, 'Failed to create thread'); }
  }
});

(function () {
  const zlib = require('zlib');
  const crypto = require('crypto');
  const ZIP_CACHE = path.join(__dirname, '..', '.arklum_sys', 'cache');
  try { fs.mkdirSync(ZIP_CACHE, { recursive: true }); } catch (e) {}
  const zipMemo = new Map();

  async function zipDownload(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('http ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  function zipParse(buf) {
    const out = [];
    let eocd = -1;
    const min = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= min; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return out;
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < count && p + 46 <= buf.length; i++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const extAttr = buf.readUInt32LE(p + 38);
      const local = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      const dir = name.endsWith('/') || (extAttr & 0x10) !== 0;
      out.push({ name, dir, size, method, compSize, local });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }
  function zipTree(entries) {
    const root = [];
    const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const e of sorted) {
      const parts = e.name.replace(/\/+$/, '').split('/').filter(Boolean);
      if (!parts.length) continue;
      let level = root;
      let acc = '';
      for (let i = 0; i < parts.length; i++) {
        acc += (acc ? '/' : '') + parts[i];
        const isLast = i === parts.length - 1;
        const isDir = !isLast || e.dir;
        let node = level.find(n => n.name === parts[i] && n.type === (isDir ? 'dir' : 'file'));
        if (!node) {
          node = isDir
            ? { name: parts[i], type: 'dir', path: acc, children: [] }
            : { name: parts[i], type: 'file', path: acc, size: e.size };
          level.push(node);
        }
        if (isDir) level = node.children;
      }
    }
    const sortN = (arr) => {
      arr.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)));
      arr.forEach(n => { if (n.children) sortN(n.children); });
    };
    sortN(root);
    return root;
  }
  function zipExtract(buf, entry) {
    const local = entry.local;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('bad local header');
    const nameLen = buf.readUInt16LE(local + 26);
    const extraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + nameLen + extraLen;
    const raw = buf.subarray(start, start + entry.compSize);
    if (entry.method === 0) return Buffer.from(raw);
    if (entry.method === 8) return zlib.inflateRawSync(raw);
    throw new Error('unsupported method ' + entry.method);
  }
  async function zipEnsureMulti(urls) {
    const list = (urls || []).filter(u => /^https?:\/\//.test(u));
    if (!list.length) throw new Error('bad url');
    const key = crypto.createHash('sha1').update(list.join('|')).digest('hex').slice(0, 16);
    const file = path.join(ZIP_CACHE, key + '.zip');
    const build = async () => {
      const chunks = [];
      for (const u of list) chunks.push(await zipDownload(u));
      fs.writeFileSync(file, Buffer.concat(chunks));
    };
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      if (zipParse(buf).length) { zipMemo.set(key, file); return file; }
      try { fs.unlinkSync(file); } catch (e) {}
    }
    await build();
    if (!zipParse(fs.readFileSync(file)).length && list.length === 1) {
      try { fs.unlinkSync(file); } catch (e) {}
      await build();
    }
    zipMemo.set(key, file);
    return file;
  }

  registerCommand('zip_list')(async (params, { socket }) => {
    const urls = (params.urls && params.urls.length) ? params.urls : [params.url];
    try {
      const file = await zipEnsureMulti(urls);
      const buf = fs.readFileSync(file);
      const entries = zipParse(buf);
      if (!entries.length) {
        socket.emit('zip_list', { url: params.url, urls, tree: [], count: 0, error: 'No zip structure found (corrupted, or a split part whose siblings are missing)' });
        return;
      }
      socket.emit('zip_list', { url: params.url, urls, tree: zipTree(entries), count: entries.length });
    } catch (e) {
      logger.error('zip_list: ' + e.message);
      socket.emit('zip_list', { url: params.url, urls, tree: [], count: 0, error: e.message });
      fail(socket, 'Failed to read archive');
    }
  });
  registerCommand('zip_extract')(async (params, { socket }) => {
    const urls = (params.urls && params.urls.length) ? params.urls : [params.url];
    const entryName = params.entry;
    try {
      const file = await zipEnsureMulti(urls);
      const buf = fs.readFileSync(file);
      const entries = zipParse(buf);
      const entry = entries.find(en => !en.dir && en.name.replace(/\/+$/, '') === entryName);
      if (!entry) { socket.emit('zip_extract', { url: params.url, entry: entryName, error: 'Entry not found' }); return; }
      const data = zipExtract(buf, entry);
      const key = crypto.createHash('sha1').update(urls.join('|')).digest('hex').slice(0, 16);
      const xdir = path.join(ZIP_CACHE, key, 'x');
      try { fs.mkdirSync(xdir, { recursive: true }); } catch (e) {}
      try { fs.writeFileSync(path.join(xdir, entryName.replace(/[\/\\]/g, '_')), data); } catch (e) {}
      socket.emit('zip_extract', { url: params.url, entry: entryName, data: data.toString('base64'), size: data.length });
    } catch (e) {
      logger.error('zip_extract: ' + e.message);
      socket.emit('zip_extract', { url: params.url, entry: entryName, error: e.message });
    }
  });
  registerCommand('zip_cache_clear')(async (params, { socket }) => {
    try {
      if (params && (params.urls || params.url)) {
        const urls = (params.urls && params.urls.length) ? params.urls : [params.url];
        const key = crypto.createHash('sha1').update(urls.join('|')).digest('hex').slice(0, 16);
        try { fs.rmSync(path.join(ZIP_CACHE, key), { recursive: true, force: true }); } catch (e) {}
        try { fs.unlinkSync(path.join(ZIP_CACHE, key + '.zip')); } catch (e) {}
        zipMemo.delete(key);
      } else {
        try { fs.rmSync(ZIP_CACHE, { recursive: true, force: true }); } catch (e) {}
        try { fs.mkdirSync(ZIP_CACHE, { recursive: true }); } catch (e) {}
        zipMemo.clear();
      }
      socket.emit('zip_cache_cleared', {});
    } catch (e) { logger.error('zip_cache_clear: ' + e.message); }
  });
})();
