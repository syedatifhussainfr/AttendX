import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Clock3,
  Download,
  Lock,
  Search,
  UserRoundCheck,
  X,
} from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { downloadAttendanceExport } from "../utils/download.js";
const fmt = (t) =>
  new Date(t).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export function AttendanceSessionPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    toast = useToast(),
    { user } = useAuth(),
    inputRef = useRef(),
    [data, setData] = useState(null),
    [roll, setRoll] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [closing, setClosing] = useState(false),
    [reopening, setReopening] = useState(false),
    [now, setNow] = useState(Date.now());
  const load = async (silent = false) => {
    try {
      const r = await api.get(`/attendance/sessions/${id}`);
      setData(r.data);
      if (!silent) setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  useEffect(() => {
    load();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [id]);
  const records = useMemo(
    () =>
      new Map(
        (data?.session.AttendanceRecords || []).map((r) => [r.StudentId, r]),
      ),
    [data],
  );
  const missing = (data?.students || []).filter((s) => !records.has(s.id));
  const shown = (data?.students || []).filter((s) =>
    `${s.rollNumber} ${s.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  const mark = async (e) => {
    e.preventDefault();
    if (!roll.trim()) return;
    setBusy(true);
    try {
      const r = await api.post(`/attendance/sessions/${id}/mark`, {
        rollNumber: roll.trim(),
      });
      toast(
        `Roll ${r.data.student.rollNumber} marked ${r.data.record.status}.`,
      );
      setRoll("");
      await load(true);
    } catch (err) {
      toast(messageOf(err), "error");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };
  const correct = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.patch(`/attendance/sessions/${id}/students/${selected.id}`, {
        status: f.get("status"),
        reason: f.get("reason"),
      });
      toast("Attendance updated and audit entry created.");
      setSelected(null);
      await load();
    } catch (err) {
      toast(messageOf(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    setBusy(true);
    try {
      await api.post(`/attendance/sessions/${id}/close`);
      toast(`Session closed. ${missing.length} students marked absent.`);
      setClosing(false);
      await load();
    } catch (e) {
      toast(messageOf(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const download = async (review = false) => {
    try {
      const filename = await downloadAttendanceExport({
        review,
        params: { sessionId: id },
      });
      toast(
        `${review ? "Review report" : "Machine data"} downloaded as ${filename}.`,
      );
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  const reopen = async (event) => {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    setBusy(true);
    try {
      await api.post(`/attendance/sessions/${id}/reopen`, { reason });
      toast("Session reopened with an audit entry.");
      setReopening(false);
      await load();
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <div className="page">
        <div className="skeleton hero-skeleton" />
      </div>
    );
  const s = data.session,
    recs = s.AttendanceRecords,
    counts = {
      PRESENT: recs.filter((x) => x.status === "PRESENT").length,
      LATE: recs.filter((x) => x.status === "LATE").length,
      ABSENT: recs.filter((x) => x.status === "ABSENT").length,
    };
  const deadline =
      new Date(`${s.sessionDate}T${s.scheduledStartTime}:00+05:30`).getTime() +
      s.lateThresholdMinutes * 60000,
    left = Math.max(0, deadline - now),
    min = String(Math.floor(left / 60000)).padStart(2, "0"),
    sec = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
  return (
    <div className="page attendance-page">
      <div className="session-head">
        <button className="back" onClick={() => navigate("/")}>
          <ArrowLeft />
          Overview
        </button>
        <div className={`status-badge ${s.status.toLowerCase()}`}>
          {s.status === "OPEN" ? (
            <>
              <i /> LIVE SESSION
            </>
          ) : (
            <>
              <Lock /> CLOSED
            </>
          )}
        </div>
        <div className="session-actions">
          <button className="secondary" onClick={() => download(false)}>
            <Download />
            Machine data
          </button>
          {s.status === "CLOSED" && (
            <button className="primary" onClick={() => download(true)}>
              <Download /> Review report
            </button>
          )}
          {s.status === "OPEN" && (
            <button className="danger-outline" onClick={() => setClosing(true)}>
              <Lock />
              Review & close
            </button>
          )}
          {s.status === "CLOSED" && user.role === "ADMIN" && (
            <button
              className="danger-outline"
              onClick={() => setReopening(true)}
            >
              <Lock /> Reopen with reason
            </button>
          )}
        </div>
      </div>
      <section className="session-banner">
        <div>
          <span className="eyebrow">
            {s.sessionType} · {s.sessionDate}
          </span>
          <h1>{s.Subject.name}</h1>
          <p>
            {s.scheduledSubject && s.scheduledSubject.id !== s.Subject.id
              ? `Scheduled: ${s.scheduledSubject.name} · Actual: ${s.Subject.name} · `
              : ""}
            {s.scheduledStartTime}–{s.scheduledEndTime} ·{" "}
            {s.faculty || "Faculty not assigned"} · Opened {fmt(s.openedAt)}
            {s.createdBy?.name ? ` by ${s.createdBy.name}` : ""}
          </p>
        </div>
        <div className={left ? "countdown" : "countdown elapsed"}>
          <small>{left ? "ON-TIME WINDOW" : "LATE WINDOW"}</small>
          <strong>{left ? `${min}:${sec}` : "00:00"}</strong>
          <span>
            {left
              ? "until late marks begin"
              : `threshold was ${s.lateThresholdMinutes} min`}
          </span>
        </div>
      </section>
      <div className="count-strip">
        <div className="present">
          <span /> <small>Present</small>
          <strong>{counts.PRESENT}</strong>
        </div>
        <div className="late">
          <span /> <small>Late</small>
          <strong>{counts.LATE}</strong>
        </div>
        <div className="unmarked">
          <span />{" "}
          <small>{s.status === "OPEN" ? "Not marked" : "Absent"}</small>
          <strong>
            {s.status === "OPEN" ? missing.length : counts.ABSENT}
          </strong>
        </div>
        <div className="total">
          <span />
          <small>Total class</small>
          <strong>{data.students.length}</strong>
        </div>
        <div className="server-clock">
          <Clock3 />
          <small>Server-synced view</small>
          <strong>{fmt(now)}</strong>
        </div>
      </div>
      {s.status === "OPEN" && (
        <section className="mark-console">
          <form onSubmit={mark}>
            <label>Rapid roll entry</label>
            <div>
              <input
                ref={inputRef}
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                placeholder="Type roll number — e.g. 01"
                inputMode="numeric"
                aria-label="Roll number"
              />
              <button className="primary" disabled={busy || !roll.trim()}>
                <UserRoundCheck />
                Mark attendance
              </button>
            </div>
            <p>Press Enter to mark · Status is assigned by the server clock</p>
          </form>
        </section>
      )}
      {s.status === "OPEN" && missing.length > 0 && (
        <section className="missing-callout">
          <strong>Missing</strong>
          <span>{missing.map((x) => x.rollNumber).join(", ")}</span>
          <small>{missing.length} students still unmarked</small>
        </section>
      )}
      <section className="panel grid-panel">
        <div className="panel-title">
          <div>
            <h2>Live roll grid</h2>
            <p>Select a roll to view or correct its attendance.</p>
          </div>
          <div className="search">
            <Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roll or name"
            />
          </div>
        </div>
        <div className="roll-grid">
          {shown.map((student) => {
            const r = records.get(student.id),
              state = r?.status?.toLowerCase() || "unmarked";
            return (
              <button
                key={student.id}
                className={`roll-tile ${state} ${r?.correctedAt ? "corrected" : ""}`}
                onClick={() => setSelected(student)}
              >
                <strong>{student.rollNumber}</strong>
                <span>{r?.status || "Not marked"}</span>
                {r?.status === "PRESENT" && <Check />}
                {(r?.status === "LATE" || r?.status === "ABSENT") && <X />}
              </button>
            );
          })}
        </div>
      </section>
      <Dialog
        open={!!selected}
        title={selected ? `Roll ${selected.rollNumber} · ${selected.name}` : ""}
        onClose={() => setSelected(null)}
      >
        <div className="student-detail">
          <div className="detail-status">
            <span>Current status</span>
            <strong
              className={(
                records.get(selected?.id)?.status || "unmarked"
              ).toLowerCase()}
            >
              {records.get(selected?.id)?.status || "NOT MARKED"}
            </strong>
            {records.get(selected?.id) && (
              <small>Marked {fmt(records.get(selected.id).markedAt)}</small>
            )}
            {records.get(selected?.id)?.correctedAt && (
              <div className="correction-note">
                <b>Corrected</b>
                <span>
                  {records.get(selected.id).correctedFromStatus} →{" "}
                  {records.get(selected.id).status}
                </span>
                <span>{records.get(selected.id).correctionReason}</span>
                <small>
                  By {records.get(selected.id).correctedBy?.name || "Unknown"} ·{" "}
                  {fmt(records.get(selected.id).correctedAt)}
                </small>
              </div>
            )}
          </div>
          {(s.status === "OPEN" || user.role === "ADMIN") && (
            <form onSubmit={correct} className="form-stack">
              <label>
                Set attendance status
                <select
                  name="status"
                  defaultValue={records.get(selected?.id)?.status || "PRESENT"}
                >
                  <option>PRESENT</option>
                  <option>LATE</option>
                  <option>ABSENT</option>
                </select>
              </label>
              <label>
                Reason for manual action
                <input
                  name="reason"
                  required
                  minLength="2"
                  placeholder="Required for the audit log"
                />
              </label>
              <button className="primary" disabled={busy}>
                Save with audit trail
              </button>
            </form>
          )}
        </div>
      </Dialog>
      <Dialog
        open={reopening}
        title="Reopen closed session"
        onClose={() => setReopening(false)}
      >
        <form className="form-stack" onSubmit={reopen}>
          <div className="danger-note">
            Reopening permits corrections again. The reason, administrator, and
            time are permanently audited.
          </div>
          <label>
            Reason for reopening
            <input
              name="reason"
              minLength="3"
              maxLength="250"
              required
              placeholder="Explain why this closed session must change"
            />
          </label>
          <button className="danger" disabled={busy}>
            {busy ? "Reopening…" : "Reopen session"}
          </button>
        </form>
      </Dialog>
      <Dialog
        open={closing}
        title="Review before closing"
        onClose={() => setClosing(false)}
      >
        <div className="close-review">
          <div>
            <span>
              Present<strong>{counts.PRESENT}</strong>
            </span>
            <span>
              Late<strong>{counts.LATE}</strong>
            </span>
            <span>
              Missing<strong>{missing.length}</strong>
            </span>
          </div>
          <p>
            Closing will permanently mark every unmarked student as{" "}
            <b>ABSENT</b>. Normal CR editing will be locked.
          </p>
          {missing.length > 0 && (
            <div className="missing-box">
              Missing rolls: {missing.map((x) => x.rollNumber).join(", ")}
            </div>
          )}
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setClosing(false)}>
              Keep session open
            </button>
            <button className="danger" disabled={busy} onClick={close}>
              {busy ? "Closing…" : "Confirm and close"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
