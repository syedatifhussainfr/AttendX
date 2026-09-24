import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "../state/AuthContext.jsx";
import { messageOf } from "../api.js";
import { useBranding } from "../state/BrandingContext.jsx";
export function Login() {
  const { login } = useAuth(),
    { branding } = useBranding(),
    [show, setShow] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await login({ email: form.get("email"), password: form.get("password") });
    } catch (err) {
      setError(messageOf(err));
      setLoading(false);
    }
  };
  return (
    <div className="login-page">
      <div className="login-story">
        <img
          className="login-mark"
          src={branding.primaryLogoUrl}
          alt={branding.institutionName}
        />
        <div>
          <span className="eyebrow">
            {branding.institutionName.toUpperCase()} · ACADEMIC OPERATIONS
          </span>
          <h1>
            Attendance,
            <br />
            without the roll call.
          </h1>
          <p>
            A focused attendance workspace designed for the rhythm of real
            college lectures.
          </p>
        </div>
        {branding.secondaryLogoUrl && (
          <img
            className="ethics-mark"
            src={branding.secondaryLogoUrl}
            alt={`${branding.institutionName} partner mark`}
          />
        )}
      </div>
      <div className="login-area">
        <form className="login-card" onSubmit={submit} autoComplete="on">
          <div className="login-heading">
            <span className="app-monogram">AX</span>
            <div>
              <h2>Welcome to AttendX</h2>
              <p>Sign in with your institution access</p>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <label>
            Email address
            <div className="field with-icon">
              <Mail />
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
          </label>
          <label>
            Password
            <div className="field with-icon">
              <LockKeyhole />
              <input
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>
          <button className="primary wide" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
            <ArrowRight />
          </button>
          <p className="login-note">Authorized ADMIN, FACULTY, and CR accounts only</p>
        </form>
      </div>
    </div>
  );
}
