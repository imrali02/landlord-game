import { BASE } from '../socket';
import { useRoom } from '../useRoom';
import { GameView } from './GameView';
import { Lobby } from './Lobby';

export function RoomPage({ roomId }: { roomId: string }) {
  const room = useRoom(roomId);
  const { state, error, connected } = room;

  if (error && !state) {
    return (
      <main className="center-screen">
        <div className="home-card">
          <h2>Can't open room {roomId}</h2>
          <p className="muted">{error}</p>
          <a className="btn btn-primary" href={BASE}>
            Back to home
          </a>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="center-screen">
        <div className="spinner" aria-label="Loading" />
        <p className="muted">{connected ? 'Joining room…' : 'Connecting to the server…'}</p>
      </main>
    );
  }

  return (
    <>
      {!connected && <div className="offline-banner">Connection lost — reconnecting…</div>}
      {state.phase === 'lobby' ? <Lobby room={room} state={state} /> : <GameView room={room} state={state} />}
    </>
  );
}
