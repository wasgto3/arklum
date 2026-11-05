(function () {
  var S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  window.ArkIcons = {
    mic: '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M6.5 11a5.5 5.5 0 0 0 11 0"/><path d="M12 16.5V21"/><path d="M9 21h6"/>',
    'mic-off': '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path d="M6.5 11a5.5 5.5 0 0 0 11 0"/><path d="M12 16.5V21"/><path d="M4 4l16 16"/>',
    chat: '<path d="M21 11.5a8 8 0 0 1-8.5 8L4 21l1.6-3.6A8 8 0 1 1 21 11.5z"/>',
    leave: '<path d="M4 14c4.5-4.5 11.5-4.5 16 0"/><path d="M4 14l-1.5 3.5L6 19"/><path d="M20 14l1.5 3.5L18 19"/>',
    react: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v4"/>',
    edit: '<path d="M4 20l4.5-1L20 7.5l-3.5-3.5L5 15.5 4 20z"/><path d="M13.5 6l3.5 3.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="M4 12l16-8-6.5 16-2.5-6.5L4 12z"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    hash: '<path d="M9 4L7 20M17 4l-2 16M4 9h17M3 15h17"/>',
    down: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
    book: '<path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2V4z"/><path d="M9 2v18"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
    warn: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    play: '<path d="M8 5l11 7-11 7V5z"/>',
    file: '<path d="M6 2h8l4 4v16H6V2z"/><path d="M14 2v4h4"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    ban: '<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    plug: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'
  };
  window.arkIcon = function (name, size, cls) {
    var body = window.ArkIcons[name] || '';
    return '<svg class="' + (cls || 'ark-ic') + '" width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" ' + S + ' aria-hidden="true">' + body + '</svg>';
  };
})();