import { Router } from "express";
import { Op } from "sequelize";
import { DateTime } from "luxon";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  AttendanceSession,
  AttendanceRecord,
  Student,
  Subject,
  Timetable,
  Setting,
  User,
} from "../db/index.js";
import {
  markAttendance,
  closeSession,
  getSessionDetail,
  summarize,
} from "../services/attendanceService.js";
import { buildAttendanceWorkbook } from "../services/exportService.js";
import { config } from "../config.js";
import {
  compareRollNumbers,
  normalizeRollNumber,
} from "../utils/rollNumber.js";

const router = Router();
router.use(requireAuth);
const getSetting = async (key, fallback) => {
  const row = await Setting.findByPk(key);
  return row ? JSON.parse(row.value) : fallback;
};

router.get("/dashboard", async (req, res) => {
  const now = DateTime.now().setZone(config.timezone),
    dayOfWeek = now.weekday;
  const timetable = await Timetable.findAll({
    where: { dayOfWeek, active: true },
    order: [["startTime", "ASC"]],
    include: [Subject],
  });
  const sessions = await AttendanceSession.findAll({
    where: { sessionDate: now.toISODate() },
    include: [Subject, AttendanceRecord],
    order: [["openedAt", "DESC"]],
  });
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
    sessions: sessions.map((s) => ({
      ...s.toJSON(),
      summary: summarize(s.AttendanceRecords),
    })),
  });
});
router.post("/sessions", async (req, res) => {
  const input = z
    .object({
      subjectId: z.number().int(),
      scheduledStartTime: z.string().regex(/^\d{2}:\d{2}$/),
      scheduledEndTime: z.string().regex(/^\d{2}:\d{2}$/),
      faculty: z.string().trim().max(120).nullable().optional(),
      sessionType: z
        .enum(["SCHEDULED", "REPLACEMENT", "EXTRA"])
        .default("SCHEDULED"),
      reason: z.string().trim().max(250).nullable().optional(),
    })
    .parse(req.body);
  if (
    !(await Subject.findOne({ where: { id: input.subjectId, active: true } }))
  )
    return res
      .status(400)
      .json({ message: "Selected subject is unavailable." });
  const now = DateTime.now().setZone(config.timezone);
  const session = await AttendanceSession.create({
    ...input,
    SubjectId: input.subjectId,
    sessionDate: now.toISODate(),
    openedAt: now.toJSDate(),
    lateThresholdMinutes: await getSetting("lateThresholdMinutes", 15),
    createdById: req.user.id,
  });
  res.status(201).json(await getSessionDetail(session.id));
});
router.get("/sessions", async (req, res) => {
  const where = {};
  if (req.query.from || req.query.to)
    where.sessionDate = {
      ...(req.query.from && { [Op.gte]: req.query.from }),
      ...(req.query.to && { [Op.lte]: req.query.to }),
    };
  if (req.query.subjectId) where.SubjectId = req.query.subjectId;
  const sessions = await AttendanceSession.findAll({
    where,
    limit: 100,
    order: [
      ["sessionDate", "DESC"],
      ["openedAt", "DESC"],
    ],
    include: [Subject, AttendanceRecord],
  });
  res.json(
    sessions.map((s) => ({
      ...s.toJSON(),
      summary: summarize(s.AttendanceRecords),
    })),
  );
});
router.get("/sessions/:id", async (req, res) => {
  const session = await getSessionDetail(req.params.id);
  const students = await Student.findAll({ where: { active: true } });
  students.sort(compareRollNumbers);
  res.json({
    session,
    students,
    serverTime: new Date().toISOString(),
    summary: summarize(session.AttendanceRecords),
  });
});
router.post("/sessions/:id/mark", async (req, res, next) => {
  try {
    const input = z
      .object({ rollNumber: z.string().trim().min(1).max(20) })
      .parse(req.body);
    res
      .status(201)
      .json(
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
});
router.patch("/sessions/:id/students/:studentId", async (req, res) => {
  const input = z
    .object({
      status: z.enum(["PRESENT", "LATE", "ABSENT"]),
      reason: z.string().trim().min(2).max(250),
    })
    .parse(req.body);
  const session = await AttendanceSession.findByPk(req.params.id);
  const allow = req.user.role === "ADMIN" || session?.status === "OPEN";
  if (!allow)
    return res
      .status(403)
      .json({ message: "Only ADMIN can correct a closed session." });
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
router.post("/sessions/:id/close", async (req, res) =>
  res.json(
    await closeSession({ sessionId: req.params.id, userId: req.user.id }),
  ),
);
router.get("/export", async (req, res) => {
  const workbook = await buildAttendanceWorkbook({
    sessionId: req.query.sessionId,
    from: req.query.from,
    to: req.query.to,
    subjectId: req.query.subjectId,
  });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="AttendX-${Date.now()}.xlsx"`,
  );
  await workbook.xlsx.write(res);
  res.end();
});
router.get("/analytics/students/:id", async (req, res) => {
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
});
export default router;
