import { useEffect, useState } from "react";
import {
  Laptop,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";

export function deviceName(userAgent = "") {
  const browser = userAgent.includes("Edg/")
    ? "Microsoft Edge"
    : userAgent.includes("Chrome/")
      ? "Google Chrome"
      : userAgent.includes("Firefox/")
        ? "Mozilla Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser session";
  const platform = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Android")
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : userAgent.includes("Mac OS")
          ? "macOS"
          : userAgent.includes("Linux")
            ? "Linux"
            : "Unknown device";
  return { browser, platform, mobile: /Android|iPhone|iPad/i.test(userAgent) };
}

export const formatSessionTime = (value) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function SessionManager() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/auth/sessions");
      setSessions(data.sessions);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (id) => {
    setBusy(id);
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessions((current) => current.filter((session) => session.id !== id));
      toast("That device was signed out.");
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy("");
    }
  };

  const revokeOthers = async () => {
    setBusy("others");
    try {
      await api.post("/auth/sessions/revoke-others");
      setSessions((current) => current.filter((session) => session.current));
      toast("Every other device was signed out.");
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <section
      className="session-manager"
      aria-labelledby="active-sessions-title"
    >
      <header>
        <div>
          <span>
            <ShieldCheck />
          </span>
          <div>
            <h3 id="active-sessions-title">Signed-in devices</h3>
            <p>Review every active AttendX login.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh sessions"
        >
          <RefreshCw />
        </button>
      </header>
      <div className="secure-session-list">
        {loading && <p className="session-empty">Checking active sessions…</p>}
        {!loading &&
          sessions.map((session) => {
            const device = deviceName(session.userAgent);
            const DeviceIcon = device.mobile ? Smartphone : Laptop;
            return (
              <article key={session.id}>
                <DeviceIcon />
                <div>
                  <strong>
                    {session.current ? "This device" : device.browser}
                  </strong>
                  <span>
                    {device.browser} on {device.platform}
                  </span>
                  <small>
                    Last active {formatSessionTime(session.lastUsedAt)} · Expires{" "}
                    {formatSessionTime(session.expiresAt)}
                  </small>
                </div>
                {session.current ? (
                  <b className="current-session">CURRENT</b>
                ) : (
                  <button
                    type="button"
                    onClick={() => revoke(session.id)}
                    disabled={busy === session.id}
                  >
                    <LogOut />
                    {busy === session.id ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </article>
            );
          })}
      </div>
      {sessions.some((session) => !session.current) && (
        <button
          className="revoke-others"
          type="button"
          onClick={revokeOthers}
          disabled={busy === "others"}
        >
          <LogOut />{" "}
          {busy === "others"
            ? "Signing out devices…"
            : "Sign out all other devices"}
        </button>
      )}
    </section>
  );
}
