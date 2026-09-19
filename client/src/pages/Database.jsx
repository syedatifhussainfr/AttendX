import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Database as DatabaseIcon,
  Download,
  Users,
} from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";

const labels = {
  users: "Users",
  students: "Students",
  subjects: "Subjects",
  timetable: "Timetable",
  attendance_sessions: "Attendance sessions",
  attendance_records: "Attendance records",
  settings: "Settings",
  audit_logs: "Audit logs",
  auth_sessions: "Login sessions",
  app_migrations: "Schema migrations",
};

const displayValue = (value) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export function DatabasePage() {
  const [overview, setOverview] = useState(null);
  const [selected, setSelected] = useState("students");
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/admin/database/overview")
      .then((response) => setOverview(response.data))
      .catch((error) => toast(messageOf(error), "error"));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/admin/database/tables/${selected}`, {
        params: { page, pageSize: 50 },
      })
      .then((response) => setResult(response.data))
      .catch((error) => toast(messageOf(error), "error"))
      .finally(() => setLoading(false));
  }, [selected, page]);

  const columns = useMemo(() => {
    const names = new Set();
    for (const row of result?.rows || [])
      Object.keys(row).forEach((key) => names.add(key));
    return [...names];
  }, [result]);

  const changeTable = (table) => {
    setSelected(table);
    setPage(1);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(result?.rows || [], null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendx-${selected}-page-${page}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page database-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">ADMIN++ · SECURE CONSOLE</span>
          <h1>Database</h1>
          <p>
            Inspect stored records without bypassing AttendX permissions or
            audit rules.
          </p>
        </div>
        <div className="database-engine">
          <DatabaseIcon />
          <div>
            <small>ENGINE</small>
            <strong>{overview?.dialect?.toUpperCase() || "…"}</strong>
          </div>
        </div>
      </div>

      <section className="database-summary">
        <div className="database-location">
          <small>DATABASE FILE</small>
          <code>{overview?.location || "Loading…"}</code>
        </div>
        <div className="database-counts">
          {overview &&
            Object.entries(overview.tables).map(([table, count]) => (
              <button
                key={table}
                className={selected === table ? "active" : ""}
                onClick={() => changeTable(table)}
              >
                <span>{labels[table]}</span>
                <strong>{count}</strong>
              </button>
            ))}
        </div>
      </section>

      <section className="panel database-browser">
        <div className="database-toolbar">
          <div>
            <span className="eyebrow">TABLE</span>
            <h2>{labels[selected]}</h2>
            <p>{result?.total ?? 0} stored records</p>
          </div>
          <div className="button-row">
            {selected === "users" && (
              <button
                className="secondary"
                onClick={() => navigate("/users")}
              >
                <Users /> Manage users
              </button>
            )}
            <select
              value={selected}
              onChange={(event) => changeTable(event.target.value)}
              aria-label="Database table"
            >
              {Object.entries(labels).map(([name, label]) => (
                <option key={name} value={name}>
                  {label}
                </option>
              ))}
            </select>
            <button
              className="secondary"
              onClick={downloadJson}
              disabled={!result?.rows?.length}
            >
              <Download /> Export page JSON
            </button>
          </div>
        </div>

        <div className="database-table-wrap">
          {loading ? (
            <div className="empty">Loading database records…</div>
          ) : result?.rows?.length ? (
            <table className="database-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={row.id ?? row.key ?? index}>
                    {columns.map((column) => (
                      <td key={column} title={displayValue(row[column])}>
                        {displayValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              This table does not contain any records.
            </div>
          )}
        </div>

        <div className="database-pagination">
          <button
            className="secondary"
            disabled={!result || page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft /> Previous
          </button>
          <span>
            Page <strong>{result?.page || page}</strong> of{" "}
            {result?.totalPages || 1}
          </span>
          <button
            className="secondary"
            disabled={!result || page >= result.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next <ChevronRight />
          </button>
        </div>
      </section>
    </div>
  );
}
