import { useEffect, useRef, useState } from "react";
import {
  ArchiveRestore,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileUp,
  HardDrive,
  LoaderCircle,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { ManualEntryInput } from "../components/ManualEntryInput.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";

const sizeOf = (bytes) =>
  bytes === 0
    ? "0 KB"
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const SECURE_RESTORE_MILLISECONDS = 10_000;

const pause = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForApiRestart(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  await pause(900);
  while (Date.now() < deadline) {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (response.ok) return true;
    } catch {
      // The short connection gap is expected while SQLite is reopened.
    }
    await pause(400);
  }
  return false;
}

export function BackupsPage() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState("");
  const [restoreProgress, setRestoreProgress] = useState({
    percent: 0,
    label: "",
    eta: 0,
  });
  const restoreControllerRef = useRef(null);
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
    setRestoreStatus("");
    setRestoreProgress({ percent: 0, label: "", eta: 0 });
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
    const controller = new AbortController();
    restoreControllerRef.current = controller;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const startedAt = Date.now();
    let uploadedRatio = 0;
    const stageFor = (elapsed) =>
      elapsed < 2_000
        ? "Uploading protected SQLite data"
        : elapsed < 4_000
          ? "Checking file signature and format"
          : elapsed < 6_500
            ? "Scanning database integrity and relationships"
            : elapsed < 8_500
              ? "Verifying schema and administrator recovery"
              : "Preparing atomic database replacement";
    setRestoreProgress({
      percent: 3,
      label: "Starting secure restore verification",
      eta: 10,
    });
    const ticker = window.setInterval(() => {
      const elapsed = Math.min(
        Date.now() - startedAt,
        SECURE_RESTORE_MILLISECONDS,
      );
      const timeRatio = elapsed / SECURE_RESTORE_MILLISECONDS;
      setRestoreProgress({
        percent: Math.min(
          94,
          Math.max(
            8 + Math.round(timeRatio * 84),
            Math.round(uploadedRatio * 42),
          ),
        ),
        label: stageFor(elapsed),
        eta: Math.max(
          0,
          Math.ceil((SECURE_RESTORE_MILLISECONDS - elapsed) / 1000),
        ),
      });
    }, 150);
    try {
      const { data } = await api.post("/admin/backups/restore", form, {
        signal: controller.signal,
        onUploadProgress: (upload) => {
          if (upload.total) uploadedRatio = upload.loaded / upload.total;
        },
      });
      window.clearInterval(ticker);
      setRestoreProgress({
        percent: 96,
        label: "Verified backup applied safely",
        eta: 0,
      });
      toast(data.message);
      setRestoreStatus("Database restored. Restarting the AttendX API…");
      const restarted = await waitForApiRestart();
      if (!restarted) {
        setRestoreStatus(
          "The database is restored, but the API is taking longer than expected. Restart npm run dev if it does not return.",
        );
        setBusy(false);
        return;
      }
      setRestoreStatus("API ready. Reloading your restored workspace…");
      window.sessionStorage.setItem(
        "attendx:restore-complete",
        JSON.stringify({
          sourceName: data.restored?.sourceName || restoreFile?.name,
          students: data.restored?.students,
          administrators: data.restored?.administrators,
          safetyBackup: data.safetyBackup,
        }),
      );
      await pause(350);
      window.location.assign("/login?restored=1");
    } catch (error) {
      window.clearInterval(ticker);
      if (error.name === "CanceledError" || error.name === "AbortError") {
        toast("Backup restore cancelled before database replacement.");
        setRestoreStatus("");
      } else toast(messageOf(error), "error");
      setBusy(false);
      setRestoreProgress({ percent: 0, label: "", eta: 0 });
    } finally {
      restoreControllerRef.current = null;
    }
  };
  const cancelRestore = () => restoreControllerRef.current?.abort();
  const chooseRestoreFile = async (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return setRestoreFile(null);
    if (!/\.sqlite$/i.test(file.name)) {
      event.target.value = "";
      setRestoreFile(null);
      return toast("Choose an AttendX .sqlite backup file only.", "error");
    }
    if (file.size < 100 || file.size > 100 * 1024 * 1024) {
      event.target.value = "";
      setRestoreFile(null);
      return toast("SQLite backups must be between 100 bytes and 100 MB.", "error");
    }
    const signature = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const expected = new TextEncoder().encode("SQLite format 3\u0000");
    if (!expected.every((byte, index) => signature[index] === byte)) {
      event.target.value = "";
      setRestoreFile(null);
      return toast("The selected file is not a valid SQLite 3 database.", "error");
    }
    setRestoreFile(file);
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
      await api.delete(
        `/admin/backups/${encodeURIComponent(deleteRow.filename)}`,
        {
          data: {
            confirmation: form.confirmation,
            reason: form.reason,
          },
        },
      );
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
          {can("backups.restore") && (
            <button
              className="secondary"
              onClick={() => {
                setRestoreFile(null);
                setRestoreOpen(true);
              }}
            >
              <ArchiveRestore /> Restore
            </button>
          )}
          {can("backups.create") && (
            <button className="primary" onClick={create} disabled={busy}>
              <Plus /> {busy ? "Creating…" : "Create backup"}
            </button>
          )}
        </div>
      </div>
      <section className="backup-overview" aria-label="Backup overview">
        <div>
          <DatabaseBackup />
          <span>
            <small>Recovery points</small>
            <strong>{rows.length}</strong>
          </span>
        </div>
        <div>
          <HardDrive />
          <span>
            <small>Managed storage</small>
            <strong>{sizeOf(totalSize)}</strong>
          </span>
        </div>
        <div>
          <FileCheck2 />
          <span>
            <small>Newest backup</small>
            <strong>
              {rows[0]
                ? new Date(rows[0].createdAt).toLocaleDateString("en-IN")
                : "Not created"}
            </strong>
          </span>
        </div>
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
                      {can("backups.download") && (
                        <button
                          className="secondary"
                          onClick={() => download(row)}
                        >
                          <Download /> Download
                        </button>
                      )}
                      {can("backups.delete") && (
                        <button
                          className="backup-delete"
                          onClick={() => setDeleteRow(row)}
                          aria-label={`Delete ${row.filename}`}
                        >
                          <Trash2 />
                        </button>
                      )}
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
            <div>
              <strong>Current data will be replaced</strong>
              <p>
                AttendX validates the file, creates a safety backup, replaces
                the database, and relaunches the API automatically.
              </p>
            </div>
          </div>
          <div className="restore-file-field">
            <span className="restore-file-label">SQLite backup file</span>
            <input
              id="restore-backup-file"
              className="restore-file-input"
              name="backup"
              type="file"
              accept=".sqlite,application/x-sqlite3,application/vnd.sqlite3"
              onChange={chooseRestoreFile}
              required
            />
            <label
              className="restore-file-trigger"
              htmlFor="restore-backup-file"
            >
              <span className="restore-file-icon">
                <FileUp />
              </span>
              <span className="restore-file-copy">
                <strong>
                  {restoreFile?.name || "Choose a downloaded backup"}
                </strong>
                <small>
                  {restoreFile
                    ? `${sizeOf(restoreFile.size)} · ready for validation`
                    : "AttendX .sqlite file only · maximum 100 MB"}
                </small>
              </span>
              <span className="restore-file-browse">
                {restoreFile ? "Change" : "Browse"}
              </span>
            </label>
          </div>
          <label>
            Your ADMIN password
            <ManualEntryInput
              id="backup-restore-admin-password"
              name="password"
              required
            />
          </label>
          <label>
            Type <code>RESTORE ATTENDX</code>
            <ManualEntryInput
              id="backup-restore-confirmation"
              name="confirmation"
              type="text"
              expected="RESTORE ATTENDX"
              pattern="RESTORE ATTENDX"
              required
            />
          </label>
          {restoreStatus && (
            <div className="restore-restart-status" role="status" aria-live="polite">
              <span aria-hidden="true" />
              {restoreStatus}
            </div>
          )}
          {busy && !restoreStatus && (
            <div className="restore-verification-progress" aria-live="polite">
              <span className="restore-verification-spinner">
                <LoaderCircle />
              </span>
              <div>
                <strong>{restoreProgress.label}</strong>
                <small>
                  {restoreProgress.eta
                    ? `Safety verification in about ${restoreProgress.eta}s`
                    : "Final database verification"}
                </small>
                <div className="restore-verification-stages">
                  <b className={restoreProgress.percent >= 8 ? "done" : "active"}>
                    Upload
                  </b>
                  <b className={restoreProgress.percent >= 28 ? "done" : ""}>
                    Signature
                  </b>
                  <b className={restoreProgress.percent >= 50 ? "done" : ""}>
                    Integrity
                  </b>
                  <b className={restoreProgress.percent >= 72 ? "done" : ""}>
                    Schema
                  </b>
                  <b className={restoreProgress.percent >= 90 ? "done" : ""}>
                    Apply
                  </b>
                </div>
                <i>
                  <b style={{ width: `${restoreProgress.percent}%` }} />
                </i>
                <em>{restoreProgress.percent}%</em>
              </div>
            </div>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={busy ? cancelRestore : closeRestore}
            >
              {busy ? (
                <>
                  <X /> Cancel verification
                </>
              ) : (
                "Cancel"
              )}
            </button>
            <button className="danger" disabled={busy}>
              <ArchiveRestore />{" "}
              {busy ? "Restoring and restarting…" : "Restore database"}
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
              <p>
                {deleteRow?.filename} · {sizeOf(deleteRow?.size || 0)}
              </p>
            </div>
          </div>
          <label>
            Reason for deletion
            <textarea
              name="reason"
              minLength="5"
              maxLength="250"
              required
              placeholder="For example: expired duplicate backup"
            />
          </label>
          <label>
            Type <code>DELETE BACKUP</code>
            <ManualEntryInput
              id="backup-delete-confirmation"
              name="confirmation"
              type="text"
              expected="DELETE BACKUP"
              pattern="DELETE BACKUP"
              required
            />
          </label>
          <label>
            Your Admin++ password
            <ManualEntryInput
              id="backup-delete-admin-password"
              name="password"
              required
            />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              disabled={deleting}
              onClick={() => setDeleteRow(null)}
            >
              Keep backup
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
