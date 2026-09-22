import { useEffect, useState } from "react";
import { Database, ShieldCheck } from "lucide-react";
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
        <span className="admin-plus-lock-icon">
          <Database />
        </span>
        <span className="eyebrow">
          {adminPlus ? "ADMIN++" : "ADMIN"} · PROTECTED AREA
        </span>
        <h1>Unlock {area}</h1>
        <p>
          Confirm the password for <b>{user.email}</b>. Access stays unlocked
          for five minutes in this tab and is bound to this login session.
        </p>
        <form onSubmit={unlock} className="form-stack">
          <label>
            Current password
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
            <ShieldCheck />
            {busy ? "Verifying…" : `Unlock ${area}`}
          </button>
        </form>
        <small>
          Nothing is stored in the browser. Refreshing or signing out removes
          this verification immediately.
        </small>
      </section>
    </div>
  );
}
