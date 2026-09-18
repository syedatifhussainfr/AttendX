import { useEffect, useState } from "react";
import { Plus, ShieldCheck, UserRound } from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
export function UsersPage() {
  const [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    toast = useToast();
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
            <button className="secondary" onClick={() => toggle(u)}>
              {u.active ? "Disable" : "Enable"}
            </button>
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
            <input name="password" type="password" minLength="8" required />
          </label>
          <button className="primary">Create account</button>
        </form>
      </Dialog>
    </div>
  );
}
