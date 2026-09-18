import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
export function Subjects() {
  const [rows, setRows] = useState([]),
    [edit, setEdit] = useState(null),
    [adding, setAdding] = useState(false),
    toast = useToast();
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
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ACADEMIC CONFIGURATION</span>
          <h1>Subjects</h1>
          <p>Subjects available for scheduled and replacement lectures.</p>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus />
          Add subject
        </button>
      </div>
      <div className="subject-grid">
        {rows.map((s) => (
          <button
            className="subject-card"
            key={s.id}
            onClick={() => setEdit(s)}
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
          <button className="primary">Save subject</button>
        </form>
      </Dialog>
    </div>
  );
}
