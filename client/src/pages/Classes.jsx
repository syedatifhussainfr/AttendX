import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Pencil,
  Plus,
  UserMinus,
  UserRound,
} from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
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
  const selected = classes.find((item) => item.id === classId) || null;

  const loadOptions = async () => {
    if (!selected) return;
    try {
      const requests = [api.get("/admin/subjects")];
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

  const removeStaff = async (assignment) => {
    try {
      await api.delete(
        `/admin/classes/${selected.id}/assignments/${assignment.User.id}`,
      );
      toast("Class access removed.");
      await reloadClasses();
    } catch (error) {
      toast(messageOf(error), "error");
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

  return (
    <div className="page class-workspace">
      <div className="page-intro">
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
            >
              <span>{item.code}</span>
              <h2>{item.displayName}</h2>
              <p>
                {[
                  item.course,
                  item.specialization,
                  item.semester && `Semester ${item.semester}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="class-card-stats">
                {!item.active && <span>Archived workspace</span>}
                <span>
                  <GraduationCap /> {item.studentCount} students
                </span>
                <span>
                  <BookOpen /> {item.subjects?.length || 0} subjects
                </span>
                <span>
                  <UserRound /> {item.mentor?.name || "Mentor not assigned"}
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
            <span className="eyebrow">ACTIVE WORKSPACE</span>
            <h2>{selected.displayName}</h2>
            <dl>
              <div>
                <dt>Academic year</dt>
                <dd>{selected.academicYear || "Not set"}</dd>
              </div>
              <div>
                <dt>Batch</dt>
                <dd>{selected.batch || "Not set"}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>{selected.section || "Not set"}</dd>
              </div>
              <div>
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
                        onClick={() => removeStaff(assignment)}
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
              <span className="eyebrow">SUBJECT CATALOGUE</span>
              <h2>Subjects for this class</h2>
              <p>
                Only selected subjects appear in this class timetable and
                attendance workflow.
              </p>
              <div className="class-subject-picker">
                {subjects.map((subject) => (
                  <button
                    key={subject.id}
                    className={
                      assignedSubjectIds.has(subject.id) ? "active" : ""
                    }
                    onClick={() => toggleSubject(subject)}
                  >
                    <span>{subject.code}</span>
                    {subject.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

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
          <button className="primary full">Save class</button>
        </form>
      </Dialog>
    </div>
  );
}
