import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarRange,
  Check,
  GraduationCap,
  Layers3,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  UserMinus,
  UserRound,
} from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { ManualEntryInput } from "../components/ManualEntryInput.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useClass } from "../state/ClassContext.jsx";
import { useToast } from "../state/ToastContext.jsx";

const blank = {
  displayName: "",
  code: "",
  course: "",
  specialization: "",
  semester: "",
  section: "",
  academicYear: "",
  batch: "",
};

export function Classes() {
  const { can, user } = useAuth();
  const { classes, classId, selectClass, reloadClasses } = useClass();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [staff, setStaff] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [staffRemoval, setStaffRemoval] = useState(null);
  const [staffRemovalConfirmation, setStaffRemovalConfirmation] = useState("");
  const [removingStaff, setRemovingStaff] = useState(false);
  const [deleteClass, setDeleteClass] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const selected = classes.find((item) => item.id === classId) || null;

  const loadOptions = async () => {
    if (!selected) return;
    try {
      const requests = [
        api.get("/admin/subjects", {
          params: { courseCategory: selected.course },
        }),
      ];
      if (can("classes.assignStaff"))
        requests.push(api.get(`/admin/classes/${selected.id}/staff-options`));
      const [subjectResponse, staffResponse] = await Promise.all(requests);
      setSubjects(subjectResponse.data);
      setStaff(staffResponse?.data || []);
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };
  useEffect(() => {
    loadOptions();
  }, [selected?.id]);

  const save = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of [
      "specialization",
      "semester",
      "section",
      "academicYear",
      "batch",
    ])
      data[key] = data[key] || null;
    if (Object.hasOwn(data, "active")) data.active = data.active === "true";
    try {
      if (editing) await api.patch(`/admin/classes/${editing.id}`, data);
      else await api.post("/admin/classes", data);
      toast(editing ? "Class updated." : "Class created.");
      setEditing(null);
      setCreating(false);
      await reloadClasses();
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };

  const removeStaff = async (event) => {
    event.preventDefault();
    if (staffRemovalConfirmation !== "REMOVE ACCESS") {
      toast("Type REMOVE ACCESS exactly to continue.", "error");
      return;
    }
    setRemovingStaff(true);
    try {
      const form = new FormData(event.currentTarget);
      await api.delete(
        `/admin/classes/${selected.id}/assignments/${staffRemoval.User.id}`,
        {
          data: {
            confirmation: staffRemovalConfirmation,
            password: form.get("password"),
          },
        },
      );
      toast("Class access removed.");
      setStaffRemoval(null);
      setStaffRemovalConfirmation("");
      await reloadClasses();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setRemovingStaff(false);
    }
  };

  const assignStaff = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api.put(
        `/admin/classes/${selected.id}/assignments/${data.userId}`,
        {
          assignmentRole: data.assignmentRole,
        },
      );
      toast("Class staff assignment saved.");
      await reloadClasses();
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };

  const assignedSubjectIds = useMemo(
    () => new Set((selected?.subjects || []).map((item) => item.id)),
    [selected],
  );
  const toggleSubject = async (subject) => {
    try {
      const path = `/admin/classes/${selected.id}/subjects/${subject.id}`;
      if (assignedSubjectIds.has(subject.id)) await api.delete(path);
      else await api.put(path);
      await reloadClasses();
      toast(
        assignedSubjectIds.has(subject.id)
          ? "Subject removed from class."
          : "Subject added to class.",
      );
    } catch (error) {
      toast(messageOf(error), "error");
    }
  };

  const removeClass = async (event) => {
    event.preventDefault();
    if (deleteConfirmation !== "DELETE CLASS") {
      toast("Type DELETE CLASS exactly to continue.", "error");
      return;
    }
    setDeleting(true);
    try {
      const form = new FormData(event.currentTarget);
      const { data } = await api.post("/auth/elevate", {
        password: form.get("password"),
      });
      setAdminElevation(data.elevationToken, data.expiresInSeconds);
      await api.delete(`/admin/classes/${deleteClass.id}`, {
        data: { confirmation: deleteConfirmation },
      });
      toast("Empty class permanently deleted.");
      setDeleteClass(null);
      setDeleteConfirmation("");
      setEditing(null);
      await reloadClasses();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page class-workspace">
      <div className="page-intro class-page-intro">
        <div>
          <span className="eyebrow">ACADEMIC WORKSPACES</span>
          <h1>Classes</h1>
          <p>
            Manage class identity, mentors, faculty access, subjects, rosters,
            timetables and attendance boundaries from database-backed records.
          </p>
        </div>
        {can("classes.create") && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus /> Create class
          </button>
        )}
      </div>

      <div className="class-card-grid">
        {classes.map((item) => (
          <article
            className={`class-card ${item.id === classId ? "selected" : ""}`}
            key={item.id}
          >
            <button
              className="class-card-main"
              onClick={() => item.active && selectClass(item.id)}
              disabled={!item.active}
              aria-pressed={item.id === classId}
            >
              <div className="class-card-topline">
                <span>{item.code}</span>
                <b className={item.active ? "active" : "archived"}>
                  {item.id === classId
                    ? "Current"
                    : item.active
                      ? "Available"
                      : "Archived"}
                </b>
              </div>
              <h2>{item.displayName}</h2>
              <div className="class-card-context">
                {item.course && <span>{item.course}</span>}
                {item.specialization && <span>{item.specialization}</span>}
                {item.semester && <span>Semester {item.semester}</span>}
                {item.section && <span>Section {item.section}</span>}
              </div>
              <div className="class-card-stats">
                {!item.active && <span>Archived workspace</span>}
                <span>
                  <GraduationCap />
                  <small>Students</small>
                  <strong>{item.studentCount}</strong>
                </span>
                <span>
                  <BookOpen />
                  <small>Subjects</small>
                  <strong>{item.subjects?.length || 0}</strong>
                </span>
                <span>
                  <UserRound />
                  <small>Mentor</small>
                  <strong>{item.mentor?.name || "Not assigned"}</strong>
                </span>
              </div>
            </button>
            {can("classes.manage") && (
              <button className="class-edit" onClick={() => setEditing(item)}>
                <Pencil /> Edit
              </button>
            )}
          </article>
        ))}
      </div>

      {selected && (
        <div className="class-management-grid">
          <section className="glass-card class-detail-card">
            <header className="class-panel-heading">
              <div>
                <span className="eyebrow">ACTIVE WORKSPACE</span>
                <h2>{selected.displayName}</h2>
                <div className="class-profile-context">
                  <span>{selected.code}</span>
                  {selected.course && <span>{selected.course}</span>}
                  {selected.specialization && (
                    <span>{selected.specialization}</span>
                  )}
                  {selected.semester && (
                    <span>Semester {selected.semester}</span>
                  )}
                </div>
              </div>
              <span className="class-live-state">
                <Layers3 /> Database workspace
              </span>
            </header>
            <dl>
              <div>
                <CalendarRange />
                <dt>Academic year</dt>
                <dd>{selected.academicYear || "Not set"}</dd>
              </div>
              <div>
                <GraduationCap />
                <dt>Batch</dt>
                <dd>{selected.batch || "Not set"}</dd>
              </div>
              <div>
                <Layers3 />
                <dt>Section</dt>
                <dd>{selected.section || "Not set"}</dd>
              </div>
              <div>
                <BookOpen />
                <dt>Weekly lectures</dt>
                <dd>{selected.timetableCount}</dd>
              </div>
            </dl>
          </section>

          {can("classes.assignStaff") && (
            <section className="glass-card">
              <span className="eyebrow">MENTOR & ACCESS</span>
              <h2>Assigned staff</h2>
              <div className="class-assignment-list">
                {(selected.assignments || []).map((assignment) => (
                  <div key={assignment.id}>
                    <span>
                      <b>{assignment.User?.name}</b>
                      <small>{assignment.assignmentRole}</small>
                    </span>
                    {assignment.User?.id !== user.id && (
                      <button
                        type="button"
                        title={`Remove ${assignment.User?.name} from this class`}
                        onClick={() => {
                          setStaffRemoval(assignment);
                          setStaffRemovalConfirmation("");
                        }}
                      >
                        <UserMinus /> Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <form className="class-inline-form" onSubmit={assignStaff}>
                <select name="userId" required defaultValue="">
                  <option value="">Choose faculty or CR</option>
                  {staff.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name} · {person.role}
                    </option>
                  ))}
                </select>
                <select name="assignmentRole" defaultValue="FACULTY">
                  <option value="MENTOR">Mentor</option>
                  <option value="FACULTY">Faculty</option>
                  <option value="CR">CR</option>
                </select>
                <button className="secondary">Assign</button>
              </form>
            </section>
          )}

          {can("classes.assignSubjects") && (
            <section className="glass-card class-subject-panel">
              <header className="class-subject-heading">
                <div>
                  <span className="eyebrow">{selected.course} CATALOGUE</span>
                  <h2>Subject access</h2>
                  <p>
                    Assigned subjects are available in this class timetable and
                    attendance workflow.
                  </p>
                </div>
                <span className="class-subject-count">
                  <strong>{assignedSubjectIds.size}</strong>
                  <small>of {subjects.length} assigned</small>
                </span>
              </header>
              <div className="class-subject-groups">
                <section>
                  <header>
                    <div>
                      <strong>Assigned to this class</strong>
                      <small>Click a subject to remove access.</small>
                    </div>
                    <span>{assignedSubjectIds.size}</span>
                  </header>
                  <div className="class-subject-picker assigned">
                    {subjects
                      .filter((subject) => assignedSubjectIds.has(subject.id))
                      .map((subject) => (
                        <button
                          key={subject.id}
                          className="active"
                          onClick={() => toggleSubject(subject)}
                        >
                          <Check />
                          <span>{subject.code}</span>
                          <strong>{subject.name}</strong>
                        </button>
                      ))}
                    {!assignedSubjectIds.size && (
                      <p className="class-subject-empty">
                        No subjects assigned yet.
                      </p>
                    )}
                  </div>
                </section>
                <section>
                  <header>
                    <div>
                      <strong>Available from {selected.course}</strong>
                      <small>Click a subject to assign it.</small>
                    </div>
                    <span>{subjects.length - assignedSubjectIds.size}</span>
                  </header>
                  <div className="class-subject-picker available">
                    {subjects
                      .filter((subject) => !assignedSubjectIds.has(subject.id))
                      .map((subject) => (
                        <button
                          key={subject.id}
                          onClick={() => toggleSubject(subject)}
                        >
                          <Plus />
                          <span>{subject.code}</span>
                          <strong>{subject.name}</strong>
                        </button>
                      ))}
                    {subjects.length === assignedSubjectIds.size && (
                      <p className="class-subject-empty">
                        Every catalogue subject is assigned.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={!!staffRemoval}
        title={
          staffRemoval
            ? `Remove ${staffRemoval.User?.name}?`
            : "Remove class access"
        }
        onClose={() => {
          if (!removingStaff) {
            setStaffRemoval(null);
            setStaffRemovalConfirmation("");
          }
        }}
      >
        <form className="form-stack class-unassign-form" onSubmit={removeStaff}>
          <section className="class-unassign-summary">
            <span><UserMinus /></span>
            <div>
              <strong>Revoke access to {selected?.displayName}</strong>
              <p>
                {staffRemoval?.User?.name} will lose their {staffRemoval?.assignmentRole?.toLowerCase()} assignment for this class.
              </p>
            </div>
          </section>
          <label className="class-delete-field">
            <span>Type <code>REMOVE ACCESS</code> to confirm</span>
            <ManualEntryInput
              id="class-staff-remove-confirmation"
              name="confirmation"
              type="text"
              expected="REMOVE ACCESS"
              value={staffRemovalConfirmation}
              onChange={(event) =>
                setStaffRemovalConfirmation(event.target.value)
              }
              required
              data-dialog-initial-focus
            />
          </label>
          <label className="class-delete-field">
            <span>Your current password</span>
            <ManualEntryInput
              id="class-staff-remove-password"
              name="password"
              required
            />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setStaffRemoval(null);
                setStaffRemovalConfirmation("");
              }}
              disabled={removingStaff}
            >
              Keep access
            </button>
            <button
              className="danger"
              disabled={
                removingStaff || staffRemovalConfirmation !== "REMOVE ACCESS"
              }
            >
              <UserMinus /> {removingStaff ? "Removing…" : "Remove access"}
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={creating || !!editing}
        title={editing ? "Edit class" : "Create class"}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      >
        <form className="form-grid" onSubmit={save}>
          {Object.entries({
            displayName: "Display name",
            code: "Unique class code",
            course: "Course",
            specialization: "Specialization",
            semester: "Semester",
            section: "Section",
            academicYear: "Academic year",
            batch: "Batch",
          }).map(([name, label]) => (
            <label className={name === "displayName" ? "full" : ""} key={name}>
              {label}
              <input
                name={name}
                defaultValue={(editing || blank)[name] || ""}
                required={["displayName", "code", "course"].includes(name)}
              />
            </label>
          ))}
          {editing && can("classes.archive") && (
            <label className="full">
              Workspace status
              <select name="active" defaultValue={String(editing.active)}>
                <option value="true">Active</option>
                <option value="false">Archived</option>
              </select>
              <small>
                Archiving hides the class from daily operations without deleting
                its records.
              </small>
            </label>
          )}
          <div className="dialog-actions full">
            {editing && can("classes.delete") && (
              <button
                type="button"
                className="danger-outline"
                onClick={() => {
                  setDeleteClass(editing);
                  setDeleteConfirmation("");
                  setEditing(null);
                }}
              >
                <Trash2 /> Delete permanently
              </button>
            )}
            <button className="primary">Save class</button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deleteClass}
        title={deleteClass ? `Delete ${deleteClass.displayName}?` : "Delete class"}
        onClose={() => {
          if (!deleting) {
            setDeleteClass(null);
            setDeleteConfirmation("");
          }
        }}
      >
        <form className="form-stack class-delete-form" onSubmit={removeClass}>
          <section className="class-delete-warning">
            <span><ShieldAlert /></span>
            <div>
              <strong>Permanent database action</strong>
              <p>
                This removes the class workspace and its assignments. It cannot
                be recovered from the interface.
              </p>
            </div>
          </section>
          <div className="class-delete-requirements">
            <span>Deletion is accepted only when the class has:</span>
            <ul>
              <li>No students</li>
              <li>No timetable entries</li>
              <li>No attendance history</li>
            </ul>
            <small>Otherwise, archive the workspace to preserve its records.</small>
          </div>
          <label className="class-delete-field">
            <span>Type <code>DELETE CLASS</code> to confirm</span>
            <ManualEntryInput
              id="class-delete-confirmation"
              name="confirmation"
              type="text"
              expected="DELETE CLASS"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              required
              data-dialog-initial-focus
            />
          </label>
          <label className="class-delete-field">
            <span>Admin++ password</span>
            <ManualEntryInput
              id="class-delete-admin-password"
              name="password"
              required
            />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDeleteClass(null);
                setDeleteConfirmation("");
              }}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              className="danger"
              disabled={deleting || deleteConfirmation !== "DELETE CLASS"}
            >
              <Trash2 /> {deleting ? "Deleting…" : "Delete empty class"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
