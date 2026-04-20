import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <main style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.25rem', margin: 0 }}>식후 벌칙게임</h1>
            <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-4)' }}>
              Task A10 HomePage 에서 채워집니다.
            </p>
          </main>
        }
      />
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
