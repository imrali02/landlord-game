import { useState, type FormEvent } from 'react';
import { navigate } from '../App';
import { createRoom, roomPath, storage } from '../socket';
import { useToast } from '../toast';
import { Flag } from './Flag';
import type { CountryId } from '../../shared/types';

const SHOWCASE: CountryId[] = ['palestine', 'pakistan', 'italy', 'germany', 'china', 'france', 'uk', 'usa'];

export function Home() {
  const [name, setName] = useState(storage.name());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('Enter a name first');
    setBusy(true);
    storage.setName(name.trim());
    const r = await createRoom(name.trim());
    setBusy(false);
    if (!r.ok || !r.roomId || !r.token) return toast(r.error ?? 'Could not create a room');
    storage.setToken(r.roomId, r.token);
    navigate(roomPath(r.roomId));
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(c)) return toast('Room codes are 5 letters/numbers');
    if (name.trim()) storage.setName(name.trim());
    navigate(roomPath(c));
  };

  return (
    <main className="home">
      <div className="home-card">
        <div className="brand">
          <span className="brand-mark">🏠</span>
          <h1>Landlord</h1>
        </div>
        <p className="tagline">Buy cities, collect rent, and outlast your friends in this online property game.</p>
        <div className="flag-row" aria-hidden>
          {SHOWCASE.map((c) => (
            <Flag key={c} country={c} width={30} />
          ))}
        </div>

        <form onSubmit={create} className="stack">
          <label className="field">
            <span>Your name</span>
            <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="e.g. Imran" autoFocus />
          </label>
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Creating…' : 'Create a game'}
          </button>
        </form>

        <div className="divider">
          <span>or join a friend</span>
        </div>

        <form onSubmit={join} className="row">
          <input
            className="code-input"
            value={code}
            maxLength={8}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            aria-label="Room code"
          />
          <button className="btn">Join</button>
        </form>
      </div>
      <footer className="home-foot">2–8 players · invite with a link · no account needed</footer>
    </main>
  );
}
