// HTTP + Socket.IO server. Serves the built client under BASE_PATH and hosts
// game rooms in memory.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { ClientToServer, ServerToClient } from '../shared/types';
import { Game, GameError } from './game';

const PORT = Number(process.env.PORT ?? 3100);
const HOST = process.env.HOST ?? '127.0.0.1';
const BASE = (process.env.BASE_PATH ?? '/landlordgame').replace(/\/$/, '');
const ROOM_IDLE_MS = 60 * 60 * 1000;

const here = path.dirname(fileURLToPath(import.meta.url));
// Built layout: dist/server.mjs + dist/client/. In dev (tsx) the client is served by Vite instead.
const clientDir = path.resolve(here, 'client');
const hasClient = fs.existsSync(path.join(clientDir, 'index.html'));

const app = express();
app.disable('x-powered-by');
app.get(`${BASE}/healthz`, (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.use((req, res, next) => (req.path === BASE ? res.redirect(301, `${BASE}/`) : next()));
if (hasClient) {
  app.use(
    `${BASE}/assets`,
    express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '30d', fallthrough: false }),
  );
  app.use(BASE, express.static(clientDir, { index: false }));
  app.get(`${BASE}/*`, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server<ClientToServer, ServerToClient>(server, {
  path: `${BASE}/socket.io`,
  serveClient: false,
});

interface Room {
  game: Game;
  emptySince: number | null;
}
const rooms = new Map<string, Room>();
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, { roomId?: string; playerId?: string }>;

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRoomId(): string {
  for (;;) {
    let id = '';
    for (let i = 0; i < 5; i++) id += ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)];
    if (!rooms.has(id)) return id;
  }
}

const broadcast = (room: Room) => {
  room.game.state.serverNow = Date.now();
  io.to(room.game.state.roomId).emit('state', room.game.state);
};

/** Count sockets still attached to a player (one person may have two tabs open). */
async function socketsFor(roomId: string, playerId: string) {
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.filter((s) => s.data.playerId === playerId).length;
}

function attach(socket: Sock, room: Room, playerId: string | undefined) {
  const roomId = room.game.state.roomId;
  socket.data.roomId = roomId;
  socket.data.playerId = playerId;
  socket.join(roomId);
  if (playerId) room.game.setConnected(playerId, true);
  room.emptySince = null;
  broadcast(room);
}

io.on('connection', (socket: Sock) => {
  const errorText = (e: unknown) => (e instanceof GameError ? e.message : 'Something went wrong');

  socket.on('create', (p, ack) => {
    if (typeof ack !== 'function') return;
    if (socket.data.playerId) return ack({ ok: false, error: 'Already in a room' });
    if (socket.data.roomId) socket.leave(socket.data.roomId);
    if (rooms.size > 500) return ack({ ok: false, error: 'The server is busy, try again later' });
    const roomId = newRoomId();
    const room: Room = { game: new Game(roomId), emptySince: null };
    rooms.set(roomId, room);
    const { playerId, token } = room.game.addPlayer(p?.name);
    attach(socket, room, playerId);
    ack({ ok: true, roomId, playerId, token });
  });

  socket.on('join', (p, ack) => {
    if (typeof ack !== 'function') return;
    const roomId = String(p?.roomId ?? '').toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return ack({ ok: false, error: 'That room does not exist (it may have expired)' });
    const existing = room.game.playerForToken(p?.token);
    if (socket.data.playerId) {
      if (socket.data.roomId === roomId && socket.data.playerId === existing) {
        socket.emit('state', room.game.state);
        return ack({ ok: true, roomId, playerId: existing, token: p.token });
      }
      return ack({ ok: false, error: 'Already in another room' });
    }
    if (socket.data.roomId) socket.leave(socket.data.roomId); // spectator picking a seat
    if (existing) {
      attach(socket, room, existing);
      return ack({ ok: true, roomId, playerId: existing, token: p.token });
    }
    if (room.game.state.phase !== 'lobby' || !p?.name) {
      // Watch a running game (or a lobby before choosing a name).
      attach(socket, room, undefined);
      return ack({ ok: true, roomId, spectator: true });
    }
    try {
      const { playerId, token } = room.game.addPlayer(p.name);
      attach(socket, room, playerId);
      ack({ ok: true, roomId, playerId, token });
    } catch (e) {
      ack({ ok: false, error: errorText(e) });
    }
  });

  socket.on('action', async (a, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const room = socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
    if (!room || !socket.data.playerId) return reply({ ok: false, error: 'You are only watching this game' });
    try {
      const result = room.game.handle(socket.data.playerId, a);
      if (result.kicked && room.game.state.phase === 'lobby') {
        for (const s of await io.in(room.game.state.roomId).fetchSockets()) {
          if (s.data.playerId === result.kicked) {
            s.emit('kicked');
            s.data.playerId = undefined;
          }
        }
      }
      reply({ ok: true });
    } catch (e) {
      if (!(e instanceof GameError)) console.error('action failed', a, e);
      reply({ ok: false, error: errorText(e) });
    }
    broadcast(room);
  });

  socket.on('chat', (text) => {
    const room = socket.data.roomId ? rooms.get(socket.data.roomId) : undefined;
    if (!room || typeof text !== 'string') return;
    room.game.chat(socket.data.playerId ?? null, text);
    broadcast(room);
  });

  socket.on('disconnect', async () => {
    const { roomId, playerId } = socket.data;
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room || !roomId) return;
    if (playerId && (await socketsFor(roomId, playerId)) === 0) room.game.setConnected(playerId, false);
    if ((await io.in(roomId).fetchSockets()).length === 0) room.emptySince = Date.now();
    broadcast(room);
  });
});

// Game clock: auctions, AFK turns, host handover, and cleanup of idle rooms.
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.emptySince && now - room.emptySince > ROOM_IDLE_MS) {
      rooms.delete(id);
      continue;
    }
    try {
      if (room.game.tick()) broadcast(room);
    } catch (e) {
      console.error('tick failed', id, e);
    }
  }
}, 500);

server.listen(PORT, HOST, () => {
  console.log(`Landlord server listening on http://${HOST}:${PORT}${BASE}/ ${hasClient ? '' : '(API only; run Vite for the client)'}`);
});
