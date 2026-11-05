(function () {
  var dialogRoot = null;
  var dialogResolver = null;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  function adjustColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var amt = Math.round(2.55 * percent);
    var r = Math.max(0, Math.min(255, (num >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
    var b = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function snowflakeDate(id) {
    try {
      var ms = Number((BigInt(id) >> BigInt(22)) + BigInt(1420070400000));
      return new Date(ms);
    } catch (e) {
      return null;
    }
  }
  function getFileBase64(fileInput) {
    return new Promise(function (resolve) {
      var file = fileInput.files ? fileInput.files[0] : null;
      if (!file) return resolve(null);
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result.split(',')[1]); };
      reader.onerror = function () { resolve(null); };
      reader.readAsDataURL(file);
    });
  }
  function previewFile(input, imgId) {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = document.getElementById(imgId);
      if (img) {
        img.src = e.target.result;
        img.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function ensureDialog() {
    if (dialogRoot) return dialogRoot;
    dialogRoot = document.createElement('div');
    dialogRoot.className = 'modal';
    dialogRoot.innerHTML = '<div class="modal-card"><h3 id="ark-dialog-title"></h3><input id="ark-dialog-input" style="display:none"><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="secondary-btn" id="ark-dialog-no">Cancel</button><button class="primary-btn" id="ark-dialog-yes">OK</button></div></div>';
    document.body.appendChild(dialogRoot);
    dialogRoot.querySelector('#ark-dialog-yes').addEventListener('click', function () {
      closeDialog(true);
    });
    dialogRoot.querySelector('#ark-dialog-no').addEventListener('click', function () {
      closeDialog(false);
    });
    dialogRoot.addEventListener('click', function (e) {
      if (e.target === dialogRoot) closeDialog(false);
    });
    dialogRoot.querySelector('#ark-dialog-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') closeDialog(true);
    });
    return dialogRoot;
  }
  function closeDialog(ok) {
    dialogRoot.classList.remove('show');
    var resolver = dialogResolver;
    dialogResolver = null;
    if (resolver) resolver(ok);
  }
  function openDialog(message, isPrompt, value) {
    var root = ensureDialog();
    root.querySelector('#ark-dialog-title').textContent = message;
    var input = root.querySelector('#ark-dialog-input');
    input.style.display = isPrompt ? 'block' : 'none';
    input.value = isPrompt ? (value || '') : '';
    root.classList.add('show');
    if (isPrompt) setTimeout(function () { input.focus(); }, 50);
    return new Promise(function (resolve) {
      dialogResolver = function (ok) {
        if (!isPrompt) resolve(ok);
        else resolve(ok ? input.value : null);
      };
    });
  }
  function customConfirm(message) {
    return openDialog(message, false, '');
  }
  function customPrompt(message, value) {
    return openDialog(message, true, value);
  }
  window.esc = esc;
  window.formatFileSize = formatFileSize;
  window.adjustColor = adjustColor;
  window.snowflakeDate = snowflakeDate;
  window.getFileBase64 = getFileBase64;
  window.previewFile = previewFile;
  window.copyToClipboard = copyToClipboard;
  window.customConfirm = customConfirm;
  window.customPrompt = customPrompt;
})();