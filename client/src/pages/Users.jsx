import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, UserRound } from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
export function UsersPage() {
  const [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    [resetUser, setResetUser] = useState(null),
    toast = useToast(),
    { user } = useAuth();
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
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ACCESS CONTROL</span>
          <h1>Users & CR access</h1>
          <p>Passwords are hashed; only role and access state are visible.</p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus />
          Add account
        </button>
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
                {u.role} · {u.active ? "Active" : "Disabled"}
              </small>
            </div>
            <div className="user-actions">
              {u.role === "CR" && (
                <button className="secondary" onClick={() => setResetUser(u)}>
                  <KeyRound /> Reset password
                </button>
              )}
              <button
                className="secondary"
                onClick={() => toggle(u)}
                disabled={u.id === user.id && u.active}
                title={u.id === user.id && u.active ? "You cannot disable your own active account." : ""}
              >
                {u.id === user.id && u.active ? "Current account" : u.active ? "Disable" : "Enable"}
              </button>
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
            <small>10+ characters with uppercase, lowercase, number, and symbol.</small>
          </label>
          <button className="primary">Create account</button>
        </form>
      </Dialog>
      <Dialog
        open={!!resetUser}
        title={resetUser ? `Reset password · ${resetUser.name}` : "Reset password"}
        onClose={() => setResetUser(null)}
      >
        <form className="form-stack" onSubmit={resetPassword}>
          <p>The CR will be signed out everywhere and required to replace this temporary password.</p>
          <label>
            Temporary password
            <input name="temporaryPassword" type="password" minLength="10" required />
          </label>
          <label>
            Confirm temporary password
            <input name="confirmation" type="password" minLength="10" required />
          </label>
          <button className="primary">Reset CR password</button>
        </form>
      </Dialog>
    </div>
  );
}
