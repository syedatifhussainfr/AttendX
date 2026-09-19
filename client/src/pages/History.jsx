import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, Filter } from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { downloadAttendanceExport } from "../utils/download.js";
export function History() {
  const [rows, setRows] = useState([]),
    [subjects, setSubjects] = useState([]),
    toast = useToast(),
    nav = useNavigate();
  const load = async (params = {}) => {
    try {
      const [r, s] = await Promise.all([
        api.get("/attendance/sessions", { params }),
        api.get("/admin/subjects"),
      ]);
      setRows(r.data);
      setSubjects(s.data);
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const filter = (e) => {
    e.preventDefault();
    load(Object.fromEntries(new FormData(e.currentTarget)));
  };
  const exportRange = async (e, review) => {
    const params = Object.fromEntries(
      new FormData(e.currentTarget.closest("form")),
    );
    try {
      const filename = await downloadAttendanceExport({ review, params });
      toast(`${review ? "Review report" : "Machine data"} downloaded as ${filename}.`);
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
          <p>Recorded sessions, summaries and exports.</p>
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
        <button type="button" className="secondary" onClick={(e) => exportRange(e, false)}>
          <Download />
          Machine data
        </button>
        <button type="button" className="primary" onClick={(e) => exportRange(e, true)}>
          <Download />
          Review report
        </button>
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
              <th>Absent / missing</th>
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
                  {r.status === "CLOSED"
                    ? r.summary.absent
                    : 78 - r.summary.total}
                </td>
                <td>
                  <span className={`table-status ${r.status.toLowerCase()}`}>
                    {r.status}
                  </span>
                </td>
                <td>
                  <button
                    className="row-action"
                    onClick={() => nav(`/attendance/${r.id}`)}
                  >
                    View
                    <ArrowRight />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">No sessions match these filters.</div>
        )}
      </section>
    </div>
  );
}
