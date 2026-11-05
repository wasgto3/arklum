const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { logger, registerCommand } = require('../bot');

const ARK_CLI = path.join(process.cwd(), 'scripts', '1kd.js');
const LOCAL_ARKV_ROOT = path.join(process.cwd(), 'arkv.md');
const LOCAL_ARKV_SYS = path.join(process.cwd(), '.arklum_sys', 'arkv.md');
const MARKER = '[=/?/=]';

function runArk(args, timeoutMs) {
  const ms = timeoutMs || 180000;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [ARK_CLI].concat(args, ['--json']), {
      cwd: process.cwd(),
      timeout: ms,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || err.message).slice(0, 1000)));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error('Invalid updater response: ' + stdout.slice(0, 300)));
      }
    });
  });
}

// --- arkv.md parsing and diffing ---

function parseArkvGroups(text, stopAtMarker) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const groups = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === MARKER) {
      if (stopAtMarker) break;
      continue;
    }
    const m = t.match(/^\[#\s*(.+?)\s*\]$/);
    if (m) {
      cur = { title: m[1], lines: [] };
      groups.push(cur);
      continue;
    }
    if (t && cur) cur.lines.push(t.replace(/^-\s*/, ''));
  }
  return groups;
}

function readLocalArkv() {
  try {
    if (fs.existsSync(LOCAL_ARKV_SYS)) return fs.readFileSync(LOCAL_ARKV_SYS, 'utf8');
    if (fs.existsSync(LOCAL_ARKV_ROOT)) return fs.readFileSync(LOCAL_ARKV_ROOT, 'utf8');
  } catch (e) {}
  return '';
}

async function fetchRemoteArkv(src) {
  try {
    const url = `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${src.branch}/arkv.md`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Arklum-Updater' } });
    if (res.ok) return await res.text();
  } catch (e) {}
  return null;
}

function diffArkvNotes(remoteText, localText) {
  if (!remoteText) return [];
  
  const lines = String(remoteText).split(/\r?\n/);
  let markerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === MARKER) { markerIdx = i; break; }
  }
  
  if (markerIdx !== -1) {
    // Explicit notes below marker
    return parseArkvGroups(lines.slice(markerIdx + 1).join('\n'), false);
  }
  
  // Fallback: diff groups between remote and local
  const lmap = {};
  parseArkvGroups(localText, false).forEach(g => { lmap[g.title] = g.lines.join('\n'); });
  return parseArkvGroups(remoteText, false).filter(g => {
    return !(g.title in lmap) || lmap[g.title] !== g.lines.join('\n');
  });
}

// --- socket commands ---

registerCommand('check_for_update')(async (params, { socket }) => {
  try {
    const r = await runArk(['check'], 30000);
    if (!r.ok) {
      socket.emit('update_error', { message: r.error || 'Update check failed' });
      return;
    }
    if (r.updateAvailable) {
      logger.info('[UPDATER] update available v' + r.current + ' → v' + r.latest);
      
      // Fetch and parse arkv.md notes
      let notes = [];
      try {
        const remoteArkv = await fetchRemoteArkv(r.source);
        const localArkv = readLocalArkv();
        notes = diffArkvNotes(remoteArkv, localArkv);
      } catch (e) {
        logger.warn('[UPDATER] failed to parse arkv notes: ' + e.message);
      }

      socket.emit('update_available', {
        current: r.current,
        latest: r.latest,
        zip_url: '',
        commitMsg: r.commitMsg || '',
        notes: notes, // Array of { title, lines }
        fallbackNote: r.commitMsg || 'Update available. You can dismiss this and update later.'
      });
    } else {
      socket.emit('update_not_available', { message: 'Up to date (v' + r.current + ').' });
    }
  } catch (e) {
    logger.error('[UPDATER] check failed: ' + e.message);
    socket.emit('update_error', { message: e.message });
  }
});

registerCommand('perform_update')(async (params, { socket }) => {
  try {
    socket.emit('update_progress', { step: 'Cloning latest repo...', percent: 15 });
    const r = await runArk(['update'], 240000);
    if (!r.ok) {
      socket.emit('update_error', { message: r.error || 'Update failed' });
      return;
    }
    if (!r.changed) {
      socket.emit('update_complete', { message: r.message || 'Already up to date.' });
      return;
    }
    logger.info('[UPDATER] installed ' + r.written + ' files: ' + (r.installed || []).join(', '));
    socket.emit('update_complete', { message: 'Update installed (' + r.written + ' files). Backup saved. Please restart.' });
  } catch (e) {
    logger.error('[UPDATER] update failed: ' + e.message);
    socket.emit('update_error', { message: e.message });
  }
});

registerCommand('repair_update')(async (params, { socket }) => {
  try {
    socket.emit('update_progress', { step: 'Repairing from repo...', percent: 10 });
    const r = await runArk(['repair'], 240000);
    if (!r.ok) {
      socket.emit('update_error', { message: r.error || 'Repair failed' });
      return;
    }
    socket.emit('update_complete', { message: 'Repair complete (' + r.written + ' files). Please restart.' });
  } catch (e) {
    logger.error('[UPDATER] repair failed: ' + e.message);
    socket.emit('update_error', { message: e.message });
  }
});

registerCommand('rollback_update')(async (params, { socket }) => {
  try {
    socket.emit('update_progress', { step: 'Rolling back...', percent: 25 });
    const r = await runArk(['rollback'], 120000);
    if (!r.ok) {
      socket.emit('update_error', { message: r.error || 'Rollback failed' });
      return;
    }
    socket.emit('update_complete', { message: 'Rollback complete. Restored ' + r.restored + ' files. Please restart.' });
  } catch (e) {
    logger.error('[UPDATER] rollback failed: ' + e.message);
    socket.emit('update_error', { message: e.message });
  }
});