import { Router } from "express";
import { Op } from "sequelize";
import { DateTime } from "luxon";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import {
  requireAdminElevation,
  requireAdminPlus,
  requireAuth,
  requirePermission,
} from "../middleware/auth.js";
import { hasPermission } from "../policy/policyService.js";
import {
  AttendanceSession,
  AttendanceRecord,
  Student,
  Subject,
  Timetable,
  User,
  Setting,
} from "../db/index.js";
import {
  markAttendance,
  closeSession,
  getSessionDetail,
  summarize,
  reopenSession,
  deleteAttendanceSession,
  setLiveAttendanceSelection,
} from "../services/attendanceService.js";
import { openAttendanceSession } from "../services/sessionService.js";
import {
  attendanceExportFilename,
  buildAttendanceReviewWorkbook,
  buildAttendanceWorkbook,
} from "../services/exportService.js";
import { config } from "../config.js";
import {
  compareRollNumbers,
  normalizeRollNumber,
} from "../utils/rollNumber.js";
import { CLOCK_TIME_PATTERN } from "../utils/schedule.js";

const router = Router();
router.use(requireAuth);

const optionalExportId = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);
const optionalExportDate = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().date().optional(),
);
const exportFiltersSchema = z
  .object({
    sessionId: optionalExportId,
    from: optionalExportDate,
    to: optionalExportDate,
    subjectId: optionalExportId,
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "The export end date must be on or after the start date.",
  });
const exportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `user-${req.user.id}`,
  message: { message: "Too many export requests. Please wait a minute." },
});

function exportHeaders(res, filename) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}
async function canCorrectOpenAttendance(user) {
  if (!hasPermission(user, "attendance.correctOpen")) return false;
  if (user.role !== "CR") return true;
  const setting = await Setting.findByPk("crCanCorrectRecent");
  return setting ? JSON.parse(setting.value) === true : true;
}
router.get("/dashboard", requirePermission("dashboard.view"), async (req, res) => {
  const now = DateTime.now().setZone(config.timezone),
    dayOfWeek = now.weekday;
  const [timetable, sessions, activeStudentCount] = await Promise.all([
    Timetable.findAll({
      where: { dayOfWeek, active: true },
      order: [["startTime", "ASC"]],
      include: [Subject],
    }),
    AttendanceSession.findAll({
      where: { sessionDate: now.toISODate() },
      include: [Subject, AttendanceRecord],
      order: [["openedAt", "DESC"]],
    }),
    Student.count({ where: { active: true } }),
  ]);
  const currentMinutes = now.hour * 60 + now.minute;
  const decorated = timetable.map((item) => item.toJSON());
  const current = decorated.find((item) => {
    const [h, m] = item.startTime.split(":").map(Number),
      [eh, em] = item.endTime.split(":").map(Number);
    return currentMinutes >= h * 60 + m && currentMinutes <= eh * 60 + em;
  });
  const next = decorated.find((item) => {
    const [h, m] = item.startTime.split(":").map(Number);
    return h * 60 + m > currentMinutes;
  });
  res.json({
    serverTime: now.toISO(),
    date: now.toISODate(),
    timetable: decorated,
    current,
    next,
    activeStudentCount,
    sessions: sessions.map((s) => ({
      ...s.toJSON(),
      summary: summarize(s.AttendanceRecords),
    })),
  });
});
router.post("/sessions", requirePermission("attendance.open"), async (req, res) => {
  const input = z
    .object({
      subjectId: z.number().int(),
      scheduledSubjectId: z.number().int().nullable().optional(),
      scheduledStartTime: z.string().regex(CLOCK_TIME_PATTERN),
      scheduledEndTime: z.string().regex(CLOCK_TIME_PATTERN),
      faculty: z.string().trim().max(120).nullable().optional(),
      sessionType: z
        .enum(["SCHEDULED", "REPLACEMENT", "EXTRA"])
        .default("SCHEDULED"),
      reason: z.string().trim().max(250).nullable().optional(),
      allowOverlap: z.boolean().default(false),
    })
    .refine((value) => value.scheduledEndTime > value.scheduledStartTime, {
      path: ["scheduledEndTime"],
      message: "End time must be after start time.",
    })
    .parse(req.body);
  const now = DateTime.now().setZone(config.timezone);
  res.status(201).json(
    await openAttendanceSession({
      input: {
        ...input,
        sessionDate: now.toISODate(),
      },
      userId: req.user.id,
      now: now.toJSDate(),
    }),
  );
});
router.get("/sessions", requirePermission("attendance.view"), async (req, res) => {
  const where = {};
  if (req.query.from || req.query.to)
    where.sessionDate = {
      ...(req.query.from && { [Op.gte]: req.query.from }),
      ...(req.query.to && { [Op.lte]: req.query.to }),
    };
  if (req.query.subjectId) where.SubjectId = req.query.subjectId;
  const [sessions, activeStudentCount] = await Promise.all([
    AttendanceSession.findAll({
      where,
      limit: 100,
      order: [
        ["sessionDate", "DESC"],
        ["openedAt", "DESC"],
      ],
      include: [Subject, AttendanceRecord],
    }),
    Student.count({ where: { active: true } }),
  ]);
  res.json(
    sessions.map((s) => {
      const summary = summarize(s.AttendanceRecords);
      return {
        ...s.toJSON(),
        summary: {
          ...summary,
          pending:
            s.status === "OPEN"
              ? Math.max(0, activeStudentCount - summary.total)
              : 0,
        },
      };
    }),
  );
});
router.get("/sessions/:id", requirePermission("attendance.view"), async (req, res) => {
  const [session, canCorrectOpen] = await Promise.all([
    getSessionDetail(req.params.id),
    canCorrectOpenAttendance(req.user),
  ]);
  const activeStudents = await Student.findAll({ where: { active: true } });
  const studentsById = new Map(
    session.AttendanceRecords.filter((record) => record.Student).map(
      (record) => [record.Student.id, record.Student],
    ),
  );
  for (const student of activeStudents) studentsById.set(student.id, student);
  const students = [...studentsById.values()];
  students.sort(compareRollNumbers);
  res.json({
    session,
    students,
    serverTime: new Date().toISOString(),
    summary: summarize(session.AttendanceRecords),
    capabilities: { canCorrectOpen },
  });
});
router.post(
  "/sessions/:id/mark",
  requirePermission("attendance.mark"),
  async (req, res, next) => {
  try {
    const input = z
      .object({ rollNumber: z.string().trim().min(1).max(20) })
      .parse(req.body);
    res.status(201).json(
      await markAttendance({
        sessionId: req.params.id,
        rollNumber: normalizeRollNumber(input.rollNumber),
        markedById: req.user.id,
      }),
    );
  } catch (error) {
    if (error.existing)
      return res
        .status(error.status)
        .json({ message: error.message, existing: error.existing });
    next(error);
  }
  },
);
router.post(
  "/sessions/:id/students/:studentId/mark",
  requirePermission("attendance.mark"),
  async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["PRESENT", "LATE"]) })
      .parse(req.body);
    res.status(201).json(
      await markAttendance({
        sessionId: req.params.id,
        studentId: Number(req.params.studentId),
        status,
        markedById: req.user.id,
      }),
    );
  },
);
router.patch(
  "/sessions/:id/students/:studentId/selection",
  requirePermission("attendance.mark"),
  async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["PRESENT", "LATE"]).nullable() })
      .parse(req.body);
    res.json(
      await setLiveAttendanceSelection({
        sessionId: req.params.id,
        studentId: Number(req.params.studentId),
        status,
        markedById: req.user.id,
        allowCorrection: await canCorrectOpenAttendance(req.user),
      }),
    );
  },
);
router.patch("/sessions/:id/students/:studentId", async (req, res) => {
  const input = z
    .object({
      status: z.enum(["PRESENT", "LATE", "ABSENT"]),
      reason: z.string().trim().min(2).max(250),
    })
    .parse(req.body);
  const session = await AttendanceSession.findByPk(req.params.id);
  if (!session)
    return res.status(404).json({ message: "Attendance session not found." });
  const requiredPermission =
    session.status === "OPEN"
      ? "attendance.correctOpen"
      : "attendance.correctClosed";
  const allow =
    session.status === "OPEN"
      ? await canCorrectOpenAttendance(req.user)
      : hasPermission(req.user, requiredPermission);
  if (!allow)
    return res
      .status(403)
      .json({
        code: "PERMISSION_REQUIRED",
        permission: requiredPermission,
        message: `Permission ${requiredPermission} is required for this correction.`,
      });
  res.json(
    await markAttendance({
      sessionId: req.params.id,
      studentId: Number(req.params.studentId),
      status: input.status,
      reason: input.reason,
      markedById: req.user.id,
      allowCorrection: true,
    }),
  );
});
router.post("/sessions/:id/close", requirePermission("attendance.close"), async (req, res) =>
  res.json(
    await closeSession({ sessionId: req.params.id, userId: req.user.id }),
  ),
);
router.post(
  "/sessions/:id/reopen",
  requirePermission("attendance.reopen"),
  async (req, res) => {
  const { reason } = z
    .object({ reason: z.string().trim().min(3).max(250) })
    .parse(req.body);
  res.json(
    await reopenSession({
      sessionId: req.params.id,
      userId: req.user.id,
      reason,
    }),
  );
  },
);
router.delete(
  "/sessions/:id",
  requirePermission("attendance.delete"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const { reason } = z
      .object({
        confirmation: z.literal("DELETE ATTENDANCE"),
        reason: z.string().trim().min(5).max(250),
      })
      .parse(req.body);
    await deleteAttendanceSession({
      sessionId: req.params.id,
      userId: req.user.id,
      reason,
    });
    res.status(204).end();
  },
);
router.get(
  "/export/review",
  requirePermission("reports.export"),
  exportLimiter,
  async (req, res) => {
  const filters = exportFiltersSchema.parse(req.query);
  const { workbook, sessions } = await buildAttendanceReviewWorkbook(filters);
  exportHeaders(res, attendanceExportFilename(filters, sessions));
  await workbook.xlsx.write(res);
  res.end();
  },
);
router.get(
  "/export",
  requirePermission("reports.export"),
  exportLimiter,
  async (req, res) => {
  const filters = exportFiltersSchema.parse(req.query);
  const { workbook, sessions } = await buildAttendanceWorkbook(filters);
  exportHeaders(res, attendanceExportFilename(filters, sessions, true));
  await workbook.xlsx.write(res);
  res.end();
  },
);
router.get(
  "/analytics/students/:id",
  requirePermission("reports.view"),
  async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found." });
  const records = await AttendanceRecord.findAll({
    where: { StudentId: student.id },
    include: [
      {
        model: AttendanceSession,
        where: { status: "CLOSED" },
        include: [Subject],
      },
    ],
    order: [[AttendanceSession, "sessionDate", "DESC"]],
  });
  res.json({ student, summary: summarize(records), records });
  },
);
export default router;
