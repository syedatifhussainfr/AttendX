import { Router } from "express";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  sequelize,
  Student,
  Subject,
  Timetable,
  Setting,
  User,
  AuditLog,
  AttendanceSession,
  AttendanceRecord,
} from "../db/index.js";
import {
  compareRollNumbers,
  normalizeRollNumber,
} from "../utils/rollNumber.js";

const router = Router();
router.use(requireAuth);
router.get("/students", async (req, res) => {
  const q = req.query.q || "";
  const students = await Student.findAll({
    where: q
      ? {
          [Op.or]: [
            { rollNumber: { [Op.like]: `%${q}%` } },
            { name: { [Op.like]: `%${q}%` } },
          ],
        }
      : {},
  });
  res.json(students.sort(compareRollNumbers));
});
router.post("/students", requireRole("ADMIN"), async (req, res) => {
  const data = z
    .object({
      rollNumber: z.string().trim().min(1).max(20),
      name: z.string().trim().min(2),
      cardToken: z.string().trim().min(16).nullable().optional(),
      photoUrl: z.string().url().nullable().optional(),
    })
    .parse(req.body);
  data.rollNumber = normalizeRollNumber(data.rollNumber);
  res.status(201).json(await Student.create(data));
});
router.patch("/students/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await Student.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "Student not found." });
  const data = z
    .object({
      rollNumber: z.string().trim().min(1).max(20).optional(),
      name: z.string().trim().min(2).optional(),
      active: z.boolean().optional(),
      cardToken: z.string().trim().min(16).nullable().optional(),
      photoUrl: z.string().url().nullable().optional(),
    })
    .parse(req.body);
  if (data.rollNumber) data.rollNumber = normalizeRollNumber(data.rollNumber);
  await row.update(data);
  res.json(row);
});
router.post("/students/import", requireRole("ADMIN"), async (req, res) => {
  const rows = z
    .array(
      z.object({
        rollNumber: z.string().trim().min(1).max(20),
        name: z.string().trim().min(2),
      }),
    )
    .min(1)
    .max(500)
    .parse(req.body.rows)
    .map((item) => ({
      ...item,
      rollNumber: normalizeRollNumber(item.rollNumber),
    }));
  const uniqueRolls = new Set(rows.map((item) => item.rollNumber));
  if (uniqueRolls.size !== rows.length)
    return res
      .status(400)
      .json({ message: "The CSV contains duplicate roll numbers." });
  const results = await sequelize.transaction(async (transaction) => {
    const imported = [];
    for (const item of rows) {
      const [student, created] = await Student.findOrCreate({
        where: { rollNumber: item.rollNumber },
        defaults: { name: item.name },
        transaction,
      });
      if (!created)
        await student.update(
          { name: item.name, active: true },
          { transaction },
        );
      imported.push({ rollNumber: item.rollNumber, created });
    }
    return imported;
  });
  res.json({ imported: results.length, results });
});
router.get("/subjects", async (req, res) =>
  res.json(await Subject.findAll({ order: [["name", "ASC"]] })),
);
router.post("/subjects", requireRole("ADMIN"), async (req, res) =>
  res
    .status(201)
    .json(
      await Subject.create(
        z
          .object({
            code: z.string().trim().min(1).max(30),
            name: z.string().trim().min(2),
          })
          .parse(req.body),
      ),
    ),
);
router.patch("/subjects/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await Subject.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "Subject not found." });
  await row.update(
    z
      .object({
        code: z.string().trim().min(1).max(30).optional(),
        name: z.string().trim().min(2).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body),
  );
  res.json(row);
});
router.get("/timetable", async (req, res) =>
  res.json(
    await Timetable.findAll({
      include: [Subject],
      order: [
        ["dayOfWeek", "ASC"],
        ["startTime", "ASC"],
      ],
    }),
  ),
);
router.post("/timetable", requireRole("ADMIN"), async (req, res) => {
  const data = z
    .object({
      dayOfWeek: z.number().int().min(1).max(7),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      subjectId: z.number().int(),
      faculty: z.string().trim().max(120).nullable().optional(),
    })
    .parse(req.body);
  res
    .status(201)
    .json(await Timetable.create({ ...data, SubjectId: data.subjectId }));
});
router.patch("/timetable/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await Timetable.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "Entry not found." });
  const data = z
    .object({
      dayOfWeek: z.number().int().min(1).max(7).optional(),
      startTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      endTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
      subjectId: z.number().int().optional(),
      faculty: z.string().trim().max(120).nullable().optional(),
      active: z.boolean().optional(),
    })
    .parse(req.body);
  await row.update({
    ...data,
    ...(data.subjectId && { SubjectId: data.subjectId }),
  });
  res.json(row);
});
router.delete("/timetable/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await Timetable.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "Entry not found." });
  await row.destroy();
  res.status(204).end();
});
router.get("/settings", async (req, res) => {
  const rows = await Setting.findAll();
  res.json(
    Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)])),
  );
});
router.put("/settings", requireRole("ADMIN"), async (req, res) => {
  const data = z
    .object({
      lateThresholdMinutes: z.number().int().min(1).max(120),
      institutionName: z.string().min(2),
      className: z.string().min(1),
      academicSession: z.string().min(2),
      timezone: z.literal("Asia/Kolkata"),
      crCanCorrectRecent: z.boolean().optional(),
    })
    .parse(req.body);
  for (const [key, value] of Object.entries(data))
    await Setting.upsert({ key, value: JSON.stringify(value) });
  res.json(data);
});
router.get("/users", requireRole("ADMIN"), async (req, res) =>
  res.json(
    await User.findAll({
      attributes: { exclude: ["passwordHash"] },
      order: [
        ["role", "ASC"],
        ["name", "ASC"],
      ],
    }),
  ),
);
router.post("/users", requireRole("ADMIN"), async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["ADMIN", "CR"]),
    })
    .parse(req.body);
  res
    .status(201)
    .json(
      await User.create({
        ...data,
        email: data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(data.password, 12),
      }).then((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        active: row.active,
      })),
    );
});
router.patch("/users/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await User.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "User not found." });
  const data = z
    .object({
      name: z.string().min(2).optional(),
      role: z.enum(["ADMIN", "CR"]).optional(),
      active: z.boolean().optional(),
      password: z.string().min(8).optional(),
    })
    .parse(req.body);
  if (data.password) data.passwordHash = await bcrypt.hash(data.password, 12);
  delete data.password;
  await row.update(data);
  res.json({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
  });
});
router.get("/audit-logs", requireRole("ADMIN"), async (req, res) =>
  res.json(
    await AuditLog.findAll({
      limit: 300,
      order: [["createdAt", "DESC"]],
      include: [
        { model: User, attributes: ["id", "name"] },
        { model: Student, attributes: ["id", "rollNumber", "name"] },
        { model: AttendanceSession, attributes: ["id", "sessionDate"] },
      ],
    }),
  ),
);

const databaseTables = {
  users: {
    model: User,
    attributes: { exclude: ["passwordHash"] },
    order: [["id", "ASC"]],
  },
  students: { model: Student, order: [["id", "ASC"]] },
  subjects: { model: Subject, order: [["id", "ASC"]] },
  timetable: { model: Timetable, order: [["id", "ASC"]] },
  attendance_sessions: {
    model: AttendanceSession,
    order: [["id", "DESC"]],
  },
  attendance_records: {
    model: AttendanceRecord,
    order: [["id", "DESC"]],
  },
  settings: { model: Setting, order: [["key", "ASC"]] },
  audit_logs: { model: AuditLog, order: [["id", "DESC"]] },
};

router.get("/database/overview", requireRole("ADMIN"), async (req, res) => {
  const entries = await Promise.all(
    Object.entries(databaseTables).map(async ([name, definition]) => [
      name,
      await definition.model.count(),
    ]),
  );
  res.json({
    dialect: sequelize.getDialect(),
    location: "server/data/attendx.sqlite",
    tables: Object.fromEntries(entries),
  });
});

router.get("/database/tables/:table", requireRole("ADMIN"), async (req, res) => {
  const definition = databaseTables[req.params.table];
  if (!definition)
    return res.status(404).json({ message: "Database table is unavailable." });
  const { page, pageSize } = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(50),
    })
    .parse(req.query);
  const result = await definition.model.findAndCountAll({
    attributes: definition.attributes,
    order: definition.order,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  res.json({
    table: req.params.table,
    rows: result.rows,
    total: result.count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(result.count / pageSize)),
  });
});
export default router;
