import { FormEvent, useState } from "react";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "register";

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        await login({
          username_or_email: String(form.get("username_or_email") || ""),
          password: String(form.get("password") || "")
        });
      } else {
        const password = String(form.get("password") || "");
        const confirmPassword = String(form.get("confirm_password") || "");
        if (password !== confirmPassword) throw new Error("비밀번호 확인이 일치하지 않습니다.");
        await register({
          username: String(form.get("username") || ""),
          email: String(form.get("email") || ""),
          display_name: String(form.get("display_name") || ""),
          password
        });
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-label="Wikindle authentication">
        <div className="brand-block">
          <h1>Wikindle</h1>
          <p>나무위키식 문법으로 쓰는 개인 위키</p>
        </div>

        <div className="segmented" role="tablist" aria-label="auth mode">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")} type="button">로그인</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")} type="button">회원가입</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === "login" ? (
            <>
              <label>
                아이디 또는 이메일
                <input name="username_or_email" autoComplete="username" required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
            </>
          ) : (
            <>
              <label>
                아이디
                <input name="username" autoComplete="username" required minLength={3} />
              </label>
              <label>
                이메일
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                표시 이름
                <input name="display_name" autoComplete="name" required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" autoComplete="new-password" required minLength={8} />
              </label>
              <label>
                비밀번호 확인
                <input name="confirm_password" type="password" autoComplete="new-password" required minLength={8} />
              </label>
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "처리 중" : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
      </section>
    </main>
  );
}