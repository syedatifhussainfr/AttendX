import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useClass } from "../state/ClassContext.jsx";
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function Timetable() {
  const [rows, setRows] = useState([]),
    [subjects, setSubjects] = useState([]),
    [edit, setEdit] = useState(null),
    [open, setOpen] = useState(false),
    toast = useToast(),
    { can } = useAuth(),
    { classId, selectedClass } = useClass();
  const load = async () => {
    if (!classId) return;
    try {
      const [r, s] = await Promise.all([
        api.get("/admin/timetable", { params: { classId } }),
        api.get("/admin/subjects", { params: { classId } }),
      ]);
      setRows(r.data);
      setSubjects(s.data.filter((x) => x.active));
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  useEffect(() => {
    load();
  }, [classId]);
  const save = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)),
      data = {
        ...f,
        classId,
        dayOfWeek: Number(f.dayOfWeek),
        subjectId: Number(f.subjectId),
        faculty: f.faculty || null,
      };
    try {
      edit
        ? await api.patch(`/admin/timetable/${edit.id}`, data)
        : await api.post("/admin/timetable", data);
      toast("Timetable updated.");
      setOpen(false);
      setEdit(null);
      load();
    } catch (x) {
      toast(messageOf(x), "error");
    }
  };
  const remove = async (row) => {
    if (!confirm(`Delete ${row.Subject.name} on ${days[row.dayOfWeek - 1]}?`))
      return;
    try {
      await api.delete(`/admin/timetable/${row.id}`);
      toast("Entry deleted.");
      load();
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">WEEKLY ROUTINE</span>
          <h1>Timetable</h1>
          <p>{selectedClass?.displayName} · editable weekly schedule.</p>
        </div>
        {can("timetable.manage") && (
          <button className="primary" onClick={() => setOpen(true)}>
            <Plus />
            Add lecture
          </button>
        )}
      </div>
      <div className="week-grid">
        {days.slice(0, 6).map((day, i) => (
          <section className="day-column" key={day}>
            <header>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h2>{day}</h2>
            </header>
            {rows
              .filter((r) => r.dayOfWeek === i + 1)
              .map((r) => (
                <article key={r.id}>
                  <time>
                    {r.startTime}–{r.endTime}
                  </time>
                  <strong>{r.Subject.name}</strong>
                  <small>{r.faculty || "Faculty not assigned"}</small>
                  {can("timetable.manage") && (
                    <div>
                      <button
                        onClick={() => {
                          setEdit(r);
                          setOpen(true);
                        }}
                      >
                        <Pencil />
                      </button>
                      <button onClick={() => remove(r)}>
                        <Trash2 />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            {!rows.some((r) => r.dayOfWeek === i + 1) && (
              <p className="empty-day">No lectures</p>
            )}
          </section>
        ))}
      </div>
      <Dialog
        open={open}
        title={edit ? "Edit timetable entry" : "Add timetable entry"}
        onClose={() => {
          setOpen(false);
          setEdit(null);
        }}
      >
        <form className="form-grid" onSubmit={save}>
          <label>
            Day
            <select name="dayOfWeek" defaultValue={edit?.dayOfWeek || 1}>
              {days.map((d, i) => (
                <option value={i + 1} key={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <select
              name="subjectId"
              defaultValue={edit?.SubjectId || ""}
              required
            >
              <option value="">Select</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start
            <input
              name="startTime"
              type="time"
              defaultValue={edit?.startTime || "09:30"}
              required
            />
          </label>
          <label>
            End
            <input
              name="endTime"
              type="time"
              defaultValue={edit?.endTime || "10:45"}
              required
            />
          </label>
          <label className="full">
            Faculty (optional)
            <input name="faculty" defaultValue={edit?.faculty || ""} />
          </label>
          <button className="primary full">Save entry</button>
        </form>
      </Dialog>
    </div>
  );
}
