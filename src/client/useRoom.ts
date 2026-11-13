import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, GameState } from '../shared/types';
import { joinRoom, sendAction, socket, storage } from './socket';
import { useToast } from './toast';

/** Server time minus local time; used for auction countdowns. */
export const clock = { offset: 0, now: () => Date.now() + clock.offset };

export interface RoomHandle {
  state: GameState | null;
  playerId: string | null;
  connected: boolean;
  error: string | null;
  /** Take a seat (lobby only) when you arrived without one. */
  takeSeat: (name: string) => Promise<void>;
  act: (a: Action) => Promise<boolean>;
}

export function useRoom(roomId: string): RoomHandle {
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const nameRef = useRef('');

  const join = useCallback(
    async (name: string) => {
      const token = storage.token(roomId);
      const r = await joinRoom(roomId, token ? storage.name() : name, token);
      if (!r.ok) {
        // A stale token (server restarted) – fall back to watching / choosing a seat.
        if (token) {
          storage.clearToken(roomId);
          return join(name);
        }
        setError(r.error ?? 'Could not join');
        return;
      }
      setError(null);
      if (r.playerId && r.token) {
        storage.setToken(roomId, r.token);
        setPlayerId(r.playerId);
      } else setPlayerId(null);
    },
    [roomId],
  );

  useEffect(() => {
    const onState = (s: GameState) => {
      if (s.roomId !== roomId) return;
      clock.offset = s.serverNow - Date.now();
      setState(s);
    };
    const onConnect = () => {
      setConnected(true);
      join(nameRef.current);
    };
    const onDisconnect = () => setConnected(false);
    const onKicked = () => {
      storage.clearToken(roomId);
      setPlayerId(null);
      toast('The host removed you from this room');
    };
    socket.on('state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('kicked', onKicked);
    if (socket.connected) onConnect();
    return () => {
      socket.off('state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('kicked', onKicked);
    };
  }, [roomId, join, toast]);

  const takeSeat = useCallback(
    async (name: string) => {
      nameRef.current = name;
      storage.setName(name);
      await join(name);
    },
    [join],
  );

  const act = useCallback(
    async (a: Action) => {
      const r = await sendAction(a);
      if (!r.ok) toast(r.error ?? 'That did not work');
      return r.ok;
    },
    [toast],
  );

  return { state, playerId, connected, error, takeSeat, act };
}
