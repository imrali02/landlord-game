# Landlord

An online multiplayer property-trading board game, served at **https://haidery.dev/landlordgame/**.

- 2–8 players, rooms joined by link or 5-character code, no accounts
- Buy cities, auctions, houses & hotels, mortgages, player-to-player trades, prison, Surprise/Treasure cards, vacation pot
- Host-configurable house rules in the lobby
- Refreshing or reconnecting puts you back in your seat; an absent player's turn is auto-played after 30s so the game keeps moving

## Stack

| Part | Tech |
| --- | --- |
| Client | React 18 + TypeScript, built with Vite |
| Server | Node 20+, Express, Socket.IO (authoritative game engine) |
| Shared | Plain TypeScript used by both sides (board data, types, rules) |

The server owns all game state. Clients send intents (`roll`, `buy`, `bid`, …) and render the state the server broadcasts after every change.

## Layout

```
src/shared/board.ts    ← board tiles, countries, prices, rents, default settings (edit this to change the map)
src/shared/types.ts    ← GameState / Action types shared by client and server
src/shared/rules.ts    ← rent and "can I build/mortgage/trade?" rules (used by both sides)
src/server/game.ts     ← the game engine (turns, movement, money, auctions, trades, bankruptcy)
src/server/cards.ts    ← Surprise and Treasure card texts and effects
src/server/index.ts    ← HTTP + Socket.IO server and room management
src/server/simulate.ts ← plays hundreds of random games to check the engine (`npm test`)
src/client/            ← React UI (components/, styles.css)
deploy/                ← systemd unit, nginx snippet, deploy script
```

## Develop

```bash
npm install
npm run dev        # server on :3100, Vite on http://localhost:5173/landlordgame/
npm test           # engine simulation
npm run build      # type-check + build client and server into dist/
```

To test multiplayer on one machine, open the game at `localhost` in one tab and at `127.0.0.1` in another (separate storage means separate seats).

## Common changes

- **Rename cities or change prices/rents:** edit `BOARD` in `src/shared/board.ts`.
- **Add/replace a country:** add it to `CountryId` in `types.ts`, `COUNTRIES` in `board.ts`, and a flag in `src/client/components/Flag.tsx`.
- **New card:** add an entry to `SURPRISE` or `TREASURE` in `src/server/cards.ts` using the `CardApi` helpers.
- **New house rule:** add a field to `Settings` (`types.ts`) and `DEFAULT_SETTINGS` (`board.ts`), honour it in `game.ts`/`rules.ts`, and add a toggle in `Lobby.tsx`.
- **New player action:** add it to the `Action` union, handle it in `Game.handle`, and call `act({ type: ... })` from the UI.

## Deploy

```bash
bash deploy/deploy.sh
```

This builds locally, uploads to the VM, installs into `/opt/landlordgame`, and restarts the `landlordgame` systemd service. The service listens on `127.0.0.1:3100` and runs as the unprivileged `landlord` user. On first run the script also adds the `/landlordgame/` proxy block from `deploy/nginx-landlordgame.conf` to `/etc/nginx/sites-available/haidery.dev`. It backs up that file first and reloads nginx only if `nginx -t` passes.

Server-side commands:

```bash
systemctl status landlordgame
journalctl -u landlordgame -f
```

Games live in memory, so restarting the service ends games in progress.
