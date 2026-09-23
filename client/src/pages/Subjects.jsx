import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
export function Subjects() {
  const [rows, setRows] = useState([]),
    [edit, setEdit] = useState(null),
    [adding, setAdding] = useState(false),
    [deleteSubject, setDeleteSubject] = useState(null),
    [deleting, setDeleting] = useState(false),
    toast = useToast(),
    { can } = useAuth();
  const load = () =>
    api
      .get("/admin/subjects")
      .then((r) => setRows(r.data))
      .catch((e) => toast(messageOf(e), "error"));
  useEffect(() => {
    load();
  }, []);
  const save = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      edit
        ? await api.patch(`/admin/subjects/${edit.id}`, {
            ...f,
            active: f.active === "true",
          })
        : await api.post("/admin/subjects", f);
      toast("Subject saved.");
      setEdit(null);
      setAdding(false);
      load();
    } catch (x) {
      toast(messageOf(x), "error");
    }
  };
  const remove = async (event) => {
    event.preventDefault();
    setDeleting(true);
    try {
      const password = new FormData(event.currentTarget).get("password");
      const { data } = await api.post("/auth/elevate", { password });
      setAdminElevation(data.elevationToken, data.expiresInSeconds);
      await api.delete(`/admin/subjects/${deleteSubject.id}`);
      toast("Subject permanently deleted.");
      setDeleteSubject(null);
      load();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ACADEMIC CONFIGURATION</span>
          <h1>Subjects</h1>
          <p>Subjects available for scheduled and replacement lectures.</p>
        </div>
        {can("subjects.manage") && (
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus />
            Add subject
          </button>
        )}
      </div>
      <div className="subject-grid">
        {rows.map((s) => (
          <button
            className="subject-card"
            key={s.id}
            onClick={() => can("subjects.manage") && setEdit(s)}
          >
            <span>{s.code}</span>
            <strong>{s.name}</strong>
            <small>{s.active ? "Active" : "Inactive"}</small>
          </button>
        ))}
      </div>
      <Dialog
        open={adding || !!edit}
        title={edit ? "Edit subject" : "Add subject"}
        onClose={() => {
          setEdit(null);
          setAdding(false);
        }}
      >
        <form onSubmit={save} className="form-stack">
          <label>
            Subject code
            <input name="code" defaultValue={edit?.code} required />
          </label>
          <label>
            Subject name
            <input name="name" defaultValue={edit?.name} required />
          </label>
          {edit && (
            <label>
              Status
              <select name="active" defaultValue={String(edit.active)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          )}
          <div className="dialog-actions">
            {edit && can("subjects.delete") && (
              <button
                type="button"
                className="danger-outline"
                onClick={() => {
                  setDeleteSubject(edit);
                  setEdit(null);
                }}
              >
                <Trash2 /> Delete permanently
              </button>
            )}
            <button className="primary">Save subject</button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deleteSubject}
        title={
          deleteSubject ? `Delete ${deleteSubject.name}?` : "Delete subject"
        }
        onClose={() => !deleting && setDeleteSubject(null)}
      >
        <form className="form-stack" onSubmit={remove}>
          <div className="danger-note">
            This is only allowed when the subject has never been used in the
            timetable or attendance history. Used subjects must be made
            inactive.
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
              onClick={() => setDeleteSubject(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button className="danger" disabled={deleting}>
              <Trash2 /> {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
