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
  BrandingAsset,
  User,
  AuditLog,
  AttendanceSession,
  AttendanceRecord,
  AppMigration,
  AuthSession,
  AcademicClass,
  ClassAssignment,
  ClassSubject,
} from "../db/index.js";
import { normalizeRollNumber } from "../utils/rollNumber.js";
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
import {
  publicStudent,
  studentDirectory,
  studentProfile,
} from "../services/studentService.js";
import {
  assertClassAccess,
  classDirectory,
  isInstitutionAdmin,
  resolveClassId,
} from "../services/classService.js";

const router = Router();
router.use(requireAuth);
const classFields = {
  displayName: z.string().trim().min(3).max(160),
  code: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  course: z.string().trim().min(2).max(100),
  specialization: z.string().trim().max(120).nullable().optional(),
  semester: z.string().trim().max(30).nullable().optional(),
  section: z.string().trim().max(30).nullable().optional(),
  academicYear: z.string().trim().max(30).nullable().optional(),
  batch: z.string().trim().max(50).nullable().optional(),
};

router.get("/classes", requirePermission("classes.view"), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await classDirectory(req.user));
});

router.post(
  "/classes",
  requirePermission("classes.create"),
  async (req, res) => {
    if (!isInstitutionAdmin(req.user) && req.user.role !== "FACULTY")
      return res.status(403).json({ message: "Faculty access is required." });
    const data = z.object(classFields).parse(req.body);
    data.code = data.code.toUpperCase();
    const created = await sequelize.transaction(async (transaction) => {
      const academicClass = await AcademicClass.create(data, { transaction });
      if (req.user.role === "FACULTY")
        await ClassAssignment.create(
          {
            AcademicClassId: academicClass.id,
            UserId: req.user.id,
            assignmentRole: "MENTOR",
          },
          { transaction },
        );
      await AuditLog.create(
        {
          entityType: "ACADEMIC_CLASS",
          entityId: academicClass.id,
          action: "CLASS_CREATED",
          newValue: JSON.stringify(academicClass.toJSON()),
          UserId: req.user.id,
        },
        { transaction },
      );
      return academicClass;
    });
    res.status(201).json(created);
  },
);

router.patch(
  "/classes/:id",
  requirePermission("classes.manage"),
  async (req, res) => {
    const academicClass = await assertClassAccess(req.user, req.params.id, {
      manage: true,
    });
    const data = z
      .object({
        ...Object.fromEntries(
          Object.entries(classFields).map(([key, schema]) => [
            key,
            schema.optional(),
          ]),
        ),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    if (data.active === false && !hasPermission(req.user, "classes.archive"))
      return res.status(403).json({
        code: "ADMIN_PLUS_REQUIRED",
        message: "Only Admin++ can archive a class.",
      });
    if (data.code) data.code = data.code.toUpperCase();
    const before = academicClass.toJSON();
    await sequelize.transaction(async (transaction) => {
      await academicClass.update(data, { transaction });
      await AuditLog.create(
        {
          entityType: "ACADEMIC_CLASS",
          entityId: academicClass.id,
          action: data.active === false ? "CLASS_ARCHIVED" : "CLASS_UPDATED",
          oldValue: JSON.stringify(before),
          newValue: JSON.stringify(academicClass.toJSON()),
          UserId: req.user.id,
        },
        { transaction },
      );
    });
    res.json(academicClass);
  },
);

router.get(
  "/classes/:id/staff-options",
  requirePermission("classes.assignStaff"),
  async (req, res) => {
    await assertClassAccess(req.user, req.params.id, { manage: true });
    res.json(
      await User.findAll({
        where: { active: true, role: { [Op.in]: ["FACULTY", "CR"] } },
        attributes: ["id", "name", "email", "role"],
        order: [["name", "ASC"]],
      }),
    );
  },
);

router.put(
  "/classes/:id/assignments/:userId",
  requirePermission("classes.assignStaff"),
  async (req, res) => {
    const academicClass = await assertClassAccess(req.user, req.params.id, {
      manage: true,
    });
    const { assignmentRole } = z
      .object({ assignmentRole: z.enum(["MENTOR", "FACULTY", "CR"]) })
      .parse(req.body);
    const user = await User.findByPk(req.params.userId);
    if (!user || !user.active)
      return res
        .status(404)
        .json({ message: "Active staff account not found." });
    if (assignmentRole === "CR" ? user.role !== "CR" : user.role !== "FACULTY")
      return res.status(400).json({
        message:
          assignmentRole === "CR"
            ? "Choose a CR account."
            : "Choose a FACULTY account.",
      });
    await sequelize.transaction(async (transaction) => {
      if (assignmentRole === "MENTOR")
        await ClassAssignment.destroy({
          where: {
            AcademicClassId: academicClass.id,
            assignmentRole: "MENTOR",
          },
          transaction,
        });
      const [assignment] = await ClassAssignment.findOrCreate({
        where: { AcademicClassId: academicClass.id, UserId: user.id },
        defaults: { assignmentRole },
        transaction,
      });
      if (assignment.assignmentRole !== assignmentRole)
        await assignment.update({ assignmentRole }, { transaction });
      await AuditLog.create(
        {
          entityType: "ACADEMIC_CLASS",
          entityId: academicClass.id,
          action: "CLASS_STAFF_ASSIGNED",
          newValue: JSON.stringify({ userId: user.id, assignmentRole }),
          UserId: req.user.id,
        },
        { transaction },
      );
    });
    res.json({ message: "Class assignment saved." });
  },
);

router.delete(
  "/classes/:id/assignments/:userId",
  requirePermission("classes.assignStaff"),
  async (req, res) => {
    const academicClass = await assertClassAccess(req.user, req.params.id, {
      manage: true,
    });
    const confirmation = z
      .object({
        confirmation: z.literal("REMOVE ACCESS"),
        password: z.string().min(1).max(128),
      })
      .parse(req.body);
    const operator = await User.findByPk(req.user.id);
    if (!(await bcrypt.compare(confirmation.password, operator.passwordHash)))
      return res.status(401).json({ message: "Password is incorrect." });
    if (
      Number(req.params.userId) === req.user.id &&
      !isInstitutionAdmin(req.user)
    )
      return res.status(409).json({
        message: "You cannot remove your own class access.",
      });
    const assignment = await ClassAssignment.findOne({
      where: {
        AcademicClassId: academicClass.id,
        UserId: Number(req.params.userId),
      },
    });
    if (!assignment)
      return res.status(404).json({ message: "Class assignment not found." });
    await sequelize.transaction(async (transaction) => {
      await assignment.destroy({ transaction });
      await AuditLog.create(
        {
          entityType: "ACADEMIC_CLASS",
          entityId: academicClass.id,
          action: "CLASS_STAFF_REMOVED",
          oldValue: JSON.stringify({
            userId: assignment.UserId,
            assignmentRole: assignment.assignmentRole,
          }),
          UserId: req.user.id,
        },
        { transaction },
      );
    });
    res.status(204).end();
  },
);

router.put(
  "/classes/:id/subjects/:subjectId",
  requirePermission("classes.assignSubjects"),
  async (req, res) => {
    const academicClass = await assertClassAccess(req.user, req.params.id, {
      manage: true,
    });
    const subject = await Subject.findByPk(req.params.subjectId);
    if (!subject)
      return res.status(404).json({ message: "Subject not found." });
    if (
      subject.courseCategory.trim().toLowerCase() !==
      academicClass.course.trim().toLowerCase()
    )
      return res.status(409).json({
        message: `${subject.code} belongs to ${subject.courseCategory}, not ${academicClass.course}.`,
      });
    await sequelize.transaction(async (transaction) => {
      const [assignment] = await ClassSubject.findOrCreate({
        where: { AcademicClassId: academicClass.id, SubjectId: subject.id },
        defaults: { active: true },
        transaction,
      });
      if (!assignment.active)
        await assignment.update({ active: true }, { transaction });
      await AuditLog.create(
        {
          entityType: "ACADEMIC_CLASS",
          entityId: academicClass.id,
          action: "CLASS_SUBJECT_ASSIGNED",
          newValue: JSON.stringify({
            subjectId: subject.id,
            subjectCode: subject.code,
          }),
          UserId: req.user.id,
        },
        { transaction },
      );
    });
    res.json({ message: "Subject added to class." });
  },
);

router.delete(
  "/classes/:id/subjects/:subjectId",
  requirePermission("classes.assignSubjects"),
  async (req, res) => {
    const academicClass = await assertClassAccess(req.user, req.params.id, {
      manage: true,
    });
    const used = await Timetable.count({
      where: {
        AcademicClassId: academicClass.id,
        SubjectId: Number(req.params.subjectId),
        active: true,
      },
    });
    if (used)
      return res.status(409).json({
        message: "Remove this subject from the active timetable first.",
      });
    await sequelize.transaction(async (transaction) => {
      await ClassSubject.update(
        { active: false },
        {
          where: {
            AcademicClassId: academicClass.id,
            SubjectId: Number(req.params.subjectId),
          },
          transaction,
        },
      );
      await AuditLog.create(
        {
          entityType: "ACADEMIC_CLASS",
          entityId: academicClass.id,
          action: "CLASS_SUBJECT_REMOVED",
          oldValue: JSON.stringify({
            subjectId: Number(req.params.subjectId),
          }),
          UserId: req.user.id,
        },
        { transaction },
      );
    });
    res.status(204).end();
  },
);
router.get(
  "/students",
  requirePermission("students.view"),
  async (req, res) => {
    const classId = await resolveClassId(req.user, req.query.classId);
    const q = z
      .string()
      .trim()
      .max(100)
      .catch("")
      .parse(req.query.q || "");
    res.json(
      await studentDirectory({
        q,
        classId,
        sensitive: req.user.role !== "CR",
      }),
    );
  },
);
router.get(
  "/students/:id/profile",
  requirePermission("students.view"),
  async (req, res) => {
    const student = await Student.findByPk(req.params.id);
    if (!student)
      return res.status(404).json({ message: "Student not found." });
    await assertClassAccess(req.user, student.AcademicClassId);
    const profile = await studentProfile(req.params.id, {
      sensitive: req.user.role !== "CR",
    });
    if (!profile)
      return res.status(404).json({ message: "Student not found." });
    res.setHeader("Cache-Control", "private, no-store");
    res.json(profile);
  },
);
const optionalText = (max) =>
  z.preprocess(
    (value) => (value == null || String(value).trim() === "" ? null : value),
    z.string().trim().max(max).nullable(),
  );
const optionalPhone = z.preprocess(
  (value) => (value == null || String(value).trim() === "" ? null : value),
  z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, "Use 8–15 digits with an optional country code.")
    .nullable(),
);
const studentDetailsSchema = {
  enrollmentNumber: optionalText(50).optional(),
  section: optionalText(80).optional(),
  phoneNumber: optionalPhone.optional(),
  guardianPhone: optionalPhone.optional(),
  notes: optionalText(1000).optional(),
  admissionDate: z
    .preprocess(
      (value) => (value == null || value === "" ? null : value),
      z.string().date().nullable(),
    )
    .optional(),
};
const sensitiveStudentFields = [
  "phoneNumber",
  "guardianPhone",
  "notes",
  "cardToken",
];
function enforceSensitiveStudentWrite(req, data) {
  if (
    req.user.role === "CR" &&
    sensitiveStudentFields.some((field) =>
      Object.prototype.hasOwnProperty.call(data, field),
    )
  ) {
    const error = new Error(
      "Administrator permission is required to change private student information.",
    );
    error.status = 403;
    error.code = "ADMIN_REQUIRED";
    throw error;
  }
}
router.post(
  "/students",
  requirePermission("students.create"),
  async (req, res) => {
    const data = z
      .object({
        classId: z.coerce.number().int().positive().optional(),
        rollNumber: z.string().trim().min(1).max(20),
        name: z.string().trim().min(2),
        cardToken: z.string().trim().min(16).nullable().optional(),
        photoUrl: z.string().url().nullable().optional(),
        ...studentDetailsSchema,
      })
      .parse(req.body);
    const resolvedClassId = await resolveClassId(req.user, data.classId);
    const academicClass = await assertClassAccess(req.user, resolvedClassId);
    enforceSensitiveStudentWrite(req, data);
    delete data.classId;
    data.rollNumber = normalizeRollNumber(data.rollNumber);
    const created = await sequelize.transaction(async (transaction) => {
      const row = await Student.create(
        { ...data, AcademicClassId: academicClass.id },
        { transaction },
      );
      await AuditLog.create(
        {
          entityType: "STUDENT",
          entityId: row.id,
          action: "STUDENT_CREATED",
          newValue: JSON.stringify(publicStudent(row)),
          UserId: req.user.id,
        },
        { transaction },
      );
      return row;
    });
    res
      .status(201)
      .json(publicStudent(created, { sensitive: req.user.role !== "CR" }));
  },
);
router.patch(
  "/students/:id",
  requirePermission("students.update"),
  async (req, res) => {
    const row = await Student.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Student not found." });
    await assertClassAccess(req.user, row.AcademicClassId);
    const data = z
      .object({
        rollNumber: z.string().trim().min(1).max(20).optional(),
        name: z.string().trim().min(2).optional(),
        active: z.boolean().optional(),
        cardToken: z.string().trim().min(16).nullable().optional(),
        photoUrl: z.string().url().nullable().optional(),
        ...studentDetailsSchema,
      })
      .parse(req.body);
    enforceSensitiveStudentWrite(req, data);
    if (data.rollNumber) data.rollNumber = normalizeRollNumber(data.rollNumber);
    const before = publicStudent(row, { sensitive: true });
    await sequelize.transaction(async (transaction) => {
      await row.update(data, { transaction });
      await AuditLog.create(
        {
          entityType: "STUDENT",
          entityId: row.id,
          action: "STUDENT_UPDATED",
          oldValue: JSON.stringify(before),
          newValue: JSON.stringify(publicStudent(row, { sensitive: true })),
          UserId: req.user.id,
        },
        { transaction },
      );
    });
    res.json(publicStudent(row, { sensitive: req.user.role !== "CR" }));
  },
);
router.delete(
  "/students/:id",
  requirePermission("students.delete"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const row = await Student.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Student not found." });
    await assertClassAccess(req.user, row.AcademicClassId, { manage: true });
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
    const classId = await resolveClassId(req.user, req.body.classId);
    await assertClassAccess(req.user, classId);
    const rows = importRowsSchema.parse(req.body.rows);
    res.json(await reconcileStudentRows(rows, { classId }));
  },
);
router.post(
  "/students/import/apply",
  requirePermission("students.import"),
  async (req, res) => {
    const data = z
      .object({
        classId: z.coerce.number().int().positive().optional(),
        rows: importRowsSchema,
        missingAction: z.enum(["KEEP", "DEACTIVATE"]),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    data.classId = await resolveClassId(req.user, data.classId);
    await assertClassAccess(req.user, data.classId);
    res.json(
      await applyStudentImport({
        rawRows: data.rows,
        missingAction: data.missingAction,
        userId: req.user.id,
        classId: data.classId,
      }),
    );
  },
);
router.get(
  "/subjects",
  requirePermission("subjects.view"),
  async (req, res) => {
    if (!req.query.classId) {
      const courseCategory = z
        .string()
        .trim()
        .max(100)
        .optional()
        .parse(req.query.courseCategory);
      return res.json(
        await Subject.findAll({
          where: courseCategory ? { courseCategory } : {},
          order: [
            ["courseCategory", "ASC"],
            ["name", "ASC"],
          ],
        }),
      );
    }
    const classId = await resolveClassId(req.user, req.query.classId);
    const assigned = await ClassSubject.findAll({
      where: { AcademicClassId: classId, active: true },
      include: [{ model: Subject, where: { active: true } }],
      order: [[Subject, "name", "ASC"]],
    });
    res.json(assigned.map((row) => row.Subject));
  },
);
router.post(
  "/subjects",
  requirePermission("subjects.manage"),
  async (req, res) => {
    const data = z
      .object({
        code: z.string().trim().min(1).max(30),
        name: z.string().trim().min(2),
        classId: z.coerce.number().int().positive().optional(),
      })
      .parse(req.body);
    const classId = await resolveClassId(req.user, data.classId);
    const academicClass = await assertClassAccess(req.user, classId, {
      manage: true,
    });
    const subject = await sequelize.transaction(async (transaction) => {
      const created = await Subject.create(
        {
          code: data.code,
          name: data.name,
          courseCategory: academicClass.course,
        },
        { transaction },
      );
      await ClassSubject.create(
        { AcademicClassId: classId, SubjectId: created.id, active: true },
        { transaction },
      );
      return created;
    });
    res.status(201).json(subject);
  },
);
router.patch(
  "/subjects/:id",
  requirePermission("subjects.manage"),
  async (req, res) => {
    const row = await Subject.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Subject not found." });
    const data = z
      .object({
        classId: z.coerce.number().int().positive().optional(),
        code: z.string().trim().min(1).max(30).optional(),
        name: z.string().trim().min(2).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const classId = await resolveClassId(req.user, data.classId);
    await assertClassAccess(req.user, classId, { manage: true });
    const assigned = await ClassSubject.count({
      where: { AcademicClassId: classId, SubjectId: row.id, active: true },
    });
    if (!assigned)
      return res.status(403).json({
        message: "This subject is not assigned to the selected class.",
      });
    delete data.classId;
    await row.update(data);
    res.json(row);
  },
);
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
  const classId = data.classId ?? current?.AcademicClassId;
  const windowError = validateScheduleWindow(startTime, endTime);
  if (windowError) {
    const error = new Error(windowError);
    error.status = 400;
    error.code = "INVALID_TIMETABLE_WINDOW";
    throw error;
  }
  const subject = await Subject.findOne({
    where: { id: subjectId, active: true },
  });
  if (!subject) {
    const error = new Error(
      "Choose an active subject for this timetable entry.",
    );
    error.status = 400;
    error.code = "SUBJECT_UNAVAILABLE";
    throw error;
  }
  const classSubject = await ClassSubject.findOne({
    where: { AcademicClassId: classId, SubjectId: subjectId, active: true },
  });
  if (!classSubject) {
    const error = new Error("Assign this subject to the class first.");
    error.status = 400;
    error.code = "CLASS_SUBJECT_REQUIRED";
    throw error;
  }
  if (!active) return;
  const candidates = await Timetable.findAll({
    where: {
      dayOfWeek,
      AcademicClassId: classId,
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
router.get(
  "/timetable",
  requirePermission("timetable.view"),
  async (req, res) =>
    res.json(
      await Timetable.findAll({
        where: {
          AcademicClassId: await resolveClassId(req.user, req.query.classId),
        },
        include: [Subject],
        order: [
          ["dayOfWeek", "ASC"],
          ["startTime", "ASC"],
        ],
      }),
    ),
);
router.post(
  "/timetable",
  requirePermission("timetable.manage"),
  async (req, res) => {
    const data = z
      .object({
        classId: z.coerce.number().int().positive().optional(),
        dayOfWeek: z.number().int().min(1).max(7),
        startTime: z.string().regex(CLOCK_TIME_PATTERN),
        endTime: z.string().regex(CLOCK_TIME_PATTERN),
        subjectId: z.number().int(),
        faculty: z.string().trim().max(120).nullable().optional(),
      })
      .parse(req.body);
    data.classId = await resolveClassId(req.user, data.classId);
    await assertClassAccess(req.user, data.classId, { manage: true });
    await validateTimetableChange(data);
    const { subjectId, classId, ...values } = data;
    res.status(201).json(
      await Timetable.create({
        ...values,
        SubjectId: subjectId,
        AcademicClassId: classId,
      }),
    );
  },
);
router.patch(
  "/timetable/:id",
  requirePermission("timetable.manage"),
  async (req, res) => {
    const row = await Timetable.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Entry not found." });
    await assertClassAccess(req.user, row.AcademicClassId, { manage: true });
    const data = z
      .object({
        dayOfWeek: z.number().int().min(1).max(7).optional(),
        startTime: z.string().regex(CLOCK_TIME_PATTERN).optional(),
        endTime: z.string().regex(CLOCK_TIME_PATTERN).optional(),
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
  },
);
router.delete(
  "/timetable/:id",
  requirePermission("timetable.manage"),
  async (req, res) => {
    const row = await Timetable.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Entry not found." });
    await assertClassAccess(req.user, row.AcademicClassId, { manage: true });
    await row.destroy();
    res.status(204).end();
  },
);
function settingValue(row) {
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

router.get(
  "/settings",
  requirePermission("settings.view"),
  async (req, res) => {
    const rows = await Setting.findAll();
    res.json({
      lateModeEnabled: true,
      lateAttendanceCredit: 0,
      attendanceTargetPercentage: 75,
      institutionName: "AttendX Institution",
      institutionCode: "",
      campusName: "",
      timezone: "Asia/Kolkata",
      ...Object.fromEntries(rows.map((row) => [row.key, settingValue(row)])),
    });
  },
);
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
router.put(
  "/settings/late-credit",
  requirePermission("settings.manageLateMode"),
  requireAdminPlus,
  async (req, res) => {
    const { credit } = z
      .object({ credit: z.union([z.literal(0), z.literal(0.5), z.literal(1)]) })
      .parse(req.body);
    const current = await Setting.findByPk("lateAttendanceCredit");
    const oldValue = current ? Number(settingValue(current)) : 0;
    await sequelize.transaction(async (transaction) => {
      await Setting.upsert(
        { key: "lateAttendanceCredit", value: JSON.stringify(credit) },
        { transaction },
      );
      if (oldValue !== credit)
        await AuditLog.create(
          {
            entityType: "SETTING",
            entityId: 0,
            action: "LATE_ATTENDANCE_CREDIT_CHANGED",
            oldValue: String(oldValue),
            newValue: String(credit),
            reason: `Late marks now earn ${credit} attendance credit`,
            UserId: req.user.id,
          },
          { transaction },
        );
    });
    res.json({ lateAttendanceCredit: credit });
  },
);
router.put(
  "/settings",
  requirePermission("settings.manage"),
  async (req, res) => {
    const data = z
      .object({
        lateThresholdMinutes: z.number().int().min(1).max(120),
        timezone: z.literal("Asia/Kolkata"),
        crCanCorrectRecent: z.boolean().optional(),
        attendanceTargetPercentage: z.number().int().min(1).max(100).optional(),
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
  },
);
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
      role: z.enum(["ADMIN", "FACULTY", "CR"]),
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
router.patch(
  "/users/:id",
  requirePermission("users.update"),
  async (req, res) => {
    const row = await User.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "User not found." });
    const data = z
      .object({
        name: z.string().min(2).optional(),
        role: z.enum(["ADMIN", "FACULTY", "CR"]).optional(),
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
      if (roleChanged && data.role === "ADMIN")
        await ClassAssignment.destroy({
          where: { UserId: row.id },
          transaction,
        });
      else if (roleChanged)
        await ClassAssignment.update(
          { assignmentRole: data.role === "FACULTY" ? "FACULTY" : "CR" },
          { where: { UserId: row.id }, transaction },
        );
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
  },
);
router.post(
  "/users/:id/reset-password",
  requirePermission("users.resetCrPassword"),
  async (req, res) => {
    const row = await User.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "User not found." });
    if (!["CR", "FACULTY"].includes(row.role))
      return res
        .status(400)
        .json({ message: "ADMIN can reset only FACULTY or CR passwords." });
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
          action: "STAFF_PASSWORD_RESET",
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
  return Number.isNaN(date.getTime())
    ? "Timestamp unavailable"
    : date.toISOString();
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
    include: [
      {
        model: AcademicClass,
        as: "assignedClasses",
        attributes: ["displayName", "code"],
        through: { attributes: ["assignmentRole"] },
        required: false,
      },
    ],
    order: [["id", "ASC"]],
    serialize: (row) => {
      const { assignedClasses = [], ...user } = row.toJSON();
      const institutionWide = user.role === "ADMIN";
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        classAccess: institutionWide
          ? "All classes"
          : assignedClasses.length
            ? assignedClasses
                .map(
                  (academicClass) =>
                    `${academicClass.displayName} (${academicClass.ClassAssignment?.assignmentRole || user.role})`,
                )
                .join(" · ")
            : "No class assigned",
        assignedClassCodes: institutionWide
          ? "ALL"
          : assignedClasses.map((academicClass) => academicClass.code).join(", ") || null,
        ...Object.fromEntries(
          Object.entries(user).filter(
            ([key]) => !["id", "name", "email", "role"].includes(key),
          ),
        ),
      };
    },
  },
  academic_classes: { model: AcademicClass, order: [["id", "ASC"]] },
  class_assignments: {
    model: ClassAssignment,
    include: [
      { model: User, attributes: ["name", "email", "role"] },
      { model: AcademicClass, attributes: ["displayName", "code"] },
    ],
    order: [["id", "ASC"]],
    serialize: (row) => {
      const { User: user, AcademicClass: academicClass, ...assignment } =
        row.toJSON();
      return {
        id: assignment.id,
        staffName: user?.name || null,
        staffEmail: user?.email || null,
        accountRole: user?.role || null,
        assignmentRole: assignment.assignmentRole,
        className: academicClass?.displayName || null,
        classCode: academicClass?.code || null,
        ...Object.fromEntries(
          Object.entries(assignment).filter(
            ([key]) => !["id", "assignmentRole"].includes(key),
          ),
        ),
      };
    },
  },
  class_subjects: {
    model: ClassSubject,
    include: [
      { model: AcademicClass, attributes: ["displayName", "code"] },
      { model: Subject, attributes: ["name", "code"] },
    ],
    order: [["id", "ASC"]],
    serialize: (row) => {
      const { AcademicClass: academicClass, Subject: subject, ...link } =
        row.toJSON();
      return {
        id: link.id,
        className: academicClass?.displayName || null,
        classCode: academicClass?.code || null,
        subjectName: subject?.name || null,
        subjectCode: subject?.code || null,
        ...Object.fromEntries(
          Object.entries(link).filter(([key]) => key !== "id"),
        ),
      };
    },
  },
  students: {
    model: Student,
    include: [
      {
        model: AcademicClass,
        attributes: ["displayName", "code"],
        required: false,
      },
    ],
    order: [["id", "ASC"]],
    serialize: (row) => {
      const { AcademicClass: academicClass, ...student } = row.toJSON();
      return {
        id: student.id,
        rollNumber: student.rollNumber,
        name: student.name,
        className: academicClass?.displayName || "Unassigned class",
        classCode: academicClass?.code || null,
        ...Object.fromEntries(
          Object.entries(student).filter(
            ([key]) => !["id", "rollNumber", "name"].includes(key),
          ),
        ),
      };
    },
  },
  subjects: {
    model: Subject,
    include: [
      {
        model: AcademicClass,
        as: "AcademicClasses",
        attributes: ["displayName", "code"],
        through: { attributes: [] },
        required: false,
      },
    ],
    order: [["id", "ASC"]],
    serialize: (row) => {
      const { AcademicClasses = [], ...subject } = row.toJSON();
      return {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        usedByClasses:
          AcademicClasses.map((academicClass) => academicClass.displayName).join(
            " · ",
          ) || "Not assigned",
        usedByClassCodes:
          AcademicClasses.map((academicClass) => academicClass.code).join(", ") ||
          null,
        ...Object.fromEntries(
          Object.entries(subject).filter(
            ([key]) => !["id", "code", "name"].includes(key),
          ),
        ),
      };
    },
  },
  timetable: {
    model: Timetable,
    include: [
      { model: AcademicClass, attributes: ["displayName", "code"] },
      { model: Subject, attributes: ["name", "code"] },
    ],
    order: [["id", "ASC"]],
    serialize: (row) => {
      const { AcademicClass: academicClass, Subject: subject, ...entry } =
        row.toJSON();
      return {
        id: entry.id,
        className: academicClass?.displayName || null,
        classCode: academicClass?.code || null,
        subjectName: subject?.name || null,
        subjectCode: subject?.code || null,
        ...Object.fromEntries(
          Object.entries(entry).filter(([key]) => key !== "id"),
        ),
      };
    },
  },
  attendance_sessions: {
    model: AttendanceSession,
    include: [
      { model: AcademicClass, attributes: ["displayName", "code"] },
      { model: Subject, attributes: ["name", "code"] },
      {
        model: Subject,
        as: "scheduledSubject",
        attributes: ["name", "code"],
      },
      { model: User, as: "createdBy", attributes: ["name", "email"] },
      { model: User, as: "closedBy", attributes: ["name", "email"] },
      { model: User, as: "reopenedBy", attributes: ["name", "email"] },
    ],
    order: [["id", "DESC"]],
    serialize: (row) => {
      const {
        AcademicClass: academicClass,
        Subject: subject,
        scheduledSubject,
        createdBy,
        closedBy,
        reopenedBy,
        ...session
      } = row.toJSON();
      return {
        id: session.id,
        className: academicClass?.displayName || null,
        classCode: academicClass?.code || null,
        subjectName: subject?.name || null,
        subjectCode: subject?.code || null,
        scheduledSubjectName: scheduledSubject?.name || null,
        createdBy: createdBy?.name || null,
        closedBy: closedBy?.name || null,
        reopenedBy: reopenedBy?.name || null,
        ...Object.fromEntries(
          Object.entries(session).filter(([key]) => key !== "id"),
        ),
      };
    },
  },
  attendance_records: {
    model: AttendanceRecord,
    include: [
      {
        model: Student,
        attributes: ["name", "rollNumber"],
        include: [
          { model: AcademicClass, attributes: ["displayName", "code"] },
        ],
      },
      {
        model: AttendanceSession,
        attributes: ["sessionDate", "AcademicClassId", "SubjectId"],
        include: [
          { model: AcademicClass, attributes: ["displayName", "code"] },
          { model: Subject, attributes: ["name", "code"] },
        ],
      },
      { model: User, as: "markedBy", attributes: ["name", "email"] },
      { model: User, as: "correctedBy", attributes: ["name", "email"] },
    ],
    order: [["id", "DESC"]],
    serialize: (row) => {
      const { Student: student, AttendanceSession: session, markedBy, correctedBy, ...record } =
        row.toJSON();
      const academicClass = session?.AcademicClass || student?.AcademicClass;
      return {
        id: record.id,
        studentName: student?.name || null,
        rollNumber: student?.rollNumber || null,
        className: academicClass?.displayName || null,
        classCode: academicClass?.code || null,
        subjectName: session?.Subject?.name || null,
        subjectCode: session?.Subject?.code || null,
        sessionDate: session?.sessionDate || null,
        status: record.status,
        markedBy: markedBy?.name || null,
        correctedBy: correctedBy?.name || null,
        ...Object.fromEntries(
          Object.entries(record).filter(
            ([key]) => !["id", "status"].includes(key),
          ),
        ),
      };
    },
  },
  settings: { model: Setting, order: [["key", "ASC"]] },
  branding_assets: {
    model: BrandingAsset,
    attributes: { exclude: ["data"] },
    order: [["slot", "ASC"]],
  },
  audit_logs: {
    model: AuditLog,
    include: [
      { model: User, attributes: ["name", "email", "role"] },
      {
        model: Student,
        attributes: ["name", "rollNumber"],
        include: [
          { model: AcademicClass, attributes: ["displayName", "code"] },
        ],
      },
      {
        model: AttendanceSession,
        attributes: ["sessionDate"],
        include: [
          { model: AcademicClass, attributes: ["displayName", "code"] },
          { model: Subject, attributes: ["name", "code"] },
        ],
      },
    ],
    order: [["id", "DESC"]],
    serialize: (row) => {
      const { User: actor, Student: student, AttendanceSession: session, ...log } =
        row.toJSON();
      return {
        id: log.id,
        actorName: actor?.name || "System",
        actorRole: actor?.role || null,
        targetStudent: student
          ? `${student.rollNumber} · ${student.name}`
          : null,
        className:
          student?.AcademicClass?.displayName ||
          session?.AcademicClass?.displayName ||
          null,
        sessionDate: session?.sessionDate || null,
        subjectName: session?.Subject?.name || null,
        ...Object.fromEntries(
          Object.entries(log).filter(([key]) => key !== "id"),
        ),
      };
    },
  },
  auth_sessions: {
    model: AuthSession,
    attributes: { exclude: ["currentTokenHash", "tokenHistory", "ipHash"] },
    include: [
      { model: User, as: "user", attributes: ["name", "email", "role"] },
    ],
    order: [["lastUsedAt", "DESC"]],
    serialize: (row) => {
      const { user, ...session } = row.toJSON();
      return {
        id: session.id,
        userName: user?.name || null,
        userEmail: user?.email || null,
        userRole: user?.role || null,
        ...Object.fromEntries(
          Object.entries(session).filter(([key]) => key !== "id"),
        ),
      };
    },
  },
  app_migrations: { model: AppMigration, order: [["appliedAt", "DESC"]] },
};

router.get(
  "/database/overview",
  requirePermission("database.view"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
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
  },
);

router.delete(
  "/classes/:id",
  requirePermission("classes.delete"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const academicClass = await AcademicClass.findByPk(req.params.id);
    if (!academicClass)
      return res.status(404).json({ message: "Class not found." });
    z.object({ confirmation: z.literal("DELETE CLASS") }).parse(req.body);
    const [studentCount, timetableCount, attendanceCount, otherActiveCount] =
      await Promise.all([
        Student.count({ where: { AcademicClassId: academicClass.id } }),
        Timetable.count({ where: { AcademicClassId: academicClass.id } }),
        AttendanceSession.count({ where: { AcademicClassId: academicClass.id } }),
        AcademicClass.count({
          where: { id: { [Op.ne]: academicClass.id }, active: true },
        }),
      ]);
    if (!otherActiveCount)
      return res.status(409).json({
        code: "LAST_ACTIVE_CLASS",
        message: "The last active class cannot be deleted. Create another class first.",
      });
    if (studentCount || timetableCount || attendanceCount)
      return res.status(409).json({
        code: "CLASS_HAS_HISTORY",
        message:
          "This class contains students, timetable entries, or attendance history and cannot be permanently deleted. Archive it instead.",
      });
    const snapshot = academicClass.toJSON();
    await sequelize.transaction(async (transaction) => {
      await ClassAssignment.destroy({
        where: { AcademicClassId: academicClass.id },
        transaction,
      });
      await ClassSubject.destroy({
        where: { AcademicClassId: academicClass.id },
        transaction,
      });
      await AuditLog.create(
        {
          entityType: "ACADEMIC_CLASS",
          entityId: academicClass.id,
          action: "CLASS_DELETED",
          oldValue: JSON.stringify(snapshot),
          reason: "Empty class permanently deleted by Admin++",
          UserId: req.user.id,
        },
        { transaction },
      );
      await academicClass.destroy({ transaction });
    });
    res.status(204).end();
  },
);

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
      include: definition.include,
      distinct: Boolean(definition.include),
      order: definition.order,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.json({
      table: req.params.table,
      rows: definition.serialize
        ? result.rows.map(definition.serialize)
        : result.rows,
      total: result.count,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(result.count / pageSize)),
    });
  },
);
export default router;
