import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import {
  api,
  hasAdminElevation,
  messageOf,
  setAdminElevation,
} from "../api.js";
import { useAuth } from "../state/AuthContext.jsx";

export function AdminPlusGate({
  children,
  adminPlus = true,
  area = "protected tools",
}) {
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(hasAdminElevation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const ended = () => setUnlocked(false);
    window.addEventListener("attendx:admin-elevation-ended", ended);
    return () => window.removeEventListener("attendx:admin-elevation-ended", ended);
  }, []);

  const unlock = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const password = new FormData(event.currentTarget).get("password");
      const { data } = await api.post("/auth/elevate", { password });
      setAdminElevation(data.elevationToken, data.expiresInSeconds);
      setUnlocked(true);
    } catch (requestError) {
      setError(messageOf(requestError));
    } finally {
      setBusy(false);
    }
  };

  if (unlocked) return children;
  return (
    <div className="page admin-plus-lock">
      <section className="admin-plus-lock-card">
        <header className="admin-plus-lock-header">
          <span className="admin-plus-lock-icon" aria-hidden="true">
            <LockKeyhole />
          </span>
          <div>
            <span className="eyebrow">PROTECTED AREA</span>
            <small>{adminPlus ? "Admin++ verification" : "Administrator verification"}</small>
          </div>
        </header>
        <div className="admin-plus-lock-copy">
          <h1>Unlock {area}</h1>
          <p>
            Confirm the password for <b>{user.email}</b>. Access is limited to
            this login session and expires after five minutes.
          </p>
        </div>
        <form onSubmit={unlock} className="form-stack admin-plus-lock-form">
          <label>
            <span>Current password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          {error && <div className="danger-note">{error}</div>}
          <button className="primary" disabled={busy}>
            {busy ? <ShieldCheck /> : <ArrowRight />}
            {busy ? "Verifying…" : `Unlock ${area}`}
          </button>
        </form>
        <footer className="admin-plus-lock-footer">
          <ShieldCheck aria-hidden="true" />
          <small>
            Verification stays in memory only. Refreshing or signing out locks
            this area again.
          </small>
        </footer>
      </section>
    </div>
  );
}
