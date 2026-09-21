import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Search, ShieldCheck } from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";

const readable = (value) => {
  if (value == null || value === "") return "—";
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object") return String(parsed);
    return Object.entries(parsed)
      .slice(0, 4)
      .map(
        ([key, item]) =>
          `${key}: ${typeof item === "object" ? JSON.stringify(item) : item}`,
      )
      .join(" · ");
  } catch {
    return String(value);
  }
};

const targetOf = (row) =>
  row.Student
    ? {
        primary: `${row.Student.rollNumber} · ${row.Student.name}`,
        secondary: "Student",
      }
    : row.AttendanceSession
      ? {
          primary: row.AttendanceSession.sessionDate,
          secondary: `Session #${row.AttendanceSession.id}`,
        }
      : {
          primary: `${row.entityType} #${row.entityId}`,
          secondary: "System record",
        };

export function Audit() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  useEffect(() => {
    api
      .get("/admin/audit-logs")
      .then((r) => setRows(r.data))
      .catch((e) => toast(messageOf(e), "error"));
  }, []);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.action,
        row.reason,
        row.User?.name,
        row.Student?.rollNumber,
        row.Student?.name,
        row.AttendanceSession?.sessionDate,
        row.entityType,
        row.oldValue,
        row.newValue,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, rows]);
  const download = async () => {
    setDownloading(true);
    try {
      const response = await api.get("/admin/audit-logs/export", {
        responseType: "blob",
      });
      const disposition = response.headers["content-disposition"] || "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] || "attendx-audit.txt";
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast(`Audit log downloaded as ${filename}.`);
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="page audit-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ACCOUNTABILITY</span>
          <h1>Audit logs</h1>
          <p>
            Traceable changes with their actor, target, reason, and before/after
            values.
          </p>
        </div>
        <button className="primary" onClick={download} disabled={downloading}>
          <Download /> {downloading ? "Preparing…" : "Download .txt log"}
        </button>
      </div>
      <section className="audit-summary" aria-label="Audit log summary">
        <div>
          <ShieldCheck />
          <span><small>Visible entries</small><strong>{rows.length}</strong></span>
        </div>
        <div>
          <FileText />
          <span><small>Export format</small><strong>Plain text</strong></span>
        </div>
        <label className="audit-search">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, roll, user, reason…"
            aria-label="Search audit logs"
          />
        </label>
      </section>
      <section className="panel table-panel audit-table-panel">
        <table className="audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Target</th>
              <th>Recorded change</th>
              <th>Reason</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const target = targetOf(row);
              const timestamp = new Date(row.createdAt);
              return <tr key={row.id}>
                <td className="audit-time">
                  <strong>{timestamp.toLocaleDateString("en-IN")}</strong>
                  <small>{timestamp.toLocaleTimeString("en-IN")}</small>
                </td>
                <td>
                  <span className="audit-action">
                    {row.action.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="audit-target">
                  <strong>{target.primary}</strong>
                  <small>{target.secondary}</small>
                </td>
                <td>
                  <div className="audit-change">
                    {row.oldValue && <span><small>FROM</small>{readable(row.oldValue)}</span>}
                    {row.newValue && <span><small>TO</small>{readable(row.newValue)}</span>}
                    {!row.oldValue && !row.newValue && <span>Metadata-only action</span>}
                  </div>
                </td>
                <td className="audit-reason">{row.reason || "No reason supplied"}</td>
                <td><span className="audit-actor">{row.User?.name || "System"}</span></td>
              </tr>;
            })}
          </tbody>
        </table>
        {!shown.length && (
          <div className="empty">
            {rows.length
              ? "No audit entries match your search."
              : "No auditable actions recorded yet."}
          </div>
        )}
      </section>
    </div>
  );
}
