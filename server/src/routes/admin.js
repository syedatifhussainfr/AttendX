import { Router } from "express";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import { z } from "zod";
import {
  requireAdminElevation,
  requireAdminPlus,
  requireAuth,
  requireRole,
} from "../middleware/auth.js";
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
  AppMigration,
  AuthSession,
} from "../db/index.js";
import {
  compareRollNumbers,
  normalizeRollNumber,
} from "../utils/rollNumber.js";
import {
  applyStudentImport,
  reconcileStudentRows,
} from "../services/studentImportService.js";
import { passwordSchema, publicUser } from "../utils/password.js";
import { revokeUserSessions } from "../services/authSessionService.js";

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
const importRowsSchema = z
  .array(
    z.object({
      rowNumber: z.number().int().positive().optional(),
      rollNumber: z.unknown().optional(),
      name: z.unknown().optional(),
    }),
  )
  .min(1)
  .max(1000);
router.post(
  "/students/import/preview",
  requireRole("ADMIN"),
  async (req, res) => {
    const rows = importRowsSchema.parse(req.body.rows);
    res.json(await reconcileStudentRows(rows));
  },
);
router.post(
  "/students/import/apply",
  requireRole("ADMIN"),
  async (req, res) => {
    const data = z
      .object({
        rows: importRowsSchema,
        missingAction: z.enum(["KEEP", "DEACTIVATE"]),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    res.json(
      await applyStudentImport({
        rawRows: data.rows,
        missingAction: data.missingAction,
        userId: req.user.id,
      }),
    );
  },
);
router.get("/subjects", async (req, res) =>
  res.json(await Subject.findAll({ order: [["name", "ASC"]] })),
);
router.post("/subjects", requireRole("ADMIN"), async (req, res) =>
  res.status(201).json(
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
router.get("/users", requireAdminPlus, requireAdminElevation, async (req, res) =>
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
router.post("/users", requireAdminPlus, requireAdminElevation, async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: passwordSchema,
      role: z.enum(["ADMIN", "CR"]),
    })
    .parse(req.body);
  const created = await sequelize.transaction(async (transaction) => {
    const row = await User.create(
      {
        ...data,
        email: data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(data.password, 12),
        mustChangePassword: true,
      },
      { transaction },
    );
    await AuditLog.create(
      {
        entityType: "USER",
        entityId: row.id,
        action: "USER_CREATED",
        newValue: JSON.stringify(publicUser(row)),
        UserId: req.user.id,
      },
      { transaction },
    );
    return row;
  });
  res.status(201).json(publicUser(created));
});
router.patch("/users/:id", requireAdminPlus, requireAdminElevation, async (req, res) => {
  const row = await User.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "User not found." });
  const data = z
    .object({
      name: z.string().min(2).optional(),
      role: z.enum(["ADMIN", "CR"]).optional(),
      active: z.boolean().optional(),
    })
    .parse(req.body);
  if (row.id === req.user.id && data.active === false)
    return res.status(409).json({
      code: "SELF_DISABLE_BLOCKED",
      message:
        "You cannot disable the administrator account you are currently using.",
    });
  if (row.id === req.user.id && data.role && data.role !== "ADMIN")
    return res.status(409).json({
      code: "SELF_ROLE_CHANGE_BLOCKED",
      message:
        "You cannot remove ADMIN access from the account you are currently using.",
    });
  const before = publicUser(row);
  await sequelize.transaction(async (transaction) => {
    await row.update(data, { transaction });
    await AuditLog.create(
      {
        entityType: "USER",
        entityId: row.id,
        action: "USER_UPDATED",
        oldValue: JSON.stringify(before),
        newValue: JSON.stringify(publicUser(row)),
        UserId: req.user.id,
      },
      { transaction },
    );
  });
  if (data.active === false) await revokeUserSessions(row.id);
  res.json(publicUser(row));
});
router.post(
  "/users/:id/reset-password",
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await User.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "User not found." });
    if (row.role !== "CR")
      return res
        .status(400)
        .json({ message: "ADMIN can reset only CR passwords." });
    const { temporaryPassword } = z
      .object({ temporaryPassword: passwordSchema })
      .parse(req.body);
    await sequelize.transaction(async (transaction) => {
      await row.update(
        {
          passwordHash: await bcrypt.hash(temporaryPassword, 12),
          mustChangePassword: true,
          tokenVersion: (row.tokenVersion || 0) + 1,
        },
        { transaction },
      );
      await AuditLog.create(
        {
          entityType: "USER",
          entityId: row.id,
          action: "CR_PASSWORD_RESET",
          newValue: JSON.stringify({ mustChangePassword: true }),
          UserId: req.user.id,
        },
        { transaction },
      );
    });
    await revokeUserSessions(row.id);
    res.json({
      message: "Temporary password set. Existing sessions were revoked.",
    });
  },
);
router.delete(
  "/users/:id",
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await User.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "User not found." });
    if (row.id === req.user.id)
      return res.status(409).json({
        code: "SELF_DELETE_BLOCKED",
        message: "You cannot delete the account you are currently using.",
      });
    if (
      row.adminPlus &&
      (await User.count({ where: { adminPlus: true, active: true } })) <= 1
    )
      return res.status(409).json({
        code: "LAST_ADMIN_PLUS",
        message: "The last active Admin++ account cannot be deleted.",
      });
    const references = await Promise.all([
      AttendanceSession.count({
        where: {
          [Op.or]: [
            { createdById: row.id },
            { closedById: row.id },
            { reopenedById: row.id },
          ],
        },
      }),
      AttendanceRecord.count({
        where: {
          [Op.or]: [{ markedById: row.id }, { correctedById: row.id }],
        },
      }),
      AuditLog.count({ where: { UserId: row.id } }),
    ]);
    if (references.some(Boolean))
      return res.status(409).json({
        code: "USER_HAS_HISTORY",
        message:
          "This account has audit or attendance history and cannot be deleted. Disable it instead.",
      });
    await sequelize.transaction(async (transaction) => {
      await AuthSession.destroy({ where: { UserId: row.id }, transaction });
      await AuditLog.create(
        {
          entityType: "USER",
          entityId: row.id,
          action: "USER_DELETED",
          oldValue: JSON.stringify(publicUser(row)),
          UserId: req.user.id,
        },
        { transaction },
      );
      await row.destroy({ transaction });
    });
    res.status(204).end();
  },
);
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
  auth_sessions: {
    model: AuthSession,
    attributes: { exclude: ["currentTokenHash", "tokenHistory", "ipHash"] },
    order: [["lastUsedAt", "DESC"]],
  },
  app_migrations: { model: AppMigration, order: [["appliedAt", "DESC"]] },
};

router.get("/database/overview", requireAdminPlus, requireAdminElevation, async (req, res) => {
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

router.get(
  "/database/tables/:table",
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const definition = databaseTables[req.params.table];
    if (!definition)
      return res
        .status(404)
        .json({ message: "Database table is unavailable." });
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
  },
);
export default router;
