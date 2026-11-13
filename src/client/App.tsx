import { useEffect, useState } from 'react';
import { BASE } from './socket';
import { Home } from './components/Home';
import { RoomPage } from './components/RoomPage';
import { ToastProvider } from './toast';

/** Minimal router: `/landlordgame/` is home, `/landlordgame/r/CODE` is a room. */
function parseRoute(): string | null {
  const rest = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '';
  const m = /^r\/([A-Za-z0-9]{4,8})\/?$/.exec(rest);
  return m ? m[1].toUpperCase() : null;
}

export function navigate(path: string) {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function App() {
  const [roomId, setRoomId] = useState(parseRoute);
  useEffect(() => {
    const onPop = () => setRoomId(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return <ToastProvider>{roomId ? <RoomPage key={roomId} roomId={roomId} /> : <Home />}</ToastProvider>;
}
