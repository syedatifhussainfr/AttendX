import { useEffect, useState } from "react";
import { FileUp, Plus, Search } from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
export function Students() {
  const [rows, setRows] = useState([]),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState(null),
    [create, setCreate] = useState(false),
    [importing, setImporting] = useState(false),
    [preview, setPreview] = useState([]),
    toast = useToast(),
    { user } = useAuth();
  const load = async () => {
    try {
      setRows((await api.get("/admin/students", { params: { q } })).data);
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q]);
  const save = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (selected)
        await api.patch(`/admin/students/${selected.id}`, {
          ...f,
          active: f.active === "true",
          cardToken: f.cardToken || null,
          photoUrl: f.photoUrl || null,
        });
      else
        await api.post("/admin/students", {
          ...f,
          cardToken: null,
          photoUrl: null,
        });
      toast("Student saved.");
      setSelected(null);
      setCreate(false);
      load();
    } catch (x) {
      toast(messageOf(x), "error");
    }
  };
  const readCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = reader.result.trim().split(/\r?\n/);
      const parsed = lines
        .slice(1)
        .map((line) => {
          const [rollNumber, ...name] = line.split(",");
          const cleanedRoll = rollNumber?.trim();
          return {
            rollNumber: /^\d+$/.test(cleanedRoll)
              ? cleanedRoll.replace(/^0+(?=\d)/, "").padStart(2, "0")
              : cleanedRoll,
            name: name.join(",").trim(),
          };
        })
        .filter((x) => x.rollNumber && x.name);
      setPreview(parsed);
      setImporting(true);
    };
    reader.readAsText(file);
  };
  const submitImport = async () => {
    try {
      await api.post("/admin/students/import", { rows: preview });
      toast(`${preview.length} student rows imported.`);
      setImporting(false);
      load();
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">CLASS DIRECTORY</span>
          <h1>Students</h1>
          <p>{rows.length} records · QR-ready identity fields included</p>
        </div>
        {user.role === "ADMIN" && (
          <div className="button-row">
            <label className="secondary file-button">
              <FileUp />
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={readCsv} />
            </label>
            <button className="primary" onClick={() => setCreate(true)}>
              <Plus />
              Add student
            </button>
          </div>
        )}
      </div>
      <div className="search standalone">
        <Search />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by roll number or name"
        />
      </div>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Roll</th>
              <th>Student name</th>
              <th>Status</th>
              <th>QR card</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                onClick={() => user.role === "ADMIN" && setSelected(s)}
                className={user.role === "ADMIN" ? "clickable" : ""}
              >
                <td>
                  <span className="roll-chip">{s.rollNumber}</span>
                </td>
                <td>
                  <strong>{s.name}</strong>
                </td>
                <td>
                  <span
                    className={`table-status ${s.active ? "open" : "closed"}`}
                  >
                    {s.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </td>
                <td>{s.cardToken ? "Assigned" : "Not assigned"}</td>
                <td>{s.photoUrl ? "Available" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Dialog
        open={create || !!selected}
        title={selected ? "Edit student" : "Add student"}
        onClose={() => {
          setSelected(null);
          setCreate(false);
        }}
      >
        <form className="form-grid" onSubmit={save}>
          <label>
            Roll number
            <input
              name="rollNumber"
              defaultValue={selected?.rollNumber}
              required
            />
          </label>
          <label>
            Student name
            <input name="name" defaultValue={selected?.name} required />
          </label>
          {selected && (
            <>
              <label>
                Status
                <select name="active" defaultValue={String(selected.active)}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
              <label>
                Card token
                <input
                  name="cardToken"
                  defaultValue={selected.cardToken || ""}
                  placeholder="Random secure token (V2)"
                />
              </label>
              <label className="full">
                Photo URL
                <input name="photoUrl" defaultValue={selected.photoUrl || ""} />
              </label>
            </>
          )}
          <div className="dialog-actions full">
            <button className="primary">Save student</button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={importing}
        title="Preview CSV import"
        onClose={() => setImporting(false)}
      >
        <p>
          Expected columns: <code>rollNumber,name</code>. Existing rolls will
          have their names updated.
        </p>
        <div className="import-preview">
          {preview.slice(0, 12).map((r, i) => (
            <div key={i}>
              <b>{r.rollNumber}</b>
              <span>{r.name}</span>
            </div>
          ))}
          {preview.length > 12 && (
            <small>+ {preview.length - 12} more rows</small>
          )}
        </div>
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setImporting(false)}>
            Cancel
          </button>
          <button className="primary" onClick={submitImport}>
            Import {preview.length} rows
          </button>
        </div>
      </Dialog>
    </div>
  );
}
