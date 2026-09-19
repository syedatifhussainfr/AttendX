import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Play,
  Users,
} from "lucide-react";
import { api, messageOf } from "../api.js";
import { Dialog } from "../components/Dialog.jsx";
import { useToast } from "../state/ToastContext.jsx";
const prettyTime = (value) => {
  if (!value) return "—";
  const [h, m] = value.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
};
export function Dashboard() {
  const [data, setData] = useState(null),
    [subjects, setSubjects] = useState([]),
    [open, setOpen] = useState(false),
    [conflict, setConflict] = useState(null),
    [pendingStart, setPendingStart] = useState(null),
    [saving, setSaving] = useState(false),
    navigate = useNavigate(),
    toast = useToast();
  const load = async () => {
    try {
      const [d, s] = await Promise.all([
        api.get("/attendance/dashboard"),
        api.get("/admin/subjects"),
      ]);
      setData(d.data);
      setSubjects(s.data.filter((x) => x.active));
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const suggested = data?.current || data?.next || data?.timetable?.[0];
  const liveOrNext = data?.current || data?.next;
  const sendStart = async (payload, allowOverlap = false) => {
    setSaving(true);
    try {
      const { data: s } = await api.post("/attendance/sessions", { ...payload, allowOverlap });
      navigate(`/attendance/${s.id}`);
    } catch (err) {
      if (err.response?.data?.code === "SESSION_CONFLICT") {
        setPendingStart(payload);
        setConflict(err.response.data);
      } else toast(messageOf(err), "error");
      setSaving(false);
    }
  };
  const start = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await sendStart({
      subjectId: Number(f.get("subjectId")),
      scheduledSubjectId: suggested?.SubjectId || null,
      scheduledStartTime: f.get("startTime"),
      scheduledEndTime: f.get("endTime"),
      faculty: f.get("faculty") || null,
      sessionType: f.get("sessionType"),
      reason: f.get("reason") || null,
    });
  };
  if (!data)
    return (
      <div className="page">
        <div className="skeleton hero-skeleton" />
      </div>
    );
  const date = new Date(`${data.date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">TODAY’S OPERATIONS</span>
          <h1>Good {new Date().getHours() < 12 ? "morning" : "afternoon"}</h1>
          <p>{date}</p>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          <Play />
          Start attendance
        </button>
      </div>
      <section className="lecture-hero">
        <div>
          <span className={`live-label ${data.current ? "" : "idle"}`}>
            <i /> {data.current ? "LECTURE IN PROGRESS" : data.next ? "UP NEXT" : "DAY COMPLETE"}
          </span>
          <h2>
            {data.current?.Subject?.name ||
              data.next?.Subject?.name ||
              "Today’s schedule is complete"}
          </h2>
          <p>
            {liveOrNext ? (
              <>
                {data.current ? "Expected current lecture" : "Up next"} ·{" "}
                {prettyTime(liveOrNext.startTime)}–{prettyTime(liveOrNext.endTime)}
              </>
            ) : (
              "Open an extra or replacement lecture whenever needed."
            )}
          </p>
        </div>
        <button className="hero-action" onClick={() => setOpen(true)}>
          {liveOrNext ? "Open attendance console" : "Start an unscheduled lecture"}
          <ArrowRight />
        </button>
      </section>
      <div className="metric-row">
        <article>
          <span>
            <Clock3 />
          </span>
          <div>
            <small>Current lecture</small>
            <strong>{data.current?.Subject?.code || "—"}</strong>
            <p>{data.current?.faculty || "Faculty not assigned"}</p>
          </div>
        </article>
        <article>
          <span>
            <CalendarDays />
          </span>
          <div>
            <small>Next lecture</small>
            <strong>{data.next?.Subject?.code || "—"}</strong>
            <p>
              {data.next
                ? prettyTime(data.next.startTime)
                : "Schedule complete"}
            </p>
          </div>
        </article>
        <article>
          <span>
            <CheckCircle2 />
          </span>
          <div>
            <small>Completed today</small>
            <strong>
              {data.sessions.filter((s) => s.status === "CLOSED").length}
            </strong>
            <p>attendance sessions</p>
          </div>
        </article>
        <article>
          <span>
            <Users />
          </span>
          <div>
            <small>Class strength</small>
            <strong>78</strong>
            <p>active students</p>
          </div>
        </article>
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Today’s timetable</h2>
              <p>Expected routine — you can choose another subject.</p>
            </div>
            <CalendarDays />
          </div>
          <div className="timeline">
            {data.timetable.length ? (
              data.timetable.map((x, i) => (
                <div
                  className={
                    x.id === data.current?.id
                      ? "timeline-item current"
                      : "timeline-item"
                  }
                  key={x.id}
                >
                  <time>
                    {prettyTime(x.startTime)}
                    <small>{prettyTime(x.endTime)}</small>
                  </time>
                  <i />
                  <div>
                    <strong>{x.Subject.name}</strong>
                    <span>{x.faculty || "Faculty editable"}</span>
                  </div>
                  {x.id === data.current?.id && <b>NOW</b>}
                </div>
              ))
            ) : (
              <div className="empty">No lectures scheduled today.</div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Sessions today</h2>
              <p>Actual classes conducted and recorded.</p>
            </div>
          </div>
          <div className="session-list">
            {data.sessions.length ? (
              data.sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/attendance/${s.id}`)}
                >
                  <div>
                    <strong>{s.Subject.name}</strong>
                    <span>
                      {prettyTime(s.scheduledStartTime)} · {s.status}
                    </span>
                  </div>
                  <div className="mini-count">
                    <b>{s.summary.present}</b> P <b>{s.summary.late}</b> L
                  </div>
                  <ArrowRight />
                </button>
              ))
            ) : (
              <div className="empty">
                No attendance session has been opened today.
              </div>
            )}
          </div>
        </section>
      </div>
      <Dialog
        open={open}
        title="Start attendance session"
        onClose={() => setOpen(false)}
      >
        <form id="start-form" onSubmit={start} className="form-grid">
          <label className="full">
            Actual subject conducted
            <select
              name="subjectId"
              defaultValue={suggested?.SubjectId || ""}
              required
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start time
            <input
              name="startTime"
              type="time"
              defaultValue={suggested?.startTime || "09:30"}
              required
            />
          </label>
          <label>
            End time
            <input
              name="endTime"
              type="time"
              defaultValue={suggested?.endTime || "10:45"}
              required
            />
          </label>
          <label>
            Class type
            <select name="sessionType">
              <option value="SCHEDULED">Scheduled</option>
              <option value="REPLACEMENT">Replacement</option>
              <option value="EXTRA">Extra class</option>
            </select>
          </label>
          <label>
            Faculty (optional)
            <input
              name="faculty"
              defaultValue={suggested?.faculty || ""}
              placeholder="Faculty name / code"
            />
          </label>
          <label className="full">
            Adjustment reason (optional)
            <select name="reason">
              <option value="">None</option>
              <option>Faculty Adjustment</option>
              <option>Extra Class</option>
              <option>Replacement Class</option>
              <option>Other</option>
            </select>
          </label>
          <div className="dialog-actions full">
            <button
              type="button"
              className="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Opening…" : "Open session"}
              <ArrowRight />
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!conflict}
        title="Session conflict detected"
        onClose={() => setConflict(null)}
      >
        <div className="form-stack">
          <div className="danger-note">{conflict?.message} No session has been created.</div>
          {(conflict?.details?.otherOpen || []).map((item) => (
            <div className="import-line" key={`open-${item.id}`}>
              <b>Open #{item.id}</b><span>{item.subject} · {prettyTime(item.startTime)}–{prettyTime(item.endTime)}</span>
            </div>
          ))}
          {(conflict?.details?.conflicting || []).map((item) => (
            <div className="import-line" key={`conflict-${item.id}`}>
              <b>Overlap #{item.id}</b><span>{item.subject} · {prettyTime(item.startTime)}–{prettyTime(item.endTime)} · {item.status}</span>
            </div>
          ))}
          <p>Continuing records this as an explicitly confirmed replacement or extra class.</p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setConflict(null)}>Go back</button>
            <button
              className="primary"
              disabled={saving}
              onClick={() => sendStart({
                ...pendingStart,
                sessionType: pendingStart?.sessionType === "SCHEDULED" ? "EXTRA" : pendingStart?.sessionType,
                reason: pendingStart?.reason || "Confirmed overlapping class",
              }, true)}
            >
              {saving ? "Opening…" : pendingStart?.sessionType === "SCHEDULED" ? "Confirm as extra class" : "Confirm overlap"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
