import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database as DatabaseIcon,
  Download,
  FileClock,
  GraduationCap,
  KeyRound,
  Settings,
  ShieldCheck,
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

const managementAreas = [
  {
    tables: ["users"],
    route: "/users",
    label: "Users & access",
    description: "Create, disable, reset, or safely delete accounts.",
    action: "Manage users",
    Icon: Users,
  },
  {
    tables: ["students"],
    route: "/students",
    label: "Students",
    description: "Add, edit, import, and deactivate student records.",
    action: "Manage students",
    Icon: GraduationCap,
  },
  {
    tables: ["subjects"],
    route: "/subjects",
    label: "Subjects",
    description: "Create subjects and update their names or status.",
    action: "Manage subjects",
    Icon: BookOpen,
  },
  {
    tables: ["timetable"],
    route: "/timetable",
    label: "Timetable",
    description: "Create, edit, activate, or remove timetable entries.",
    action: "Manage timetable",
    Icon: CalendarDays,
  },
  {
    tables: ["attendance_sessions", "attendance_records"],
    route: "/history",
    label: "Attendance records",
    description: "Review sessions and make reason-backed corrections.",
    action: "Review attendance",
    Icon: FileClock,
  },
  {
    tables: ["settings"],
    route: "/settings",
    label: "System settings",
    description: "Update attendance rules and academic configuration.",
    action: "Manage settings",
    Icon: Settings,
  },
  {
    tables: ["audit_logs"],
    route: "/audit",
    label: "Audit history",
    description: "Inspect protected change history and administrator actions.",
    action: "View audit logs",
    Icon: ShieldCheck,
  },
  {
    tables: ["auth_sessions"],
    route: "/change-password",
    label: "Login sessions",
    description: "Review devices and revoke active browser sessions.",
    action: "Manage sessions",
    Icon: KeyRound,
  },
];

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
  const selectedManagement = managementAreas.find((area) =>
    area.tables.includes(selected),
  );
  const SelectedManagementIcon = selectedManagement?.Icon;

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
            Inspect every table, then create or edit data through protected,
            validated management controls.
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

      <section className="panel database-management">
        <div className="database-management-head">
          <div>
            <span className="eyebrow">MANAGE DATA</span>
            <h2>Safe editing controls</h2>
            <p>
              Changes use AttendX validation, permissions, relationships, and
              audit rules instead of unsafe raw cell editing.
            </p>
          </div>
          <ShieldCheck />
        </div>
        <div className="database-management-grid">
          {managementAreas.map(({ route, label, description, Icon }) => (
            <button key={route} onClick={() => navigate(route)}>
              <span>
                <Icon />
              </span>
              <div>
                <strong>{label}</strong>
                <small>{description}</small>
              </div>
              <ArrowRight />
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
            {selectedManagement && (
              <button
                className="primary database-manage-action"
                onClick={() => navigate(selectedManagement.route)}
              >
                <SelectedManagementIcon /> {selectedManagement.action}
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
