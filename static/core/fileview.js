(function () {
  var TEXT_EXT = { js: 'js', mjs: 'js', ts: 'js', jsx: 'js', tsx: 'js', py: 'py', css: 'css', html: 'html', htm: 'html', xml: 'html', svg: 'html', json: 'json', md: 'md', markdown: 'md', sh: 'sh', bash: 'sh', zsh: 'sh', yml: 'sh', yaml: 'sh', txt: 'txt', log: 'txt', csv: 'txt', ini: 'txt', toml: 'txt', conf: 'txt', cfg: 'txt', env: 'txt', gitignore: 'txt', sql: 'txt', java: 'js', c: 'js', cpp: 'js', h: 'js', cs: 'js', go: 'js', rs: 'js', php: 'js', rb: 'js', kt: 'js', swift: 'js', lua: 'sh', bat: 'sh', ps1: 'sh' };
  var BINARY_EXT = { zip: 1, rar: 1, '7z': 1, tar: 1, gz: 1, exe: 1, apk: 1, bin: 1, so: 1, dll: 1, png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, mp4: 1, webm: 1, mov: 1, mkv: 1, mp3: 1, wav: 1, ogg: 1, flac: 1, aac: 1, m4a: 1, pdf: 1, doc: 1, docx: 1, xls: 1, xlsx: 1, ppt: 1, pptx: 1, ttf: 1, otf: 1, woff: 1, woff2: 1 };
  function escH(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var RULES = {
    js: [
      [/\/\/[^\n]*|\/\*[\s\S]*?\*\//, 'c'],
      [/(?:`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/, 's'],
      [/\b(?:const|let|var|function|return|if|else|for|while|do|class|new|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|switch|case|break|continue|delete|in|of|this|super|extends|yield|static|null|undefined|true|false)\b/, 'k'],
      [/\b\d+(?:\.\d+)?\b/, 'n'],
      [/[A-Za-z_$][\w$]*(?=\s*\()/, 'f']
    ],
    py: [
      [/#[^\n]*/, 'c'],
      [/(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/, 's'],
      [/@[A-Za-z_][\w.]*/, 'f'],
      [/\b(?:def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|lambda|pass|break|continue|global|nonlocal|yield|assert|raise|and|or|not|in|is|async|await|True|False|None)\b/, 'k'],
      [/\b\d+(?:\.\d+)?\b/, 'n'],
      [/[A-Za-z_][\w]*(?=\s*\()/, 'f']
    ],
    css: [
      [/\/\*[\s\S]*?\*\//, 'c'],
      [/"[^"\n]*"|'[^'\n]*'/, 's'],
      [/@[a-z-]+/, 'k'],
      [/[#.]?[A-Za-z_-][\w-]*(?=\s*\{)/, 'f'],
      [/[a-z-]+(?=\s*:)/, 'p'],
      [/#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?\b/, 'n']
    ],
    html: [
      [/&lt;!--[\s\S]*?--&gt;/, 'c'],
      [/"[^"]*"|'[^']*'/, 's'],
      [/&lt;\/?[A-Za-z][\w:-]*/, 't'],
      [/[A-Za-z-]+(?==)/, 'p'],
      [/\/?&gt;/, 't']
    ],
    json: [
      [/"(?:\\.|[^"\\])*"(?=\s*:)/, 'p'],
      [/"(?:\\.|[^"\\])*"/, 's'],
      [/\b(?:true|false|null)\b/, 'k'],
      [/-?\b\d+(?:\.\d+)?\b/, 'n']
    ],
    md: [
      [/^#{1,6}[^\n]*/m, 'k'],
      [/\*\*[^*\n]+\*\*|__[^_\n]+__/, 'f'],
      [/`[^`\n]+`/, 's'],
      [/\[[^\]\n]*\]\([^)\n]*\)/, 'p']
    ],
    sh: [
      [/#[^\n]*/, 'c'],
      [/"[^"\n]*"|'[^'\n]*'/, 's'],
      [/\$\{?[A-Za-z_][\w]*\}?/, 'n'],
      [/\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|echo|cd|export|source|npm|node|python|pip|git|curl|sudo)\b/, 'k']
    ]
  };
  function highlight(code, lang) {
    var rules = RULES[lang];
    var src = escH(code);
    if (!rules) return src;
    var combined = rules.map(function (r) { return '(' + r[0].source + ')'; }).join('|');
    var re = new RegExp(combined, 'gm');
    return src.replace(re, function () {
      var args = arguments;
      for (var i = 0; i < rules.length; i++) {
        if (args[i + 1] !== undefined) return '<span class="tk-' + rules[i][1] + '">' + args[0] + '</span>';
      }
      return args[0];
    });
  }
  var ov = null;
  function build() {
    if (ov) return;
    ov = document.createElement('div');
    ov.id = 'fv-overlay';
    ov.innerHTML = '<div class="fv-top"><span id="fv-name" class="fv-name"></span><span id="fv-lang" class="fv-lang"></span><div class="fv-btns"><button id="fv-wrap" class="lb-btn" type="button">⇤</button><button id="fv-copy" class="lb-btn" type="button">⧉</button><button id="fv-dl" class="lb-btn" type="button">⤓</button><button id="fv-close" class="lb-btn" type="button">✕</button></div></div><div id="fv-status" class="fv-status">Loading…</div><div class="fv-body"><div class="fv-inner"><div id="fv-gutter" class="fv-gutter"></div><pre id="fv-code" class="fv-code"></pre></div></div>';
    document.body.appendChild(ov);
    document.getElementById('fv-close').onclick = function () { ov.classList.remove('open'); };
    document.getElementById('fv-wrap').onclick = function () { document.getElementById('fv-code').classList.toggle('wrap'); };
    document.getElementById('fv-copy').onclick = function () { if (ov._raw && window.copyToClipboard) copyToClipboard(ov._raw); };
    document.getElementById('fv-dl').onclick = function () {
      if (!ov._url) return;
      var a = document.createElement('a');
      a.href = ov._url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = ov._name || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    Session.socket.on('file_content', function (d) {
      if (!ov.classList.contains('open') || !ov._pending || !d || d.url !== ov._pending) return;
      ov._pending = null;
      ov._raw = d.content;
      var lang = ov._lang;
      var lines = d.content.split('\n');
      document.getElementById('fv-code').innerHTML = highlight(d.content, lang);
      document.getElementById('fv-gutter').innerHTML = lines.map(function (_, i) { return '<span>' + (i + 1) + '</span>'; }).join('');
      document.getElementById('fv-status').textContent = lines.length + ' lines · ' + lang.toUpperCase();
    });
  }
  function extOf(name) { return ((name || '').split('.').pop() || '').toLowerCase(); }
  window.openFileView = function (url, name) {
    build();
    ov._url = url;
    ov._name = name;
    ov._raw = null;
    var ext = extOf(name);
    var lang = TEXT_EXT[ext] || null;
    if (!lang && !BINARY_EXT[ext]) lang = 'txt';
    ov._lang = lang || 'txt';
    ov.classList.add('open');
    document.getElementById('fv-name').textContent = name || 'file';
    document.getElementById('fv-lang').textContent = lang ? lang : (ext || '?').toUpperCase();
    var code = document.getElementById('fv-code');
    var gut = document.getElementById('fv-gutter');
    var st = document.getElementById('fv-status');
    code.innerHTML = '';
    gut.innerHTML = '';
    if (!lang) {
      st.textContent = 'No text preview for this file type.';
      return;
    }
    st.textContent = 'Loading…';
    ov._pending = url;
    Session.socket.emit('run_command', { cmd: 'fetch_file_content', params: { url: url } });
    setTimeout(function () {
      if (ov._pending === url) {
        ov._pending = null;
        st.textContent = 'Preview failed or timed out.';
      }
    }, 10000);
  };
})();