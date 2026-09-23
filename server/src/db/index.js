import { Sequelize, DataTypes } from "sequelize";
import { config } from "../config.js";
import { runMigrations } from "./migrate.js";

export const sequelize =
  config.dialect === "postgres"
    ? new Sequelize(config.databaseUrl, {
        dialect: "postgres",
        logging: false,
        dialectOptions:
          process.env.DB_SSL === "true"
            ? { ssl: { require: true, rejectUnauthorized: false } }
            : {},
      })
    : new Sequelize({
        dialect: "sqlite",
        storage: config.sqlitePath,
        logging: false,
        retry: { match: [/SQLITE_BUSY/i], max: 5 },
        pool: { max: 1, min: 0, idle: 10_000 },
      });

const common = { underscored: true, timestamps: true };
export const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM("ADMIN", "FACULTY", "CR"), allowNull: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    mustChangePassword: { type: DataTypes.BOOLEAN, defaultValue: false },
    tokenVersion: { type: DataTypes.INTEGER, defaultValue: 0 },
    adminPlus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },
  },
  common,
);
export const AuthSession = sequelize.define(
  "AuthSession",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    currentTokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    tokenHistory: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "[]",
    },
    generation: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    userAgent: {
      type: DataTypes.STRING(300),
      allowNull: false,
      defaultValue: "Unknown device",
    },
    ipHash: { type: DataTypes.STRING(64), allowNull: true },
    lastUsedAt: { type: DataTypes.DATE, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    ...common,
    indexes: [
      { fields: ["user_id", "revoked_at", "expires_at"] },
      { unique: true, fields: ["current_token_hash"] },
    ],
  },
);
export const Student = sequelize.define(
  "Student",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    rollNumber: { type: DataTypes.STRING(20), allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    cardToken: { type: DataTypes.STRING, unique: true, allowNull: true },
    photoUrl: { type: DataTypes.STRING, allowNull: true },
    enrollmentNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    section: { type: DataTypes.STRING(80), allowNull: true },
    phoneNumber: { type: DataTypes.STRING(20), allowNull: true },
    guardianPhone: { type: DataTypes.STRING(20), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    admissionDate: { type: DataTypes.DATEONLY, allowNull: true },
    AcademicClassId: { type: DataTypes.INTEGER, allowNull: false },
  },
  common,
);
export const AcademicClass = sequelize.define(
  "AcademicClass",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    displayName: { type: DataTypes.STRING(160), allowNull: false },
    code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    course: { type: DataTypes.STRING(100), allowNull: false },
    specialization: { type: DataTypes.STRING(120), allowNull: true },
    semester: { type: DataTypes.STRING(30), allowNull: true },
    section: { type: DataTypes.STRING(30), allowNull: true },
    academicYear: { type: DataTypes.STRING(30), allowNull: true },
    batch: { type: DataTypes.STRING(50), allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  common,
);
export const ClassAssignment = sequelize.define(
  "ClassAssignment",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    assignmentRole: {
      type: DataTypes.ENUM("MENTOR", "FACULTY", "CR"),
      allowNull: false,
    },
  },
  {
    ...common,
    indexes: [
      { unique: true, fields: ["academic_class_id", "user_id"] },
      { fields: ["academic_class_id", "assignment_role"] },
    ],
  },
);
export const ClassSubject = sequelize.define(
  "ClassSubject",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    ...common,
    indexes: [
      { unique: true, fields: ["academic_class_id", "subject_id"] },
    ],
  },
);
export const Subject = sequelize.define(
  "Subject",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(30), unique: true, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    courseCategory: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "BCA",
    },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  common,
);
export const Timetable = sequelize.define(
  "Timetable",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 7 },
    },
    startTime: { type: DataTypes.STRING(5), allowNull: false },
    endTime: { type: DataTypes.STRING(5), allowNull: false },
    faculty: { type: DataTypes.STRING, allowNull: true },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    AcademicClassId: { type: DataTypes.INTEGER, allowNull: false },
  },
  common,
);
export const AttendanceSession = sequelize.define(
  "AttendanceSession",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sessionDate: { type: DataTypes.DATEONLY, allowNull: false },
    scheduledStartTime: { type: DataTypes.STRING(5), allowNull: false },
    scheduledEndTime: { type: DataTypes.STRING(5), allowNull: false },
    openedAt: { type: DataTypes.DATE, allowNull: false },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.ENUM("OPEN", "CLOSED"), defaultValue: "OPEN" },
    sessionType: {
      type: DataTypes.ENUM("SCHEDULED", "REPLACEMENT", "EXTRA"),
      defaultValue: "SCHEDULED",
    },
    reason: { type: DataTypes.STRING, allowNull: true },
    faculty: { type: DataTypes.STRING, allowNull: true },
    lateThresholdMinutes: { type: DataTypes.INTEGER, allowNull: false },
    lateModeEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lateAttendanceCredit: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    scheduledSubjectId: { type: DataTypes.INTEGER, allowNull: true },
    reopenedAt: { type: DataTypes.DATE, allowNull: true },
    reopenReason: { type: DataTypes.STRING(250), allowNull: true },
    AcademicClassId: { type: DataTypes.INTEGER, allowNull: false },
  },
  common,
);
export const AttendanceRecord = sequelize.define(
  "AttendanceRecord",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    status: {
      type: DataTypes.ENUM("PRESENT", "LATE", "ABSENT"),
      allowNull: false,
    },
    attendanceCredit: { type: DataTypes.BOOLEAN, allowNull: false },
    attendanceCreditValue: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: null,
    },
    markedAt: { type: DataTypes.DATE, allowNull: false },
    method: { type: DataTypes.ENUM("MANUAL", "QR"), defaultValue: "MANUAL" },
    correctedFromStatus: { type: DataTypes.STRING(20), allowNull: true },
    correctionReason: { type: DataTypes.STRING(250), allowNull: true },
    correctedAt: { type: DataTypes.DATE, allowNull: true },
    StudentId: { type: DataTypes.INTEGER, allowNull: false },
    AttendanceSessionId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    ...common,
    indexes: [
      { unique: true, fields: ["attendance_session_id", "student_id"] },
    ],
  },
);
export const Setting = sequelize.define(
  "Setting",
  {
    key: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: false },
  },
  { ...common, createdAt: false },
);
export const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityType: { type: DataTypes.STRING, allowNull: false },
    entityId: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING, allowNull: false },
    oldValue: { type: DataTypes.TEXT, allowNull: true },
    newValue: { type: DataTypes.TEXT, allowNull: true },
    reason: { type: DataTypes.STRING, allowNull: true },
  },
  common,
);
export const AppMigration = sequelize.define(
  "AppMigration",
  {
    id: { type: DataTypes.STRING(100), primaryKey: true },
    appliedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: "app_migrations", underscored: true, timestamps: false },
);

Subject.hasMany(Timetable);
Timetable.belongsTo(Subject);
Subject.hasMany(AttendanceSession);
AttendanceSession.belongsTo(Subject);
Subject.hasMany(AttendanceSession, {
  foreignKey: "scheduledSubjectId",
  as: "scheduledSessions",
});
AttendanceSession.belongsTo(Subject, {
  foreignKey: "scheduledSubjectId",
  as: "scheduledSubject",
});
AcademicClass.hasMany(Student, { foreignKey: "AcademicClassId" });
Student.belongsTo(AcademicClass, { foreignKey: "AcademicClassId" });
AcademicClass.hasMany(Timetable, { foreignKey: "AcademicClassId" });
Timetable.belongsTo(AcademicClass, { foreignKey: "AcademicClassId" });
AcademicClass.hasMany(AttendanceSession, { foreignKey: "AcademicClassId" });
AttendanceSession.belongsTo(AcademicClass, { foreignKey: "AcademicClassId" });
AcademicClass.belongsToMany(User, {
  through: ClassAssignment,
  foreignKey: "AcademicClassId",
  otherKey: "UserId",
  as: "assignedUsers",
});
User.belongsToMany(AcademicClass, {
  through: ClassAssignment,
  foreignKey: "UserId",
  otherKey: "AcademicClassId",
  as: "assignedClasses",
});
AcademicClass.hasMany(ClassAssignment, { foreignKey: "AcademicClassId" });
ClassAssignment.belongsTo(AcademicClass, { foreignKey: "AcademicClassId" });
User.hasMany(ClassAssignment, { foreignKey: "UserId" });
ClassAssignment.belongsTo(User, { foreignKey: "UserId" });
AcademicClass.belongsToMany(Subject, {
  through: ClassSubject,
  foreignKey: "AcademicClassId",
  otherKey: "SubjectId",
  as: "Subjects",
});
Subject.belongsToMany(AcademicClass, {
  through: ClassSubject,
  foreignKey: "SubjectId",
  otherKey: "AcademicClassId",
  as: "AcademicClasses",
});
AcademicClass.hasMany(ClassSubject, { foreignKey: "AcademicClassId" });
ClassSubject.belongsTo(AcademicClass, { foreignKey: "AcademicClassId" });
Subject.hasMany(ClassSubject, { foreignKey: "SubjectId" });
ClassSubject.belongsTo(Subject, { foreignKey: "SubjectId" });
User.hasMany(AttendanceSession, {
  foreignKey: "createdById",
  as: "createdSessions",
});
User.hasMany(AuthSession, {
  foreignKey: "UserId",
  as: "authSessions",
  onDelete: "CASCADE",
});
AuthSession.belongsTo(User, { foreignKey: "UserId", as: "user" });
AttendanceSession.belongsTo(User, {
  foreignKey: "createdById",
  as: "createdBy",
});
User.hasMany(AttendanceSession, {
  foreignKey: "closedById",
  as: "closedSessions",
});
AttendanceSession.belongsTo(User, { foreignKey: "closedById", as: "closedBy" });
AttendanceSession.belongsTo(User, {
  foreignKey: "reopenedById",
  as: "reopenedBy",
});
AttendanceSession.hasMany(AttendanceRecord, { onDelete: "CASCADE" });
AttendanceRecord.belongsTo(AttendanceSession);
Student.hasMany(AttendanceRecord);
AttendanceRecord.belongsTo(Student);
User.hasMany(AttendanceRecord, { foreignKey: "markedById" });
AttendanceRecord.belongsTo(User, { foreignKey: "markedById", as: "markedBy" });
AttendanceRecord.belongsTo(User, {
  foreignKey: "correctedById",
  as: "correctedBy",
});
User.hasMany(AuditLog);
AuditLog.belongsTo(User);
Student.hasMany(AuditLog);
AuditLog.belongsTo(Student);
AttendanceSession.hasMany(AuditLog);
AuditLog.belongsTo(AttendanceSession);

export const models = {
  User,
  AcademicClass,
  ClassAssignment,
  ClassSubject,
  AuthSession,
  Student,
  Subject,
  Timetable,
  AttendanceSession,
  AttendanceRecord,
  Setting,
  AuditLog,
  AppMigration,
};
export async function initDatabase({ force = false } = {}) {
  await sequelize.authenticate();
  if (config.dialect === "sqlite") {
    await sequelize.query("PRAGMA journal_mode = WAL");
    await sequelize.query("PRAGMA busy_timeout = 5000");
    await sequelize.query("PRAGMA synchronous = NORMAL");
  }
  await sequelize.sync({ force });
  await runMigrations(sequelize);
}
