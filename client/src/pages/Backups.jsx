import { useEffect, useState } from "react";
import { ArchiveRestore, DatabaseBackup, Download, Plus } from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";

const sizeOf = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function BackupsPage() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const toast = useToast();
  const { can } = useAuth();
  const load = async () => {
    try {
      setRows((await api.get("/admin/backups")).data);
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const create = async () => {
    setBusy(true);
    try {
      await api.post("/admin/backups");
      toast("Consistent SQLite backup created.");
      await load();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(false);
    }
  };
  const download = async (row) => {
    try {
      const response = await api.get(
        `/admin/backups/${encodeURIComponent(row.filename)}/download`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = row.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };
  const restore = async (event) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const { data } = await api.post("/admin/backups/restore", form);
      toast(data.message);
      setRestoreOpen(false);
    } catch (error) {
      toast(messageOf(error), "error");
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">DATA PROTECTION</span>
          <h1>Backup & restore</h1>
          <p>
            ADMIN-only, integrity-checked SQLite snapshots. PostgreSQL uses
            pg_dump/pg_restore.
          </p>
        </div>
        <div className="button-row">
          {can("backups.restore") && <button className="secondary" onClick={() => setRestoreOpen(true)}>
            <ArchiveRestore /> Restore
          </button>}
          {can("backups.create") && <button className="primary" onClick={create} disabled={busy}>
            <Plus /> {busy ? "Creating…" : "Create backup"}
          </button>}
        </div>
      </div>
      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <h2>Available backups</h2>
            <p>Stored outside the live database directory.</p>
          </div>
          <DatabaseBackup />
        </div>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Created</th>
                <th>Size</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.filename}>
                  <td>
                    <code>{row.filename}</code>
                  </td>
                  <td>{new Date(row.createdAt).toLocaleString("en-IN")}</td>
                  <td>{sizeOf(row.size)}</td>
                  <td>
                    {can("backups.download") && <button className="secondary" onClick={() => download(row)}>
                      <Download /> Download
                    </button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            No managed backup exists yet. Create one before risky changes.
          </div>
        )}
      </section>
      <Dialog
        open={restoreOpen}
        title="Restore SQLite database"
        onClose={() => !busy && setRestoreOpen(false)}
      >
        <form className="form-stack" onSubmit={restore}>
          <div className="danger-note">
            Restoration replaces the current database. AttendX creates a safety
            backup first, validates the upload, then stops the API so you can
            restart it safely.
          </div>
          <label>
            SQLite backup file
            <input
              name="backup"
              type="file"
              accept=".sqlite,.db,application/x-sqlite3"
              required
            />
          </label>
          <label>
            Your ADMIN password
            <input name="password" type="password" required />
          </label>
          <label>
            Type <code>RESTORE ATTENDX</code>
            <input name="confirmation" autoComplete="off" required />
          </label>
          <button className="danger" disabled={busy}>
            {busy ? "Validating and restoring…" : "Restore and stop API"}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
