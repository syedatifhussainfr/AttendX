import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "../state/AuthContext.jsx";
import { messageOf } from "../api.js";
export function Login() {
  const { login } = useAuth(),
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
        <img className="login-mark" src="/brand/eiilm.png" alt="EIILM Kolkata" />
        <div>
          <span className="eyebrow">EIILM KOLKATA · ACADEMIC OPERATIONS</span>
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
        <img className="ethics-mark" src="/brand/ekcle.png" />
      </div>
      <div className="login-area">
        <form className="login-card" onSubmit={submit} autoComplete="off">
          <div className="login-heading">
            <span className="app-monogram">AX</span>
            <div>
              <h2>Welcome to AttendX</h2>
              <p>Sign in with your college access</p>
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
                autoComplete="off"
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
                autoComplete="off"
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
          <p className="login-note">Authorized ADMIN and CR accounts only</p>
        </form>
      </div>
    </div>
  );
}
