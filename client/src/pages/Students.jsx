import { useEffect, useState } from "react";
import { FileUp, Plus, Search, Trash2 } from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { downloadImportErrors, parseCsv } from "../utils/csv.js";
export function Students() {
  const [rows, setRows] = useState([]),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState(null),
    [create, setCreate] = useState(false),
    [importing, setImporting] = useState(false),
    [importRows, setImportRows] = useState([]),
    [review, setReview] = useState(null),
    [missingAction, setMissingAction] = useState("KEEP"),
    [deleteStudent, setDeleteStudent] = useState(null),
    [deleting, setDeleting] = useState(false),
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
    reader.onload = async () => {
      try {
        const parsed = parseCsv(reader.result);
        const { data } = await api.post("/admin/students/import/preview", { rows: parsed });
        setImportRows(parsed);
        setReview(data);
        setMissingAction("KEEP");
        setImporting(true);
      } catch (error) {
        toast(messageOf(error), "error");
      }
    };
    reader.readAsText(file);
  };
  const submitImport = async () => {
    try {
      const { data } = await api.post("/admin/students/import/apply", {
        rows: importRows,
        missingAction,
        confirmed: true,
      });
      toast(`Import complete: ${data.added} added, ${data.updated} updated, ${data.deactivated} deactivated.`);
      setImporting(false);
      setReview(null);
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
      await api.delete(`/admin/students/${deleteStudent.id}`);
      toast("Student record permanently deleted.");
      setDeleteStudent(null);
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
            {selected && user.adminPlus && (
              <button
                type="button"
                className="danger-outline"
                onClick={() => {
                  setDeleteStudent(selected);
                  setSelected(null);
                }}
              >
                <Trash2 /> Delete permanently
              </button>
            )}
            <button className="primary">Save student</button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deleteStudent}
        title={deleteStudent ? `Delete ${deleteStudent.name}?` : "Delete student"}
        onClose={() => !deleting && setDeleteStudent(null)}
      >
        <form className="form-stack" onSubmit={remove}>
          <div className="danger-note">
            This is only allowed when the student has no attendance or audit
            history. Otherwise, AttendX will preserve the record and ask you to
            mark it inactive.
          </div>
          <label>
            Confirm your Admin++ password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setDeleteStudent(null)}
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
      <Dialog
        open={importing}
        title="Preview CSV import"
        onClose={() => setImporting(false)}
      >
        {review && <div className="import-review">
          <p>Nothing has been changed yet. Review every category, then confirm one transactional update.</p>
          <div className="import-summary">
            <span><b>{review.summary.new}</b> New</span>
            <span><b>{review.summary.changed}</b> Name changes</span>
            <span><b>{review.summary.unchanged}</b> Unchanged</span>
            <span><b>{review.summary.invalid}</b> Invalid</span>
            <span><b>{review.summary.missing}</b> Missing from CSV</span>
          </div>
          {!!review.nameChanges.length && <section><h3>Name changes</h3>{review.nameChanges.slice(0, 10).map((row) => <div className="import-line" key={row.rollNumber}><b>{row.rollNumber}</b><span>{row.oldName} → {row.name}</span></div>)}</section>}
          {!!review.newStudents.length && <section><h3>New students</h3>{review.newStudents.slice(0, 10).map((row) => <div className="import-line" key={row.rollNumber}><b>{row.rollNumber}</b><span>{row.name}</span></div>)}</section>}
          {!!review.invalidRows.length && <section className="import-errors"><h3>Invalid or duplicate rows</h3>{review.invalidRows.slice(0, 10).map((row) => <div className="import-line" key={`${row.rowNumber}-${row.rollNumber}`}><b>Row {row.rowNumber}</b><span>{row.errors.join(" ")}</span></div>)}<button className="secondary" onClick={() => downloadImportErrors(review.invalidRows)}>Download error CSV</button></section>}
          {!!review.missingStudents.length && <section><h3>Active students missing from this CSV</h3><p>{review.missingStudents.map((row) => row.rollNumber).join(", ")}</p><label>When applying<select value={missingAction} onChange={(event) => setMissingAction(event.target.value)}><option value="KEEP">Keep them active</option><option value="DEACTIVATE">Deactivate them</option></select></label></section>}
        </div>}
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setImporting(false)}>
            Cancel
          </button>
          <button className="primary" onClick={submitImport} disabled={!review?.canApply}>
            Confirm and apply {review?.summary.valid || 0} rows
          </button>
        </div>
      </Dialog>
    </div>
  );
}
