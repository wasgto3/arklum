const fs = require('fs');
const path = require('path');
const { registerCommand, getBot, getBotDataDir, getAvatarUrl, getUserBannerUrl, logger } = require('../../bot');

function profilePath() {
  return path.join(getBotDataDir(), 'bot_profile.json');
}

function serverProfilePath(guildId) {
  return path.join(getBotDataDir(), 'bot_profile_' + guildId + '.json');
}

function readJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return fallback;
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(p + '.tmp', p);
}

registerCommand('bot_profile_get')(async (params, { socket }) => {
  const b = getBot();
  const saved = readJson(profilePath(), {});
  socket.emit('bot_profile', {
    bio: saved.bio || (b && b.user ? b.user.bio || '' : ''),
    avatar_url: saved.avatar_url || (b && b.user ? getAvatarUrl(b.user) : null),
    banner_url: saved.banner_url || (b && b.user ? getUserBannerUrl(b.user) : null)
  });
});

registerCommand('bot_profile_save')(async (params, { socket }) => {
  const b = getBot();
  if (!b || !b.isReady()) {
    socket.emit('error', { message: 'Bot not connected' });
    return;
  }
  const saved = readJson(profilePath(), {});
  const payload = {};
  if ('bio' in params) payload.bio = params.bio;
  if (params.avatar) payload.avatar = Buffer.from(params.avatar, 'base64');
  if (params.banner) payload.banner = Buffer.from(params.banner, 'base64');
  try {
    if (Object.keys(payload).length) await b.user.edit(payload);
    writeJson(profilePath(), Object.assign(saved, {
      bio: b.user.bio || '',
      avatar_url: getAvatarUrl(b.user),
      banner_url: getUserBannerUrl(b.user)
    }));
    socket.emit('notification', 'Global profile saved');
    socket.emit('bot_profile', { bio: b.user.bio || '', avatar_url: getAvatarUrl(b.user), banner_url: getUserBannerUrl(b.user) });
  } catch (e) {
    logger.error('Profile save error: ' + e.message);
    socket.emit('error', { message: 'Failed to save profile' });
  }
});

registerCommand('bot_server_profile_get')(async (params, { socket }) => {
  const b = getBot();
  const guildId = params.guild_id;
  if (!b || !b.isReady() || !guildId) return;
  const guild = b.guilds.cache.get(guildId);
  const saved = readJson(serverProfilePath(guildId), {});
  const me = guild ? guild.members.me : null;
  socket.emit('bot_server_profile', {
    guild_id: guildId,
    nickname: saved.nickname || (me ? me.nickname || '' : ''),
    bio: saved.bio || '',
    avatar_url: saved.avatar_url || (me ? me.displayAvatarURL({ format: 'png', size: 128 }) : null),
    banner_url: saved.banner_url || null
  });
});

registerCommand('bot_server_profile_save')(async (params, { socket }) => {
  const b = getBot();
  const guildId = params.guild_id;
  if (!b || !b.isReady() || !guildId) {
    socket.emit('error', { message: 'Bot not connected' });
    return;
  }
  const guild = b.guilds.cache.get(guildId);
  if (!guild) {
    socket.emit('error', { message: 'Server not found' });
    return;
  }
  const me = guild.members.me;
  const saved = readJson(serverProfilePath(guildId), {});
  try {
    if ('nickname' in params) await me.setNickname(params.nickname || null);
    if (params.avatar) await me.setAvatar(Buffer.from(params.avatar, 'base64'));
    if (params.banner) await me.setBanner(Buffer.from(params.banner, 'base64'));
    writeJson(serverProfilePath(guildId), Object.assign(saved, {
      nickname: me.nickname || '',
      avatar_url: me.displayAvatarURL({ format: 'png', size: 128 })
    }));
    socket.emit('notification', 'Server profile saved');
  } catch (e) {
    logger.error('Server profile save error: ' + e.message);
    socket.emit('error', { message: 'Failed to save server profile' });
  }
});

module.exports = {};