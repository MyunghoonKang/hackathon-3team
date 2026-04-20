import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {/* 단일 방 라우트. RoomPage 가 RoomStatus 에 따라 Lobby/Game/Result 를 스왑 (A11~A13). */}
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
  );
}
