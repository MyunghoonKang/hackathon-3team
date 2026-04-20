import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { socket } from './socket';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

type ToastState = 'hidden' | 'disconnected' | 'reconnected';

export default function App() {
  const [toast, setToast] = useState<ToastState>('hidden');

  useEffect(() => {
    let reconnectedTimer: ReturnType<typeof setTimeout>;

    const onDisconnect = () => {
      clearTimeout(reconnectedTimer);
      setToast('disconnected');
    };
    const onReconnect = () => {
      setToast('reconnected');
      reconnectedTimer = setTimeout(() => setToast('hidden'), 2000);
    };

    socket.on('disconnect', onDisconnect);
    socket.on('reconnect', onReconnect);
    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect', onReconnect);
      clearTimeout(reconnectedTimer);
    };
  }, []);

  return (
    <>
      {toast !== 'hidden' && (
        <div className={`reconnect-toast reconnect-toast--${toast}`} role="status" aria-live="polite">
          {toast === 'disconnected' ? '⚠️ 서버 연결이 끊겼습니다. 재연결 중…' : '✅ 재연결되었습니다.'}
        </div>
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route
          path="*"
          element={
            <main style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
              <h1>404</h1>
            </main>
          }
        />
      </Routes>
    </>
  );
}
