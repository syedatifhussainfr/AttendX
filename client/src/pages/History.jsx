import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Download,
  Filter,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { downloadAttendanceExport } from "../utils/download.js";
import { useAuth } from "../state/AuthContext.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { useClass } from "../state/ClassContext.jsx";
export function History() {
  const [rows, setRows] = useState([]),
    [subjects, setSubjects] = useState([]),
    [filters, setFilters] = useState({}),
    [deleteSession, setDeleteSession] = useState(null),
    [deleting, setDeleting] = useState(false),
    toast = useToast(),
    nav = useNavigate(),
    { can } = useAuth(),
    { classId, selectedClass } = useClass();
  const load = async (params = {}) => {
    if (!classId) return;
    const scopedParams = { ...params, classId };
    try {
      const [r, s] = await Promise.all([
        api.get("/attendance/sessions", { params: scopedParams }),
        can("subjects.view")
          ? api.get("/admin/subjects", { params: { classId } })
          : Promise.resolve({ data: [] }),
      ]);
      setRows(r.data);
      setSubjects(s.data);
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  useEffect(() => {
    load();
  }, [classId]);
  const filter = (e) => {
    e.preventDefault();
    const nextFilters = Object.fromEntries(new FormData(e.currentTarget));
    setFilters(nextFilters);
    load(nextFilters);
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
      await api.delete(`/attendance/sessions/${deleteSession.id}`, {
        data: {
          confirmation: form.confirmation,
          reason: form.reason,
        },
      });
      toast(
        "Attendance session permanently deleted. Its audit snapshot was preserved.",
      );
      setDeleteSession(null);
      await load(filters);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setDeleting(false);
    }
  };
  const exportRange = async (e, review) => {
    const params = {
      ...Object.fromEntries(
      new FormData(e.currentTarget.closest("form")),
      ),
      classId,
    };
    try {
      const filename = await downloadAttendanceExport({ review, params });
      toast(
        `${review ? "Review report" : "Machine data"} downloaded as ${filename}.`,
      );
    } catch (x) {
      toast(messageOf(x), "error");
    }
  };
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">REPORTING</span>
          <h1>Attendance history</h1>
          <p>{selectedClass?.displayName} · recorded sessions, summaries and exports.</p>
        </div>
      </div>
      <form className="filter-bar" onSubmit={filter}>
        <label>
          From
          <input name="from" type="date" />
        </label>
        <label>
          To
          <input name="to" type="date" />
        </label>
        <label>
          Subject
          <select name="subjectId">
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary">
          <Filter />
          Apply
        </button>
        {can("reports.export") && (
          <button
            type="button"
            className="secondary"
            onClick={(e) => exportRange(e, false)}
          >
            <Download />
            Machine data
          </button>
        )}
        {can("reports.export") && (
          <button
            type="button"
            className="primary"
            onClick={(e) => exportRange(e, true)}
          >
            <Download />
            Review report
          </button>
        )}
      </form>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Date & time</th>
              <th>Subject conducted</th>
              <th>Type</th>
              <th>Present</th>
              <th>Late</th>
              <th>Absent / pending</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.sessionDate}</strong>
                  <small>
                    {r.scheduledStartTime}–{r.scheduledEndTime}
                  </small>
                </td>
                <td>{r.Subject.name}</td>
                <td>{r.sessionType}</td>
                <td>
                  <b className="text-present">{r.summary.present}</b>
                </td>
                <td>
                  <b className="text-late">{r.summary.late}</b>
                </td>
                <td>
                  {r.status === "CLOSED" ? r.summary.absent : r.summary.pending}
                </td>
                <td>
                  <span className={`table-status ${r.status.toLowerCase()}`}>
                    {r.status}
                  </span>
                </td>
                <td>
                  <div className="history-actions">
                    <button
                      className="row-action"
                      onClick={() => nav(`/attendance/${r.id}`)}
                    >
                      View
                      <ArrowRight />
                    </button>
                    {r.status === "CLOSED" && can("attendance.delete") && (
                      <button
                        className="history-delete"
                        onClick={() => setDeleteSession(r)}
                        aria-label={`Delete ${r.Subject.name} attendance from ${r.sessionDate}`}
                        title="Permanently delete this closed session"
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
        {!rows.length && (
          <div className="empty">No sessions match these filters.</div>
        )}
      </section>
      <Dialog
        open={!!deleteSession}
        title="Permanently delete attendance?"
        onClose={() => !deleting && setDeleteSession(null)}
      >
        <form className="form-stack delete-attendance-form" onSubmit={remove}>
          <div className="destructive-summary">
            <span className="destructive-summary-icon">
              <ShieldAlert />
            </span>
            <div>
              <strong>This cannot be undone</strong>
              <p>
                {deleteSession?.Subject.name} · {deleteSession?.sessionDate} ·{" "}
                {deleteSession?.scheduledStartTime}–
                {deleteSession?.scheduledEndTime}
              </p>
              <small>
                Detailed attendance records will be removed. The session
                snapshot, your reason, identity, and deletion time stay in the
                audit log.
              </small>
            </div>
          </div>
          <label className="delete-attendance-field">
            <span className="field-label">Reason for deletion</span>
            <textarea
              name="reason"
              minLength="5"
              maxLength="250"
              required
              placeholder="Explain why this attendance history must be removed"
            />
            <small className="field-help">
              Required · 5–250 characters · recorded permanently
            </small>
          </label>
          <label className="delete-attendance-field confirmation-field">
            <span className="field-label">Confirmation phrase</span>
            <small className="field-help">
              Type <code>DELETE ATTENDANCE</code> exactly as shown.
            </small>
            <input
              name="confirmation"
              autoComplete="off"
              pattern="DELETE ATTENDANCE"
              spellCheck="false"
              required
            />
          </label>
          <label className="delete-attendance-field">
            <span className="field-label">Your Admin++ password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            <small className="field-help">
              Password confirmation unlocks this action for five minutes.
            </small>
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              disabled={deleting}
              onClick={() => setDeleteSession(null)}
            >
              Cancel
            </button>
            <button className="danger" disabled={deleting}>
              <Trash2 />
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
