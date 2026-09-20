import { DateTime } from "luxon";
import {
  sequelize,
  AttendanceSession,
  AttendanceRecord,
  Student,
  AuditLog,
  Subject,
} from "../db/index.js";
import { config } from "../config.js";

export function deriveAttendanceStatus({
  sessionDate,
  scheduledStartTime,
  thresholdMinutes,
  markedAt,
  timezone = config.timezone,
}) {
  const start = DateTime.fromISO(`${sessionDate}T${scheduledStartTime}`, {
    zone: timezone,
  });
  const time = DateTime.fromJSDate(new Date(markedAt), { zone: timezone });
  return time < start.plus({ minutes: thresholdMinutes }) ? "PRESENT" : "LATE";
}
export const creditFor = (status) => status === "PRESENT";

export async function getSessionDetail(id, transaction) {
  const session = await AttendanceSession.findByPk(id, {
    transaction,
    include: [
      Subject,
      { association: "scheduledSubject" },
      { association: "createdBy", attributes: ["id", "name"] },
      { association: "closedBy", attributes: ["id", "name"] },
      { association: "reopenedBy", attributes: ["id", "name"] },
      {
        model: AttendanceRecord,
        include: [
          { model: Student },
          { association: "markedBy", attributes: ["id", "name"] },
          { association: "correctedBy", attributes: ["id", "name"] },
        ],
      },
    ],
  });
  if (!session) {
    const error = new Error("Attendance session not found.");
    error.status = 404;
    throw error;
  }
  return session;
}

export async function markAttendance({
  sessionId,
  studentId,
  rollNumber,
  status,
  markedById,
  reason,
  now = new Date(),
  method = "MANUAL",
  allowCorrection = false,
}) {
  return sequelize.transaction(async (transaction) => {
    const session = await AttendanceSession.findByPk(sessionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!session) {
      const error = new Error("Attendance session not found.");
      error.status = 404;
      throw error;
    }
    if (session.status === "CLOSED" && !allowCorrection) {
      const error = new Error("This session is closed.");
      error.status = 409;
      throw error;
    }
    const student = studentId
      ? await Student.findByPk(studentId, { transaction })
      : await Student.findOne({ where: { rollNumber }, transaction });
    if (!student || (!student.active && !allowCorrection)) {
      const error = new Error("Active student not found for that roll number.");
      error.status = 404;
      throw error;
    }
    const existing = await AttendanceRecord.findOne({
      where: { AttendanceSessionId: session.id, StudentId: student.id },
      transaction,
    });
    const resolvedStatus =
      status ||
      deriveAttendanceStatus({
        sessionDate: session.sessionDate,
        scheduledStartTime: session.scheduledStartTime,
        thresholdMinutes: session.lateThresholdMinutes,
        markedAt: now,
      });
    if (existing && !allowCorrection) {
      const error = new Error(
        `Roll ${student.rollNumber} was already marked ${existing.status}.`,
      );
      error.status = 409;
      error.existing = existing;
      throw error;
    }
    if (existing) {
      const oldStatus = existing.status;
      await existing.update(
        {
          status: resolvedStatus,
          attendanceCredit: creditFor(resolvedStatus),
          correctedFromStatus: existing.correctedFromStatus || oldStatus,
          correctionReason: reason,
          correctedAt: now,
          correctedById: markedById,
        },
        { transaction },
      );
      await AuditLog.create(
        {
          entityType: "ATTENDANCE_RECORD",
          entityId: existing.id,
          action: "STATUS_CORRECTED",
          oldValue: oldStatus,
          newValue: resolvedStatus,
          reason: reason || null,
          UserId: markedById,
          StudentId: student.id,
          AttendanceSessionId: session.id,
        },
        { transaction },
      );
      return { record: existing, student, corrected: true };
    }
    const record = await AttendanceRecord.create(
      {
        AttendanceSessionId: session.id,
        StudentId: student.id,
        status: resolvedStatus,
        attendanceCredit: creditFor(resolvedStatus),
        markedAt: now,
        markedById,
        method,
      },
      { transaction },
    );
    return { record, student, corrected: false };
  });
}

export async function reopenSession({
  sessionId,
  userId,
  reason,
  now = new Date(),
}) {
  return sequelize.transaction(async (transaction) => {
    const session = await AttendanceSession.findByPk(sessionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!session) {
      const error = new Error("Attendance session not found.");
      error.status = 404;
      throw error;
    }
    if (session.status !== "CLOSED") {
      const error = new Error("Only a closed session can be reopened.");
      error.status = 409;
      throw error;
    }
    const previousClose = {
      closedAt: session.closedAt,
      closedById: session.closedById,
    };
    await session.update(
      {
        status: "OPEN",
        reopenedAt: now,
        reopenedById: userId,
        reopenReason: reason,
        closedAt: null,
        closedById: null,
      },
      { transaction },
    );
    await AuditLog.create(
      {
        entityType: "ATTENDANCE_SESSION",
        entityId: session.id,
        action: "SESSION_REOPENED",
        oldValue: JSON.stringify(previousClose),
        newValue: JSON.stringify({ reopenedAt: now }),
        reason,
        UserId: userId,
        AttendanceSessionId: session.id,
      },
      { transaction },
    );
    return getSessionDetail(session.id, transaction);
  });
}

export async function closeSession({ sessionId, userId, now = new Date() }) {
  return sequelize.transaction(async (transaction) => {
    const session = await AttendanceSession.findByPk(sessionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!session) {
      const error = new Error("Attendance session not found.");
      error.status = 404;
      throw error;
    }
    if (session.status === "CLOSED") {
      const error = new Error("Session is already closed.");
      error.status = 409;
      throw error;
    }
    const students = await Student.findAll({
      where: { active: true },
      transaction,
    });
    const marked = await AttendanceRecord.findAll({
      where: { AttendanceSessionId: session.id },
      attributes: ["StudentId"],
      transaction,
    });
    const markedIds = new Set(marked.map((item) => item.StudentId));
    const absent = students
      .filter((student) => !markedIds.has(student.id))
      .map((student) => ({
        AttendanceSessionId: session.id,
        StudentId: student.id,
        status: "ABSENT",
        attendanceCredit: false,
        markedAt: now,
        markedById: userId,
        method: "MANUAL",
        createdAt: now,
        updatedAt: now,
      }));
    if (absent.length)
      await AttendanceRecord.bulkCreate(absent, { transaction });
    await session.update(
      { status: "CLOSED", closedAt: now, closedById: userId },
      { transaction },
    );
    await AuditLog.create(
      {
        entityType: "ATTENDANCE_SESSION",
        entityId: session.id,
        action: "SESSION_CLOSED",
        newValue: JSON.stringify({ absentAssigned: absent.length }),
        UserId: userId,
        AttendanceSessionId: session.id,
      },
      { transaction },
    );
    return getSessionDetail(session.id, transaction);
  });
}

export function summarize(records) {
  const total = records.length,
    present = records.filter((r) => r.status === "PRESENT").length,
    late = records.filter((r) => r.status === "LATE").length,
    absent = records.filter((r) => r.status === "ABSENT").length;
  return {
    total,
    present,
    late,
    absent,
    credited: present,
    physicalAppearances: present + late,
    attendancePercentage: total
      ? Number(((present / total) * 100).toFixed(2))
      : 0,
  };
}
