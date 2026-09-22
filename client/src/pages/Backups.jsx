import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileUp,
  HardDrive,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";

const sizeOf = (bytes) =>
  bytes === 0
    ? "0 KB"
    : bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function BackupsPage() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
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
  const closeRestore = () => {
    if (busy) return;
    setRestoreOpen(false);
    setRestoreFile(null);
  };
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
      setRestoreFile(null);
    } catch (error) {
      toast(messageOf(error), "error");
      setBusy(false);
    }
  };
  const remove = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    setDeleting(true);
    try {
      const { data } = await api.post("/auth/elevate", {
        password: form.password,
      });
      setAdminElevation(data.elevationToken, data.expiresInSeconds);
      await api.delete(`/admin/backups/${encodeURIComponent(deleteRow.filename)}`, {
        data: {
          confirmation: form.confirmation,
          reason: form.reason,
        },
      });
      toast(`${deleteRow.filename} permanently deleted.`);
      setDeleteRow(null);
      await load();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setDeleting(false);
    }
  };
  const totalSize = rows.reduce((total, row) => total + row.size, 0);
  return (
    <div className="page backups-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">DATA PROTECTION</span>
          <h1>Backup & restore</h1>
          <p>
            Integrity-checked SQLite recovery points with protected restore and
            retention controls.
          </p>
        </div>
        <div className="button-row">
          {can("backups.restore") && <button className="secondary" onClick={() => {
            setRestoreFile(null);
            setRestoreOpen(true);
          }}>
            <ArchiveRestore /> Restore
          </button>}
          {can("backups.create") && <button className="primary" onClick={create} disabled={busy}>
            <Plus /> {busy ? "Creating…" : "Create backup"}
          </button>}
        </div>
      </div>
      <section className="backup-overview" aria-label="Backup overview">
        <div><DatabaseBackup /><span><small>Recovery points</small><strong>{rows.length}</strong></span></div>
        <div><HardDrive /><span><small>Managed storage</small><strong>{sizeOf(totalSize)}</strong></span></div>
        <div><FileCheck2 /><span><small>Newest backup</small><strong>{rows[0] ? new Date(rows[0].createdAt).toLocaleDateString("en-IN") : "Not created"}</strong></span></div>
      </section>
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
                <th>Actions</th>
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
                    <div className="backup-actions">
                      {can("backups.download") && <button className="secondary" onClick={() => download(row)}>
                        <Download /> Download
                      </button>}
                      {can("backups.delete") && <button className="backup-delete" onClick={() => setDeleteRow(row)} aria-label={`Delete ${row.filename}`}>
                        <Trash2 />
                      </button>}
                    </div>
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
        onClose={closeRestore}
      >
        <form className="form-stack restore-backup-form" onSubmit={restore}>
          <div className="restore-warning">
            <ShieldAlert />
            <div><strong>Current data will be replaced</strong><p>AttendX validates the file and creates a safety backup before restoration. The API then stops for a clean restart.</p></div>
          </div>
          <div className="restore-file-field">
            <span className="restore-file-label">SQLite backup file</span>
            <input
              id="restore-backup-file"
              className="restore-file-input"
              name="backup"
              type="file"
              accept=".sqlite,.db,application/x-sqlite3"
              onChange={(event) => setRestoreFile(event.target.files?.[0] || null)}
              required
            />
            <label className="restore-file-trigger" htmlFor="restore-backup-file">
              <span className="restore-file-icon"><FileUp /></span>
              <span className="restore-file-copy">
                <strong>{restoreFile?.name || "Choose a downloaded backup"}</strong>
                <small>
                  {restoreFile
                    ? `${sizeOf(restoreFile.size)} · ready for validation`
                    : "AttendX .sqlite or .db file · maximum 100 MB"}
                </small>
              </span>
              <span className="restore-file-browse">{restoreFile ? "Change" : "Browse"}</span>
            </label>
          </div>
          <label>
            Your ADMIN password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            Type <code>RESTORE ATTENDX</code>
            <input
              name="confirmation"
              pattern="RESTORE ATTENDX"
              autoComplete="off"
              spellCheck="false"
              required
            />
          </label>
          <div className="dialog-actions">
            <button type="button" className="secondary" disabled={busy} onClick={closeRestore}>Cancel</button>
            <button className="danger" disabled={busy}>
              <ArchiveRestore /> {busy ? "Validating and restoring…" : "Restore and stop API"}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deleteRow}
        title="Delete backup file?"
        onClose={() => !deleting && setDeleteRow(null)}
      >
        <form className="form-stack backup-delete-form" onSubmit={remove}>
          <div className="restore-warning delete-warning">
            <Trash2 />
            <div>
              <strong>This recovery point will be lost</strong>
              <p>{deleteRow?.filename} · {sizeOf(deleteRow?.size || 0)}</p>
            </div>
          </div>
          <label>
            Reason for deletion
            <textarea name="reason" minLength="5" maxLength="250" required placeholder="For example: expired duplicate backup" />
          </label>
          <label>
            Type <code>DELETE BACKUP</code>
            <input name="confirmation" pattern="DELETE BACKUP" autoComplete="off" required />
          </label>
          <label>
            Your Admin++ password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div className="dialog-actions">
            <button type="button" className="secondary" disabled={deleting} onClick={() => setDeleteRow(null)}>Keep backup</button>
            <button className="danger" disabled={deleting}><Trash2 /> {deleting ? "Deleting…" : "Delete permanently"}</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
