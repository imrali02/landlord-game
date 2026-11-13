import { io, type Socket } from 'socket.io-client';
import type { Action, ActionResult, ClientToServer, JoinResult, ServerToClient } from '../shared/types';

/** '/landlordgame/' – set by `base` in vite.config.ts. */
export const BASE = import.meta.env.BASE_URL;

export const socket: Socket<ServerToClient, ClientToServer> = io({ path: `${BASE}socket.io` });

export const sendAction = (a: Action) =>
  new Promise<ActionResult>((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: 'Not connected to the server' });
    socket.timeout(8000).emit('action', a, (err: unknown, r: ActionResult) =>
      resolve(err ? { ok: false, error: 'The server did not respond' } : r),
    );
  });

export const createRoom = (name: string) =>
  new Promise<JoinResult>((resolve) => {
    socket.timeout(8000).emit('create', { name }, (err: unknown, r: JoinResult) =>
      resolve(err ? { ok: false, error: 'The server did not respond' } : r),
    );
  });

export const joinRoom = (roomId: string, name: string, token?: string) =>
  new Promise<JoinResult>((resolve) => {
    socket.timeout(8000).emit('join', { roomId, name, token }, (err: unknown, r: JoinResult) =>
      resolve(err ? { ok: false, error: 'The server did not respond' } : r),
    );
  });

// Per-room seat tokens live in localStorage so a refresh puts you back in your seat.
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
export const storage = {
  token: (roomId: string) => safe(() => localStorage.getItem(`ll:token:${roomId}`) ?? undefined, undefined),
  setToken: (roomId: string, token: string) => safe(() => localStorage.setItem(`ll:token:${roomId}`, token), undefined),
  clearToken: (roomId: string) => safe(() => localStorage.removeItem(`ll:token:${roomId}`), undefined),
  name: () => safe(() => localStorage.getItem('ll:name') ?? '', ''),
  setName: (n: string) => safe(() => localStorage.setItem('ll:name', n), undefined),
};

export const roomPath = (roomId: string) => `${BASE}r/${roomId}`;
export const roomUrl = (roomId: string) => `${location.origin}${roomPath(roomId)}`;
