import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attendx-v11-"));
process.env.DB_DIALECT = "sqlite";
process.env.SQLITE_PATH = path.join(tempDir, "attendx.sqlite");
process.env.BACKUP_DIR = path.join(tempDir, "backups");
process.env.JWT_SECRET = "v1.1-test-secret";
process.env.NODE_ENV = "test";

const db = await import("../src/db/index.js");
const { app } = await import("../src/app.js");
const backup = await import("../src/services/backupService.js");
const studentImport = await import("../src/services/studentImportService.js");
const sessions = await import("../src/services/sessionService.js");
const attendance = await import("../src/services/attendanceService.js");

let admin;
let cr;
let subject;
const sign = (user) =>
  jwt.sign(
    { sub: user.id, role: user.role, ver: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
  );

before(async () => {
  await db.initDatabase({ force: true });
  admin = await db.User.create({
    name: "Admin Test",
    email: "admin-v11@test.local",
    passwordHash: await bcrypt.hash("AdminTest@123", 4),
    role: "ADMIN",
  });
  cr = await db.User.create({
    name: "CR Test",
    email: "cr-v11@test.local",
    passwordHash: await bcrypt.hash("CRTestPass@123", 4),
    role: "CR",
  });
  subject = await db.Subject.create({ code: "V11", name: "V1.1 Safety" });
  await db.Setting.create({ key: "lateThresholdMinutes", value: "15" });
  await db.Student.bulkCreate([
    { rollNumber: "01", name: "Original One" },
    { rollNumber: "02", name: "Original Two" },
  ]);
});

after(async () => {
  if (db.sequelize.connectionManager.pool) await db.sequelize.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("versioned migration adds V1.1 columns and records itself", async () => {
  const users = await db.sequelize.getQueryInterface().describeTable("users");
  const records = await db.sequelize
    .getQueryInterface()
    .describeTable("attendance_records");
  assert.ok(users.must_change_password);
  assert.ok(users.token_version);
  assert.ok(records.correction_reason);
  const [migrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '001-v1.1-core-safety'",
  );
  assert.equal(migrations.length, 1);
});

test("backup creation produces a valid, downloadable SQLite snapshot", async () => {
  const created = await backup.createBackup({ label: "test" });
  assert.ok(created.size > 0);
  assert.equal(created.students, 2);
  const validation = await backup.validateBackup(
    backup.backupPath(created.filename),
  );
  assert.equal(validation.valid, true);
  assert.equal(validation.students, 2);
});

test("student reconciliation normalizes rolls and detects duplicates", async () => {
  const review = await studentImport.reconcileStudentRows([
    { rowNumber: 2, rollNumber: "1", name: "Original One" },
    { rowNumber: 3, rollNumber: "003", name: "Third Student" },
    { rowNumber: 4, rollNumber: "3", name: "Duplicate Third" },
  ]);
  assert.equal(review.unchanged[0].rollNumber, "01");
  assert.equal(review.duplicateRolls[0].rollNumber, "03");
  assert.equal(review.canApply, false);
});

test("student import applies additions, edits and deactivation atomically", async () => {
  const result = await studentImport.applyStudentImport({
    rawRows: [
      { rollNumber: "1", name: "Renamed One" },
      { rollNumber: "3", name: "Student Three" },
    ],
    missingAction: "DEACTIVATE",
    userId: admin.id,
  });
  assert.deepEqual(
    {
      added: result.added,
      updated: result.updated,
      deactivated: result.deactivated,
    },
    { added: 1, updated: 1, deactivated: 1 },
  );
  assert.equal(
    (await db.Student.findOne({ where: { rollNumber: "01" } })).name,
    "Renamed One",
  );
  assert.equal(
    (await db.Student.findOne({ where: { rollNumber: "02" } })).active,
    false,
  );
  assert.ok(await db.AuditLog.count({ where: { action: "STUDENT_IMPORTED" } }));
});

test("session service blocks duplicates and requires overlap confirmation", async () => {
  const base = {
    sessionDate: "2026-09-18",
    subjectId: subject.id,
    scheduledSubjectId: subject.id,
    scheduledStartTime: "09:30",
    scheduledEndTime: "10:45",
    faculty: null,
    sessionType: "EXTRA",
    reason: "Test class",
    allowOverlap: false,
  };
  const first = await sessions.openAttendanceSession({
    input: base,
    userId: cr.id,
    now: new Date("2026-09-18T04:00:00Z"),
  });
  await assert.rejects(
    sessions.openAttendanceSession({
      input: base,
      userId: cr.id,
      now: new Date(),
    }),
    (error) => error.code === "DUPLICATE_OPEN_SESSION",
  );
  const overlap = {
    ...base,
    scheduledStartTime: "10:30",
    scheduledEndTime: "11:30",
  };
  await assert.rejects(
    sessions.openAttendanceSession({
      input: overlap,
      userId: cr.id,
      now: new Date(),
    }),
    (error) => error.code === "SESSION_CONFLICT",
  );
  const second = await sessions.openAttendanceSession({
    input: { ...overlap, allowOverlap: true },
    userId: cr.id,
    now: new Date(),
  });
  assert.equal(second.sessionType, "EXTRA");
  await attendance.closeSession({ sessionId: first.id, userId: cr.id });
  await attendance.closeSession({ sessionId: second.id, userId: cr.id });
});

test("CR cannot reopen while ADMIN can reopen with a required reason", async () => {
  const closed = await db.AttendanceSession.findOne({
    where: { status: "CLOSED" },
  });
  await request(app)
    .post(`/api/attendance/sessions/${closed.id}/reopen`)
    .set("Authorization", `Bearer ${sign(cr)}`)
    .send({ reason: "Not permitted" })
    .expect(403);
  await request(app)
    .post(`/api/attendance/sessions/${closed.id}/reopen`)
    .set("Authorization", `Bearer ${sign(admin)}`)
    .send({ reason: "Approved correction" })
    .expect(200);
  assert.equal((await db.AttendanceSession.findByPk(closed.id)).status, "OPEN");
});

test("corrections preserve original status and correction metadata", async () => {
  const session = await db.AttendanceSession.findOne({
    where: { status: "OPEN" },
  });
  const student = await db.Student.findOne({ where: { rollNumber: "01" } });
  await attendance.markAttendance({
    sessionId: session.id,
    studentId: student.id,
    status: "ABSENT",
    markedById: admin.id,
    reason: "Register correction",
    allowCorrection: true,
  });
  const record = await db.AttendanceRecord.findOne({
    where: { AttendanceSessionId: session.id, StudentId: student.id },
  });
  await attendance.markAttendance({
    sessionId: session.id,
    studentId: student.id,
    status: "PRESENT",
    markedById: admin.id,
    reason: "Verified signed sheet",
    allowCorrection: true,
  });
  await record.reload();
  assert.equal(record.correctedFromStatus, "ABSENT");
  assert.equal(record.status, "PRESENT");
  assert.equal(record.correctionReason, "Verified signed sheet");
  assert.equal(record.correctedById, admin.id);
});

test("ADMIN cannot disable their own account but can disable another account", async () => {
  await request(app)
    .patch(`/api/admin/users/${admin.id}`)
    .set("Authorization", `Bearer ${sign(admin)}`)
    .send({ active: false })
    .expect(409);
  assert.equal((await db.User.findByPk(admin.id)).active, true);
  await request(app)
    .patch(`/api/admin/users/${cr.id}`)
    .set("Authorization", `Bearer ${sign(admin)}`)
    .send({ active: false })
    .expect(200);
  assert.equal((await db.User.findByPk(cr.id)).active, false);
  await db.User.update({ active: true }, { where: { id: cr.id } });
  await cr.reload();
});

test("password change revokes the old token and replaces the password", async () => {
  const oldToken = sign(cr);
  await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${oldToken}`)
    .send({ currentPassword: "CRTestPass@123", newPassword: "NewCRPass@456" })
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${oldToken}`)
    .expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: cr.email, password: "CRTestPass@123" })
    .expect(401);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: cr.email, password: "NewCRPass@456" })
    .expect(200);
  assert.equal(login.body.user.mustChangePassword, false);
});
