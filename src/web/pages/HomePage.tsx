import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";

export default function HomePage() {
  const { create, join } = useSession();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameOk = name.trim().length > 0;
  const codeOk = code.trim().length === 4;

  const doCreate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const snap = await create(name.trim());
      nav(`/room/${snap.roomCode}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "create failed");
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { snap } = await join(code.trim().toUpperCase(), name.trim());
      nav(`/room/${snap.roomCode}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "join failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="home">
      <header className="home__hero">
        <h1 className="home__title">식후 벌칙게임</h1>
        <p className="home__subtitle">
          최대 8명이 놀고, 진 사람이 다음 점심을 쏜다
        </p>
      </header>

      <label className="home__field">
        <span className="home__label">이름</span>
        <input
          className="home__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름을 입력하세요"
          maxLength={20}
          autoFocus
        />
      </label>

      <section className="home__card">
        <h2 className="home__card-title">방 만들기</h2>
        <button
          className="home__btn home__btn--primary"
          disabled={!nameOk || busy}
          onClick={doCreate}
        >
          새 방 만들기
        </button>
      </section>

      <section className="home__card">
        <h2 className="home__card-title">방 참여</h2>
        <input
          className="home__input home__input--code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="XXXX"
          maxLength={4}
          aria-label="룸 코드 (4자리)"
        />
        <button
          className="home__btn"
          disabled={!nameOk || !codeOk || busy}
          onClick={doJoin}
        >
          참여
        </button>
      </section>

      {err && (
        <p className="home__error" role="alert" aria-live="polite">
          {err}
        </p>
      )}
    </main>
  );
}
