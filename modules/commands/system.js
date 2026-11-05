const fs = require('fs');
const path = require('path');
const os = require('os');
const { io, registerCommand, logger, getBot, getBotDataDir, loadDashboardPrefs, saveDashboardPrefs, clearRuntimeCaches, resetTokenVault, fetchBotApplicationInfo, getGuildListWithBanners, LOG_BUFFER, SYS_DIR } = require('../../bot');
function sampleCpuPercent() {
  return new Promise((resolve) => {
    const c1 = os.cpus();
    setTimeout(() => {
      const c2 = os.cpus();
      let total = 0;
      let idle = 0;
      for (let i = 0; i < c2.length; i++) {
        const t1 = c1[i] ? c1[i].times : {};
        const t2 = c2[i].times;
        for (const k of Object.keys(t2)) {
          const d = (t2[k] || 0) - (t1[k] || 0);
          total += d;
          if (k === 'idle') idle += d;
        }
      }
      if (total > 0) resolve(Math.max(0, Math.min(100, Math.round(100 * (1 - idle / total)))));
      else {
        const cores = c2.length || 1;
        resolve(Math.max(0, Math.min(100, Math.round((os.loadavg()[0] / cores) * 100))));
      }
    }, 500);
  });
}
registerCommand('get_recent_logs')(async (params, { socket }) => {
  socket.emit('recent_logs', { messages: [...LOG_BUFFER] });
});
registerCommand('get_system_stats')(async (params, { socket }) => {
  const b = getBot();
  const info = {
    ping: b ? Math.round(b.ws.ping) : 0,
    uptime: 0,
    memory_total: 'N/A',
    memory_used: 'N/A',
    memory_percent: 0,
    cpu_percent: 0,
    device: os.hostname() || 'Unknown',
    os: `${os.type()} ${os.release()}`,
    bot_name: b ? b.user.tag : 'Not connected',
    bot_avatar: b ? getBot().user ? getBot().user.avatar : null : null,
    owner: 'Unknown',
    guilds: b ? b.guilds.cache.size : 0,
    users: b ? b.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0) : 0
  };
  if (b && b.startTime) info.uptime = Math.round((new Date() - b.startTime) / 1000);
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    info.memory_total = `${Math.floor(totalMem / (1024 ** 2))} MB`;
    info.memory_used = `${Math.floor(usedMem / (1024 ** 2))} MB`;
    info.memory_percent = Math.round((usedMem / totalMem) * 100);
    info.cpu_percent = await sampleCpuPercent();
  } catch {}
  if (b && b.user) {
    const app = await fetchBotApplicationInfo(b);
    if (app && app.owner) info.owner = app.owner.tag;
  }
  socket.emit('system_stats', info);
});
registerCommand('clear_runtime_cache')(async (params, { socket }) => {
  clearRuntimeCaches();
  const b = getBot();
  if (b && b.isReady()) {
    const guilds = await getGuildListWithBanners(b);
    io.emit('bot_status', { connected: true, guilds });
  }
  socket.emit('notification', 'Runtime cache cleared');
  socket.emit('system_stats_cleared', {});
});
registerCommand('shutdown_bot')(async (params, { socket }) => {
  socket.emit('shutdown_progress', { step: 'Clearing leftover cache...' });
  clearRuntimeCaches();
  const b = getBot();
  if (b && !b.isDestroyed) await b.destroy();
  socket.emit('shutdown_progress', { step: 'Logging out bot...' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  socket.emit('shutdown_progress', { step: 'Disconnecting socket...' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  socket.emit('shutdown_progress', { step: 'Shutdown complete. Goodbye!' });
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
});
registerCommand('reset_system')(async (params, { socket }) => {
  const configDir = path.join(SYS_DIR, 'config');
  if (fs.existsSync(configDir)) fs.rmSync(configDir, { recursive: true, force: true });
  fs.mkdirSync(configDir, { recursive: true });
  resetTokenVault();
  socket.emit('system_reset_complete', {});
});
registerCommand('dashboard_get_prefs')(async (params, { socket }) => {
  socket.emit('dashboard_prefs', loadDashboardPrefs());
});
registerCommand('dashboard_save_pref')(async (params, { socket }) => {
  const key = params.key;
  const value = params.value;
  if (!key) return;
  const prefs = loadDashboardPrefs();
  if (key in prefs) {
    prefs[key] = value;
    saveDashboardPrefs(prefs);
  }
  socket.emit('pref_saved', { key, value });
});
registerCommand('save_global_theme')(async (params, { socket }) => {
  const themePath = params.path || '';
  const themeDir = path.join(SYS_DIR, 'config');
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify({ theme_path: themePath }));
  socket.emit('notification', 'Global theme saved');
});
registerCommand('fetch_arkv_markup')(async (params, { socket }) => {
  const arkvPath = path.join(SYS_DIR, 'arkv.md');
  let content = '';
  if (fs.existsSync(arkvPath)) {
    try { content = fs.readFileSync(arkvPath, 'utf8'); } catch {}
  } else {
    content = '# App Info\n\nNo content available. Create `.arklum_sys/arkv.md` to populate this page.';
  }
  socket.emit('arkv_content', { content });
});
registerCommand('ui_state_save')(async (params, { socket }) => {
  if (!params || !params.state) return;
  const file = path.join(getBotDataDir(), 'ui_state.json');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(params.state));
    fs.renameSync(file + '.tmp', file);
  } catch (e) {
    logger.error('ui_state_save: ' + e.message);
  }
});
registerCommand('get_meme_config')(async (params, { socket }) => {
  const memeConfigPath = path.join(getBotDataDir(), 'meme_config.json');
  let cfg = { enabled: true, prefix: '$' };
  if (fs.existsSync(memeConfigPath)) {
    try {
      cfg = JSON.parse(fs.readFileSync(memeConfigPath, 'utf8'));
    } catch {}
  }
  socket.emit('meme_config', cfg);
});
registerCommand('toggle_background_task')(async (params, { socket }) => {
  const key = params.key;
  const enabled = params.enabled !== undefined ? params.enabled : true;
  if (key === 'memes') {
    const memeConfigPath = path.join(getBotDataDir(), 'meme_config.json');
    let cfg = { enabled, prefix: '$' };
    if (fs.existsSync(memeConfigPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(memeConfigPath, 'utf8'));
        cfg.prefix = existing.prefix || '$';
      } catch {}
    }
    fs.writeFileSync(memeConfigPath + '.tmp', JSON.stringify(cfg));
    fs.renameSync(memeConfigPath + '.tmp', memeConfigPath);
    socket.emit('notification', `Meme Generator ${enabled ? 'enabled' : 'disabled'}`);
  } else {
    socket.emit('notification', `Unknown task: ${key}`);
  }
});
registerCommand('set_bg_prefix')(async (params, { socket }) => {
  const key = params.key;
  const prefix = params.prefix || '$';
  if (key === 'memes') {
    const memeConfigPath = path.join(getBotDataDir(), 'meme_config.json');
    let cfg = { enabled: true, prefix };
    if (fs.existsSync(memeConfigPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(memeConfigPath, 'utf8'));
        cfg.enabled = existing.enabled !== undefined ? existing.enabled : true;
      } catch {}
    }
    fs.writeFileSync(memeConfigPath + '.tmp', JSON.stringify(cfg));
    fs.renameSync(memeConfigPath + '.tmp', memeConfigPath);
    socket.emit('notification', `Meme prefix set to ${prefix}`);
  } else {
    socket.emit('notification', `Unknown task: ${key}`);
  }
});
registerCommand('get_arklum_stats')(async (params, { socket }) => {
  const ram = process.memoryUsage().rss;
  let folderSize = 0;
  const root = process.cwd();
  const exclude = new Set(['node_modules', '.git', '.arklum_sys', 'data']);
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (exclude.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else folderSize += fs.statSync(full).size;
      }
    } catch (e) {}
  }
  walk(root);
  socket.emit('ar klum_stats', { ram_bytes: ram, folder_size_bytes: folderSize });
});

registerCommand('settings_upload_font')(async (params, { socket }) => {
  const dataB64 = params.data || '';
  const filename = params.filename || 'custom.ttf';
  if (!dataB64) { socket.emit('error', { message: 'No font data' }); return; }
  try {
    const bytes = Buffer.from(dataB64, 'base64');
    const fontsDir = path.join('static', 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });
    const ext = path.extname(filename) || '.ttf';
    const dest = path.join(fontsDir, 'custom_font' + ext);
    fs.writeFileSync(dest, bytes);
    socket.emit('notification', 'Font uploaded');
    socket.emit('font_uploaded', { url: '/fonts/custom_font' + ext + '?t=' + Date.now() });
  } catch (e) {
    socket.emit('error', { message: 'Failed to save font' });
  }
});
registerCommand('get_system_stats')(async (params, { socket }) => {
  const b = getBot();

  let core_version = '0.0.0';
  try {
    const arkvPath = path.join(SYS_DIR, 'arkv.md');
    if (fs.existsSync(arkvPath)) {
      const firstLine = fs.readFileSync(arkvPath, 'utf8').split('\n')[0].trim();
      const m = firstLine.match(/v?(\d+(?:\.\d+)*)/);
      if (m) core_version = m[1];
    } else {
      core_version = require('../../package.json').version;
    }
  } catch (e) {}

  const info = {
    ping: b ? Math.round(b.ws.ping) : 0,
    uptime: 0,
    core_version: core_version,
    memory_total: 'N/A',
    memory_used: 'N/A',
    memory_percent: 0,
    cpu_percent: 0,
    device: os.hostname() || 'Unknown',
    os: `${os.type()} ${os.release()}`,
    bot_name: b ? b.user.tag : 'Not connected',
    bot_avatar: b && b.user ? b.user.avatar : null,
    owner: 'Unknown',
    guilds: b ? b.guilds.cache.size : 0,
    users: b ? b.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0) : 0
  };

  if (b && b.startTime) info.uptime = Math.round((new Date() - b.startTime) / 1000);
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    info.memory_total = `${Math.floor(totalMem / (1024 ** 2))} MB`;
    info.memory_used = `${Math.floor(usedMem / (1024 ** 2))} MB`;
    info.memory_percent = Math.round((usedMem / totalMem) * 100);
    info.cpu_percent = await sampleCpuPercent();
  } catch {}
  if (b && b.user) {
    const app = await fetchBotApplicationInfo(b);
    if (app && app.owner) info.owner = app.owner.tag;
  }
  socket.emit('system_stats', info);
});
registerCommand('get_arkv_version')(async (params, { socket }) => {
  const arkvPath = path.join(SYS_DIR, 'arkv.md');
  let version = 'v0.0.0';
  if (fs.existsSync(arkvPath)) {
    try {
      const firstLine = fs.readFileSync(arkvPath, 'utf8').split('\n')[0].trim();
      const m = firstLine.match(/v?\d+(?:\.\d+)*/);
      if (m) version = 'v' + m[0];
    } catch {}
  }
  socket.emit('arkv_version', { version });
});
registerCommand('settings_upload_font')(async (params, { socket }) => {
  const dataB64 = params.data || '';
  const filename = params.filename || 'custom.ttf';
  if (!dataB64) { socket.emit('error', { message: 'No font data' }); return; }
  try {
    const bytes = Buffer.from(dataB64, 'base64');
    const fontsDir = path.join('static', 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });
    const ext = path.extname(filename) || '.ttf';
    const dest = path.join(fontsDir, 'custom_font' + ext);
    fs.writeFileSync(dest, bytes);
    socket.emit('notification', 'Font uploaded');
    socket.emit('font_uploaded', { url: '/fonts/custom_font' + ext + '?t=' + Date.now() });
  } catch (e) {
    socket.emit('error', { message: 'Failed to save font' });
  }
});