# Arklum v1.0.0

[# FEATURES]
- Complete Discord client in the browser: servers, channels, messages, voice, members.
- Voice chat bridging real Discord calls with bidirectional PCM streaming.
- Direct messages with local history, unread tracking, and contact management.
- Standalone chat-site link for any server, shareable with others.
- Media done right: lightbox, player, code viewer, and pure-JS zip browser.
- Custom appearance: dark/light themes, custom fonts, bubble or compact chat.
- Updates that explain themselves in plain words via `arkv.md` grouping, with one-tap rollback.
- Local-first data: history, cache, and secrets never leave the machine.

[# CHAT]
- Sidebar with categories, text channels, voice channels (JOIN button), and threads nested under parents.
- Member list with online/idle/dnd dots and prefix search.
- Messages group by author, show date dividers, a NEW divider at last-read, and hover timestamps.
- Full Discord markdown: bold, italic, underline, strike, headings, quotes, lists, spoilers, inline code, and fenced code blocks with copy button.
- Mentions are colored and tappable: people, roles, and #channels.
- Replies: tap reply for a preview bar, or swipe right on touch screens.
- Edit and delete own messages; copy any message's text or ID.
- Embeds render with title, description, fields grid, images, and footer.
- Pasted invites become resolved cards with server icon, member count, and Join button.
- Typing indicators both ways: see who is typing, they see you.
- Search filters the channel locally, jumps match to match, and highlights hits.
- Jump-to-present pill with an unseen counter appears when scrolling up.
- Autocomplete while typing for @people, #channels, :emoji:, and /commands.
- Composer grows with text, sends with Enter (Shift+Enter for newline), and compresses images before upload.
- Slash commands: /shrug, /tableflip, /unflip, /me, /tts, /clear, /jump, /search, /theme, /font, /bubble, /vm, /copylast, /ping, /help.

[# VOICE]
- Join any voice channel from the sidebar; call card shows channel name, live timer, and participant avatars.
- Hear everyone in the Discord call in real time and speak back with your microphone.
- Controls: mute mic, deafen (stop hearing), open channel chat, and red leave button.
- Participants panel lists everyone in the call with their mute state and speaking indicators.
- Desktop overlay anchors to the sidebar; mobile overlay floats and is draggable.
- Voicemail: record from mic button, preview, then send as voice message or TTS.
- Mute state syncs to Discord so others see you exactly as you are.
- Audio pipeline: 48kHz PCM, opusscript engine, DAVE encryption support.

[# EMOJI & REACTIONS]
- Emoji picker holding custom emoji from every server the bot sits in, plus full unicode sets.
- Custom emoji appear as real images inside the message box while typing (mirror technique).
- Type :name to get emoji suggestions; pick one to insert it.
- React with any custom or unicode emoji from any message.
- Reaction chips show counts; tap to toggle; long-press to see everyone who reacted and remove reactions.

[# DIRECT MESSAGES]
- DM list with avatars, last-message previews, and unread badges.
- Find anyone by name or ID and open the conversation instantly.
- Full history kept locally in `.arklum_sys/dm_history/`.
- Mark as read or remove contacts at will.
- Mobile: two-pane list/chat with back button; Desktop: side-by-side layout.

[# THREADS]
- Start threads from any message or channel.
- Thread banner shows name, parent channel, archived/locked state, and View-parent button.
- Sidebar shows thread rows indented under parent channels.

[# MEDIA & FILES]
- Images open in a full-screen lightbox with navigation, captions, and thumbnail strip.
- Video and audio play in a built-in player with seek bar, timer, and visualizer; autoplay optional.
- Files show as cards with size, one-tap download, and an eye button for line-numbered, syntax-colored code viewing.
- Zips open without downloading: pure-JS parse, tree browser, preview text/images inside, extract to cache.
- Split archives (part1of2, part2of2…) are combined automatically via SHA1-keyed cache.
- Uploads are compressed automatically (ffmpeg scale 1280:720, crf 28) to fit Discord limits.

[# PROFILES & MEMBERS]
- Tap any avatar or name for a full profile card with SERVER and GLOBAL tabs.
- Shows banner, avatar decoration, status dot, badges, Nitro tag, bio, role chips, join/boost dates, and timeout state.
- Actions: message, mention, copy ID, view avatar full-size in lightbox.
- Tap a role mention to see a sheet of every member holding that role.

[# UI & APPEARANCE]
- Dark and light themes, plus custom font uploads (.ttf) served via CSS variables.
- Chat styles: bubble messages, compact spacing, 24-hour timestamps, media autoplay, reduce motion.
- Font size adjustable from 12 to 20 via settings or /font.
- Glassmorphism design system with CSS variables (--bg-card, --glass-border, --blur, etc.).
- Shell navigation: Home, Bookmarks, Search, Plugins, DMs, More.
- Touch conventions: long-press for popups, swipe-right reply, visualViewport handling for keyboard rise.

[# STANDALONE & WEBHOOKS]
- Standalone chat site (chatsite.html) bound per configured guild for public sharing.
- Webhooks Studio page for creating and managing Discord webhooks without leaving Arklum.

[# API & SYSTEM]
- Socket.io gateway with session/ticket auth guard.
- `registerCommand` registry for remote commands invoked via `run_command` events.
- Supervision chain: `npm start` runs `ensure-deps.js` then `supervise.js` (restarts only on exit code 42).
- 1kd updater: depth-1 clone from feed repo, atomic overlay, backup manifest, one-step rollback.
- `arkv.md` grouping system: `[# SECTION]` headers act as the update diff surface for Settings -> Arklum.

[# SECURITY & PRIVACY]
- All IDs validated as snowflakes; message content validated before send/edit.
- URL fetches restricted to Discord cdn/media hosts with 10s timeout.
- Rate limiting per socket for send, fetch, edit, delete, profile, and reactions.
- Secrets (tokens.enc, key.bin) and local state (.arklum_sys) never enter the repo or update feed.
- Mic requires secure context (https/localhost); voice join enforces Discord Connect/Speak permissions.