# Dabba

A private, invite-only messenger for a small circle of friends.

- **mobile/** — the app (Expo SDK 54 / React Native, expo-router). Runs on Android, iOS and the web.
- **web/** — the backend (Next.js API routes on Neon Postgres), live at **https://dabba.appgen.co**.

## Features
Invite-only sign-up · username or email login · password + username recovery via security question ·
friends by exact username (no public directory) · 1:1, group and "message yourself" chats ·
text, photos and voice notes (with 1x/1.5x/2x playback) · replies, edits, reactions, stars, pins,
forwarding, delete for me / everyone · read receipts and typing indicators · disappearing messages ·
search, favourites, archive, mute, wallpapers, export chat · 1:1 voice calls (WebRTC) with call history ·
app PIN + separate per-chat codes with fingerprint unlock · security screen and hide-previews setting.

## Security
HTTPS everywhere, scrypt-hashed passwords and security answers, rate limiting and lockouts on login and
recovery, no account enumeration on recovery, uploads identified by file signature (SVG/HTML rejected),
security headers, sliding 180-day sessions, 8-character minimum passwords, invite code kept server-side.
**Not end-to-end encrypted** — the server can read messages; the app says so in Settings › Security.

## Build an Android APK
```bash
cd mobile
npm install
npx eas-cli login                 # or set EXPO_TOKEN
npx eas-cli build -p android --profile preview
```
The finished build page on expo.dev has an **Install** button / QR code for the APK.
The `preview` profile in `eas.json` points the app at `https://dabba.appgen.co`.

## Run locally
```bash
cd web && npm install && cp .env.example .env   # fill in DATABASE_URL, INVITE_CODE, SERVER_SECRET
npm run dev                                       # API on http://localhost:3000
cd ../mobile && npm install && npx expo start --web
```

## Source backup
Besides GitHub, every release is also saved as a `.tar.gz` in the database table `app_source_backups`
(`SELECT encode(data, 'base64') FROM app_source_backups ORDER BY id DESC LIMIT 1;` → base64-decode → `tar xzf`).
