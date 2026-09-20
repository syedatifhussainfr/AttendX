import { useState } from "react";
import { ArrowLeft, Laptop, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { messageOf } from "../api.js";

export function LogoutPage() {
  const [busy, setBusy] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const staySignedIn = () =>
    navigate(user.mustChangePassword ? "/change-password" : "/", {
      replace: true,
    });
  const confirmLogout = async () => {
    setBusy(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="logout-route-page">
      <section className="logout-route-card">
        <header className="logout-route-brand">
          <img src="/brand/eiilm.png" alt="EIILM Kolkata" />
          <div>
            <strong>AttendX</strong>
            <span>EIILM Kolkata</span>
          </div>
        </header>
        <span className="logout-route-icon">
          <LogOut />
        </span>
        <span className="eyebrow">SECURE SIGN OUT</span>
        <h1>End this browser session?</h1>
        <p>
          AttendX will revoke this device on the server and remove its secure
          browser cookie. Other signed-in devices stay active.
        </p>
        <div className="logout-route-session">
          <Laptop />
          <div>
            <strong>{user.name}</strong>
            <span>Current browser · {user.email}</span>
          </div>
          <ShieldCheck />
        </div>
        <div className="logout-route-actions">
          <button className="secondary" onClick={staySignedIn} disabled={busy}>
            <ArrowLeft /> Stay signed in
          </button>
          <button
            className="danger logout-confirm-button"
            onClick={confirmLogout}
            disabled={busy}
          >
            {busy ? "Revoking session…" : "Sign out securely"}
            <LogOut />
          </button>
        </div>
      </section>
    </main>
  );
}
