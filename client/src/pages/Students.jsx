import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  FileUp,
  Grid2X2,
  List,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { downloadImportErrors, parseCsv } from "../utils/csv.js";

const riskLabel = {
  GOOD: "Good standing",
  WATCH: "Needs attention",
  CRITICAL: "Critical",
  NO_DATA: "No attendance",
};
const initials = (name = "") =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export function Students() {
  const navigate = useNavigate(),
    toast = useToast(),
    { can } = useAuth();
  const [rows, setRows] = useState([]),
    [overview, setOverview] = useState(null),
    [target, setTarget] = useState(75);
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("ALL"),
    [risk, setRisk] = useState("ALL"),
    [sort, setSort] = useState("ROLL");
  const [view, setView] = useState(
    () => localStorage.getItem("attendx_student_view") || "CARDS",
  );
  const [selected, setSelected] = useState(null),
    [create, setCreate] = useState(false);
  const [importing, setImporting] = useState(false),
    [importRows, setImportRows] = useState([]),
    [review, setReview] = useState(null),
    [missingAction, setMissingAction] = useState("KEEP");
  const [deleteStudent, setDeleteStudent] = useState(null),
    [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/students", { params: { q } });
      setRows(data.students || data);
      setOverview(data.overview || null);
      setTarget(data.target || 75);
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };
  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [q]);
  const shown = useMemo(() => {
    const next = rows.filter(
      (student) =>
        (status === "ALL" ||
          (status === "ACTIVE" ? student.active : !student.active)) &&
        (risk === "ALL" || student.attendance.risk === risk),
    );
    next.sort((a, b) => {
      if (sort === "NAME") return a.name.localeCompare(b.name);
      if (sort === "ATTENDANCE")
        return (
          (b.attendance.percentage ?? -1) - (a.attendance.percentage ?? -1)
        );
      if (sort === "RISK") {
        const order = { CRITICAL: 0, WATCH: 1, NO_DATA: 2, GOOD: 3 };
        return order[a.attendance.risk] - order[b.attendance.risk];
      }
      return a.rollNumber.localeCompare(b.rollNumber, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    return next;
  }, [rows, status, risk, sort]);
  const changeView = (next) => {
    setView(next);
    localStorage.setItem("attendx_student_view", next);
  };
  const save = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      ...form,
      ...(selected && { active: form.active === "true" }),
      cardToken: form.cardToken || null,
      photoUrl: form.photoUrl || null,
    };
    try {
      if (selected) await api.patch(`/admin/students/${selected.id}`, payload);
      else await api.post("/admin/students", payload);
      toast(selected ? "Student profile updated." : "Student added.");
      setSelected(null);
      setCreate(false);
      await load();
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };
  const readCsv = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = parseCsv(reader.result);
        const { data } = await api.post("/admin/students/import/preview", {
          rows: parsed,
        });
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
      toast(
        `Import complete: ${data.added} added, ${data.updated} updated, ${data.deactivated} deactivated.`,
      );
      setImporting(false);
      setReview(null);
      await load();
    } catch (error) {
      toast(messageOf(error), "error");
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
      await load();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page student-directory-page">
      <div className="page-intro student-directory-intro">
        <div>
          <span className="eyebrow">STUDENT WORKSPACE</span>
          <h1>Students</h1>
          <p>
            Attendance standing, subject records, profiles, and roster controls
            in one place.
          </p>
        </div>
        {(can("students.import") || can("students.create")) && (
          <div className="button-row">
            {can("students.import") && (
              <label className="secondary file-button">
                <FileUp /> Import CSV
                <input type="file" accept=".csv,text/csv" onChange={readCsv} />
              </label>
            )}
            {can("students.create") && (
              <button className="primary" onClick={() => setCreate(true)}>
                <Plus /> Add student
              </button>
            )}
          </div>
        )}
      </div>
      <section className="student-overview-strip" aria-label="Student overview">
        <article>
          <span>Roster</span>
          <strong>{overview?.total ?? rows.length}</strong>
          <small>{overview?.active ?? 0} active</small>
        </article>
        <article className="good">
          <span>Good standing</span>
          <strong>{overview?.good ?? 0}</strong>
          <small>At or above {target}%</small>
        </article>
        <article className="watch">
          <span>Needs attention</span>
          <strong>{overview?.watch ?? 0}</strong>
          <small>Within 15 points</small>
        </article>
        <article className="critical">
          <span>Critical</span>
          <strong>{overview?.critical ?? 0}</strong>
          <small>Below {Math.max(0, target - 15)}%</small>
        </article>
      </section>
      <section className="student-directory-toolbar">
        <div className="search">
          <Search />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search roll, name, or enrolment"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter student status"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active only</option>
          <option value="INACTIVE">Inactive only</option>
        </select>
        <select
          value={risk}
          onChange={(event) => setRisk(event.target.value)}
          aria-label="Filter attendance standing"
        >
          <option value="ALL">All attendance</option>
          <option value="GOOD">Good standing</option>
          <option value="WATCH">Needs attention</option>
          <option value="CRITICAL">Critical</option>
          <option value="NO_DATA">No attendance</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort students"
        >
          <option value="ROLL">Sort by roll</option>
          <option value="NAME">Sort by name</option>
          <option value="ATTENDANCE">Highest attendance</option>
          <option value="RISK">Highest risk</option>
        </select>
        <div className="student-view-toggle">
          <button
            className={view === "CARDS" ? "active" : ""}
            onClick={() => changeView("CARDS")}
            title="Card view"
          >
            <Grid2X2 />
          </button>
          <button
            className={view === "TABLE" ? "active" : ""}
            onClick={() => changeView("TABLE")}
            title="Table view"
          >
            <List />
          </button>
        </div>
      </section>
      <div className="student-result-note">
        <span>
          {shown.length} student{shown.length === 1 ? "" : "s"}
        </span>
        <small>Credited attendance counts Present records only.</small>
      </div>
      {view === "CARDS" ? (
        <section className="student-card-grid">
          {shown.map((student) => {
            const attendance = student.attendance;
            return (
              <article
                className={`student-card risk-${attendance.risk.toLowerCase()} ${student.active ? "" : "inactive"}`}
                key={student.id}
              >
                <button
                  className="student-card-main"
                  onClick={() => navigate(`/students/${student.id}`)}
                >
                  <span className="student-avatar">
                    {student.photoUrl ? (
                      <img src={student.photoUrl} alt="" />
                    ) : (
                      initials(student.name)
                    )}
                  </span>
                  <span className="student-card-identity">
                    <small>ROLL {student.rollNumber}</small>
                    <strong>{student.name}</strong>
                    <em>
                      {student.section ||
                        student.enrollmentNumber ||
                        (student.active
                          ? "Active student"
                          : "Inactive student")}
                    </em>
                  </span>
                  <ChevronRight />
                </button>
                <div className="student-attendance-line">
                  <div>
                    <span>Attendance</span>
                    <strong>
                      {attendance.percentage == null
                        ? "—"
                        : `${attendance.roundedPercentage}%`}
                    </strong>
                  </div>
                  <div className="student-progress">
                    <i
                      style={{
                        width: `${Math.min(100, attendance.percentage || 0)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`student-risk ${attendance.risk.toLowerCase()}`}
                  >
                    {riskLabel[attendance.risk]}
                  </span>
                </div>
                <div className="student-card-counts">
                  <span>
                    <b>{attendance.present}</b>Present
                  </span>
                  <span>
                    <b>{attendance.late}</b>Late
                  </span>
                  <span>
                    <b>{attendance.absent}</b>Absent
                  </span>
                  <span>
                    <b>{attendance.total}</b>Recorded
                  </span>
                </div>
                <footer>
                  <small>
                    {attendance.lastAttendedAt
                      ? `Last attended ${attendance.lastAttendedAt}`
                      : "No attendance recorded"}
                  </small>
                  {can("students.update") && (
                    <button onClick={() => setSelected(student)}>
                      <Pencil /> Edit
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="panel table-panel student-table-panel">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Standing</th>
                <th>Present</th>
                <th>Late</th>
                <th>Absent</th>
                <th>Recorded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((student) => (
                <tr
                  key={student.id}
                  className="clickable"
                  onClick={() => navigate(`/students/${student.id}`)}
                >
                  <td>
                    <div className="student-table-name">
                      <span>{student.rollNumber}</span>
                      <div>
                        <strong>{student.name}</strong>
                        <small>
                          {student.section ||
                            student.enrollmentNumber ||
                            "No additional details"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`student-risk ${student.attendance.risk.toLowerCase()}`}
                    >
                      {student.attendance.percentage == null
                        ? "No data"
                        : `${student.attendance.roundedPercentage}% · ${riskLabel[student.attendance.risk]}`}
                    </span>
                  </td>
                  <td>{student.attendance.present}</td>
                  <td>{student.attendance.late}</td>
                  <td>{student.attendance.absent}</td>
                  <td>{student.attendance.total}</td>
                  <td>
                    {can("students.update") && (
                      <button
                        className="icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(student);
                        }}
                      >
                        <Pencil />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {!shown.length && (
        <section className="student-empty">
          <UserRound />
          <h2>No students match these filters</h2>
          <p>Change the search or attendance filters to see the roster.</p>
        </section>
      )}
      <Dialog
        open={create || !!selected}
        title={selected ? `Edit roll ${selected.rollNumber}` : "Add student"}
        onClose={() => {
          setSelected(null);
          setCreate(false);
        }}
      >
        <form className="form-grid student-form" onSubmit={save}>
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
          <label>
            Enrolment number
            <input
              name="enrollmentNumber"
              defaultValue={selected?.enrollmentNumber || ""}
            />
          </label>
          <label>
            Section / group
            <input name="section" defaultValue={selected?.section || ""} />
          </label>
          <label>
            Admission date
            <input
              name="admissionDate"
              type="date"
              defaultValue={selected?.admissionDate || ""}
            />
          </label>
          {selected && (
            <label>
              Status
              <select name="active" defaultValue={String(selected.active)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          )}
          <label>
            Student phone
            <input
              name="phoneNumber"
              inputMode="tel"
              defaultValue={selected?.phoneNumber || ""}
              placeholder="Optional"
            />
          </label>
          <label>
            Guardian phone
            <input
              name="guardianPhone"
              inputMode="tel"
              defaultValue={selected?.guardianPhone || ""}
              placeholder="Optional"
            />
          </label>
          {selected && (
            <label>
              Card token
              <input
                name="cardToken"
                defaultValue={selected.cardToken || ""}
                placeholder="Random secure token"
              />
            </label>
          )}
          <label className={selected ? "" : "full"}>
            Photo URL
            <input name="photoUrl" defaultValue={selected?.photoUrl || ""} />
          </label>
          <label className="full">
            Administrative notes
            <textarea
              name="notes"
              rows="3"
              maxLength="1000"
              defaultValue={selected?.notes || ""}
              placeholder="Optional; never shown to CR accounts"
            />
          </label>
          <div className="student-form-privacy full">
            <ShieldAlert />
            <span>
              Phone numbers, guardian contact, notes, and card tokens are
              visible only to administrators.
            </span>
          </div>
          <div className="dialog-actions full">
            {selected && can("students.delete") && (
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
            <button className="primary">
              {selected ? "Save profile" : "Add student"}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deleteStudent}
        title={
          deleteStudent ? `Delete ${deleteStudent.name}?` : "Delete student"
        }
        onClose={() => !deleting && setDeleteStudent(null)}
      >
        <form className="form-stack" onSubmit={remove}>
          <div className="danger-note">
            Permanent deletion is allowed only when no attendance history
            references this student. Otherwise, mark the profile inactive.
          </div>
          <label>
            Confirm your Admin++ password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
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
        {review && (
          <div className="import-review">
            <p>
              Nothing has been changed yet. Review every category, then confirm
              one transactional update.
            </p>
            <div className="import-summary">
              <span>
                <b>{review.summary.new}</b> New
              </span>
              <span>
                <b>{review.summary.changed}</b> Name changes
              </span>
              <span>
                <b>{review.summary.unchanged}</b> Unchanged
              </span>
              <span>
                <b>{review.summary.invalid}</b> Invalid
              </span>
              <span>
                <b>{review.summary.missing}</b> Missing
              </span>
            </div>
            {!!review.nameChanges.length && (
              <section>
                <h3>Name changes</h3>
                {review.nameChanges.slice(0, 10).map((row) => (
                  <div className="import-line" key={row.rollNumber}>
                    <b>{row.rollNumber}</b>
                    <span>
                      {row.oldName} → {row.name}
                    </span>
                  </div>
                ))}
              </section>
            )}
            {!!review.newStudents.length && (
              <section>
                <h3>New students</h3>
                {review.newStudents.slice(0, 10).map((row) => (
                  <div className="import-line" key={row.rollNumber}>
                    <b>{row.rollNumber}</b>
                    <span>{row.name}</span>
                  </div>
                ))}
              </section>
            )}
            {!!review.invalidRows.length && (
              <section className="import-errors">
                <h3>Invalid or duplicate rows</h3>
                {review.invalidRows.slice(0, 10).map((row) => (
                  <div
                    className="import-line"
                    key={`${row.rowNumber}-${row.rollNumber}`}
                  >
                    <b>Row {row.rowNumber}</b>
                    <span>{row.errors.join(" ")}</span>
                  </div>
                ))}
                <button
                  className="secondary"
                  onClick={() => downloadImportErrors(review.invalidRows)}
                >
                  Download error CSV
                </button>
              </section>
            )}
            {!!review.missingStudents.length && (
              <section>
                <h3>Active students missing from this CSV</h3>
                <p>
                  {review.missingStudents
                    .map((row) => row.rollNumber)
                    .join(", ")}
                </p>
                <label>
                  When applying
                  <select
                    value={missingAction}
                    onChange={(event) => setMissingAction(event.target.value)}
                  >
                    <option value="KEEP">Keep them active</option>
                    <option value="DEACTIVATE">Deactivate them</option>
                  </select>
                </label>
              </section>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setImporting(false)}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={submitImport}
            disabled={!review?.canApply}
          >
            Confirm and apply {review?.summary.valid || 0} rows
          </button>
        </div>
      </Dialog>
    </div>
  );
}
