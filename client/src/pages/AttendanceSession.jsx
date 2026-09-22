import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CloudOff,
  Clock3,
  Download,
  Eraser,
  Lock,
  MousePointer2,
  Search,
  UserRoundCheck,
  X,
} from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { downloadAttendanceExport } from "../utils/download.js";
import {
  clearAttendanceDrafts,
  queueAttendanceDraft,
  readAttendanceDrafts,
  removeAttendanceDraft,
  syncAttendanceDrafts,
} from "../utils/attendanceDraft.js";
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
    { can } = useAuth(),
    inputRef = useRef(),
    [data, setData] = useState(null),
    [roll, setRoll] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [markTool, setMarkTool] = useState("PRESENT"),
    [applying, setApplying] = useState(() => new Set()),
    [draftCount, setDraftCount] = useState(0),
    [saveState, setSaveState] = useState("saved"),
    [selected, setSelected] = useState(null),
    [closing, setClosing] = useState(false),
    [reopening, setReopening] = useState(false),
    [now, setNow] = useState(Date.now());
  const load = async (silent = false) => {
    try {
      const r = await api.get(`/attendance/sessions/${id}`);
      setData(r.data);
      if (r.data.session.status === "CLOSED") clearAttendanceDrafts(id);
      setDraftCount(readAttendanceDrafts(id).length);
      if (!silent) setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      toast(messageOf(e), "error");
    }
  };
  const transientFailure = (error) =>
    !error.response || error.response.status >= 500 || error.response.status === 429;
  const updateLocalRecord = (studentId, record) =>
    setData((current) => {
      if (!current) return current;
      const rows = current.session.AttendanceRecords || [];
      const next = record
        ? rows.some((item) => item.StudentId === studentId)
          ? rows.map((item) => (item.StudentId === studentId ? record : item))
          : [...rows, record]
        : rows.filter((item) => item.StudentId !== studentId);
      return {
        ...current,
        session: { ...current.session, AttendanceRecords: next },
      };
    });
  const recoverDrafts = async ({ announce = false } = {}) => {
    const before = readAttendanceDrafts(id).length;
    if (!before) {
      setDraftCount(0);
      setSaveState("saved");
      return [];
    }
    setSaveState("saving");
    const remaining = await syncAttendanceDrafts(id, async (draft) => {
      try {
        if (draft.kind === "SELECTION")
          await api.patch(
            `/attendance/sessions/${id}/students/${draft.studentId}/selection`,
            { status: draft.status },
          );
        else
          await api.post(`/attendance/sessions/${id}/mark`, {
            rollNumber: draft.rollNumber,
          });
        return "SAVED";
      } catch (error) {
        if (
          draft.kind === "ROLL" &&
          error.response?.status === 409 &&
          error.response?.data?.existing
        )
          return "SAVED";
        if (transientFailure(error)) return "RETRY";
        toast(`Skipped an invalid saved mark: ${messageOf(error)}`, "error");
        return "DISCARD";
      }
    });
    setDraftCount(remaining.length);
    setSaveState(remaining.length ? "pending" : "saved");
    await load(true);
    if (announce && before && !remaining.length)
      toast(`${before} recovered attendance mark${before === 1 ? "" : "s"} saved.`);
    return remaining;
  };
  useEffect(() => {
    load().then(() => recoverDrafts({ announce: true }));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const reconnect = () => recoverDrafts({ announce: true });
    window.addEventListener("online", reconnect);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", reconnect);
    };
  }, [id]);
  const canCorrectOpen =
    can("attendance.correctOpen") &&
    data?.capabilities?.canCorrectOpen !== false;
  useEffect(() => {
    const selectTool = (event) => {
      if (data?.session.status !== "OPEN") return;
      const element = event.target;
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        element?.isContentEditable
      )
        return;
      const shortcut = { 1: "PRESENT", 2: "LATE", 3: "REMOVE" }[event.key];
      if (
        !shortcut ||
        (shortcut === "LATE" && !data?.session.lateModeEnabled) ||
        (shortcut === "REMOVE" && !canCorrectOpen)
      )
        return;
      event.preventDefault();
      setMarkTool(shortcut);
    };
    window.addEventListener("keydown", selectTool);
    return () => window.removeEventListener("keydown", selectTool);
  }, [data?.session.status, data?.session.lateModeEnabled, canCorrectOpen]);
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
    const submittedRoll = roll.trim();
    if (!submittedRoll) return;
    const draft = queueAttendanceDraft(id, {
      kind: "ROLL",
      rollNumber: submittedRoll,
    });
    setDraftCount(readAttendanceDrafts(id).length);
    setSaveState("saving");
    setRoll("");
    setBusy(true);
    try {
      const r = await api.post(`/attendance/sessions/${id}/mark`, {
        rollNumber: submittedRoll,
      });
      toast(
        `Roll ${r.data.student.rollNumber} marked ${r.data.record.status}.`,
      );
      removeAttendanceDraft(id, draft.id);
      await load(true);
    } catch (err) {
      if (transientFailure(err))
        toast("Network unavailable. This roll is saved locally and will retry.", "error");
      else {
        removeAttendanceDraft(id, draft.id);
        toast(messageOf(err), "error");
      }
    } finally {
      const pending = readAttendanceDrafts(id).length;
      setDraftCount(pending);
      setSaveState(pending ? "pending" : "saved");
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
  const applyMarkTool = async (student) => {
    const existing = records.get(student.id);
    const status = markTool === "REMOVE" ? null : markTool;
    if ((!existing && status === null) || existing?.status === status) return;
    if (existing && !canCorrectOpen) {
      toast("You do not have permission to overwrite or remove this mark.", "error");
      return;
    }
    const draft = queueAttendanceDraft(id, {
      kind: "SELECTION",
      studentId: student.id,
      status,
    });
    setDraftCount(readAttendanceDrafts(id).length);
    setSaveState("saving");
    updateLocalRecord(
      student.id,
      status
        ? {
            ...(existing || {}),
            id: existing?.id || `draft-${student.id}`,
            StudentId: student.id,
            status,
            attendanceCredit: status === "PRESENT",
            markedAt: existing?.markedAt || new Date().toISOString(),
            pendingSave: true,
          }
        : null,
    );
    setApplying((current) => new Set(current).add(student.id));
    try {
      const { data: result } = await api.patch(
        `/attendance/sessions/${id}/students/${student.id}/selection`,
        { status },
      );
      removeAttendanceDraft(id, draft.id);
      updateLocalRecord(student.id, result.record);
    } catch (error) {
      if (transientFailure(error))
        toast("Network unavailable. This change is saved locally and will retry.", "error");
      else {
        removeAttendanceDraft(id, draft.id);
        toast(messageOf(error), "error");
        await load(true);
      }
    } finally {
      const pending = readAttendanceDrafts(id).length;
      setDraftCount(pending);
      setSaveState(pending ? "pending" : "saved");
      setApplying((current) => {
        const next = new Set(current);
        next.delete(student.id);
        return next;
      });
    }
  };
  const close = async () => {
    setBusy(true);
    try {
      const remaining = await recoverDrafts();
      if (remaining.length) {
        toast(
          "Attendance still has locally saved changes. Reconnect before closing this session.",
          "error",
        );
        return;
      }
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
          {can("reports.export") && <button className="secondary" onClick={() => download(false)}>
            <Download />
            Machine data
          </button>}
          {s.status === "CLOSED" && can("reports.export") && (
            <button className="primary" onClick={() => download(true)}>
              <Download /> Review report
            </button>
          )}
          {s.status === "OPEN" && can("attendance.close") && (
            <button className="danger-outline" onClick={() => setClosing(true)}>
              <Lock />
              Review & close
            </button>
          )}
          {s.status === "CLOSED" && can("attendance.reopen") && (
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
        <div className={!s.lateModeEnabled ? "countdown disabled" : left ? "countdown" : "countdown elapsed"}>
          <small>{!s.lateModeEnabled ? "LATE MODE" : left ? "ON-TIME WINDOW" : "LATE WINDOW"}</small>
          <strong>{!s.lateModeEnabled ? "OFF" : left ? `${min}:${sec}` : "00:00"}</strong>
          <span>
            {!s.lateModeEnabled
              ? "all marked arrivals count as Present"
              : left
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
      {s.status === "OPEN" && can("attendance.mark") && (
        <section className="mark-console">
          <form onSubmit={mark}>
            <label>Quick roll entry</label>
            <div>
              <input
                ref={inputRef}
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                placeholder="Enter roll number"
                inputMode="numeric"
                aria-label="Roll number"
              />
              <button className="primary" disabled={busy || !roll.trim()}>
                <UserRoundCheck />
                Mark attendance
              </button>
            </div>
            <p>
              Press Enter · the field clears immediately ·{" "}
              {s.lateModeEnabled
                ? "server time decides Present or Late"
                : "Late Mode is off, so every arrival is Present"}
            </p>
          </form>
        </section>
      )}
      <section className="panel grid-panel">
        <div className="panel-title">
          <div>
            <h2>{s.status === "OPEN" ? "Live attendance board" : "Attendance roll"}</h2>
            <p>
              {s.status === "OPEN"
                ? "Choose a tool, then select as many rolls as needed. Pending rolls become absent only after final review."
                : "Select a roll to inspect its recorded attendance and correction history."}
            </p>
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
        {s.status === "OPEN" && (
          <div className={`attendance-autosave ${saveState}`} aria-live="polite">
            {saveState === "pending" ? <CloudOff /> : <CheckCircle2 />}
            <span>
              <strong>
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "pending"
                    ? `${draftCount} saved locally`
                    : "All changes saved"}
              </strong>
              <small>{saveState === "pending" ? "Retries when online" : "SQLite + recovery queue"}</small>
            </span>
          </div>
        )}
        {s.status === "OPEN" && can("attendance.mark") && (
          <div className="attendance-toolbox" role="toolbar" aria-label="Attendance marking tools">
            <div className="toolbox-heading">
              <MousePointer2 />
              <div>
                <strong>Select tool</strong>
                <small>Then click rolls below</small>
              </div>
            </div>
            <div className="attendance-tools">
              <button
                type="button"
                className={`attendance-tool present ${markTool === "PRESENT" ? "active" : ""}`}
                aria-pressed={markTool === "PRESENT"}
                aria-keyshortcuts="1"
                onClick={() => setMarkTool("PRESENT")}
              >
                <CheckCircle2 />
                <span><strong>Present</strong><small>Give attendance credit</small></span>
                <kbd>1</kbd>
              </button>
              <button
                type="button"
                className={`attendance-tool late ${markTool === "LATE" ? "active" : ""}`}
                aria-pressed={markTool === "LATE"}
                aria-keyshortcuts="2"
                disabled={!s.lateModeEnabled}
                onClick={() => setMarkTool("LATE")}
              >
                <Clock3 />
                <span><strong>Late</strong><small>{s.lateModeEnabled ? "Record without credit" : "Disabled for this session"}</small></span>
                <kbd>2</kbd>
              </button>
              <button
                type="button"
                className={`attendance-tool remove ${markTool === "REMOVE" ? "active" : ""}`}
                aria-pressed={markTool === "REMOVE"}
                aria-keyshortcuts="3"
                disabled={!canCorrectOpen}
                onClick={() => setMarkTool("REMOVE")}
              >
                <Eraser />
                <span><strong>Remove mark</strong><small>Return roll to pending</small></span>
                <kbd>3</kbd>
              </button>
            </div>
          </div>
        )}
        <div className={`roll-grid tool-${markTool.toLowerCase()}`}>
          {shown.map((student) => {
            const r = records.get(student.id),
              state = r?.status?.toLowerCase() || "unmarked";
            return (
              <button
                key={student.id}
                className={`roll-tile ${state} ${applying.has(student.id) ? "applying" : ""}`}
                disabled={applying.has(student.id)}
                onClick={() => {
                  if (s.status === "OPEN" && can("attendance.mark"))
                    applyMarkTool(student);
                  else setSelected(student);
                }}
                title={
                  s.status === "OPEN"
                    ? `${markTool === "REMOVE" ? "Remove mark from" : `Mark ${markTool.toLowerCase()}:`} roll ${student.rollNumber}`
                    : "View attendance details"
                }
              >
                <strong>{student.rollNumber}</strong>
                <span>
                  {r
                    ? `${r.status[0]}${r.status.slice(1).toLowerCase()}`
                    : "Not marked"}
                </span>
                {r?.status === "PRESENT" && <Check />}
                {r?.status === "LATE" && <Clock3 />}
                {r?.status === "ABSENT" && <X />}
              </button>
            );
          })}
        </div>
        {s.status === "OPEN" && missing.length > 0 && (
          <section className="pending-review">
            <div className="pending-review-head">
              <div>
                <strong>Pending review</strong>
                <small>These rolls become Absent only when you confirm closure.</small>
              </div>
              <span>{missing.length} unmarked</span>
            </div>
            <div className="pending-rolls">
              {missing.map((student) => (
                <button
                  type="button"
                  key={student.id}
                  disabled={markTool === "REMOVE" || applying.has(student.id)}
                  onClick={() => applyMarkTool(student)}
                  title={
                    markTool === "REMOVE"
                      ? "Choose Present or Late to mark a pending roll"
                      : `Apply ${markTool.toLowerCase()} to roll ${student.rollNumber}`
                  }
                >
                  {student.rollNumber}
                </button>
              ))}
            </div>
          </section>
        )}
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
          {records.has(selected?.id) &&
            ((s.status === "OPEN" && canCorrectOpen) ||
              (s.status === "CLOSED" && can("attendance.correctClosed"))) && (
            <form onSubmit={correct} className="form-stack">
              <label>
                Set attendance status
                <select
                  name="status"
                  defaultValue={records.get(selected?.id)?.status || "PRESENT"}
                >
                  <option>PRESENT</option>
                  {s.lateModeEnabled && <option>LATE</option>}
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
