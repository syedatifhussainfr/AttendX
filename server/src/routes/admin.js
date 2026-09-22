import { Router } from "express";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import { z } from "zod";
import {
  requireAdminElevation,
  requireAdminPlus,
  requireAuth,
  requirePermission,
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
  CLOCK_TIME_PATTERN,
  schedulesOverlap,
  validateScheduleWindow,
} from "../utils/schedule.js";
import {
  applyStudentImport,
  reconcileStudentRows,
} from "../services/studentImportService.js";
import { passwordSchema, publicUser } from "../utils/password.js";
import { hasPermission } from "../policy/policyService.js";
import {
  permissionPolicySnapshot,
  savePermissionPolicy,
} from "../policy/policyService.js";
import {
  listUserSessions,
  revokeSessionById,
  revokeUserSessions,
} from "../services/authSessionService.js";

const router = Router();
router.use(requireAuth);
router.get("/students", requirePermission("students.view"), async (req, res) => {
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
router.post("/students", requirePermission("students.create"), async (req, res) => {
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
router.patch("/students/:id", requirePermission("students.update"), async (req, res) => {
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
router.delete(
  "/students/:id",
  requirePermission("students.delete"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await Student.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Student not found." });
    const references = await Promise.all([
      AttendanceRecord.count({ where: { StudentId: row.id } }),
      AuditLog.count({ where: { StudentId: row.id } }),
    ]);
    if (references.some(Boolean))
      return res.status(409).json({
        code: "STUDENT_HAS_HISTORY",
        message:
          "This student has attendance or audit history and cannot be permanently deleted. Mark the student inactive instead.",
      });
    await sequelize.transaction(async (transaction) => {
      await AuditLog.create(
        {
          entityType: "STUDENT",
          entityId: row.id,
          action: "STUDENT_DELETED",
          oldValue: JSON.stringify({
            id: row.id,
            rollNumber: row.rollNumber,
            name: row.name,
            active: row.active,
          }),
          UserId: req.user.id,
        },
        { transaction },
      );
      await row.destroy({ transaction });
    });
    res.status(204).end();
  },
);
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
  requirePermission("students.import"),
  async (req, res) => {
    const rows = importRowsSchema.parse(req.body.rows);
    res.json(await reconcileStudentRows(rows));
  },
);
router.post(
  "/students/import/apply",
  requirePermission("students.import"),
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
router.get("/subjects", requirePermission("subjects.view"), async (req, res) =>
  res.json(await Subject.findAll({ order: [["name", "ASC"]] })),
);
router.post("/subjects", requirePermission("subjects.manage"), async (req, res) =>
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
router.patch("/subjects/:id", requirePermission("subjects.manage"), async (req, res) => {
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
router.delete(
  "/subjects/:id",
  requirePermission("subjects.delete"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await Subject.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Subject not found." });
    const references = await Promise.all([
      Timetable.count({ where: { SubjectId: row.id } }),
      AttendanceSession.count({
        where: {
          [Op.or]: [{ SubjectId: row.id }, { scheduledSubjectId: row.id }],
        },
      }),
    ]);
    if (references.some(Boolean))
      return res.status(409).json({
        code: "SUBJECT_HAS_HISTORY",
        message:
          "This subject is used by timetable or attendance history and cannot be permanently deleted. Mark it inactive instead.",
      });
    await sequelize.transaction(async (transaction) => {
      await AuditLog.create(
        {
          entityType: "SUBJECT",
          entityId: row.id,
          action: "SUBJECT_DELETED",
          oldValue: JSON.stringify({
            id: row.id,
            code: row.code,
            name: row.name,
            active: row.active,
          }),
          UserId: req.user.id,
        },
        { transaction },
      );
      await row.destroy({ transaction });
    });
    res.status(204).end();
  },
);
async function validateTimetableChange(data, current = null) {
  const dayOfWeek = data.dayOfWeek ?? current?.dayOfWeek;
  const startTime = data.startTime ?? current?.startTime;
  const endTime = data.endTime ?? current?.endTime;
  const subjectId = data.subjectId ?? current?.SubjectId;
  const active = data.active ?? current?.active ?? true;
  const windowError = validateScheduleWindow(startTime, endTime);
  if (windowError) {
    const error = new Error(windowError);
    error.status = 400;
    error.code = "INVALID_TIMETABLE_WINDOW";
    throw error;
  }
  const subject = await Subject.findOne({ where: { id: subjectId, active: true } });
  if (!subject) {
    const error = new Error("Choose an active subject for this timetable entry.");
    error.status = 400;
    error.code = "SUBJECT_UNAVAILABLE";
    throw error;
  }
  if (!active) return;
  const candidates = await Timetable.findAll({
    where: {
      dayOfWeek,
      active: true,
      ...(current && { id: { [Op.ne]: current.id } }),
    },
  });
  const conflict = candidates.find((entry) =>
    schedulesOverlap(startTime, endTime, entry.startTime, entry.endTime),
  );
  if (conflict) {
    const error = new Error(
      `This time overlaps timetable entry ${conflict.startTime}–${conflict.endTime}.`,
    );
    error.status = 409;
    error.code = "TIMETABLE_CONFLICT";
    throw error;
  }
}
router.get("/timetable", requirePermission("timetable.view"), async (req, res) =>
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
router.post("/timetable", requirePermission("timetable.manage"), async (req, res) => {
  const data = z
    .object({
      dayOfWeek: z.number().int().min(1).max(7),
      startTime: z.string().regex(CLOCK_TIME_PATTERN),
      endTime: z.string().regex(CLOCK_TIME_PATTERN),
      subjectId: z.number().int(),
      faculty: z.string().trim().max(120).nullable().optional(),
    })
    .parse(req.body);
  await validateTimetableChange(data);
  const { subjectId, ...values } = data;
  res
    .status(201)
    .json(await Timetable.create({ ...values, SubjectId: subjectId }));
});
router.patch("/timetable/:id", requirePermission("timetable.manage"), async (req, res) => {
  const row = await Timetable.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "Entry not found." });
  const data = z
    .object({
      dayOfWeek: z.number().int().min(1).max(7).optional(),
      startTime: z
        .string()
        .regex(CLOCK_TIME_PATTERN)
        .optional(),
      endTime: z
        .string()
        .regex(CLOCK_TIME_PATTERN)
        .optional(),
      subjectId: z.number().int().optional(),
      faculty: z.string().trim().max(120).nullable().optional(),
      active: z.boolean().optional(),
    })
    .parse(req.body);
  await validateTimetableChange(data, row);
  await row.update({
    ...data,
    ...(data.subjectId && { SubjectId: data.subjectId }),
  });
  res.json(row);
});
router.delete("/timetable/:id", requirePermission("timetable.manage"), async (req, res) => {
  const row = await Timetable.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "Entry not found." });
  await row.destroy();
  res.status(204).end();
});
function settingValue(row) {
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

router.get("/settings", requirePermission("settings.view"), async (req, res) => {
  const rows = await Setting.findAll();
  res.json(
    {
      lateModeEnabled: true,
      ...Object.fromEntries(
        rows.map((row) => [row.key, settingValue(row)]),
      ),
    },
  );
});
router.put(
  "/settings/late-mode",
  requirePermission("settings.manageLateMode"),
  requireAdminPlus,
  async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const current = await Setting.findByPk("lateModeEnabled");
    const oldValue = current ? settingValue(current) : true;
    await sequelize.transaction(async (transaction) => {
      await Setting.upsert(
        { key: "lateModeEnabled", value: JSON.stringify(enabled) },
        { transaction },
      );
      if (oldValue !== enabled)
        await AuditLog.create(
          {
            entityType: "SETTING",
            entityId: 0,
            action: "LATE_MODE_CHANGED",
            oldValue: String(oldValue),
            newValue: String(enabled),
            reason: enabled
              ? "Late attendance tracking enabled"
              : "Late attendance tracking disabled",
            UserId: req.user.id,
          },
          { transaction },
        );
    });
    res.json({ lateModeEnabled: enabled });
  },
);
router.put("/settings", requirePermission("settings.manage"), async (req, res) => {
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
  const before = Object.fromEntries(
    (await Setting.findAll()).map((row) => [row.key, settingValue(row)]),
  );
  await sequelize.transaction(async (transaction) => {
    for (const [key, value] of Object.entries(data))
      await Setting.upsert(
        { key, value: JSON.stringify(value) },
        { transaction },
      );
    await AuditLog.create(
      {
        entityType: "SETTING",
        entityId: 0,
        action: "SETTINGS_UPDATED",
        oldValue: JSON.stringify(before),
        newValue: JSON.stringify(data),
        UserId: req.user.id,
      },
      { transaction },
    );
  });
  res.json(data);
});
router.get(
  "/settings/permissions",
  requirePermission("settings.managePermissions"),
  requireAdminPlus,
  requireAdminElevation,
  (req, res) => res.json(permissionPolicySnapshot()),
);
router.put(
  "/settings/permissions",
  requirePermission("settings.managePermissions"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const { policy } = z.object({ policy: z.unknown() }).parse(req.body);
    const before = permissionPolicySnapshot();
    const saved = savePermissionPolicy(policy);
    await AuditLog.create({
      entityType: "PERMISSION_POLICY",
      entityId: 0,
      action: "PERMISSION_POLICY_UPDATED",
      oldValue: JSON.stringify(before),
      newValue: JSON.stringify(saved.policy),
      reason: saved.repairs.length
        ? `Secure policy repair: ${saved.repairs.join("; ")}`
        : "Permission policy updated from Settings",
      UserId: req.user.id,
    });
    res.json(saved);
  },
);
router.use("/users", requireAdminElevation);
router.get("/users", requirePermission("users.view"), async (req, res) => {
  const rows = await User.findAll({
    attributes: { exclude: ["passwordHash"] },
    order: [
      ["role", "ASC"],
      ["name", "ASC"],
    ],
  });
  res.json(
    rows.map((row) => {
      const visible = publicUser(row);
      if (!req.user.adminPlus) visible.phoneNumber = null;
      return visible;
    }),
  );
});
router.post("/users", requirePermission("users.create"), async (req, res) => {
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
router.patch("/users/:id", requirePermission("users.update"), async (req, res) => {
  const row = await User.findByPk(req.params.id);
  if (!row) return res.status(404).json({ message: "User not found." });
  const data = z
    .object({
      name: z.string().min(2).optional(),
      role: z.enum(["ADMIN", "CR"]).optional(),
      active: z.boolean().optional(),
    })
    .parse(req.body);
  if (row.adminPlus && !req.user.adminPlus)
    return res.status(403).json({
      code: "ADMIN_PLUS_REQUIRED",
      message: "Only Admin++ can change an Admin++ account.",
    });
  const roleChanged = data.role && data.role !== row.role;
  if (roleChanged && !hasPermission(req.user, "users.changeRole"))
    return res.status(403).json({
      code: "PERMISSION_REQUIRED",
      permission: "users.changeRole",
      message: "Admin++ permission is required to change account roles.",
    });
  if (roleChanged && row.adminPlus)
    return res.status(409).json({
      code: "ADMIN_PLUS_CLI_REQUIRED",
      message:
        "Admin++ roles are fixed in the browser. Revoke Admin++ with npm run admin-pp first.",
    });
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
  if (
    row.adminPlus &&
    data.active === false &&
    (await User.count({ where: { adminPlus: true, active: true } })) <= 1
  )
    return res.status(409).json({
      code: "LAST_ADMIN_PLUS",
      message: "The last active Admin++ account cannot be disabled.",
    });
  const before = publicUser(row);
  if (roleChanged) data.tokenVersion = (row.tokenVersion || 0) + 1;
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
  if (data.active === false || roleChanged) await revokeUserSessions(row.id);
  res.json(publicUser(row));
});
router.post(
  "/users/:id/reset-password",
  requirePermission("users.resetCrPassword"),
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
router.get(
  "/users/:id/sessions",
  requirePermission("users.manageSessions"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await User.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "User not found." });
    res.json({
      user: publicUser(row),
      sessions: await listUserSessions(row.id, req.authSession.id),
    });
  },
);
router.delete(
  "/users/:userId/sessions/:sessionId",
  requirePermission("users.manageSessions"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await User.findByPk(req.params.userId);
    if (!row) return res.status(404).json({ message: "User not found." });
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    await revokeSessionById(row.id, sessionId, req.authSession.id);
    await AuditLog.create({
      entityType: "USER",
      entityId: row.id,
      action: "USER_SESSION_REVOKED",
      newValue: JSON.stringify({ sessionId }),
      UserId: req.user.id,
    });
    res.status(204).end();
  },
);
router.post(
  "/users/:id/revoke-sessions",
  requirePermission("users.manageSessions"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await User.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "User not found." });
    const isCurrentUser = row.id === req.user.id;
    await revokeUserSessions(row.id, {
      exceptSessionId: isCurrentUser ? req.authSession.id : null,
    });
    await AuditLog.create({
      entityType: "USER",
      entityId: row.id,
      action: "USER_SESSIONS_REVOKED",
      newValue: JSON.stringify({ preservedCurrentSession: isCurrentUser }),
      UserId: req.user.id,
    });
    res.json({
      message: isCurrentUser
        ? "Every other session for your account was revoked."
        : `Every active session for ${row.name} was revoked.`,
    });
  },
);
router.delete(
  "/users/:id",
  requirePermission("users.delete"),
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
const auditIncludes = [
  { model: User, attributes: ["id", "name"] },
  { model: Student, attributes: ["id", "rollNumber", "name"] },
  { model: AttendanceSession, attributes: ["id", "sessionDate"] },
];

const findAuditLogs = (limit) =>
  AuditLog.findAll({
    limit,
    order: [["createdAt", "DESC"]],
    include: auditIncludes,
  });

function readableAuditValue(value) {
  if (value == null || value === "") return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return String(value);
  }
}

function readableAuditTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Timestamp unavailable" : date.toISOString();
}

router.get(
  "/audit-logs/export",
  requirePermission("audit.view"),
  async (req, res) => {
    const rows = await findAuditLogs(5000);
    const generatedAt = new Date().toISOString();
    const body = [
      "AttendX audit log",
      `Generated: ${generatedAt}`,
      `Entries: ${rows.length}`,
      "=".repeat(72),
      ...rows.flatMap((row) => {
        const target = row.Student
          ? `Student ${row.Student.rollNumber} · ${row.Student.name}`
          : row.AttendanceSession
            ? `Attendance session ${row.AttendanceSession.sessionDate} (#${row.AttendanceSession.id})`
            : `${row.entityType} #${row.entityId}`;
        return [
          "",
          `[${readableAuditTimestamp(row.createdAt)}] ${row.action.replaceAll("_", " ")}`,
          `Actor: ${row.User?.name || "System"}`,
          `Target: ${target}`,
          `Reason: ${row.reason || "—"}`,
          `Previous value:\n${readableAuditValue(row.oldValue)}`,
          `New value:\n${readableAuditValue(row.newValue)}`,
          "-".repeat(72),
        ];
      }),
      "",
    ].join("\r\n");
    const date = generatedAt.slice(0, 10);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendx-audit-${date}.txt"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(body);
  },
);

router.get("/audit-logs", requirePermission("audit.view"), async (req, res) =>
  res.json(await findAuditLogs(300)),
);

const databaseTables = {
  users: {
    model: User,
    attributes: { exclude: ["passwordHash", "phoneNumber"] },
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

router.get("/database/overview", requirePermission("database.view"), requireAdminPlus, requireAdminElevation, async (req, res) => {
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
  requirePermission("database.view"),
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
