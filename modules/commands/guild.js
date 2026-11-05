const fs = require('fs');
const path = require('path');
const { ChannelType, ActivityType } = require('discord.js');
const {
  io,
  getBot,
  registerCommand,
  validateId,
  logger,
  getAvatarUrl,
  actionTypeToName,
  SYS_DIR
} = require('../../bot');

function botReady(socket) {
  const bot = getBot();
  if (!bot || !bot.isReady()) {
    socket.emit('error', { message: 'Bot not connected' });
    return null;
  }
  return bot;
}

function resolveGuild(bot, guildId) {
  let id = guildId;
  if (!id && bot.guilds.cache.size === 1) id = bot.guilds.cache.first().id;
  return id ? bot.guilds.cache.get(id) || null : null;
}

registerCommand('server_overview_save')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  if (!validateId(guildId)) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  const updateData = {};
  if ('name' in params) updateData.name = params.name;
  if ('description' in params) updateData.description = params.description;
  if ('verification_level' in params) updateData.verificationLevel = parseInt(params.verification_level);
  if ('explicit_content_filter' in params) updateData.explicitContentFilter = parseInt(params.explicit_content_filter);
  if ('afk_channel_id' in params) updateData.afkChannel = guild.channels.cache.get(params.afk_channel_id) || null;
  if ('afk_timeout' in params) updateData.afkTimeout = parseInt(params.afk_timeout);
  if (params.icon_b64) {
    try {
      updateData.icon = Buffer.from(params.icon_b64, 'base64');
    } catch {}
  }
  if (params.banner_b64) {
    try {
      updateData.banner = Buffer.from(params.banner_b64, 'base64');
    } catch {}
  }
  if (params.splash_b64) {
    try {
      updateData.splash = Buffer.from(params.splash_b64, 'base64');
    } catch {}
  }
  if (Object.keys(updateData).length === 0) return;
  try {
    await guild.edit(updateData);
    socket.emit('notification', 'Settings saved');
  } catch (e) {
    if (e.code === 50013) socket.emit('error', { message: 'Missing permission to edit guild' });
    else {
      logger.error(`Edit guild error: ${e.message}`);
      socket.emit('error', { message: 'Failed to save settings' });
    }
  }
});

registerCommand('guild_structure')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const categories = [];
  const uncategorised = [];
  for (const cat of guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).values()) {
    const chans = [];
    for (const ch of guild.channels.cache.filter(c => c.parentId === cat.id).values()) {
      if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice) {
        chans.push({ id: String(ch.id), name: ch.name, type: ch.type === ChannelType.GuildText ? 'text' : 'voice', position: ch.position });
      }
    }
    categories.push({ id: String(cat.id), name: cat.name, position: cat.position, channels: chans });
  }
  for (const ch of guild.channels.cache.values()) {
    if (!ch.parent && (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice)) {
      uncategorised.push({ id: String(ch.id), name: ch.name, type: ch.type === ChannelType.GuildText ? 'text' : 'voice', position: ch.position });
    }
  }
  socket.emit('guild_structure', { categories, uncategorised });
});

registerCommand('guild_leave')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  if (!guildId) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  try {
    await guild.leave();
    socket.emit('notification', `Left guild ${guild.name}`);
  } catch (e) {
    logger.error(`Leave guild error: ${e.message}`);
  }
});

registerCommand('server_roles_create')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const name = params.name || 'new-role';
  const color = parseInt(params.color) || 0;
  const hoist = params.hoist || false;
  const mentionable = params.mentionable || false;
  try {
    await guild.roles.create({ name, color, hoist, mentionable });
    socket.emit('notification', `Role ${name} created`);
  } catch (e) {
    if (e.code === 50013) socket.emit('error', { message: 'Missing permission to create role' });
    else logger.error(`Create role error: ${e.message}`);
  }
});

registerCommand('server_roles_edit')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const role = guild.roles.cache.get(params.id);
  if (!role) return;
  const updateData = {};
  if ('name' in params) updateData.name = params.name;
  if ('color' in params) updateData.colors = { primaryColor: parseInt(params.color) };
  if ('hoist' in params) updateData.hoist = params.hoist;
  if ('mentionable' in params) updateData.mentionable = params.mentionable;
  if ('permissions' in params) updateData.permissions = BigInt(params.permissions);
  if (Object.keys(updateData).length === 0) return;
  try {
    await role.edit(updateData);
    socket.emit('notification', `Role ${role.name} updated`);
  } catch (e) {
    logger.error(`Edit role error: ${e.message}`);
  }
});

registerCommand('server_roles_delete')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const role = guild.roles.cache.get(params.id);
  if (!role) return;
  try {
    await role.delete();
    socket.emit('notification', `Role ${role.name} deleted`);
  } catch (e) {
    if (e.code === 50013) socket.emit('error', { message: 'Missing permission to delete role' });
    else logger.error(`Delete role error: ${e.message}`);
  }
});

registerCommand('server_roles_list')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const roles = guild.roles.cache.sort((a, b) => b.position - a.position).map(role => ({
    id: String(role.id),
    name: role.name,
    color: role.color,
    position: role.position,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: Number(role.permissions.bitfield),
    managed: role.managed,
    members: role.members.size
  }));
  socket.emit('server_roles_data', { roles });
});

registerCommand('role_members_list')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const role = guild.roles.cache.get(params.role_id);
  if (!role) return;
  const members = role.members.map(member => ({
    id: String(member.id),
    name: member.displayName,
    username: member.user.tag
  }));
  socket.emit('role_members', { role_id: params.role_id, members });
});

registerCommand('server_members_list')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const members = guild.members.cache.map(member => ({
    id: String(member.id),
    name: member.displayName,
    username: member.user.tag,
    avatar_url: getAvatarUrl(member.user)
  }));
  socket.emit('server_members_list', { members });
});

registerCommand('member_kick')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const userId = params.user_id;
  if (!validateId(userId)) return;
  const member = guild.members.cache.get(userId);
  if (!member) return;
  try {
    await member.kick();
    socket.emit('notification', `${member.displayName} kicked`);
  } catch (e) {
    socket.emit('error', { message: bot.user.username + " doesn't have kick/ban members permission" })
  }
});

registerCommand('member_ban')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const userId = params.user_id;
  const reason = params.reason || '';
  if (!validateId(userId)) return;
  const member = guild.members.cache.get(userId);
  if (!member) return;
  try {
    await member.ban({ reason });
    socket.emit('notification', `${member.displayName} banned`);
  } catch (e) {
    socket.emit('error', { message: bot.user.username + " doesn't have kick/ban members permission" })
  }
});

registerCommand('member_unban')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  const userId = params.user_id;
  if (!validateId(guildId) || !validateId(userId)) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  try {
    await guild.bans.remove(userId);
    socket.emit('notification', 'User unbanned');
  } catch (e) {
    logger.error(`Unban error: ${e.message}`);
  }
});

registerCommand('member_timeout')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const userId = params.user_id;
  if (!validateId(userId)) return;
  const member = guild.members.cache.get(userId);
  if (!member) return;
  const secs = parseInt(params.duration) || 0;
  try {
    if (secs <= 0) await member.timeout(null);
    else await member.timeout(secs * 1000);
    socket.emit('notification', secs <= 0 ? 'Timeout removed' : `Timed out for ${secs}s`);
    socket.emit('member_detail_refresh', { user_id: userId });
  } catch (e) {
    if (e.code === 50013) socket.emit('error', { message: bot.user.username + " doesn't have moderate members permission" });
    else logger.error(`Timeout error: ${e.message}`);
  }
});

registerCommand('server_bans_list')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const bans = [];
  try {
    const banList = await guild.bans.fetch();
    for (const ban of banList.values()) {
      bans.push({
        user_id: String(ban.user.id),
        user_name: ban.user.tag,
        reason: ban.reason,
        avatar_url: getAvatarUrl(ban.user)
      });
    }
  } catch (e) {
    logger.error(`Bans list error: ${e.message}`);
  }
  socket.emit('server_bans', { bans });
});

registerCommand('server_audit_log')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const limit = Math.min(params.limit || 50, 100);
  const entries = [];
  try {
    const auditLogs = await guild.fetchAuditLogs({ limit });
    for (const entry of auditLogs.entries.values()) {
      entries.push({
        action: actionTypeToName(entry.actionType),
        user: entry.executor ? entry.executor.tag : 'Unknown',
        target: entry.target ? entry.target.toString() : 'Unknown',
        reason: entry.reason,
        created_at: entry.createdAt.toISOString().slice(0, 19).replace('T', ' ')
      });
    }
  } catch (e) {
    logger.error(`Audit log error: ${e.message}`);
  }
  socket.emit('server_audit_log', { entries });
});

registerCommand('server_expression_list')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const emojis = guild.emojis.cache.filter(e => e.available).map(emoji => ({
    id: String(emoji.id),
    name: emoji.name,
    url: emoji.url
  }));
  socket.emit('server_expression_data', { emojis });
});

registerCommand('emoji_upload')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  const name = params.name || 'emoji';
  const imageB64 = params.image;
  if (!guildId || !imageB64) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  try {
    const imgBytes = Buffer.from(imageB64, 'base64');
    const emoji = await guild.emojis.create({ attachment: imgBytes, name });
    socket.emit('notification', `Emoji ${emoji.name} created`);
  } catch (e) {
    logger.error(`Upload emoji error: ${e.message}`);
    socket.emit('error', { message: 'Failed to upload emoji' });
  }
});

registerCommand('emoji_delete')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  const emojiId = params.emoji_id;
  if (!guildId || !emojiId) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  const emoji = guild.emojis.cache.get(emojiId);
  if (!emoji) return;
  try {
    await emoji.delete();
    socket.emit('notification', 'Emoji deleted');
  } catch (e) {
    logger.error(`Delete emoji error: ${e.message}`);
  }
});

registerCommand('server_sticker_list')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const stickers = guild.stickers.cache.map(sticker => ({
    id: String(sticker.id),
    name: sticker.name,
    description: sticker.description || '',
    url: sticker.url || null
  }));
  socket.emit('server_sticker_data', { stickers });
});

registerCommand('sticker_upload')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  const name = params.name || 'sticker';
  const description = params.description || '';
  const emoji = params.emoji || '😀';
  const imageB64 = params.image;
  if (!guildId || !imageB64) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  try {
    const imgBytes = Buffer.from(imageB64, 'base64');
    const sticker = await guild.stickers.create({ file: { attachment: imgBytes, name: 'sticker.png' }, name, tags: emoji, description });
    socket.emit('notification', `Sticker ${sticker.name} created`);
  } catch (e) {
    logger.error(`Upload sticker error: ${e.message}`);
    socket.emit('error', { message: 'Failed to upload sticker' });
  }
});

registerCommand('sticker_delete')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  const stickerId = params.sticker_id;
  if (!guildId || !stickerId) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  const sticker = guild.stickers.cache.get(stickerId);
  if (!sticker) return;
  try {
    await sticker.delete();
    socket.emit('notification', 'Sticker deleted');
  } catch (e) {
    logger.error(`Delete sticker error: ${e.message}`);
  }
});

registerCommand('server_invites_list')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const invites = [];
  try {
    const inviteCollection = await guild.invites.fetch();
    for (const inv of inviteCollection.values()) {
      invites.push({
        code: inv.code,
        url: inv.url,
        channel: inv.channel ? inv.channel.name : 'Unknown',
        inviter: inv.inviter ? inv.inviter.tag : 'Unknown',
        uses: inv.uses,
        max_uses: inv.maxUses,
        max_age: inv.maxAge,
        temporary: inv.temporary,
        created_at: inv.createdAt ? inv.createdAt.toISOString().slice(0, 19).replace('T', ' ') : ''
      });
    }
  } catch (e) {
    logger.error(`Get guild invites error: ${e.message}`);
  }
  socket.emit('server_invites', { invites });
});

registerCommand('invite_create')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  const channelId = params.channel_id;
  const maxUses = parseInt(params.max_uses) || 0;
  const maxAge = parseInt(params.max_age) || 0;
  const temporary = params.temporary || false;
  if (!guildId || !channelId) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const inv = await channel.createInvite({ maxUses, maxAge, temporary });
    socket.emit('notification', `Invite created: ${inv.url}`);
  } catch (e) {
    logger.error(`Create invite error: ${e.message}`);
  }
});

registerCommand('invite_revoke')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const code = params.code;
  if (!code) return;
  try {
    const invite = await bot.fetchInvite(code);
    await invite.delete();
    socket.emit('notification', 'Invite revoked');
  } catch (e) {
    logger.error(`Revoke invite error: ${e.message}`);
  }
});

registerCommand('fetch_user_profile')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const userId = params.user_id;
  if (!userId) return;
  const user = await bot.users.fetch(userId).catch(() => null);
  if (!user) return;
  let member = null;
  let guild = null;
  const guildId = params.guild_id;
  if (guildId) {
    guild = bot.guilds.cache.get(guildId);
    member = guild ? guild.members.cache.get(userId) : null;
  }
  if (!member) {
    for (const g of bot.guilds.cache.values()) {
      const m = g.members.cache.get(userId);
      if (m) {
        member = m;
        if (!guild) guild = g;
        break;
      }
    }
  }
  const profile = {
    id: String(user.id),
    name: user.displayName,
    display_name: user.displayName,
    avatar_url: getAvatarUrl(user),
    banner_url: user.banner ? user.bannerURL({ format: 'png', size: 512 }) : null,
    accent_color: user.accentColor || null,
    bio: user.bio || ''
  };
  if (member && guild) {
    profile.nick = member.nickname;
    profile.joined_at = member.joinedAt ? member.joinedAt.toISOString() : null;
    profile.roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => ({ name: r.name, color: r.color }));
    profile.status = member.presence ? member.presence.status : 'offline';
    let customStatus = '';
    for (const act of member.presence ? member.presence.activities : []) {
      if (act.type === ActivityType.Custom) {
        customStatus = act.name || '';
        break;
      }
    }
    profile.custom_status = customStatus;
  } else {
    profile.status = 'offline';
    profile.custom_status = '';
  }
  socket.emit('user_profile', profile);
});

registerCommand('settings_upload_logo')(async (params, { socket }) => {
  const imageB64 = params.image || '';
  if (!imageB64) {
    socket.emit('error', { message: 'No image data' });
    return;
  }
  try {
    const imageBytes = Buffer.from(imageB64, 'base64');
    const iconsDir = path.join(SYS_DIR, 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
    for (const old of fs.readdirSync(iconsDir)) {
      if (old.startsWith('sidebar-logo')) fs.unlinkSync(path.join(iconsDir, old));
    }
    let ext = 'png';
    if (imageB64.startsWith('/9j/')) ext = 'jpg';
    else if (imageB64.startsWith('R0lGOD')) ext = 'gif';
    const filename = `sidebar-logo.${ext}`;
    fs.writeFileSync(path.join(iconsDir, filename), imageBytes);
    socket.emit('notification', 'Logo uploaded');
    socket.emit('logo_updated', { url: `/sys-icons/${filename}` });
  } catch (e) {
    socket.emit('error', { message: 'Invalid image data' });
  }
});

registerCommand('server_bot_permissions')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const me = guild.members.me;
  socket.emit('server_bot_permissions', {
    permissions: me ? me.permissions.toArray() : [],
    bot_name: bot.user.username,
    highest_role_position: me && me.roles.highest ? me.roles.highest.position : 0
  });
});
registerCommand('member_detail')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const m = guild.members.cache.get(params.user_id) || await guild.members.fetch(params.user_id).catch(() => null);
  if (!m) return;
  socket.emit('member_detail', {
    user_id: String(m.id),
    nick: m.nickname || '',
    roles: m.roles.cache.filter(r => r.name !== '@everyone').map(r => ({ id: String(r.id), name: r.name, color: r.color, position: r.position, managed: r.managed })),
    timeout_until: m.communicationDisabledUntilTimestamp || 0,
    owner: guild.ownerId === m.id,
    above_bot: m.roles.highest.position >= guild.members.me.roles.highest.position,
    bot_name: bot.user.username
  });
});
registerCommand('member_nick')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const m = guild.members.cache.get(params.user_id);
  if (!m) return;
  try {
    await m.setNickname(params.nick || null);
    socket.emit('notification', 'Nickname updated');
    socket.emit('member_detail_refresh', { user_id: params.user_id });
  } catch (e) {
    if (e.code === 50013) socket.emit('error', { message: bot.user.username + " doesn't have manage nicknames permission" });
    else logger.error(`Nick error: ${e.message}`);
  }
});
registerCommand('member_roles_edit')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const m = guild.members.cache.get(params.user_id);
  if (!m) return;
  try {
    if (params.action === 'add') await m.roles.add(params.role_id);
    else await m.roles.remove(params.role_id);
    socket.emit('notification', 'Roles updated');
    socket.emit('member_detail_refresh', { user_id: params.user_id });
  } catch (e) {
    if (e.code === 50013) socket.emit('error', { message: bot.user.username + " doesn't have manage roles permission" });
    else logger.error(`Role edit error: ${e.message}`);
  }
});

registerCommand('emoji_edit')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const emoji = guild.emojis.cache.get(params.emoji_id);
  if (!emoji) return;
  try {
    await emoji.edit({ name: params.name || emoji.name });
    socket.emit('notification', 'Emoji renamed');
  } catch (e) {
    if (e.code === 50013) socket.emit('error', { message: bot.user.username + " doesn't have manage emojis and stickers permission" });
    else logger.error(`Edit emoji error: ${e.message}`);
  }
});

module.exports = {};