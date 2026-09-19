import ExcelJS from "exceljs";
import { Op } from "sequelize";
import {
  AttendanceSession,
  AttendanceRecord,
  Student,
  Subject,
} from "../db/index.js";
import { compareRollNumbers } from "../utils/rollNumber.js";

const NAVY = "FF0B3B68",
  ORANGE = "FFE87524",
  PALE_ORANGE = "FFFFF1E6",
  WHITE = "FFFFFFFF";
const MAX_EXPORT_RECORDS = 50_000;
const MAX_REVIEW_SESSIONS = 250;
const MAX_REVIEW_SUBJECTS = 200;

function sessionWhere({ sessionId, from, to, subjectId }, closedOnly = false) {
  const where = {};
  if (sessionId) where.id = sessionId;
  if (from || to)
    where.sessionDate = {
      ...(from && { [Op.gte]: from }),
      ...(to && { [Op.lte]: to }),
    };
  if (subjectId) where.SubjectId = subjectId;
  if (closedOnly) where.status = "CLOSED";
  return where;
}

async function loadSessions(filters, closedOnly = false) {
  const sessions = await AttendanceSession.findAll({
    where: sessionWhere(filters, closedOnly),
    order: [
      ["sessionDate", "ASC"],
      ["scheduledStartTime", "ASC"],
    ],
    include: [Subject, { model: AttendanceRecord, include: [Student] }],
  });
  const recordCount = sessions.reduce(
    (total, session) => total + session.AttendanceRecords.length,
    0,
  );
  if (recordCount > MAX_EXPORT_RECORDS) {
    const error = new Error(
      `This export contains ${recordCount.toLocaleString()} records. Narrow the date or subject filters below ${MAX_EXPORT_RECORDS.toLocaleString()} records.`,
    );
    error.status = 413;
    throw error;
  }
  return sessions;
}

function workbookBase() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AttendX";
  workbook.company = "EIILM Kolkata";
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: WHITE } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.height = 28;
}

function styleTotal(row) {
  row.font = { bold: true, color: { argb: NAVY } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALE_ORANGE },
  };
  row.border = { top: { style: "medium", color: { argb: ORANGE } } };
}

function addTitle(sheet, title, subtitle, lastColumn) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: NAVY } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getCell("A2").value = subtitle;
  sheet.getCell("A2").font = { italic: true, color: { argb: "FF5D7184" } };
  sheet.getRow(2).height = 24;
}

const blankCounts = () => ({ total: 0, present: 0, late: 0, absent: 0 });
function addStatus(counts, status) {
  counts.total += 1;
  if (status === "PRESENT") counts.present += 1;
  else if (status === "LATE") counts.late += 1;
  else counts.absent += 1;
}
const ratio = (value, total) => (total ? value / total : null);
const excelDate = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

function setPercentFormats(sheet, columns, fromRow, toRow) {
  for (const column of columns)
    for (let row = fromRow; row <= toRow; row += 1)
      sheet.getCell(row, column).numFmt = "0.00%";
}

function roundedPercent(value, total) {
  return total ? Math.round((value / total) * 100) : null;
}

function precisePercent(value, total) {
  return total ? Number(((value / total) * 100).toFixed(2)) : null;
}

function styleGroupedHeaders(sheet, firstRow, secondRow) {
  styleHeader(sheet.getRow(firstRow));
  styleHeader(sheet.getRow(secondRow));
  sheet.getRow(firstRow).height = 26;
  sheet.getRow(secondRow).height = 34;
}

function styleStatusCell(cell, status) {
  const styles = {
    PRESENT: { fill: "FFE7F5EC", font: "FF216E43" },
    LATE: { fill: "FFFFF3D6", font: "FF946200" },
    ABSENT: { fill: "FFFFE7E7", font: "FFA33131" },
    "NO RECORD": { fill: "FFF0F2F4", font: "FF66727D" },
  };
  const style = styles[status];
  if (!style) return;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: style.fill },
  };
  cell.font = { color: { argb: style.font }, bold: true };
  cell.alignment = { horizontal: "center" };
}

function reportPeriod(sessions) {
  if (!sessions.length) return "No closed sessions match the selected filters";
  const first = sessions[0].sessionDate,
    last = sessions.at(-1).sessionDate;
  return first === last ? first : `${first} to ${last}`;
}

export function attendanceExportFilename(filters, sessions, machine = false) {
  let period;
  if (sessions.length === 1) period = sessions[0].sessionDate;
  else if (filters.from && filters.to)
    period =
      filters.from === filters.to
        ? filters.from
        : `${filters.from}_to_${filters.to}`;
  else if (filters.from) period = `${filters.from}_onwards`;
  else if (filters.to) period = `through_${filters.to}`;
  else period = new Date().toISOString().slice(0, 10);
  return `attendance_${machine ? "data_" : ""}${period}.xlsx`;
}

export async function buildAttendanceWorkbook(filters) {
  const sessions = await loadSessions(filters);
  const workbook = workbookBase();
  const sheet = workbook.addWorksheet("Machine Data", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    ["Session ID", 12],
    ["Date", 13],
    ["Subject Code", 16],
    ["Subject", 36],
    ["Roll", 10],
    ["Student", 28],
    ["Status", 12],
    ["Credit", 10],
    ["Attendance Time", 23],
  ].map(([header, width]) => ({
    header,
    key: header.toLowerCase().replaceAll(" ", "_"),
    width,
  }));
  styleHeader(sheet.getRow(1));
  for (const session of sessions)
    for (const record of [...session.AttendanceRecords].sort((a, b) =>
      compareRollNumbers(a.Student, b.Student),
    ))
      sheet.addRow({
        session_id: session.id,
        date: session.sessionDate,
        subject_code: session.Subject.code,
        subject: session.Subject.name,
        roll: record.Student.rollNumber,
        student: record.Student.name,
        status: record.status,
        credit: record.attendanceCredit ? 1 : 0,
        attendance_time: record.markedAt,
      });
  sheet.autoFilter = { from: "A1", to: "I1" };
  sheet.getColumn("roll").numFmt = "@";
  sheet.getColumn("attendance_time").numFmt = "dd-mmm-yyyy hh:mm:ss";
  return { workbook, sessions };
}

export async function buildAttendanceReviewWorkbook(filters) {
  const [sessions, activeStudents] = await Promise.all([
    loadSessions(filters, true),
    Student.findAll({ where: { active: true }, order: [["id", "ASC"]] }),
  ]);
  if (sessions.length > MAX_REVIEW_SESSIONS) {
    const error = new Error(
      `The review workbook contains ${sessions.length} sessions. Narrow the date or subject filters to ${MAX_REVIEW_SESSIONS} sessions or fewer.`,
    );
    error.status = 413;
    throw error;
  }
  const workbook = workbookBase();
  const subjectMap = new Map(),
    studentMap = new Map(),
    subjectStudentMap = new Map();
  const sessionStudentMap = new Map();
  const overall = blankCounts();

  for (const student of activeStudents)
    studentMap.set(String(student.id), {
      id: student.id,
      rollNumber: student.rollNumber,
      name: student.name,
      ...blankCounts(),
    });

  for (const session of sessions) {
    const subjectKey = String(session.SubjectId);
    if (!subjectMap.has(subjectKey))
      subjectMap.set(subjectKey, {
        id: session.SubjectId,
        code: session.Subject.code,
        name: session.Subject.name,
        sessions: 0,
        ...blankCounts(),
      });
    subjectMap.get(subjectKey).sessions += 1;
    for (const record of session.AttendanceRecords) {
      const studentKey = String(record.StudentId);
      if (!studentMap.has(studentKey))
        studentMap.set(studentKey, {
          id: record.StudentId,
          rollNumber: record.Student.rollNumber,
          name: record.Student.name,
          ...blankCounts(),
        });
      const pairKey = `${subjectKey}:${studentKey}`;
      if (!subjectStudentMap.has(pairKey))
        subjectStudentMap.set(pairKey, {
          subjectId: session.SubjectId,
          subjectCode: session.Subject.code,
          subjectName: session.Subject.name,
          studentId: record.StudentId,
          rollNumber: record.Student.rollNumber,
          studentName: record.Student.name,
          ...blankCounts(),
        });
      addStatus(subjectMap.get(subjectKey), record.status);
      addStatus(studentMap.get(studentKey), record.status);
      addStatus(subjectStudentMap.get(pairKey), record.status);
      addStatus(overall, record.status);
      sessionStudentMap.set(`${session.id}:${studentKey}`, record.status);
    }
  }

  const subjects = [...subjectMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (subjects.length > MAX_REVIEW_SUBJECTS) {
    const error = new Error(
      `The review workbook contains ${subjects.length} subjects. Narrow the filters to ${MAX_REVIEW_SUBJECTS} subjects or fewer.`,
    );
    error.status = 413;
    throw error;
  }
  const students = [...studentMap.values()].sort(compareRollNumbers);
  for (const subject of subjects)
    for (const student of students) {
      const pairKey = `${subject.id}:${student.id}`;
      if (!subjectStudentMap.has(pairKey))
        subjectStudentMap.set(pairKey, {
          subjectId: subject.id,
          subjectCode: subject.code,
          subjectName: subject.name,
          studentId: student.id,
          rollNumber: student.rollNumber,
          studentName: student.name,
          ...blankCounts(),
        });
    }

  const studentSheet = workbook.addWorksheet("Student Summary", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 5, showGridLines: false }],
  });
  const overallColumns = [
    "Classes held",
    "Recorded classes",
    "Attended",
    "Late",
    "Absent",
    "Attendance % rounded",
    "Attendance % exact",
  ];
  const subjectColumns = [
    "Held",
    "Recorded",
    "Attended",
    "Late",
    "Absent",
    "% rounded",
    "% exact",
  ];
  const studentColumnCount =
    2 + overallColumns.length + subjects.length * subjectColumns.length;
  studentSheet.columns = [
    12,
    30,
    ...overallColumns.map(() => 16),
    ...subjects.flatMap(() => subjectColumns.map(() => 14)),
  ].map((width) => ({ width }));
  addTitle(
    studentSheet,
    "Attendance by Student",
    "Roll number and name identify every student. Percentages use recorded classes; blanks mean no attendance record exists for that student and subject.",
    "I",
  );
  studentSheet.addRow([]);
  studentSheet.mergeCells(4, 1, 5, 1);
  studentSheet.getCell(4, 1).value = "Roll number";
  studentSheet.mergeCells(4, 2, 5, 2);
  studentSheet.getCell(4, 2).value = "Student name";
  studentSheet.mergeCells(4, 3, 4, 2 + overallColumns.length);
  studentSheet.getCell(4, 3).value = "OVERALL";
  overallColumns.forEach((label, index) => {
    studentSheet.getCell(5, 3 + index).value = label;
  });
  subjects.forEach((subject, subjectIndex) => {
    const start =
      3 + overallColumns.length + subjectIndex * subjectColumns.length;
    studentSheet.mergeCells(4, start, 4, start + subjectColumns.length - 1);
    studentSheet.getCell(4, start).value = `${subject.code} · ${subject.name}`;
    subjectColumns.forEach((label, index) => {
      studentSheet.getCell(5, start + index).value = label;
    });
  });
  styleGroupedHeaders(studentSheet, 4, 5);
  for (const student of students) {
    const row = [
      student.rollNumber,
      student.name,
      sessions.length,
      student.total,
      student.present,
      student.late,
      student.absent,
      roundedPercent(student.present, student.total),
      precisePercent(student.present, student.total),
    ];
    for (const subject of subjects) {
      const subjectStudent = subjectStudentMap.get(
        `${subject.id}:${student.id}`,
      );
      row.push(
        subject.sessions,
        subjectStudent.total,
        subjectStudent.present,
        subjectStudent.late,
        subjectStudent.absent,
        roundedPercent(subjectStudent.present, subjectStudent.total),
        precisePercent(subjectStudent.present, subjectStudent.total),
      );
    }
    studentSheet.addRow(row);
  }
  const studentTotals = [
    "CLASS TOTAL",
    `${students.length} students`,
    sessions.length,
    overall.total,
    overall.present,
    overall.late,
    overall.absent,
    roundedPercent(overall.present, overall.total),
    precisePercent(overall.present, overall.total),
  ];
  for (const subject of subjects)
    studentTotals.push(
      subject.sessions,
      subject.total,
      subject.present,
      subject.late,
      subject.absent,
      roundedPercent(subject.present, subject.total),
      precisePercent(subject.present, subject.total),
    );
  styleTotal(studentSheet.addRow(studentTotals));
  studentSheet.getColumn(1).numFmt = "@";
  studentSheet.getColumn(1).alignment = { horizontal: "center" };
  for (let column = 8; column <= studentColumnCount; column += 1) {
    const relative = column - 3;
    const position =
      relative < overallColumns.length
        ? relative
        : (relative - overallColumns.length) % subjectColumns.length;
    if (position === 5 || position === 6)
      studentSheet.getColumn(column).numFmt =
        position === 5 ? '0"%"' : '0.00"%"';
  }
  studentSheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: studentColumnCount },
  };

  const register = workbook.addWorksheet("Attendance Register", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 5, showGridLines: false }],
  });
  const registerColumnCount = 9 + sessions.length;
  register.columns = [
    12,
    30,
    14,
    16,
    12,
    10,
    10,
    15,
    16,
    ...sessions.map(() => 18),
  ].map((width) => ({ width }));
  addTitle(
    register,
    "Student Attendance Register",
    "Each session column shows PRESENT, LATE, ABSENT, or NO RECORD for the identified student.",
    register.getColumn(registerColumnCount).letter,
  );
  register.addRow([]);
  register.mergeCells(4, 1, 5, 1);
  register.getCell(4, 1).value = "Roll number";
  register.mergeCells(4, 2, 5, 2);
  register.getCell(4, 2).value = "Student name";
  register.mergeCells(4, 3, 4, 9);
  register.getCell(4, 3).value = "OVERALL";
  [
    "Classes held",
    "Recorded",
    "Attended",
    "Late",
    "Absent",
    "% rounded",
    "% exact",
  ].forEach((label, index) => {
    register.getCell(5, 3 + index).value = label;
  });
  sessions.forEach((session, index) => {
    const column = 10 + index;
    register.getCell(4, column).value =
      `${session.Subject.code} · ${session.Subject.name}`;
    register.getCell(5, column).value =
      `${session.sessionDate} ${session.scheduledStartTime}`;
  });
  styleGroupedHeaders(register, 4, 5);
  for (const student of students) {
    const statuses = sessions.map(
      (session) =>
        sessionStudentMap.get(`${session.id}:${student.id}`) || "NO RECORD",
    );
    const added = register.addRow([
      student.rollNumber,
      student.name,
      sessions.length,
      student.total,
      student.present,
      student.late,
      student.absent,
      roundedPercent(student.present, student.total),
      precisePercent(student.present, student.total),
      ...statuses,
    ]);
    statuses.forEach((status, index) =>
      styleStatusCell(added.getCell(10 + index), status),
    );
  }
  styleTotal(
    register.addRow([
      "CLASS TOTAL",
      `${students.length} students`,
      sessions.length,
      overall.total,
      overall.present,
      overall.late,
      overall.absent,
      roundedPercent(overall.present, overall.total),
      precisePercent(overall.present, overall.total),
      ...sessions.map(
        (session) =>
          `${session.AttendanceRecords.filter((record) => record.status === "PRESENT").length} attended`,
      ),
    ]),
  );
  register.getColumn(1).numFmt = "@";
  register.getColumn(8).numFmt = '0"%"';
  register.getColumn(9).numFmt = '0.00"%"';
  register.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: registerColumnCount },
  };

  const bySubject = workbook.addWorksheet("Student by Subject", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: false }],
  });
  bySubject.columns = [12, 30, 34, 14, 14, 14, 12, 10, 10, 20, 18].map(
    (width) => ({ width }),
  );
  addTitle(
    bySubject,
    "Subject Attendance by Student",
    "Every row names the student and subject. Attendance percentage counts PRESENT records; LATE remains separate.",
    "K",
  );
  bySubject.addRow([]);
  bySubject.addRow([
    "Roll number",
    "Student name",
    "Subject",
    "Code",
    "Classes held",
    "Recorded classes",
    "Attended",
    "Late",
    "Absent",
    "Attendance % rounded",
    "Attendance % exact",
  ]);
  styleHeader(bySubject.getRow(4));
  for (const student of students) {
    for (const subject of subjects) {
      const row = subjectStudentMap.get(`${subject.id}:${student.id}`);
      bySubject.addRow([
        student.rollNumber,
        student.name,
        subject.name,
        subject.code,
        subject.sessions,
        row.total,
        row.present,
        row.late,
        row.absent,
        roundedPercent(row.present, row.total),
        precisePercent(row.present, row.total),
      ]);
    }
  }
  styleTotal(
    bySubject.addRow([
      "CLASS TOTAL",
      `${students.length} students`,
      `${subjects.length} subjects`,
      null,
      sessions.length,
      overall.total,
      overall.present,
      overall.late,
      overall.absent,
      roundedPercent(overall.present, overall.total),
      precisePercent(overall.present, overall.total),
    ]),
  );
  bySubject.getColumn(1).numFmt = "@";
  bySubject.getColumn(10).numFmt = '0"%"';
  bySubject.getColumn(11).numFmt = '0.00"%"';
  bySubject.autoFilter = { from: "A4", to: "K4" };

  const overview = workbook.addWorksheet("Overview", {
    views: [{ state: "frozen", ySplit: 9, showGridLines: false }],
  });
  overview.columns = [42, 16, 14, 15, 13, 11, 11, 18, 20].map((width) => ({
    width,
  }));
  addTitle(
    overview,
    "AttendX Attendance Review",
    `Closed sessions from ${reportPeriod(sessions)}. Present earns attendance credit. Late counts only as physical appearance.`,
    "I",
  );
  overview.addRow([]);
  overview.addRow(["Report generated", new Date()]);
  overview.getCell("B4").numFmt = "dd-mmm-yyyy hh:mm";
  overview.addRow([
    "Closed sessions",
    sessions.length,
    "Students",
    students.length,
    "Subjects",
    subjects.length,
  ]);
  overview.addRow([
    "Total records",
    overall.total,
    "Present",
    overall.present,
    "Late",
    overall.late,
    "Absent",
    overall.absent,
  ]);
  overview.addRow([
    "Overall attendance",
    ratio(overall.present, overall.total),
    "Physical appearance",
    ratio(overall.present + overall.late, overall.total),
  ]);
  overview.getCell("B7").numFmt = "0.00%";
  overview.getCell("D7").numFmt = "0.00%";
  overview.addRow([]);
  overview.addRow([
    "Subject",
    "Code",
    "Sessions",
    "Records",
    "Present",
    "Late",
    "Absent",
    "Attendance %",
    "Appearance %",
  ]);
  styleHeader(overview.getRow(9));
  for (const subject of subjects)
    overview.addRow([
      subject.name,
      subject.code,
      subject.sessions,
      subject.total,
      subject.present,
      subject.late,
      subject.absent,
      ratio(subject.present, subject.total),
      ratio(subject.present + subject.late, subject.total),
    ]);
  const overviewTotal = overview.addRow([
    "GRAND TOTAL",
    null,
    sessions.length,
    overall.total,
    overall.present,
    overall.late,
    overall.absent,
    ratio(overall.present, overall.total),
    ratio(overall.present + overall.late, overall.total),
  ]);
  styleTotal(overviewTotal);
  setPercentFormats(overview, [8, 9], 10, overviewTotal.number);
  overview.autoFilter = { from: "A9", to: "I9" };

  const sessionSheet = workbook.addWorksheet("Session Summary", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  sessionSheet.columns = [15, 44, 14, 16, 14, 24, 11, 11, 10, 11, 18, 20].map(
    (width) => ({ width }),
  );
  addTitle(
    sessionSheet,
    "Session Summary",
    "One row per selected closed attendance session.",
    "L",
  );
  sessionSheet.addRow([]);
  sessionSheet.addRow([
    "Date",
    "Subject",
    "Code",
    "Time",
    "Type",
    "Faculty",
    "Total",
    "Present",
    "Late",
    "Absent",
    "Attendance %",
    "Appearance %",
  ]);
  styleHeader(sessionSheet.getRow(4));
  for (const session of sessions) {
    const counts = blankCounts();
    for (const record of session.AttendanceRecords)
      addStatus(counts, record.status);
    sessionSheet.addRow([
      excelDate(session.sessionDate),
      session.Subject.name,
      session.Subject.code,
      `${session.scheduledStartTime}–${session.scheduledEndTime}`,
      session.sessionType,
      session.faculty || "Not assigned",
      counts.total,
      counts.present,
      counts.late,
      counts.absent,
      ratio(counts.present, counts.total),
      ratio(counts.present + counts.late, counts.total),
    ]);
  }
  const sessionTotal = sessionSheet.addRow([
    "TOTAL",
    null,
    null,
    null,
    null,
    `${sessions.length} sessions`,
    overall.total,
    overall.present,
    overall.late,
    overall.absent,
    ratio(overall.present, overall.total),
    ratio(overall.present + overall.late, overall.total),
  ]);
  styleTotal(sessionTotal);
  setPercentFormats(sessionSheet, [11, 12], 5, sessionTotal.number);
  sessionSheet.getColumn(1).numFmt = "dd-mmm-yyyy";
  sessionSheet.autoFilter = { from: "A4", to: "L4" };

  for (const sheet of workbook.worksheets) {
    sheet.pageSetup = {
      orientation: sheet.name === "Overview" ? "portrait" : "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };
    sheet.headerFooter.oddFooter = "AttendX · EIILM Kolkata · Page &P of &N";
  }
  return { workbook, sessions };
}
