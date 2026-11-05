# Arklum

Arklum is a self-hosted, highly customizable Discord bridge client. It provides a fast, glassmorphism-styled web dashboard and standalone chat sites that expose Discord servers, channels, voice calls, DMs, threads, reactions, and media through a unified, modern interface.

## Features
- **Full Chat Experience:** Custom markdown rendering, swipe-to-reply, message grouping, thread support, and autocomplete.
- **Voice Chat:** Bidirectional PCM streaming. Join Discord voice channels, hear participants, and speak back.
- **Direct Messages:** Local history persistence, unread tracking, and a dedicated two-pane mobile layout.
- **Media & Files:** Built-in lightbox, video/audio players, syntax-highlighted code viewer, and pure-JS zip browser.
- **Standalone Chat Sites:** Generate public, shareable chat links for any server.
- **Webhooks Studio:** Visual interface to create and manage Discord webhooks.
- **Customization:** Dark/Light/OLED themes, custom font uploads, and adjustable UI density.

## Requirements
- Node.js v18 or higher.
- npm v8.3 or higher.
- Git (required for the `1kd` updater).
- FFmpeg (required for media compression and voicemail transcoding).

## Installation
1. Clone the repository: `git clone https://github.com/wasgto3/arklum.git && cd arklum`
2. Install dependencies: `npm install`
3. Configure: Create a `.env` file and add `DISCORD_BOT_TOKEN=your_token_here`
4. Start: `npm start`

## Updating
- Check: `npm run upd`
- Update: `npm run update`
- Rollback: `npm run rollback`