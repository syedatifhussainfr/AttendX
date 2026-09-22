import { Op } from "sequelize";
import {
  AttendanceRecord,
  AttendanceSession,
  Setting,
  Student,
  Subject,
} from "../db/index.js";
import { compareRollNumbers } from "../utils/rollNumber.js";

const DEFAULT_TARGET = 75;

async function attendanceTarget() {
  const row = await Setting.findByPk("attendanceTargetPercentage");
  let value = DEFAULT_TARGET;
  try {
    value = Number(row ? JSON.parse(row.value) : DEFAULT_TARGET);
  } catch {
    value = DEFAULT_TARGET;
  }
  return Number.isFinite(value) && value >= 1 && value <= 100
    ? value
    : DEFAULT_TARGET;
}

function blankCounts() {
  return { total: 0, present: 0, late: 0, absent: 0 };
}

function addRecord(counts, record) {
  counts.total += 1;
  if (record.status === "PRESENT") counts.present += 1;
  else if (record.status === "LATE") counts.late += 1;
  else counts.absent += 1;
}

export function summarizeStudentAttendance(records, target = DEFAULT_TARGET) {
  const counts = blankCounts();
  for (const record of records) addRecord(counts, record);
  const percentage = counts.total
    ? Number(((counts.present / counts.total) * 100).toFixed(2))
    : null;
  const risk =
    percentage == null
      ? "NO_DATA"
      : percentage >= target
        ? "GOOD"
        : percentage >= Math.max(0, target - 15)
          ? "WATCH"
          : "CRITICAL";
  let classesNeeded = percentage != null && percentage < target && target === 100 ? null : 0;
  let classesCanMiss = 0;
  if (percentage != null && percentage < target && target < 100)
    classesNeeded = Math.max(
      0,
      Math.ceil(
        (target * counts.total - 100 * counts.present) / (100 - target),
      ),
    );
  else if (percentage != null && percentage >= target && target > 0)
    classesCanMiss = Math.max(
      0,
      Math.floor((counts.present * 100) / target - counts.total),
    );

  const chronological = [...records].sort((a, b) => {
    const left = `${a.AttendanceSession?.sessionDate || ""} ${a.AttendanceSession?.scheduledStartTime || ""}`;
    const right = `${b.AttendanceSession?.sessionDate || ""} ${b.AttendanceSession?.scheduledStartTime || ""}`;
    return right.localeCompare(left);
  });
  const lastAttended = chronological.find((record) =>
    ["PRESENT", "LATE"].includes(record.status),
  );
  let absenceStreak = 0;
  for (const record of chronological) {
    if (record.status !== "ABSENT") break;
    absenceStreak += 1;
  }
  const recent = chronological.slice(0, 10);
  const recentPresent = recent.filter((record) => record.status === "PRESENT").length;
  const recentPercentage = recent.length
    ? Number(((recentPresent / recent.length) * 100).toFixed(2))
    : null;

  return {
    ...counts,
    attended: counts.present,
    appearance: counts.present + counts.late,
    percentage,
    roundedPercentage: percentage == null ? null : Math.round(percentage),
    target,
    risk,
    classesNeeded,
    classesCanMiss,
    absenceStreak,
    recentPercentage,
    lastAttendedAt: lastAttended?.AttendanceSession?.sessionDate || null,
  };
}

function publicStudent(student, { sensitive = false } = {}) {
  const value = student.toJSON ? student.toJSON() : student;
  const publicValue = {
    id: value.id,
    rollNumber: value.rollNumber,
    name: value.name,
    active: value.active,
    enrollmentNumber: value.enrollmentNumber || null,
    section: value.section || null,
    admissionDate: value.admissionDate || null,
    hasCard: Boolean(value.cardToken),
    hasPhoto: Boolean(value.photoUrl),
    photoUrl: value.photoUrl || null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (sensitive)
    Object.assign(publicValue, {
      phoneNumber: value.phoneNumber || null,
      guardianPhone: value.guardianPhone || null,
      notes: value.notes || null,
      cardToken: value.cardToken || null,
    });
  return publicValue;
}

async function closedRecords(studentIds) {
  if (!studentIds.length) return [];
  return AttendanceRecord.findAll({
    where: { StudentId: { [Op.in]: studentIds } },
    attributes: [
      "id",
      "StudentId",
      "AttendanceSessionId",
      "status",
      "attendanceCredit",
      "markedAt",
      "correctedAt",
      "correctionReason",
    ],
    include: [
      {
        model: AttendanceSession,
        where: { status: "CLOSED" },
        attributes: [
          "id",
          "sessionDate",
          "scheduledStartTime",
          "scheduledEndTime",
          "SubjectId",
        ],
        include: [{ model: Subject, attributes: ["id", "code", "name"] }],
      },
    ],
  });
}

export async function studentDirectory({ q = "", sensitive = false } = {}) {
  const students = await Student.findAll();
  students.sort(compareRollNumbers);
  const [records, target] = await Promise.all([
    closedRecords(students.map((student) => student.id)),
    attendanceTarget(),
  ]);
  const byStudent = new Map();
  for (const record of records) {
    const list = byStudent.get(record.StudentId) || [];
    list.push(record);
    byStudent.set(record.StudentId, list);
  }
  const rows = students.map((student) => ({
    ...publicStudent(student, { sensitive }),
    attendance: summarizeStudentAttendance(
      byStudent.get(student.id) || [],
      target,
    ),
  }));
  const overview = rows.reduce(
    (result, row) => {
      result.total += 1;
      if (row.active) result.active += 1;
      else result.inactive += 1;
      result[row.attendance.risk.toLowerCase()] += 1;
      return result;
    },
    { total: 0, active: 0, inactive: 0, good: 0, watch: 0, critical: 0, no_data: 0 },
  );
  const needle = q.trim().toLowerCase();
  return {
    students: needle
      ? rows.filter((student) =>
          [student.rollNumber, student.name, student.enrollmentNumber]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle)),
        )
      : rows,
    overview,
    target,
  };
}

export async function studentProfile(id, { sensitive = false } = {}) {
  const student = await Student.findByPk(id);
  if (!student) return null;
  const [records, target] = await Promise.all([
    closedRecords([student.id]),
    attendanceTarget(),
  ]);
  records.sort((a, b) => {
    const left = `${a.AttendanceSession.sessionDate} ${a.AttendanceSession.scheduledStartTime}`;
    const right = `${b.AttendanceSession.sessionDate} ${b.AttendanceSession.scheduledStartTime}`;
    return right.localeCompare(left);
  });
  const subjectMap = new Map();
  for (const record of records) {
    const subject = record.AttendanceSession.Subject;
    if (!subjectMap.has(subject.id))
      subjectMap.set(subject.id, { subject, records: [] });
    subjectMap.get(subject.id).records.push(record);
  }
  const subjects = [...subjectMap.values()]
    .map(({ subject, records: subjectRecords }) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      ...summarizeStudentAttendance(subjectRecords, target),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    student: publicStudent(student, { sensitive }),
    attendance: summarizeStudentAttendance(records, target),
    subjects,
    records: records.slice(0, 180).map((record) => ({
      id: record.id,
      status: record.status,
      attendanceCredit: record.attendanceCredit,
      markedAt: record.markedAt,
      correctedAt: record.correctedAt,
      correctionReason: record.correctionReason,
      session: {
        id: record.AttendanceSession.id,
        date: record.AttendanceSession.sessionDate,
        startTime: record.AttendanceSession.scheduledStartTime,
        endTime: record.AttendanceSession.scheduledEndTime,
        subject: record.AttendanceSession.Subject,
      },
    })),
  };
}

export { publicStudent };
