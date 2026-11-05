const { registerCommand, logger, getCurrentBotTokenIndex, tokenVault } = require('../../bot');
const loader = require('../../plugins/loader');

registerCommand('plugin_list_installed')(async (params, { socket }) => {
  const data = loader.load_assignments();
  socket.emit('plugin_installed_list', Object.entries(loader.PLUGIN_REGISTRY).map(([key, p]) => ({
    key: key,
    name: p.name,
    version: p.version,
    author: p.author,
    description: p.description,
    loaded: !!p.loaded,
    disabled: (data.disabled || []).includes(key)
  })));
});

registerCommand('plugin_get_page')(async (params, { socket }) => {
  const key = params.key;
  const info = loader.PLUGIN_REGISTRY[key];
  if (!info || !info.content_provider) {
    socket.emit('plugin_page_content', { key: key, html: '' });
    return;
  }
  try {
    const html = (await info.content_provider()) || '';
    socket.emit('plugin_page_content', { key: key, html: html });
  } catch (e) {
    logger.error('Plugin page error: ' + e.message);
    socket.emit('plugin_page_content', { key: key, html: '' });
  }
});

registerCommand('plugin_get_settings_registry')(async (params, { socket }) => {
  socket.emit('plugin_settings_registry', loader.get_all_settings_registry());
});

registerCommand('plugin_get_token_list')(async (params, { socket }) => {
  const data = loader.load_assignments();
  socket.emit('plugin_token_list', {
    tokens: tokenVault.map((t, i) => ({
      index: i,
      name: t.name || ('Token ' + (i + 1)),
      plugin_count: (data[String(i)] || []).length
    })),
    global_plugins: data.global || []
  });
});

registerCommand('plugin_get_token_plugins')(async (params, { socket }) => {
  const idx = String(params.token_index);
  const data = loader.load_assignments();
  const keys = data[idx] || [];
  socket.emit('plugin_token_plugins', {
    token_index: params.token_index,
    plugins: keys.map(k => ({ key: k, global: (data.global || []).includes(k) }))
  });
});

registerCommand('plugin_assign')(async (params, { socket }) => {
  const idx = String(params.token_index);
  const key = params.plugin_key;
  if (!key) return;
  const data = loader.load_assignments();
  if (!Array.isArray(data[idx])) data[idx] = [];
  if (!data[idx].includes(key)) data[idx].push(key);
  loader.save_assignments(data);
  loader.load_plugins_for_token(getCurrentBotTokenIndex());
  socket.emit('notification', 'Plugin assigned');
});

registerCommand('plugin_unassign')(async (params, { socket }) => {
  const idx = String(params.token_index);
  const key = params.plugin_key;
  const data = loader.load_assignments();
  if (Array.isArray(data[idx])) data[idx] = data[idx].filter(k => k !== key);
  loader.save_assignments(data);
  loader.load_plugins_for_token(getCurrentBotTokenIndex());
  socket.emit('notification', 'Plugin unassigned');
});

registerCommand('plugin_set_global')(async (params, { socket }) => {
  const key = params.plugin_key;
  const on = !!params.global;
  const data = loader.load_assignments();
  data.global = Array.isArray(data.global) ? data.global : [];
  if (on && !data.global.includes(key)) data.global.push(key);
  if (!on) data.global = data.global.filter(k => k !== key);
  loader.save_assignments(data);
  loader.load_plugins_for_token(getCurrentBotTokenIndex());
  socket.emit('notification', on ? 'Plugin set global' : 'Plugin removed from global');
});

module.exports = {};