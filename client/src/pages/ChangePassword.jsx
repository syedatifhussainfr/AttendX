import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { api, messageOf } from "../api.js";
import { useAuth } from "../state/AuthContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { SessionManager } from "../components/SessionManager.jsx";

const requirements = [
  ["10+ characters", (value) => value.length >= 10],
  ["Upper & lowercase", (value) => /[A-Z]/.test(value) && /[a-z]/.test(value)],
  ["At least one number", (value) => /\d/.test(value)],
  ["A symbol", (value) => /[^A-Za-z0-9]/.test(value)],
];

function PasswordInput({ label, name, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="secure-field">
      <span>{label}</span>
      <div>
        <LockKeyhole />
        <input
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          minLength={name === "currentPassword" ? undefined : 10}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </label>
  );
}

export function ChangePassword() {
  const [values, setValues] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const checks = useMemo(
    () =>
      requirements.map(([label, check]) => ({
        label,
        passed: check(values.newPassword),
      })),
    [values.newPassword],
  );
  const strength = checks.filter((item) => item.passed).length;
  const matches =
    values.confirmPassword.length > 0 &&
    values.confirmPassword === values.newPassword;
  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!matches)
      return toast("New-password confirmation does not match.", "error");
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      await logout();
      toast("Password changed. Sign in with the new password.");
      navigate("/login");
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="security-page">
      <section className="security-context">
        <div className="security-brand">
          <div className="security-brand-lockup">
            <span className="security-brand-primary">
              <img src="/brand/eiilm.png" alt="EIILM Kolkata" />
            </span>
            <div className="security-brand-copy">
              <strong>AttendX</strong>
              <span>Secure account centre</span>
            </div>
          </div>
          <span className="security-brand-partner">
            <img src="/brand/ekcle.png" alt="EKCLE" />
          </span>
        </div>
        <div className="security-copy">
          <span className="security-kicker">
            <ShieldCheck /> ACCOUNT SECURITY
          </span>
          <h1>A stronger key for your attendance workspace.</h1>
          <p>
            Your account can open classes and change official attendance
            records. A unique password keeps that authority with you.
          </p>
          <div className="security-points">
            <div>
              <Check />
              <span>
                <b>Private by design</b>Password hashes are never visible to
                anyone.
              </span>
            </div>
            <div>
              <LogOut />
              <span>
                <b>Fresh session</b>Existing sign-ins are revoked after the
                change.
              </span>
            </div>
            <div>
              <KeyRound />
              <span>
                <b>No recovery email</b>Contact an ADMIN if a CR password is
                forgotten.
              </span>
            </div>
          </div>
        </div>
        <small className="security-foot">AttendX V1.1.9 · Asia/Kolkata</small>
      </section>

      <section className="security-form-side">
        <div className="security-form-wrap">
          {!user?.mustChangePassword && (
            <button
              className="security-back"
              type="button"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft /> Back to AttendX
            </button>
          )}
          <header className="security-form-head">
            <span className="security-lock">
              <KeyRound />
            </span>
            <div>
              <span className="eyebrow">
                {user?.mustChangePassword ? "ACTION REQUIRED" : "YOUR ACCOUNT"}
              </span>
              <h2>
                {user?.mustChangePassword
                  ? "Replace temporary password"
                  : "Change your password"}
              </h2>
              <p>
                {user?.mustChangePassword
                  ? "Set a private password before entering AttendX."
                  : "You’ll sign in again once this is complete."}
              </p>
            </div>
          </header>

          <div className="account-chip">
            <span>
              {(user?.name || "AttendX User").slice(0, 2).toUpperCase()}
            </span>
            <div>
              <b>{user?.name || "AttendX User"}</b>
              <small>
                {user?.email || "user@attendx.local"} · {user?.role || "ADMIN"}
              </small>
            </div>
          </div>

          <form className="security-form" onSubmit={submit}>
            <PasswordInput
              label="Current password"
              name="currentPassword"
              value={values.currentPassword}
              onChange={set("currentPassword")}
              autoComplete="current-password"
            />
            <div className="password-divider">
              <span>NEW PASSWORD</span>
            </div>
            <PasswordInput
              label="New password"
              name="newPassword"
              value={values.newPassword}
              onChange={set("newPassword")}
              autoComplete="new-password"
            />
            <div
              className="strength-track"
              aria-label={`Password strength ${strength} of 4`}
            >
              {[1, 2, 3, 4].map((step) => (
                <i key={step} className={strength >= step ? "active" : ""} />
              ))}
            </div>
            <div className="password-rules">
              {checks.map((item) => (
                <span className={item.passed ? "passed" : ""} key={item.label}>
                  <Check /> {item.label}
                </span>
              ))}
            </div>
            <PasswordInput
              label="Confirm new password"
              name="confirmPassword"
              value={values.confirmPassword}
              onChange={set("confirmPassword")}
              autoComplete="new-password"
            />
            {values.confirmPassword && (
              <small className={matches ? "match-note good" : "match-note"}>
                {matches ? "Passwords match." : "Passwords do not match yet."}
              </small>
            )}
            <button
              className="security-submit"
              disabled={busy || strength < 4 || !matches}
            >
              <ShieldCheck />{" "}
              {busy ? "Securing account…" : "Update password & sign out"}
            </button>
            <p className="security-privacy">
              <LockKeyhole /> Your password is sent securely to AttendX and
              stored only as a bcrypt hash.
            </p>
          </form>
          {!user?.mustChangePassword && <SessionManager />}
        </div>
      </section>
    </main>
  );
}
