import { Transaction } from "sequelize";
import {
  sequelize,
  AttendanceSession,
  Subject,
  Setting,
  AuditLog,
} from "../db/index.js";
import { getSessionDetail } from "./attendanceService.js";
import { schedulesOverlap } from "../utils/schedule.js";

function settingValue(row, fallback, valid) {
  if (!row) return fallback;
  try {
    const value = JSON.parse(row.value);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function inspectSessionConflicts({
  sessionDate,
  subjectId,
  scheduledStartTime,
  scheduledEndTime,
  transaction,
}) {
  const sessions = await AttendanceSession.findAll({
    where: { sessionDate },
    order: [["openedAt", "DESC"]],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  const subjects = sessions.length
    ? await Subject.findAll({
        where: {
          id: [...new Set(sessions.map((session) => session.SubjectId))],
        },
        attributes: ["id", "name"],
        transaction,
      })
    : [];
  const subjectNames = new Map(
    subjects.map((subject) => [subject.id, subject.name]),
  );
  for (const session of sessions)
    session.setDataValue("subjectName", subjectNames.get(session.SubjectId));
  const duplicate = sessions.find(
    (session) =>
      session.status === "OPEN" &&
      Number(session.SubjectId) === Number(subjectId) &&
      session.scheduledStartTime === scheduledStartTime &&
      session.scheduledEndTime === scheduledEndTime,
  );
  const conflicting = sessions.filter((session) =>
    schedulesOverlap(
      scheduledStartTime,
      scheduledEndTime,
      session.scheduledStartTime,
      session.scheduledEndTime,
    ),
  );
  const otherOpen = sessions.filter((session) => session.status === "OPEN");
  return { duplicate, conflicting, otherOpen };
}

export async function openAttendanceSession({ input, userId, now }) {
  const transactionOptions = {
    isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    ...(sequelize.getDialect() === "sqlite" && {
      type: Transaction.TYPES.IMMEDIATE,
    }),
  };
  return sequelize.transaction(transactionOptions, async (transaction) => {
    const thresholdSetting = await Setting.findByPk("lateThresholdMinutes", {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const lateModeSetting = await Setting.findByPk("lateModeEnabled", {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const lateCreditSetting = await Setting.findByPk("lateAttendanceCredit", {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const lateThresholdMinutes = settingValue(
      thresholdSetting,
      15,
      (value) => Number.isInteger(value) && value >= 1 && value <= 120,
    );
    const lateModeEnabled = settingValue(
      lateModeSetting,
      true,
      (value) => typeof value === "boolean",
    );
    const lateAttendanceCredit = settingValue(
      lateCreditSetting,
      0,
      (value) => [0, 0.5, 1].includes(value),
    );
    const subject = await Subject.findOne({
      where: { id: input.subjectId, active: true },
      transaction,
    });
    if (!subject) {
      const error = new Error("Selected subject is unavailable.");
      error.status = 400;
      throw error;
    }
    if (input.scheduledSubjectId) {
      const scheduled = await Subject.findByPk(input.scheduledSubjectId, {
        transaction,
      });
      if (!scheduled) {
        const error = new Error("Scheduled subject is unavailable.");
        error.status = 400;
        throw error;
      }
    }
    const conflicts = await inspectSessionConflicts({
      sessionDate: input.sessionDate,
      subjectId: input.subjectId,
      scheduledStartTime: input.scheduledStartTime,
      scheduledEndTime: input.scheduledEndTime,
      transaction,
    });
    if (conflicts.duplicate) {
      const error = new Error(
        "An identical attendance session is already open.",
      );
      error.status = 409;
      error.code = "DUPLICATE_OPEN_SESSION";
      error.details = { sessionId: conflicts.duplicate.id };
      throw error;
    }
    const needsConfirmation =
      conflicts.conflicting.length > 0 || conflicts.otherOpen.length > 0;
    if (needsConfirmation && !input.allowOverlap) {
      const error = new Error(
        conflicts.otherOpen.length
          ? "Another attendance session is open. Review the conflict before continuing."
          : "This session overlaps an existing session.",
      );
      error.status = 409;
      error.code = "SESSION_CONFLICT";
      error.details = {
        conflicting: conflicts.conflicting.map((session) => ({
          id: session.id,
          subject: session.getDataValue("subjectName"),
          startTime: session.scheduledStartTime,
          endTime: session.scheduledEndTime,
          status: session.status,
        })),
        otherOpen: conflicts.otherOpen.map((session) => ({
          id: session.id,
          subject: session.getDataValue("subjectName"),
          startTime: session.scheduledStartTime,
          endTime: session.scheduledEndTime,
        })),
      };
      throw error;
    }
    if (
      conflicts.conflicting.length > 0 &&
      input.allowOverlap &&
      !["REPLACEMENT", "EXTRA"].includes(input.sessionType)
    ) {
      const error = new Error(
        "An overlapping session must be marked as a replacement or extra class.",
      );
      error.status = 400;
      throw error;
    }
    const session = await AttendanceSession.create(
      {
        SubjectId: input.subjectId,
        scheduledSubjectId: input.scheduledSubjectId || null,
        sessionDate: input.sessionDate,
        scheduledStartTime: input.scheduledStartTime,
        scheduledEndTime: input.scheduledEndTime,
        openedAt: now,
        lateThresholdMinutes,
        lateModeEnabled,
        lateAttendanceCredit,
        faculty: input.faculty,
        sessionType: input.sessionType,
        reason: input.reason,
        createdById: userId,
      },
      { transaction },
    );
    await AuditLog.create(
      {
        entityType: "ATTENDANCE_SESSION",
        entityId: session.id,
        action: "SESSION_OPENED",
        newValue: JSON.stringify({
          subjectId: input.subjectId,
          scheduledSubjectId: input.scheduledSubjectId || null,
          sessionType: input.sessionType,
          overlapConfirmed: Boolean(input.allowOverlap),
        }),
        reason: input.reason || null,
        UserId: userId,
        AttendanceSessionId: session.id,
      },
      { transaction },
    );
    return getSessionDetail(session.id, transaction);
  });
}
