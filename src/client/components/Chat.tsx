import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameState } from '../../shared/types';
import { socket } from '../socket';

export function Chat({ state }: { state: GameState }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const count = state.chat.length;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('chat', text);
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {state.chat.length === 0 && <p className="muted small">No messages yet. Say hi!</p>}
        {state.chat.map((m) => (
          <div key={m.id} className="chat-msg">
            <strong style={{ color: m.color }}>{m.name}</strong> <span>{m.text}</span>
          </div>
        ))}
      </div>
      <form className="row" onSubmit={send}>
        <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Message" aria-label="Chat message" />
        <button className="btn">Send</button>
      </form>
    </div>
  );
}
