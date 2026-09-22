import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Download, MailWarning, Phone, UserRound } from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { downloadAttendanceExport } from "../utils/download.js";

const riskLabel = { GOOD: "Good standing", WATCH: "Needs attention", CRITICAL: "Critical attendance", NO_DATA: "No attendance data" };
const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const shortDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function Calendar({ records }) {
  const latest = records[0]?.session.date || new Date().toISOString().slice(0, 10);
  const [cursor, setCursor] = useState(() => new Date(`${latest.slice(0, 7)}-01T00:00:00`));
  const grouped = useMemo(() => {
    const map = new Map();
    for (const record of records) {
      const list = map.get(record.session.date) || [];
      list.push(record);
      map.set(record.session.date, list);
    }
    return map;
  }, [records]);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstOffset).fill(null), ...Array.from({ length: totalDays }, (_, index) => index + 1)];
  const move = (change) => setCursor(new Date(year, month + change, 1));
  return <section className="panel student-calendar-panel">
    <header><div><span className="eyebrow">ATTENDANCE CALENDAR</span><h2>{monthName.format(cursor)}</h2></div><div><button onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft /></button><button onClick={() => move(1)} aria-label="Next month"><ChevronRight /></button></div></header>
    <div className="student-calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="student-calendar-grid">{cells.map((day, index) => {
      if (!day) return <span className="blank" key={`blank-${index}`} />;
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const entries = grouped.get(key) || [];
      return <span className={entries.length ? "has-records" : ""} key={key} title={entries.map((row) => `${row.session.subject.code}: ${row.status}`).join(" · ")}><b>{day}</b><i>{entries.slice(0, 4).map((row) => <em className={row.status.toLowerCase()} key={row.id} />)}</i></span>;
    })}</div>
    <footer><span><i className="present" />Present</span><span><i className="late" />Late</span><span><i className="absent" />Absent</span></footer>
  </section>;
}

export function StudentProfile() {
  const { id } = useParams(), navigate = useNavigate(), toast = useToast();
  const [data, setData] = useState(null), [downloading, setDownloading] = useState(false);
  useEffect(() => { api.get(`/admin/students/${id}/profile`).then((response) => setData(response.data)).catch((error) => toast(messageOf(error), "error")); }, [id]);
  const download = async () => { setDownloading(true); try { const filename = await downloadAttendanceExport({ review: true, params: { studentId: id } }); toast(`Student report downloaded as ${filename}.`); } catch (error) { toast(messageOf(error), "error"); } finally { setDownloading(false); } };
  if (!data) return <div className="page"><div className="skeleton hero-skeleton" /></div>;
  const { student, attendance, subjects, records } = data;
  return <div className="page student-profile-page">
    <div className="student-profile-actions"><button className="back" onClick={() => navigate("/students")}><ArrowLeft /> Students</button><button className="secondary" onClick={download} disabled={downloading}><Download /> {downloading ? "Preparing…" : "Download report"}</button></div>
    <section className="student-profile-hero">
      <div className="student-profile-avatar">{student.photoUrl ? <img src={student.photoUrl} alt="" /> : <UserRound />}</div>
      <div className="student-profile-title"><span className="eyebrow">ROLL {student.rollNumber}</span><h1>{student.name}</h1><p>{[student.enrollmentNumber, student.section, student.active ? "Active" : "Inactive"].filter(Boolean).join(" · ")}</p></div>
      <div className={`student-profile-standing ${attendance.risk.toLowerCase()}`}><span>{riskLabel[attendance.risk]}</span><strong>{attendance.percentage == null ? "—" : `${attendance.percentage.toFixed(2)}%`}</strong><small>Target {attendance.target}%</small></div>
    </section>
    <section className="student-profile-metrics">
      <article><span>Recorded classes</span><strong>{attendance.total}</strong><small>{attendance.appearance} physical appearances</small></article>
      <article className="present"><span>Present</span><strong>{attendance.present}</strong><small>Credited attendance</small></article>
      <article className="late"><span>Late</span><strong>{attendance.late}</strong><small>Appearance without credit</small></article>
      <article className="absent"><span>Absent</span><strong>{attendance.absent}</strong><small>{attendance.absenceStreak ? `${attendance.absenceStreak} current streak` : "No current streak"}</small></article>
    </section>
    <section className="student-guidance-panel">
      <div><span>Attendance progress</span><strong>{attendance.percentage == null ? "No closed attendance records yet" : attendance.risk === "GOOD" ? `Can miss ${attendance.classesCanMiss} more class${attendance.classesCanMiss === 1 ? "" : "es"} and remain at target` : attendance.classesNeeded == null ? "A 100% target requires every future class to be Present" : `Attend ${attendance.classesNeeded} consecutive class${attendance.classesNeeded === 1 ? "" : "es"} to reach ${attendance.target}%`}</strong></div>
      <div className="student-progress"><i style={{ width: `${Math.min(100, attendance.percentage || 0)}%` }} /></div>
    </section>
    <div className="student-profile-layout">
      <section className="panel student-subject-panel"><header><div><span className="eyebrow">SUBJECT BREAKDOWN</span><h2>Attendance by subject</h2></div><small>{subjects.length} subjects with records</small></header>
        <div className="student-subject-table"><div className="head"><span>Subject</span><span>Recorded</span><span>P</span><span>L</span><span>A</span><span>Attendance</span></div>{subjects.map((subject) => <div className="row" key={subject.id}><span><b>{subject.code}</b><small>{subject.name}</small></span><span>{subject.total}</span><span>{subject.present}</span><span>{subject.late}</span><span>{subject.absent}</span><span><strong>{subject.percentage == null ? "—" : `${subject.percentage.toFixed(2)}%`}</strong><i className={`student-risk ${subject.risk.toLowerCase()}`}>{riskLabel[subject.risk]}</i></span></div>)}</div>
      </section>
      <section className="panel student-info-panel"><span className="eyebrow">PROFILE INFORMATION</span><h2>Student details</h2><dl><div><dt>Roll number</dt><dd>{student.rollNumber}</dd></div><div><dt>Enrolment</dt><dd>{student.enrollmentNumber || "Not provided"}</dd></div><div><dt>Section</dt><dd>{student.section || "Not provided"}</dd></div><div><dt>Admission date</dt><dd>{student.admissionDate ? shortDate(student.admissionDate) : "Not provided"}</dd></div>{"phoneNumber" in student && <><div><dt><Phone />Student phone</dt><dd>{student.phoneNumber || "Not provided"}</dd></div><div><dt><Phone />Guardian phone</dt><dd>{student.guardianPhone || "Not provided"}</dd></div><div className="notes"><dt><MailWarning />Admin notes</dt><dd>{student.notes || "No administrative notes"}</dd></div></>}</dl></section>
    </div>
    <div className="student-profile-lower"><Calendar records={records} /><section className="panel student-timeline-panel"><header><div><span className="eyebrow">RECENT RECORDS</span><h2>Attendance timeline</h2></div><CalendarDays /></header><div>{records.slice(0, 12).map((record) => <article key={record.id}><span className={record.status.toLowerCase()}>{record.status[0]}</span><div><strong>{record.session.subject.code} · {record.session.subject.name}</strong><small>{shortDate(record.session.date)} · {record.session.startTime}–{record.session.endTime}</small>{record.correctedAt && <em>Corrected · {record.correctionReason}</em>}</div><b>{record.status}</b></article>)}</div>{!records.length && <p className="empty-copy">No closed attendance records are available.</p>}</section></div>
  </div>;
}
