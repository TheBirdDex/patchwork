# Patchwork v1 (local build)
- `npm install` then `npm start`, which serves http://localhost:8787 (set `PORT` to change it).
- `npm test` runs every test, including a real two-client network round on a server it starts itself.
- Layout: `shared/rules.js` holds the stats, names, stock creatures and battle, which are deterministic. `server/rooms.js` holds the room state and the hidden-half enforcement. `server/index.js` holds the HTTP and WebSocket server. `public/` holds the client.
- Timers are 60 s to draw, 2 min to rejoin and 30 min per room, and they live in `CONFIG` in `server/rooms.js`.
- Browser rounds (server running, not part of `npm test`): `BROWSER=firefox node scripts/browser-round-pw.mjs` (Playwright; run `npx playwright install firefox` once), or `node scripts/browser-round.mjs` for Chrome.
