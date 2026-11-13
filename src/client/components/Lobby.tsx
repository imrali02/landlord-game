import { useState, type FormEvent } from 'react';
import { PLAYER_COLORS } from '../../shared/board';
import type { GameState, Settings } from '../../shared/types';
import { money } from '../format';
import { BASE, roomUrl, storage } from '../socket';
import { useToast } from '../toast';
import type { RoomHandle } from '../useRoom';
import { Chat } from './Chat';

const TOGGLES: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'auctions', label: 'Auctions', hint: 'If the lander skips a property, everyone can bid on it' },
  { key: 'vacationCash', label: 'Vacation cash', hint: 'Taxes and fees build a pot; landing on Vacation wins it' },
  { key: 'doubleRentOnSet', label: 'Double rent on full country', hint: 'Owning every city in a country doubles its base rent' },
  { key: 'evenBuild', label: 'Even building', hint: 'Houses must be built and sold evenly across a country' },
  { key: 'noRentInPrison', label: 'No rent in prison', hint: 'Owners in prison cannot collect rent' },
  { key: 'randomOrder', label: 'Random turn order', hint: 'Shuffle who goes first when the game starts' },
];

export function Lobby({ room, state }: { room: RoomHandle; state: GameState }) {
  const { playerId, act, takeSeat } = room;
  const isHost = playerId === state.hostId;
  const me = state.players.find((p) => p.id === playerId);
  const [name, setName] = useState(storage.name());
  const toast = useToast();
  const s = state.settings;
  const full = state.players.length >= s.maxPlayers;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(state.roomId));
      toast('Invite link copied', 'info');
    } catch {
      toast(`Share this link: ${roomUrl(state.roomId)}`, 'info');
    }
  };

  const seat = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('Enter a name');
    takeSeat(name.trim());
  };

  const set = (patch: Partial<Settings>) => act({ type: 'updateSettings', settings: patch });

  return (
    <main className="lobby">
      <header className="lobby-head">
        <a href={BASE} className="brand small">
          <span className="brand-mark">🏠</span>
          <span>Landlord</span>
        </a>
        <div className="room-code">
          Room <strong>{state.roomId}</strong>
          <button className="btn btn-sm" onClick={copyLink}>
            Copy invite link
          </button>
        </div>
      </header>

      <div className="lobby-grid">
        <section className="panel">
          <h2>
            Players <span className="muted">{state.players.length}/{s.maxPlayers}</span>
          </h2>
          <ul className="lobby-players">
            {state.players.map((p) => (
              <li key={p.id}>
                <span className="token-dot" style={{ background: p.color }}>
                  {p.name[0]?.toUpperCase()}
                </span>
                <span className="grow">
                  {p.name}
                  {p.id === playerId && <span className="muted"> (you)</span>}
                </span>
                {p.id === state.hostId && <span className="badge">Host</span>}
                {!p.connected && <span className="badge badge-warn">Away</span>}
                {isHost && p.id !== playerId && (
                  <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'kick', playerId: p.id })}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>

          {me ? (
            <div className="color-pick">
              <span className="muted">Your color</span>
              <div className="swatches">
                {PLAYER_COLORS.map((c) => {
                  const taken = state.players.some((p) => p.color === c && p.id !== me.id);
                  return (
                    <button
                      key={c}
                      className={`swatch ${me.color === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      disabled={taken}
                      aria-label={`Color ${c}${taken ? ' (taken)' : ''}`}
                      onClick={() => act({ type: 'setColor', color: c })}
                    />
                  );
                })}
              </div>
            </div>
          ) : full ? (
            <p className="muted">This room is full. You can watch once the game starts.</p>
          ) : (
            <form className="row" onSubmit={seat}>
              <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
              <button className="btn btn-primary">Join game</button>
            </form>
          )}

          <div className="lobby-start">
            {isHost ? (
              <button
                className="btn btn-primary btn-lg"
                disabled={state.players.length < 2}
                onClick={() => act({ type: 'start' })}
              >
                {state.players.length < 2 ? 'Waiting for players…' : 'Start game'}
              </button>
            ) : (
              <p className="muted">Waiting for the host to start the game…</p>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Game settings</h2>
          {!isHost && <p className="muted small">Only the host can change these.</p>}
          <div className="settings">
            <label className="setting">
              <span>
                <strong>Max players</strong>
              </span>
              <select value={s.maxPlayers} disabled={!isHost} onChange={(e) => set({ maxPlayers: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting">
              <span>
                <strong>Starting cash</strong>
              </span>
              <select value={s.startingCash} disabled={!isHost} onChange={(e) => set({ startingCash: Number(e.target.value) })}>
                {[500, 1000, 1500, 2000, 2500, 3000, 5000].map((n) => (
                  <option key={n} value={n}>
                    {money(n)}
                  </option>
                ))}
              </select>
            </label>
            {TOGGLES.map((t) => (
              <label key={t.key} className="setting toggle">
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(s[t.key])}
                  disabled={!isHost}
                  onChange={(e) => set({ [t.key]: e.target.checked })}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="panel chat-panel">
          <h2>Chat</h2>
          <Chat state={state} />
        </section>
      </div>
    </main>
  );
}
