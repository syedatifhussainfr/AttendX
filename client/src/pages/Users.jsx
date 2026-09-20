import { useEffect, useState } from "react";
import {
  KeyRound,
  Laptop,
  LogOut,
  MonitorSmartphone,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import {
  deviceName,
  formatSessionTime,
} from "../components/SessionManager.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
export function UsersPage() {
  const [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    [resetUser, setResetUser] = useState(null),
    [deleteUser, setDeleteUser] = useState(null),
    [deleting, setDeleting] = useState(false),
    [sessionsUser, setSessionsUser] = useState(null),
    [sessionAccessUser, setSessionAccessUser] = useState(null),
    [elevatingSessions, setElevatingSessions] = useState(false),
    [sessions, setSessions] = useState([]),
    [sessionsLoading, setSessionsLoading] = useState(false),
    [sessionsBusy, setSessionsBusy] = useState(""),
    toast = useToast(),
    { user, can } = useAuth();
  const load = () =>
    api
      .get("/admin/users")
      .then((r) => setRows(r.data))
      .catch((e) => toast(messageOf(e), "error"));
  useEffect(() => {
    load();
  }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post(
        "/admin/users",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      toast("User account created.");
      setOpen(false);
      load();
    } catch (x) {
      toast(messageOf(x), "error");
    }
  };
  const resetPassword = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const temporaryPassword = form.get("temporaryPassword");
    if (temporaryPassword !== form.get("confirmation"))
      return toast("Password confirmation does not match.", "error");
    try {
      await api.post(`/admin/users/${resetUser.id}/reset-password`, {
        temporaryPassword,
      });
      toast("CR password reset; existing sessions were revoked.");
      setResetUser(null);
      load();
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };
  const toggle = async (u) => {
    try {
      await api.patch(`/admin/users/${u.id}`, { active: !u.active });
      toast("Account access updated.");
      load();
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  const remove = async (event) => {
    event.preventDefault();
    setDeleting(true);
    try {
      const password = new FormData(event.currentTarget).get("password");
      const { data } = await api.post("/auth/elevate", { password });
      setAdminElevation(data.elevationToken, data.expiresInSeconds);
      await api.delete(`/admin/users/${deleteUser.id}`);
      toast("User account permanently deleted.");
      setDeleteUser(null);
      load();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setDeleting(false);
    }
  };
  const unlockSessions = async (event) => {
    event.preventDefault();
    setElevatingSessions(true);
    try {
      const password = new FormData(event.currentTarget).get("password");
      const { data } = await api.post("/auth/elevate", { password });
      setAdminElevation(data.elevationToken, data.expiresInSeconds);
      const account = sessionAccessUser;
      setSessionAccessUser(null);
      await openSessions(account);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setElevatingSessions(false);
    }
  };
  const openSessions = async (account) => {
    setSessionsUser(account);
    setSessions([]);
    setSessionsLoading(true);
    try {
      const { data } = await api.get(`/admin/users/${account.id}/sessions`);
      setSessions(data.sessions);
    } catch (error) {
      toast(messageOf(error), "error");
      setSessionsUser(null);
    } finally {
      setSessionsLoading(false);
    }
  };
  const revokeSession = async (sessionId) => {
    setSessionsBusy(sessionId);
    try {
      await api.delete(
        `/admin/users/${sessionsUser.id}/sessions/${sessionId}`,
      );
      setSessions((current) => current.filter((item) => item.id !== sessionId));
      toast("That login session was revoked.");
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setSessionsBusy("");
    }
  };
  const revokeAllSessions = async () => {
    setSessionsBusy("all");
    try {
      const { data } = await api.post(
        `/admin/users/${sessionsUser.id}/revoke-sessions`,
      );
      setSessions((current) => current.filter((item) => item.current));
      toast(data.message);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setSessionsBusy("");
    }
  };
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {user.adminPlus ? "ADMIN++ · ACCESS CONTROL" : "ADMIN · USER MANAGEMENT"}
          </span>
          <h1>Users & CR access</h1>
          <p>
            Create and manage accounts. Permanent deletion and device-session
            control require Admin++.
          </p>
        </div>
        {can("users.create") && (
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus />
            Add account
          </button>
        )}
      </div>
      <div className="user-grid">
        {rows.map((u) => (
          <article className="user-card" key={u.id}>
            <span className="user-icon">
              {u.role === "ADMIN" ? <ShieldCheck /> : <UserRound />}
            </span>
            <div>
              <strong>{u.name}</strong>
              <p>{u.email}</p>
              <small>
                {u.adminPlus ? "ADMIN++" : u.role} · {u.active ? "Active" : "Disabled"}
                {u.phoneNumber ? ` · ${u.phoneNumber}` : ""}
              </small>
            </div>
            <div className="user-actions">
              {can("users.manageSessions") && (
                <button
                  className="secondary"
                  onClick={() => setSessionAccessUser(u)}
                >
                  <MonitorSmartphone /> Sessions
                </button>
              )}
              {u.role === "CR" && can("users.resetCrPassword") && (
                <button className="secondary" onClick={() => setResetUser(u)}>
                  <KeyRound /> Reset password
                </button>
              )}
              {can("users.update") && <button
                className="secondary"
                onClick={() => toggle(u)}
                disabled={
                  (u.id === user.id && u.active) ||
                  (u.adminPlus && !user.adminPlus)
                }
                title={
                  u.id === user.id && u.active
                    ? "You cannot disable your own active account."
                    : u.adminPlus && !user.adminPlus
                      ? "Only Admin++ can change an Admin++ account."
                    : ""
                }
              >
                {u.id === user.id && u.active
                  ? "Current account"
                  : u.active
                    ? "Disable"
                    : "Enable"}
              </button>}
              {can("users.delete") && u.id !== user.id && (
                <button
                  className="danger-outline"
                  onClick={() => setDeleteUser(u)}
                >
                  <Trash2 /> Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={open}
        title="Create user account"
        onClose={() => setOpen(false)}
      >
        <form className="form-stack" onSubmit={save}>
          <label>
            Full name
            <input name="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Role
            <select name="role">
              <option>CR</option>
              <option>ADMIN</option>
            </select>
          </label>
          <label>
            Temporary password
            <input name="password" type="password" minLength="10" required />
            <small>
              10+ characters with uppercase, lowercase, number, and symbol.
            </small>
          </label>
          <button className="primary">Create account</button>
        </form>
      </Dialog>
      <Dialog
        open={!!deleteUser}
        title={deleteUser ? `Delete ${deleteUser.name}?` : "Delete user"}
        onClose={() => !deleting && setDeleteUser(null)}
      >
        <form className="form-stack" onSubmit={remove}>
          <div className="danger-note">
            This permanently removes the account. AttendX will block deletion
            if the user owns attendance or audit history; disable the account
            instead in that case.
          </div>
          <label>
            Confirm your Admin++ password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setDeleteUser(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              className="danger logout-confirm-button"
              disabled={deleting}
            >
              <Trash2 /> {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!sessionAccessUser}
        title={
          sessionAccessUser
            ? `Unlock sessions · ${sessionAccessUser.name}`
            : "Unlock sessions"
        }
        onClose={() => !elevatingSessions && setSessionAccessUser(null)}
      >
        <form className="form-stack" onSubmit={unlockSessions}>
          <p>
            Device-session access is restricted to Admin++. Confirm your
            password to continue.
          </p>
          <label>
            Current Admin++ password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setSessionAccessUser(null)}
              disabled={elevatingSessions}
            >
              Cancel
            </button>
            <button className="primary" disabled={elevatingSessions}>
              <ShieldCheck />
              {elevatingSessions ? "Verifying…" : "Open sessions"}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!sessionsUser}
        title={sessionsUser ? `Login sessions · ${sessionsUser.name}` : "Login sessions"}
        onClose={() => !sessionsBusy && setSessionsUser(null)}
      >
        <div className="form-stack">
          <p>
            Review every active device for this account and sign out anything
            that should no longer have access.
          </p>
          <div className="secure-session-list admin-session-list">
            {sessionsLoading && <p>Checking active sessions…</p>}
            {!sessionsLoading && sessions.length === 0 && (
              <p>No active login sessions.</p>
            )}
            {!sessionsLoading &&
              sessions.map((session) => {
                const device = deviceName(session.userAgent);
                const DeviceIcon = device.mobile ? Smartphone : Laptop;
                return (
                  <article key={session.id}>
                    <DeviceIcon />
                    <div>
                      <strong>
                        {session.current ? "This Admin++ session" : device.browser}
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
                        onClick={() => revokeSession(session.id)}
                        disabled={!!sessionsBusy}
                      >
                        <LogOut />
                        {sessionsBusy === session.id ? "Revoking…" : "Revoke"}
                      </button>
                    )}
                  </article>
                );
              })}
          </div>
          {sessions.some((session) => !session.current) && (
            <button
              type="button"
              className="danger-outline"
              onClick={revokeAllSessions}
              disabled={!!sessionsBusy}
            >
              <LogOut />
              {sessionsBusy === "all"
                ? "Revoking sessions…"
                : sessionsUser?.id === user.id
                  ? "Revoke every other session"
                  : "Revoke all sessions"}
            </button>
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!resetUser}
        title={
          resetUser ? `Reset password · ${resetUser.name}` : "Reset password"
        }
        onClose={() => setResetUser(null)}
      >
        <form className="form-stack" onSubmit={resetPassword}>
          <p>
            The CR will be signed out everywhere and required to replace this
            temporary password.
          </p>
          <label>
            Temporary password
            <input
              name="temporaryPassword"
              type="password"
              minLength="10"
              required
            />
          </label>
          <label>
            Confirm temporary password
            <input
              name="confirmation"
              type="password"
              minLength="10"
              required
            />
          </label>
          <button className="primary">Reset CR password</button>
        </form>
      </Dialog>
    </div>
  );
}
