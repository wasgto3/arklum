const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { registerCommand, logger } = require('../bot');
const fail = (socket, message) => socket.emit('error', { message });
const CACHE_DIR = path.join(__dirname, '..', '.arklum_sys', 'cache');
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
const cached = new Map();

async function ensureCached(url) {
  if (!/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(url)) throw new Error('bad url');
  const key = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const file = path.join(CACHE_DIR, key + '.zip');
  if (cached.has(url) && fs.existsSync(file)) return file;
  if (fs.existsSync(file)) { cached.set(url, file); return file; }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  const res = await fetch(url, { signal: ctrl.signal });
  clearTimeout(t);
  if (!res.ok) throw new Error('http ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  cached.set(url, file);
  return file;
}
const AdmZip = require('adm-zip');
const MAX_ENTRY = 25 * 1024 * 1024;
function parseZip(buf) {
  return new AdmZip(buf).getEntries().map(e => ({
    name: e.entryName, dir: e.isDirectory, size: e.header.size,
    method: e.header.method, compSize: e.header.compressedSize, _e: e
  }));
}
function extractEntry(buf, entry) {
  if (entry.size > MAX_ENTRY) throw new Error('entry too large');
  return entry._e.getData();
}
function buildTree(entries) {
  const root = [];
  const sorted = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const e of sorted) {
    const parts = e.name.replace(/\/+$/, '').split('/').filter(Boolean);
    if (!parts.length) continue;
    let level = root;
    let pathSoFar = '';
    for (let i = 0; i < parts.length; i++) {
      pathSoFar += (pathSoFar ? '/' : '') + parts[i];
      const isLast = i === parts.length - 1;
      const isDir = !isLast || e.dir;
      let node = level.find(n => n.name === parts[i] && n.type === (isDir ? 'dir' : 'file'));
      if (!node) {
        node = isDir
          ? { name: parts[i], type: 'dir', path: pathSoFar, children: [] }
          : { name: parts[i], type: 'file', path: pathSoFar, size: e.size };
        level.push(node);
      }
      if (isDir) level = node.children;
    }
  }
  const sortNodes = (arr) => {
    arr.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)));
    arr.forEach(n => { if (n.children) sortNodes(n.children); });
  };
  sortNodes(root);
  return root;
}
registerCommand('zip_list')(async (params, { socket }) => {
  try {
    const file = await ensureCached(params.url);
    const buf = fs.readFileSync(file);
    const entries = parseZip(buf);
    socket.emit('zip_list', { url: params.url, tree: buildTree(entries), count: entries.length });
  } catch (e) {
    logger.error('zip_list: ' + e.message);
    socket.emit('zip_list', { url: params.url, tree: [], count: 0, error: e.message });
    fail(socket, 'Failed to read archive');
  }
});
registerCommand('zip_extract')(async (params, { socket }) => {
  try {
    const file = await ensureCached(params.url);
    const buf = fs.readFileSync(file);
    const entries = parseZip(buf);
    const entry = entries.find(en => !en.dir && en.name.replace(/\/+$/, '') === params.entry);
    if (!entry) { fail(socket, 'Entry not found'); return; }
    const data = extractEntry(buf, entry);
    socket.emit('zip_extract', { url: params.url, entry: params.entry, data: data.toString('base64'), size: data.length });
  } catch (e) {
    logger.error('zip_extract: ' + e.message);
    fail(socket, 'Failed to extract entry');
  }
});
registerCommand('zip_cache_clear')(async (params, { socket }) => {
  try {
    if (params && params.url) {
      const key = crypto.createHash('sha1').update(params.url).digest('hex').slice(0, 16);
      const f = path.join(CACHE_DIR, key + '.zip');
      if (fs.existsSync(f)) fs.unlinkSync(f);
      cached.delete(params.url);
    } else {
      for (const f of fs.readdirSync(CACHE_DIR)) fs.unlinkSync(path.join(CACHE_DIR, f));
      cached.clear();
    }
    socket.emit('zip_cache_cleared', {});
  } catch (e) { logger.error('zip_cache_clear: ' + e.message); }
});