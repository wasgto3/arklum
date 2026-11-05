const { ChannelType, PermissionsBitField } = require('discord.js');
const {
  getBot,
  registerCommand,
  validateId,
  logger,
  bitsToPermissions,
  permissionNameToFlag
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

registerCommand('channel_get')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  socket.emit('channel_info', {
    id: String(channel.id),
    name: channel.name,
    type: channel.type === ChannelType.GuildText ? 'text' : 'voice',
    position: channel.position,
    category_id: channel.parent ? String(channel.parent.id) : null,
    topic: channel.topic || '',
    slowmode: channel.rateLimitPerUser || 0,
    nsfw: channel.nsfw || false,
    private: channel.permissionOverwrites.cache.size > 0
  });
});

registerCommand('channel_create')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const name = params.name || 'new-channel';
  const chType = params.type || 'text';
  const categoryId = params.category_id;
  const isPrivate = params.private || false;
  try {
    let channel;
    if (chType === 'text') channel = await guild.channels.create({ name, type: ChannelType.GuildText });
    else if (chType === 'voice') channel = await guild.channels.create({ name, type: ChannelType.GuildVoice });
    else return;
    if (categoryId) {
      const cat = guild.channels.cache.get(categoryId);
      if (cat && cat.type === ChannelType.GuildCategory) await channel.setParent(cat);
    }
    if (isPrivate) await channel.permissionOverwrites.create(guild.roles.everyone, { ViewChannel: false });
    socket.emit('notification', `Channel ${name} created`);
  } catch (e) {
    logger.error(`Create channel error: ${e.message}`);
  }
});

registerCommand('channel_edit')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const updateData = {};
  if ('name' in params) updateData.name = params.name;
  if ('topic' in params && channel.type === ChannelType.GuildText) updateData.topic = params.topic;
  if ('slowmode' in params && channel.type === ChannelType.GuildText) updateData.rateLimitPerUser = parseInt(params.slowmode);
  if ('nsfw' in params && channel.type === ChannelType.GuildText) updateData.nsfw = params.nsfw;
  if ('category_id' in params) {
    const cat = params.category_id ? guild.channels.cache.get(params.category_id) : null;
    if (cat && cat.type === ChannelType.GuildCategory) updateData.parent = cat;
    else if (params.category_id === null) updateData.parent = null;
  }
  if (Object.keys(updateData).length > 0) {
    try {
      await channel.edit(updateData);
      socket.emit('notification', `Channel ${channel.name} updated`);
    } catch (e) {
      logger.error(`Edit channel error: ${e.message}`);
    }
  }
  if ('private' in params) {
    if (params.private) await channel.permissionOverwrites.create(guild.roles.everyone, { ViewChannel: false });
    else await channel.permissionOverwrites.create(guild.roles.everyone, { ViewChannel: true });
  }
});

registerCommand('channel_delete')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  try {
    await channel.delete();
    socket.emit('notification', `Channel ${channel.name} deleted`);
  } catch (e) {
    logger.error(`Delete channel error: ${e.message}`);
  }
});

registerCommand('channel_move_absolute')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  const newPos = params.position;
  if (!validateId(channelId) || newPos === undefined) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  try {
    await channel.edit({ position: parseInt(newPos) });
  } catch (e) {
    logger.error(`Channel move absolute error: ${e.message}`);
  }
});

registerCommand('category_create')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const name = params.name || 'New Category';
  const isPrivate = params.private || false;
  try {
    const cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
    if (isPrivate) await cat.permissionOverwrites.create(guild.roles.everyone, { ViewChannel: false });
    socket.emit('notification', `Category ${name} created`);
  } catch (e) {
    logger.error(`Create category error: ${e.message}`);
  }
});

registerCommand('category_delete')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const catId = params.category_id;
  if (!catId) return;
  const cat = guild.channels.cache.get(catId);
  if (!cat || cat.type !== ChannelType.GuildCategory) return;
  try {
    await cat.delete();
  } catch (e) {
    logger.error(`Delete category error: ${e.message}`);
  }
});

registerCommand('category_edit')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const catId = params.category_id;
  const cat = guild.channels.cache.get(catId);
  if (!cat || cat.type !== ChannelType.GuildCategory) return;
  const updateData = {};
  if ('name' in params) updateData.name = params.name;
  if ('position' in params) updateData.position = parseInt(params.position);
  if (Object.keys(updateData).length === 0) return;
  try {
    await cat.edit(updateData);
    socket.emit('notification', `Category ${cat.name} updated`);
  } catch (e) {
    logger.error(`Edit category error: ${e.message}`);
  }
});

registerCommand('channel_permissions_get')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const overwrites = [];
  for (const [targetId, overwrite] of channel.permissionOverwrites.cache) {
    let targetType;
    let targetName;
    let target;
    if (guild.roles.cache.has(targetId)) {
      targetType = 'role';
      target = guild.roles.cache.get(targetId);
      targetName = target.name;
    } else if (guild.members.cache.has(targetId)) {
      targetType = 'member';
      target = guild.members.cache.get(targetId);
      targetName = target.displayName;
    } else continue;
    overwrites.push({
      id: String(targetId),
      name: targetName,
      type: targetType,
      allowed: bitsToPermissions(overwrite.allow.bitfield),
      denied: bitsToPermissions(overwrite.deny.bitfield)
    });
  }
  socket.emit('channel_permissions', { channel_id: channelId, overwrites });
});

registerCommand('channel_permissions_set')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  const targetId = params.target_id;
  const targetType = params.target_type || 'role';
  const permission = params.permission;
  const action = params.action;
  if (!channelId || !targetId || !permission || !action) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  let target;
  if (targetType === 'role') target = guild.roles.cache.get(targetId);
  else target = guild.members.cache.get(targetId);
  if (!target) return;
  const flag = permissionNameToFlag(permission);
  if (!flag) return;
  let overwrite;
  const existing = channel.permissionOverwrites.cache.get(targetId);
  if (!existing) overwrite = { allow: new PermissionsBitField(), deny: new PermissionsBitField() };
  else overwrite = { allow: existing.allow.clone(), deny: existing.deny.clone() };
  if (action === 'allow') overwrite.allow.add(flag);
  else if (action === 'deny') overwrite.deny.add(flag);
  else if (action === 'neutral') {
    overwrite.allow.remove(flag);
    overwrite.deny.remove(flag);
  }
  try {
    await channel.permissionOverwrites.create(target, { allow: overwrite.allow, deny: overwrite.deny });
  } catch (e) {
    logger.error(`Set permissions error: ${e.message}`);
  }
});

registerCommand('category_permissions_get')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  if (!guildId) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  const cat = guild.channels.cache.get(params.category_id);
  if (!cat || cat.type !== ChannelType.GuildCategory) return;
  const overwrites = [];
  for (const [targetId, overwrite] of cat.permissionOverwrites.cache) {
    let targetType;
    let targetName;
    let target;
    if (guild.roles.cache.has(targetId)) {
      targetType = 'role';
      target = guild.roles.cache.get(targetId);
      targetName = target.name;
    } else if (guild.members.cache.has(targetId)) {
      targetType = 'member';
      target = guild.members.cache.get(targetId);
      targetName = target.displayName;
    } else continue;
    overwrites.push({
      id: String(targetId),
      name: targetName,
      type: targetType,
      allowed: bitsToPermissions(overwrite.allow.bitfield),
      denied: bitsToPermissions(overwrite.deny.bitfield)
    });
  }
  socket.emit('category_permissions', { category_id: String(cat.id), overwrites });
});

registerCommand('category_permissions_set')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guildId = params.guild_id;
  if (!guildId) return;
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return;
  const cat = guild.channels.cache.get(params.category_id);
  if (!cat || cat.type !== ChannelType.GuildCategory) return;
  const targetId = params.target_id;
  const targetType = params.target_type || 'role';
  const permission = params.permission;
  const action = params.action;
  let target;
  if (targetType === 'role') target = guild.roles.cache.get(targetId);
  else target = guild.members.cache.get(targetId);
  if (!target) return;
  const flag = permissionNameToFlag(permission);
  if (!flag) return;
  let overwrite;
  const existing = cat.permissionOverwrites.cache.get(targetId);
  if (!existing) overwrite = { allow: new PermissionsBitField(), deny: new PermissionsBitField() };
  else overwrite = { allow: existing.allow.clone(), deny: existing.deny.clone() };
  if (action === 'allow') overwrite.allow.add(flag);
  else if (action === 'deny') overwrite.deny.add(flag);
  else if (action === 'neutral') {
    overwrite.allow.remove(flag);
    overwrite.deny.remove(flag);
  }
  try {
    await cat.permissionOverwrites.create(target, { allow: overwrite.allow, deny: overwrite.deny });
  } catch (e) {
    logger.error(`Category permissions set error: ${e.message}`);
  }
});

registerCommand('channel_webhooks')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const webhooks = [];
  try {
    const webhookCollection = await channel.fetchWebhooks();
    for (const wh of webhookCollection.values()) {
      webhooks.push({
        id: String(wh.id),
        name: wh.name,
        url: wh.url,
        channel_id: String(wh.channelId)
      });
    }
  } catch (e) {
    logger.error(`Get webhooks error: ${e.message}`);
  }
  socket.emit('channel_webhooks', { channel_id: channelId, webhooks });
});

registerCommand('webhook_create')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  const name = params.name || 'Arklum Webhook';
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const wh = await channel.createWebhook({ name });
    socket.emit('notification', `Webhook ${wh.name} created`);
  } catch (e) {
    logger.error(`Create webhook error: ${e.message}`);
  }
});

registerCommand('webhook_edit')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const webhookId = params.id;
  if (!webhookId) return;
  const updateData = {};
  if ('name' in params) updateData.name = params.name;
  if ('channel_id' in params && params.channel_id) {
    const guild = resolveGuild(bot, params.guild_id);
    if (guild) {
      const channel = guild.channels.cache.get(params.channel_id);
      if (channel) updateData.channel = channel;
    }
  }
  if (Object.keys(updateData).length === 0) return;
  try {
    const webhook = await bot.fetchWebhook(webhookId);
    await webhook.edit(updateData);
  } catch (e) {
    logger.error(`Edit webhook error: ${e.message}`);
  }
});

registerCommand('webhook_delete')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const webhookId = params.id;
  if (!webhookId) return;
  try {
    const webhook = await bot.fetchWebhook(webhookId);
    await webhook.delete();
  } catch (e) {
    logger.error(`Delete webhook error: ${e.message}`);
  }
});

registerCommand('channel_pins')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const pins = [];
  try {
    const pinnedRes = await channel.messages.fetchPins();
    const pinnedMsgs = Array.isArray(pinnedRes) ? pinnedRes : Array.from(pinnedRes.values());
    for (const msg of pinnedMsgs) {
      pins.push({
        id: String(msg.id),
        author: msg.author.tag,
        content: msg.content.substring(0, 200),
        timestamp: msg.createdAt.toISOString().slice(0, 19).replace('T', ' ')
      });
    }
  } catch (e) {
    logger.error(`Get pins error: ${e.message}`);
  }
  socket.emit('channel_pins', { channel_id: channelId, pins });
});

registerCommand('channel_unpin')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  const messageId = params.message_id;
  if (!validateId(channelId) || !validateId(messageId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(messageId);
    await msg.unpin();
  } catch (e) {
    logger.error(`Unpin error: ${e.message}`);
  }
});

registerCommand('channel_invites')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const guild = resolveGuild(bot, params.guild_id);
  if (!guild) return;
  const channelId = params.channel_id;
  if (!validateId(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  const invites = [];
  try {
    const inviteCollection = await channel.fetchInvites();
    for (const inv of inviteCollection.values()) {
      invites.push({
        code: inv.code,
        url: inv.url,
        uses: inv.uses,
        max_uses: inv.maxUses,
        max_age: inv.maxAge,
        temporary: inv.temporary,
        created_at: inv.createdAt ? inv.createdAt.toISOString().slice(0, 19).replace('T', ' ') : ''
      });
    }
  } catch (e) {
    logger.error(`Get invites error: ${e.message}`);
  }
  socket.emit('channel_invites', { channel_id: channelId, invites });
});

registerCommand('channel_invite_revoke')(async (params, { socket }) => {
  const bot = botReady(socket);
  if (!bot) return;
  const code = params.code;
  if (!code) return;
  try {
    const invite = await bot.fetchInvite(code);
    await invite.delete();
  } catch (e) {
    logger.error(`Revoke invite error: ${e.message}`);
  }
});

module.exports = {};