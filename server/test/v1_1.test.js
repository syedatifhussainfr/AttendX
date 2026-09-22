import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import request from "supertest";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attendx-v11-"));
process.env.DB_DIALECT = "sqlite";
process.env.SQLITE_PATH = path.join(tempDir, "attendx.sqlite");
process.env.BACKUP_DIR = path.join(tempDir, "backups");
process.env.ATTENDX_CONFIG_DIR = path.join(tempDir, "config");
process.env.JWT_SECRET = "v1.1-test-secret";
process.env.NODE_ENV = "test";

const db = await import("../src/db/index.js");
const { app } = await import("../src/app.js");
const backup = await import("../src/services/backupService.js");
const studentImport = await import("../src/services/studentImportService.js");
const sessions = await import("../src/services/sessionService.js");
const attendance = await import("../src/services/attendanceService.js");
const authSessions = await import("../src/services/authSessionService.js");

let admin;
let normalAdmin;
let cr;
let sessionUser;
let subject;
let adminToken;
let normalAdminToken;
let crToken;
let adminElevationToken;
let normalAdminElevationToken;

before(async () => {
  await db.initDatabase({ force: true });
  admin = await db.User.create({
    name: "Admin Test",
    email: "admin-v11@test.local",
    passwordHash: await bcrypt.hash("AdminTest@123", 4),
    role: "ADMIN",
    adminPlus: true,
    phoneNumber: "+919876543210",
  });
  cr = await db.User.create({
    name: "CR Test",
    email: "cr-v11@test.local",
    passwordHash: await bcrypt.hash("CRTestPass@123", 4),
    role: "CR",
  });
  normalAdmin = await db.User.create({
    name: "Standard Admin Test",
    email: "standard-admin-v11@test.local",
    passwordHash: await bcrypt.hash("StandardAdmin@123", 4),
    role: "ADMIN",
  });
  sessionUser = await db.User.create({
    name: "Session Test",
    email: "session-v11@test.local",
    passwordHash: await bcrypt.hash("SessionTest@123", 4),
    role: "CR",
  });
  adminToken = (await authSessions.createAuthSession(admin, { userAgent: "Admin test browser" })).accessToken;
  normalAdminToken = (
    await authSessions.createAuthSession(normalAdmin, {
      userAgent: "Standard admin test browser",
    })
  ).accessToken;
  crToken = (await authSessions.createAuthSession(cr, { userAgent: "CR test browser" })).accessToken;
  const elevation = await request(app)
    .post("/api/auth/elevate")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ password: "AdminTest@123" })
    .expect(200);
  adminElevationToken = elevation.body.elevationToken;
  const normalElevation = await request(app)
    .post("/api/auth/elevate")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send({ password: "StandardAdmin@123" })
    .expect(200);
  normalAdminElevationToken = normalElevation.body.elevationToken;
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
  const authSessionsTable = await db.sequelize
    .getQueryInterface()
    .describeTable("auth_sessions");
  assert.ok(users.must_change_password);
  assert.ok(users.token_version);
  assert.ok(records.correction_reason);
  assert.ok(authSessionsTable.current_token_hash);
  const attendanceSessionsTable = await db.sequelize
    .getQueryInterface()
    .describeTable("attendance_sessions");
  assert.ok(attendanceSessionsTable.late_mode_enabled);
  assert.ok(authSessionsTable.expires_at);
  assert.ok(users.admin_plus);
  assert.ok(users.phone_number);
  const [migrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '001-v1.1-core-safety'",
  );
  assert.equal(migrations.length, 1);
  const [sessionMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '002-secure-auth-sessions'",
  );
  assert.equal(sessionMigrations.length, 1);
  const [adminPlusMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '003-admin-plus-security'",
  );
  assert.equal(adminPlusMigrations.length, 1);
  const [lateModeMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '004-session-late-mode'",
  );
  assert.equal(lateModeMigrations.length, 1);
  const [timestampMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '005-normalize-sqlite-timestamps'",
  );
  assert.equal(timestampMigrations.length, 1);
});

test("secure browser sessions rotate, reject stale access, and revoke on logout", async () => {
  const agent = request.agent(app);
  const login = await agent
    .post("/api/auth/login")
    .set("User-Agent", "AttendX test browser")
    .send({ email: sessionUser.email, password: "SessionTest@123" })
    .expect(200);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/i);
  assert.match(login.headers["set-cookie"][0], /SameSite=Strict/i);
  const firstRefreshCookie = login.headers["set-cookie"][0].split(";", 1)[0];
  const firstAccessToken = login.body.accessToken;
  const parallelResume = await Promise.all([
    agent.post("/api/auth/session"),
    agent.post("/api/auth/session"),
  ]);
  assert.deepEqual(
    parallelResume.map((response) => response.status),
    [200, 200],
  );
  assert.ok(parallelResume.every((response) => response.body.user.id === sessionUser.id));
  const otherDevice = await authSessions.createAuthSession(sessionUser, {
    userAgent: "Other test device",
  });

  const sessionsResponse = await agent
    .get("/api/auth/sessions")
    .set("Authorization", `Bearer ${firstAccessToken}`)
    .expect(200);
  assert.equal(sessionsResponse.body.sessions.filter((row) => row.current).length, 1);
  assert.ok(sessionsResponse.body.sessions.some((row) => row.userAgent === "AttendX test browser"));
  const otherRow = sessionsResponse.body.sessions.find((row) => row.userAgent === "Other test device");
  await agent
    .delete(`/api/auth/sessions/${otherRow.id}`)
    .set("Authorization", `Bearer ${firstAccessToken}`)
    .expect(204);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${otherDevice.accessToken}`)
    .expect(401);

  const thirdDevice = await authSessions.createAuthSession(sessionUser, {
    userAgent: "Third test device",
  });
  await agent
    .post("/api/auth/sessions/revoke-others")
    .set("Authorization", `Bearer ${firstAccessToken}`)
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${thirdDevice.accessToken}`)
    .expect(401);

  const refresh = await agent.post("/api/auth/refresh").expect(200);
  assert.notEqual(refresh.body.accessToken, firstAccessToken);
  await agent
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${firstAccessToken}`)
    .expect(401);
  await agent
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${refresh.body.accessToken}`)
    .expect(200);

  const raced = await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", firstRefreshCookie)
    .expect(409);
  assert.equal(raced.body.code, "REFRESH_RACE");
  await agent
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${refresh.body.accessToken}`)
    .expect(200);

  const reused = await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", firstRefreshCookie)
    .set("User-Agent", "Different attacker device")
    .expect(401);
  assert.equal(reused.body.code, "REFRESH_TOKEN_REUSED");
  await agent
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${refresh.body.accessToken}`)
    .expect(401);

  await agent.post("/api/auth/logout").expect(204);
});

test("logout rejects cross-site requests and revokes only after trusted confirmation", async () => {
  const agent = request.agent(app);
  const login = await agent
    .post("/api/auth/login")
    .send({ email: sessionUser.email, password: "SessionTest@123" })
    .expect(200);
  const accessToken = login.body.accessToken;
  const rejected = await agent
    .post("/api/auth/logout")
    .set("Origin", "https://untrusted.example")
    .set("Sec-Fetch-Site", "cross-site")
    .expect(403);
  assert.equal(rejected.body.code, "UNTRUSTED_ORIGIN");
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${accessToken}`)
    .expect(200);

  const loggedOut = await agent
    .post("/api/auth/logout")
    .set("Origin", "http://localhost:5173")
    .set("Sec-Fetch-Site", "same-origin")
    .expect(204);
  assert.match(loggedOut.headers["set-cookie"][0], /attendx_refresh=;/);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${accessToken}`)
    .expect(401);
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

test("only elevated Admin++ deletes backups and audit logs export as text", async () => {
  const disposable = await backup.createBackup({ label: "delete-test" });
  const endpoint = `/api/admin/backups/${encodeURIComponent(disposable.filename)}`;
  await request(app)
    .get("/api/admin/backups")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .expect(403);
  await request(app)
    .get("/api/admin/backups")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(403);
  await request(app)
    .get("/api/admin/backups")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200);
  await request(app)
    .delete(endpoint)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send({ confirmation: "DELETE BACKUP", reason: "Cleanup test file" })
    .expect(403);
  await request(app)
    .delete(endpoint)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ confirmation: "DELETE BACKUP", reason: "Cleanup test file" })
    .expect(403);
  await request(app)
    .delete(endpoint)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ confirmation: "DELETE BACKUP", reason: "Cleanup test file" })
    .expect(204);
  await assert.rejects(fs.access(backup.backupPath(disposable.filename)));
  assert.ok(
    await db.AuditLog.findOne({
      where: { action: "DATABASE_BACKUP_DELETED" },
    }),
  );
  await db.sequelize.query(
    `INSERT INTO audit_logs
      (entity_type, entity_id, action, user_id, created_at, updated_at)
     VALUES ('DATABASE', 0, 'LEGACY_TIMESTAMP_TEST', :userId,
       '2026-09-18T12:33:47.060Z', '2026-09-18T12:33:47.060Z')`,
    { replacements: { userId: admin.id } },
  );
  await request(app)
    .get("/api/admin/audit-logs/export")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .expect(200)
    .expect("Content-Type", /text\/plain/)
    .expect("Cache-Control", "private, no-store")
    .expect("Content-Disposition", /attendx-audit-\d{4}-\d{2}-\d{2}\.txt/)
    .expect((response) => {
      assert.match(response.text, /DATABASE BACKUP DELETED/);
      assert.match(response.text, /Cleanup test file/);
      assert.match(response.text, /LEGACY TIMESTAMP TEST/);
      assert.match(response.text, /Timestamp unavailable/);
    });
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

test("timetable rejects invalid clocks and overlapping active entries", async () => {
  const base = {
    dayOfWeek: 7,
    startTime: "09:30",
    endTime: "10:30",
    subjectId: subject.id,
    faculty: "Safety test",
  };
  await request(app)
    .post("/api/admin/timetable")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send({ ...base, startTime: "29:99" })
    .expect(400);
  const created = await request(app)
    .post("/api/admin/timetable")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send(base)
    .expect(201);
  await request(app)
    .post("/api/admin/timetable")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send({ ...base, startTime: "10:00", endTime: "11:00" })
    .expect(409)
    .expect((response) => {
      assert.equal(response.body.code, "TIMETABLE_CONFLICT");
    });
  await request(app)
    .delete(`/api/admin/timetable/${created.body.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .expect(204);
});

test("CR cannot reopen while ADMIN can reopen with a required reason", async () => {
  const closed = await db.AttendanceSession.findOne({
    where: { status: "CLOSED" },
  });
  await request(app)
    .post(`/api/attendance/sessions/${closed.id}/reopen`)
    .set("Authorization", `Bearer ${crToken}`)
    .send({ reason: "Not permitted" })
    .expect(403);
  await request(app)
    .post(`/api/attendance/sessions/${closed.id}/reopen`)
    .set("Authorization", `Bearer ${adminToken}`)
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

test("review export is authenticated, validated and securely named", async () => {
  await request(app).get("/api/attendance/export/review").expect(401);
  await request(app)
    .get("/api/attendance/export/review?from=2026-09-20&to=2026-09-18")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(400);
  await request(app)
    .get("/api/attendance/export/review?from=2026-09-18&to=2026-09-18")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(200)
    .expect("Content-Type", /spreadsheetml/)
    .expect("Cache-Control", "private, no-store")
    .expect("Content-Disposition", 'attachment; filename="attendance_2026-09-18.xlsx"');
});

test("ADMIN manages accounts while Admin++ elevation protects destructive actions", async () => {
  await request(app)
    .get("/api/admin/users")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .expect(200)
    .expect((response) => {
      const elevated = response.body.find((row) => row.id === admin.id);
      assert.equal(elevated.phoneNumber, null);
    });
  await request(app)
    .get("/api/admin/database/overview")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .expect(403);
  await request(app)
    .get("/api/admin/database/tables/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200)
    .expect((response) => {
      assert.equal("passwordHash" in response.body.rows[0], false);
      assert.equal("phoneNumber" in response.body.rows[0], false);
    });
  await request(app)
    .post("/api/auth/elevate")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ password: "wrong-password" })
    .expect(401);
  await request(app)
    .post("/api/auth/elevate")
    .set("Authorization", `Bearer ${crToken}`)
    .send({ password: "CRTestPass@123" })
    .expect(403);
  await request(app)
    .get("/api/admin/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200);
  const created = await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .send({
      name: "Disposable User",
      email: "disposable@test.local",
      password: "Disposable@123",
      role: "CR",
    })
    .expect(201);
  await request(app)
    .patch(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .send({ active: false })
    .expect(200);
  await request(app)
    .delete(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .expect(403);
  await request(app)
    .delete(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(403);
  await request(app)
    .delete(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(204);
  assert.equal(await db.User.findByPk(created.body.id), null);
  await request(app)
    .patch(`/api/admin/users/${admin.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .send({ active: false })
    .expect(403);
  await request(app)
    .delete(`/api/admin/users/${admin.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(409);
  await request(app)
    .delete(`/api/admin/users/${cr.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(409);
});

test("only Admin++ changes browser roles and Admin++ status remains CLI-only", async () => {
  const created = await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({
      name: "Role Change Test",
      email: "role-change@test.local",
      password: "RoleChange@123",
      role: "CR",
    })
    .expect(201);
  await request(app)
    .patch(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .send({ role: "ADMIN" })
    .expect(403);
  await request(app)
    .patch(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ role: "ADMIN" })
    .expect(200)
    .expect((response) => assert.equal(response.body.role, "ADMIN"));
  await request(app)
    .patch(`/api/admin/users/${admin.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ role: "CR" })
    .expect(409)
    .expect((response) => assert.equal(response.body.code, "ADMIN_PLUS_CLI_REQUIRED"));
  await request(app)
    .delete(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(204);
});

test("permission editor is elevated Admin++ only and preserves security ceilings", async () => {
  await request(app)
    .get("/api/admin/settings/permissions")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .expect(403);
  const current = await request(app)
    .get("/api/admin/settings/permissions")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200);
  const attempted = structuredClone(current.body);
  attempted.permissions.ADMIN.database.view = true;
  attempted.permissions.ADMIN_PLUS.backups.restore = false;
  await request(app)
    .put("/api/admin/settings/permissions")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ policy: attempted })
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.policy.permissions.ADMIN.database.view, false);
      assert.equal(
        response.body.policy.permissions.ADMIN_PLUS.backups.restore,
        true,
      );
      assert.ok(response.body.repairs.length >= 2);
    });
});

test("disabling CR correction blocks open-session overrides", async () => {
  const session = await db.AttendanceSession.findOne({ where: { status: "OPEN" } });
  const existing = await db.AttendanceRecord.findOne({
    where: { AttendanceSessionId: session.id },
  });
  await db.Setting.upsert({ key: "crCanCorrectRecent", value: "false" });
  await request(app)
    .get(`/api/attendance/sessions/${session.id}`)
    .set("Authorization", `Bearer ${crToken}`)
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.capabilities.canCorrectOpen, false);
    });
  await request(app)
    .patch(
      `/api/attendance/sessions/${session.id}/students/${existing.StudentId}/selection`,
    )
    .set("Authorization", `Bearer ${crToken}`)
    .send({ status: existing.status === "PRESENT" ? "LATE" : "PRESENT" })
    .expect(403);
  await db.Setting.upsert({ key: "crCanCorrectRecent", value: "true" });
});

test("Admin++ permanently deletes only students and subjects without history", async () => {
  const unusedStudent = await db.Student.create({
    rollNumber: "99",
    name: "Unused Student",
  });
  await request(app)
    .delete(`/api/admin/students/${unusedStudent.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(204);
  assert.equal(await db.Student.findByPk(unusedStudent.id), null);

  const historicalStudent = await db.Student.findOne({
    where: { rollNumber: "01" },
  });
  const blockedStudent = await request(app)
    .delete(`/api/admin/students/${historicalStudent.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(409);
  assert.equal(blockedStudent.body.code, "STUDENT_HAS_HISTORY");

  const unusedSubject = await db.Subject.create({
    code: "UNUSED",
    name: "Unused Subject",
  });
  await request(app)
    .delete(`/api/admin/subjects/${unusedSubject.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(204);
  assert.equal(await db.Subject.findByPk(unusedSubject.id), null);

  const blockedSubject = await request(app)
    .delete(`/api/admin/subjects/${subject.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(409);
  assert.equal(blockedSubject.body.code, "SUBJECT_HAS_HISTORY");
});

test("Admin++ can review and revoke another user's login sessions", async () => {
  const managedUser = await db.User.create({
    name: "Managed Sessions",
    email: "managed-sessions@test.local",
    passwordHash: await bcrypt.hash("Managed@123", 4),
    role: "CR",
  });
  const first = await authSessions.createAuthSession(managedUser, {
    userAgent: "Managed device one",
  });
  const second = await authSessions.createAuthSession(managedUser, {
    userAgent: "Managed device two",
  });
  await request(app)
    .get(`/api/admin/users/${managedUser.id}/sessions`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .expect(403);
  const listed = await request(app)
    .get(`/api/admin/users/${managedUser.id}/sessions`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200);
  assert.equal(listed.body.sessions.length, 2);

  const firstRow = listed.body.sessions.find(
    (row) => row.userAgent === "Managed device one",
  );
  await request(app)
    .delete(`/api/admin/users/${managedUser.id}/sessions/${firstRow.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(204);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${first.accessToken}`)
    .expect(401);

  await request(app)
    .post(`/api/admin/users/${managedUser.id}/revoke-sessions`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${second.accessToken}`)
    .expect(401);
});

test("only Admin++ can change Late Mode and the choice is audited", async () => {
  await request(app)
    .put("/api/admin/settings/late-mode")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send({ enabled: false })
    .expect(403);
  const disabled = await request(app)
    .put("/api/admin/settings/late-mode")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ enabled: false })
    .expect(200);
  assert.equal(disabled.body.lateModeEnabled, false);
  assert.equal(
    JSON.parse((await db.Setting.findByPk("lateModeEnabled")).value),
    false,
  );
  assert.ok(
    await db.AuditLog.findOne({ where: { action: "LATE_MODE_CHANGED" } }),
  );
  await request(app)
    .put("/api/admin/settings/late-mode")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ enabled: true })
    .expect(200);
});

test("roll selection marks present or late, close assigns absence, and only elevated Admin++ deletes history", async () => {
  const live = await db.AttendanceSession.create({
    sessionDate: "2026-09-19",
    scheduledStartTime: "12:00",
    scheduledEndTime: "13:00",
    openedAt: new Date("2026-09-19T06:30:00Z"),
    status: "OPEN",
    sessionType: "EXTRA",
    reason: "Attendance workflow test",
    lateThresholdMinutes: 15,
    SubjectId: subject.id,
    scheduledSubjectId: subject.id,
    createdById: cr.id,
  });
  const rollOne = await db.Student.findOne({ where: { rollNumber: "01" } });
  const rollThree = await db.Student.findOne({ where: { rollNumber: "03" } });

  const marked = await request(app)
    .post(`/api/attendance/sessions/${live.id}/students/${rollOne.id}/mark`)
    .set("Authorization", `Bearer ${crToken}`)
    .send({ status: "LATE" })
    .expect(201);
  assert.equal(marked.body.record.status, "LATE");

  const overwritten = await request(app)
    .patch(`/api/attendance/sessions/${live.id}/students/${rollOne.id}/selection`)
    .set("Authorization", `Bearer ${crToken}`)
    .send({ status: "PRESENT" })
    .expect(200);
  assert.equal(overwritten.body.action, "UPDATED");
  assert.equal(overwritten.body.record.status, "PRESENT");
  assert.ok(
    await db.AuditLog.findOne({
      where: {
        AttendanceSessionId: live.id,
        StudentId: rollOne.id,
        action: "STATUS_CORRECTED",
      },
    }),
  );

  const removed = await request(app)
    .patch(`/api/attendance/sessions/${live.id}/students/${rollOne.id}/selection`)
    .set("Authorization", `Bearer ${crToken}`)
    .send({ status: null })
    .expect(200);
  assert.equal(removed.body.action, "REMOVED");
  assert.equal(
    await db.AttendanceRecord.findOne({
      where: { AttendanceSessionId: live.id, StudentId: rollOne.id },
    }),
    null,
  );
  assert.ok(
    await db.AuditLog.findOne({
      where: {
        AttendanceSessionId: live.id,
        StudentId: rollOne.id,
        action: "MARK_REMOVED",
      },
    }),
  );

  const reselected = await request(app)
    .patch(`/api/attendance/sessions/${live.id}/students/${rollOne.id}/selection`)
    .set("Authorization", `Bearer ${crToken}`)
    .send({ status: "LATE" })
    .expect(200);
  assert.equal(reselected.body.action, "MARKED");
  assert.equal(reselected.body.record.status, "LATE");
  await request(app)
    .post(`/api/attendance/sessions/${live.id}/students/${rollThree.id}/mark`)
    .set("Authorization", `Bearer ${crToken}`)
    .send({ status: "ABSENT" })
    .expect(400);

  const prematureDelete = await request(app)
    .delete(`/api/attendance/sessions/${live.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({
      confirmation: "DELETE ATTENDANCE",
      reason: "Testing open-session protection",
    })
    .expect(409);
  assert.equal(prematureDelete.body.code, "SESSION_MUST_BE_CLOSED");

  await request(app)
    .post(`/api/attendance/sessions/${live.id}/close`)
    .set("Authorization", `Bearer ${crToken}`)
    .expect(200);
  const autoAbsent = await db.AttendanceRecord.findOne({
    where: { AttendanceSessionId: live.id, StudentId: rollThree.id },
  });
  assert.equal(autoAbsent.status, "ABSENT");

  await request(app)
    .delete(`/api/attendance/sessions/${live.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send({
      confirmation: "DELETE ATTENDANCE",
      reason: "Standard admins cannot delete",
    })
    .expect(403);
  await request(app)
    .delete(`/api/attendance/sessions/${live.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      confirmation: "DELETE ATTENDANCE",
      reason: "Elevation is mandatory",
    })
    .expect(403);
  await request(app)
    .delete(`/api/attendance/sessions/${live.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({
      confirmation: "DELETE ATTENDANCE",
      reason: "Disposable automated workflow test",
    })
    .expect(204);

  assert.equal(await db.AttendanceSession.findByPk(live.id), null);
  assert.equal(
    await db.AttendanceRecord.count({
      where: { AttendanceSessionId: live.id },
    }),
    0,
  );
  const deletionAudit = await db.AuditLog.findOne({
    where: {
      entityType: "ATTENDANCE_SESSION",
      entityId: live.id,
      action: "SESSION_DELETED",
    },
  });
  assert.ok(deletionAudit);
  assert.equal(deletionAudit.AttendanceSessionId, null);
  assert.equal(deletionAudit.reason, "Disposable automated workflow test");
  const snapshot = JSON.parse(deletionAudit.oldValue);
  assert.equal(snapshot.summary.late, 1);
  assert.equal(snapshot.summary.absent, 1);
});

test("ADMIN cannot disable their own account but can disable another account", async () => {
  await request(app)
    .patch(`/api/admin/users/${normalAdmin.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .send({ active: false })
    .expect(409);
  assert.equal((await db.User.findByPk(normalAdmin.id)).active, true);
  await request(app)
    .patch(`/api/admin/users/${cr.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .send({ active: false })
    .expect(200);
  assert.equal((await db.User.findByPk(cr.id)).active, false);
  await db.User.update({ active: true }, { where: { id: cr.id } });
  await cr.reload();
  crToken = (await authSessions.createAuthSession(cr, { userAgent: "CR replacement browser" })).accessToken;
});

test("password change revokes the old token and replaces the password", async () => {
  const oldToken = crToken;
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
