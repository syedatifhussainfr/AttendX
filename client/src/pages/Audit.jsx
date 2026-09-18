import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
export function Audit() {
  const [rows, setRows] = useState([]),
    toast = useToast();
  useEffect(() => {
    api
      .get("/admin/audit-logs")
      .then((r) => setRows(r.data))
      .catch((e) => toast(messageOf(e), "error"));
  }, []);
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ACCOUNTABILITY</span>
          <h1>Audit logs</h1>
          <p>Permanent record of corrections and session closure.</p>
        </div>
        <span className="large-icon">
          <ShieldCheck />
        </span>
      </div>
      <section className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Student / session</th>
              <th>Change</th>
              <th>Reason</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                <td>
                  <strong>{r.action.replaceAll("_", " ")}</strong>
                </td>
                <td>
                  {r.Student
                    ? `${r.Student.rollNumber} · ${r.Student.name}`
                    : r.AttendanceSession
                      ? `Session ${r.AttendanceSession.sessionDate}`
                      : `${r.entityType} #${r.entityId}`}
                </td>
                <td>
                  {r.oldValue && <span>{r.oldValue} → </span>}
                  <b>{r.newValue}</b>
                </td>
                <td>{r.reason || "—"}</td>
                <td>{r.User?.name || "System"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">No auditable actions recorded yet.</div>
        )}
      </section>
    </div>
  );
}
