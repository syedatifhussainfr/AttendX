import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import request from "supertest";
import sqlite3 from "sqlite3";

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
const policyService = await import("../src/policy/policyService.js");
const apiRestart = await import("../src/services/apiRestartService.js");

test("database restore chooses a safe restart strategy for each runtime", () => {
  assert.equal(apiRestart.restartStrategy({ NODE_ENV: "test" }), "disabled");
  assert.equal(
    apiRestart.restartStrategy({ ATTENDX_DEV_SUPERVISED: "1" }),
    "supervisor-exit",
  );
  assert.equal(apiRestart.restartStrategy({ NODE_ENV: "production" }), "exit");
});

let admin;
let normalAdmin;
let cr;
let sessionUser;
let subject;
let defaultClass;
let adminToken;
let normalAdminToken;
let crToken;
let adminElevationToken;
let normalAdminElevationToken;

before(async () => {
  await db.initDatabase({ force: true });
  defaultClass = await db.AcademicClass.findOne({
    where: { code: "ANASUYA-BCA-AI-3B-UG" },
  });
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
  await db.ClassAssignment.bulkCreate([
    {
      AcademicClassId: defaultClass.id,
      UserId: cr.id,
      assignmentRole: "CR",
    },
    {
      AcademicClassId: defaultClass.id,
      UserId: sessionUser.id,
      assignmentRole: "CR",
    },
  ]);
  adminToken = (
    await authSessions.createAuthSession(admin, {
      userAgent: "Admin test browser",
    })
  ).accessToken;
  normalAdminToken = (
    await authSessions.createAuthSession(normalAdmin, {
      userAgent: "Standard admin test browser",
    })
  ).accessToken;
  crToken = (
    await authSessions.createAuthSession(cr, { userAgent: "CR test browser" })
  ).accessToken;
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
  await db.ClassSubject.create({
    AcademicClassId: defaultClass.id,
    SubjectId: subject.id,
    active: true,
  });
  await db.Setting.create({ key: "lateThresholdMinutes", value: "15" });
  await db.Student.bulkCreate([
    {
      rollNumber: "01",
      name: "Original One",
      AcademicClassId: defaultClass.id,
    },
    {
      rollNumber: "02",
      name: "Original Two",
      AcademicClassId: defaultClass.id,
    },
  ]);
});

after(async () => {
  if (db.sequelize.connectionManager.pool)
    await db.sequelize.close().catch(() => {});
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
  assert.ok(records.attendance_credit_value);
  assert.ok(authSessionsTable.current_token_hash);
  const attendanceSessionsTable = await db.sequelize
    .getQueryInterface()
    .describeTable("attendance_sessions");
  assert.ok(attendanceSessionsTable.late_mode_enabled);
  assert.ok(attendanceSessionsTable.late_attendance_credit);
  assert.ok(authSessionsTable.expires_at);
  const brandingAssets = await db.sequelize
    .getQueryInterface()
    .describeTable("branding_assets");
  assert.ok(brandingAssets.checksum);
  assert.ok(brandingAssets.data);
  assert.ok(users.admin_plus);
  assert.ok(users.phone_number);
  const studentsTable = await db.sequelize
    .getQueryInterface()
    .describeTable("students");
  assert.ok(studentsTable.enrollment_number);
  assert.ok(studentsTable.section);
  assert.ok(studentsTable.phone_number);
  assert.ok(studentsTable.guardian_phone);
  assert.ok(studentsTable.notes);
  assert.ok(studentsTable.admission_date);
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
  const [studentProfileMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '006-student-profile'",
  );
  assert.equal(studentProfileMigrations.length, 1);
  const [lateCreditMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '007-late-attendance-credit'",
  );
  assert.equal(lateCreditMigrations.length, 1);
  const [classMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '008-academic-classes'",
  );
  assert.equal(classMigrations.length, 1);
  const [classOwnershipMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '009-class-ownership'",
  );
  assert.equal(classOwnershipMigrations.length, 1);
  const [attendanceOwnershipMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '010-attendance-record-ownership'",
  );
  assert.equal(attendanceOwnershipMigrations.length, 1);
  const [subjectCategoryMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '011-subject-course-category'",
  );
  assert.equal(subjectCategoryMigrations.length, 1);
  const [legacySettingMigrations] = await db.sequelize.query(
    "SELECT id FROM app_migrations WHERE id = '013-remove-legacy-class-settings'",
  );
  assert.equal(legacySettingMigrations.length, 1);
  assert.equal(await db.AcademicClass.count(), 3);
  assert.equal(defaultClass.semester, "1");
  assert.equal(defaultClass.specialization, "AI/ML");
  assert.equal(subject.courseCategory, "BCA");
  assert.ok(studentsTable.academic_class_id);
  assert.equal(
    (await db.sequelize.getQueryInterface().describeTable("timetables"))
      .academic_class_id.allowNull,
    false,
  );
});

test("class workspaces isolate faculty access and roll numbers", async () => {
  const otherClass = await db.AcademicClass.findOne({
    where: { code: "ANASUYA-BCA-AI-3A-UG" },
  });
  const faculty = await db.User.create({
    name: "Faculty Test",
    email: "faculty-v119@test.local",
    passwordHash: await bcrypt.hash("FacultyTest@123", 4),
    role: "FACULTY",
  });
  await db.ClassAssignment.create({
    AcademicClassId: defaultClass.id,
    UserId: faculty.id,
    assignmentRole: "MENTOR",
  });
  const facultyToken = (
    await authSessions.createAuthSession(faculty, {
      userAgent: "Faculty class isolation test",
    })
  ).accessToken;
  const createdStudents = [];
  try {
    const classes = await request(app)
      .get("/api/admin/classes")
      .set("Authorization", `Bearer ${facultyToken}`)
      .expect(200);
    assert.deepEqual(classes.body.map((row) => row.id), [defaultClass.id]);

    await request(app)
      .get(`/api/admin/students?classId=${otherClass.id}`)
      .set("Authorization", `Bearer ${facultyToken}`)
      .expect(403);
    await request(app)
      .patch(`/api/admin/classes/${defaultClass.id}`)
      .set("Authorization", `Bearer ${facultyToken}`)
      .send({ batch: "2024-2028" })
      .expect(200);
    await request(app)
      .patch(`/api/admin/classes/${otherClass.id}`)
      .set("Authorization", `Bearer ${facultyToken}`)
      .send({ batch: "forbidden" })
      .expect(403);

    createdStudents.push(
      await db.Student.create({
        rollNumber: "94",
        name: "Default Class Roll",
        AcademicClassId: defaultClass.id,
      }),
      await db.Student.create({
        rollNumber: "94",
        name: "Other Class Roll",
        AcademicClassId: otherClass.id,
      }),
    );
    await assert.rejects(
      db.Student.create({
        rollNumber: "94",
        name: "Duplicate In Same Class",
        AcademicClassId: defaultClass.id,
      }),
    );
  } finally {
    if (createdStudents.length)
      await db.Student.destroy({
        where: { id: createdStudents.map((student) => student.id) },
      });
    await defaultClass.update({ batch: null });
    await db.AuthSession.destroy({ where: { UserId: faculty.id } });
    await faculty.destroy();
  }
});

test("class staff removal requires a typed phrase and current password", async () => {
  const removableStaff = await db.User.create({
    name: "Removable Faculty",
    email: "removable-faculty@test.local",
    passwordHash: await bcrypt.hash("FacultyTest@123", 4),
    role: "FACULTY",
  });
  await db.ClassAssignment.create({
    AcademicClassId: defaultClass.id,
    UserId: removableStaff.id,
    assignmentRole: "FACULTY",
  });
  const path = `/api/admin/classes/${defaultClass.id}/assignments/${removableStaff.id}`;

  try {
    await request(app)
      .delete(path)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ confirmation: "REMOVE ACCESS", password: "wrong-password" })
      .expect(401);
    assert.equal(
      await db.ClassAssignment.count({
        where: {
          AcademicClassId: defaultClass.id,
          UserId: removableStaff.id,
        },
      }),
      1,
    );

    await request(app)
      .delete(path)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ confirmation: "REMOVE ACCESS", password: "AdminTest@123" })
      .expect(204);
    assert.equal(
      await db.ClassAssignment.count({
        where: {
          AcademicClassId: defaultClass.id,
          UserId: removableStaff.id,
        },
      }),
      0,
    );
  } finally {
    await db.ClassAssignment.destroy({
      where: { UserId: removableStaff.id },
    });
    await removableStaff.destroy();
  }
});

test("only elevated Admin++ permanently deletes an empty class", async () => {
  const emptyClass = await db.AcademicClass.create({
    displayName: "Disposable Test Class",
    code: "DISPOSABLE-TEST-CLASS",
    course: "BCA",
    semester: "1",
  });
  await db.ClassAssignment.create({
    AcademicClassId: emptyClass.id,
    UserId: cr.id,
    assignmentRole: "CR",
  });
  await db.ClassSubject.create({
    AcademicClassId: emptyClass.id,
    SubjectId: subject.id,
    active: true,
  });

  await request(app)
    .delete(`/api/admin/classes/${emptyClass.id}`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .send({ confirmation: "DELETE CLASS" })
    .expect(403);
  await request(app)
    .delete(`/api/admin/classes/${emptyClass.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ confirmation: "DELETE CLASS" })
    .expect(403);
  await request(app)
    .delete(`/api/admin/classes/${defaultClass.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ confirmation: "DELETE CLASS" })
    .expect(409);
  await request(app)
    .delete(`/api/admin/classes/${emptyClass.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ confirmation: "DELETE CLASS" })
    .expect(204);

  assert.equal(await db.AcademicClass.count({ where: { id: emptyClass.id } }), 0);
  assert.equal(
    await db.ClassAssignment.count({
      where: { AcademicClassId: emptyClass.id },
    }),
    0,
  );
  assert.equal(
    await db.ClassSubject.count({ where: { AcademicClassId: emptyClass.id } }),
    0,
  );
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
  assert.ok(
    parallelResume.every(
      (response) => response.body.user.id === sessionUser.id,
    ),
  );
  const otherDevice = await authSessions.createAuthSession(sessionUser, {
    userAgent: "Other test device",
  });

  const sessionsResponse = await agent
    .get("/api/auth/sessions")
    .set("Authorization", `Bearer ${firstAccessToken}`)
    .expect(200);
  assert.equal(
    sessionsResponse.body.sessions.filter((row) => row.current).length,
    1,
  );
  assert.ok(
    sessionsResponse.body.sessions.some(
      (row) => row.userAgent === "AttendX test browser",
    ),
  );
  const otherRow = sessionsResponse.body.sessions.find(
    (row) => row.userAgent === "Other test device",
  );
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
    classId: defaultClass.id,
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
  for (const key of [
    "lateThresholdMinutes",
    "lateModeEnabled",
    "lateAttendanceCredit",
    "crCanCorrectRecent",
  ])
    await db.Setting.upsert({ key, value: "broken" });
  const base = {
    classId: defaultClass.id,
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
  assert.equal(first.lateThresholdMinutes, 15);
  assert.equal(first.lateModeEnabled, true);
  assert.equal(first.lateAttendanceCredit, 0);
  await request(app)
    .get(`/api/attendance/sessions/${first.id}`)
    .set("Authorization", `Bearer ${crToken}`)
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.capabilities.canCorrectOpen, true);
    });
  for (const [key, value] of [
    ["lateThresholdMinutes", "15"],
    ["lateModeEnabled", "true"],
    ["lateAttendanceCredit", "0"],
    ["crCanCorrectRecent", "true"],
  ])
    await db.Setting.upsert({ key, value });
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
    classId: defaultClass.id,
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
    .expect(
      "Content-Disposition",
      'attachment; filename="attendance_2026-09-18.xlsx"',
    );
});

test("attendance history rejects malformed and reversed filters", async () => {
  await request(app)
    .get("/api/attendance/sessions?from=not-a-date")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(400);
  await request(app)
    .get("/api/attendance/sessions?subjectId=not-a-number")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(400);
  await request(app)
    .get("/api/attendance/sessions?from=2026-09-20&to=2026-09-19")
    .set("Authorization", `Bearer ${adminToken}`)
    .expect(400);
});

test("student workspace summarizes attendance and protects personal fields", async () => {
  const student = await db.Student.findOne({ where: { rollNumber: "01" } });
  await student.update({
    enrollmentNumber: "ENROL-001",
    section: "A",
    phoneNumber: "+919111111111",
    guardianPhone: "+919222222222",
    notes: "Synthetic test note",
    admissionDate: "2026-07-01",
    cardToken: "synthetic-card-token-0001",
  });
  await db.Setting.upsert({
    key: "attendanceTargetPercentage",
    value: "75",
  });

  await request(app)
    .get("/api/admin/students")
    .set("Authorization", `Bearer ${crToken}`)
    .expect(200)
    .expect((response) => {
      const row = response.body.students.find((item) => item.id === student.id);
      assert.ok(row.attendance);
      assert.equal(row.attendance.target, 75);
      assert.equal("phoneNumber" in row, false);
      assert.equal("guardianPhone" in row, false);
      assert.equal("notes" in row, false);
      assert.equal("cardToken" in row, false);
    });

  await request(app)
    .get(`/api/admin/students/${student.id}/profile`)
    .set("Authorization", `Bearer ${crToken}`)
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.student.enrollmentNumber, "ENROL-001");
      assert.equal("phoneNumber" in response.body.student, false);
      assert.ok(Array.isArray(response.body.subjects));
      assert.ok(Array.isArray(response.body.records));
    });

  await request(app)
    .get(`/api/admin/students/${student.id}/profile`)
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.student.phoneNumber, "+919111111111");
      assert.equal(response.body.student.notes, "Synthetic test note");
    });

  await request(app)
    .get(`/api/attendance/export/review?studentId=${student.id}`)
    .set("Authorization", `Bearer ${crToken}`)
    .expect(200)
    .expect(
      "Content-Disposition",
      /attendance_student_\d+_\d{4}-\d{2}-\d{2}\.xlsx/,
    );
});

test("configurable CR student management cannot expose private profile fields", async () => {
  const originalPolicy = policyService.permissionPolicySnapshot();
  const delegatedPolicy = structuredClone(originalPolicy);
  let createdStudentId = null;
  delegatedPolicy.permissions.CR.students.create = true;
  delegatedPolicy.permissions.CR.students.update = true;
  policyService.savePermissionPolicy(delegatedPolicy);
  try {
    const created = await request(app)
      .post("/api/admin/students")
      .set("Authorization", `Bearer ${crToken}`)
      .send({ rollNumber: "97", name: "Delegated Student" })
      .expect(201);
    createdStudentId = created.body.id;
    assert.equal(Object.hasOwn(created.body, "notes"), false);
    assert.equal(Object.hasOwn(created.body, "cardToken"), false);

    const basicUpdate = await request(app)
      .patch(`/api/admin/students/${created.body.id}`)
      .set("Authorization", `Bearer ${crToken}`)
      .send({ section: "Delegated section" })
      .expect(200);
    assert.equal(basicUpdate.body.section, "Delegated section");
    assert.equal(Object.hasOwn(basicUpdate.body, "phoneNumber"), false);

    await request(app)
      .patch(`/api/admin/students/${created.body.id}`)
      .set("Authorization", `Bearer ${crToken}`)
      .send({ notes: "CR must not write this" })
      .expect(403);
    await request(app)
      .patch(`/api/admin/students/${created.body.id}`)
      .set("Authorization", `Bearer ${crToken}`)
      .send({ cardToken: "delegated-secret-token" })
      .expect(403);
  } finally {
    if (createdStudentId)
      await db.Student.destroy({ where: { id: createdStudentId } });
    policyService.savePermissionPolicy(originalPolicy);
  }
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
      const institutionAdmin = response.body.rows.find(
        (row) => row.id === admin.id,
      );
      const assignedCr = response.body.rows.find((row) => row.id === cr.id);
      assert.equal(institutionAdmin.classAccess, "All classes");
      assert.match(assignedCr.classAccess, /ANASUYA BCA AI 3B\.UG/);
      assert.match(assignedCr.assignedClassCodes, /ANASUYA-BCA-AI-3B-UG/);
    });
  await request(app)
    .get("/api/admin/database/tables/students")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200)
    .expect((response) => {
      const student = response.body.rows.find(
        (row) => row.rollNumber === "01",
      );
      assert.ok(student.id);
      assert.ok(student.name);
      assert.equal(student.className, defaultClass.displayName);
      assert.equal(student.classCode, defaultClass.code);
      assert.equal(student.AcademicClassId, defaultClass.id);
      assert.equal("AcademicClass" in student, false);
    });
  await request(app)
    .get("/api/admin/database/tables/subjects")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .expect(200)
    .expect((response) => {
      const relatedSubject = response.body.rows.find(
        (row) => row.code === subject.code,
      );
      assert.match(relatedSubject.usedByClasses, /ANASUYA BCA AI 3B\.UG/);
      assert.match(
        relatedSubject.usedByClassCodes,
        /ANASUYA-BCA-AI-3B-UG/,
      );
      assert.equal("AcademicClasses" in relatedSubject, false);
    });
  for (const table of [
    "academic_classes",
    "class_assignments",
    "class_subjects",
    "timetable",
    "attendance_sessions",
    "attendance_records",
    "settings",
    "branding_assets",
    "audit_logs",
    "auth_sessions",
    "app_migrations",
  ]) {
    await request(app)
      .get(`/api/admin/database/tables/${table}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Admin-Elevation", adminElevationToken)
      .expect(200);
  }
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
  await db.ClassAssignment.create({
    AcademicClassId: defaultClass.id,
    UserId: created.body.id,
    assignmentRole: "CR",
  });
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
    .send({ role: "FACULTY" })
    .expect(200)
    .expect((response) => assert.equal(response.body.role, "FACULTY"));
  assert.equal(
    (
      await db.ClassAssignment.findOne({
        where: { UserId: created.body.id },
      })
    ).assignmentRole,
    "FACULTY",
  );
  await request(app)
    .patch(`/api/admin/users/${created.body.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ role: "ADMIN" })
    .expect(200);
  assert.equal(
    await db.ClassAssignment.count({ where: { UserId: created.body.id } }),
    0,
  );
  await request(app)
    .patch(`/api/admin/users/${admin.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .send({ role: "CR" })
    .expect(409)
    .expect((response) =>
      assert.equal(response.body.code, "ADMIN_PLUS_CLI_REQUIRED"),
    );
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

test("Admin++ branding updates are verified, public, and database-backed", async () => {
  const logoPath = fileURLToPath(
    new URL("../../client/public/brand/eiilm.png", import.meta.url),
  );
  const initial = await request(app).get("/api/branding").expect(200);
  assert.equal(initial.body.institutionName, "EIILM Kolkata");
  assert.ok(initial.body.primaryLogoUrl);

  await request(app)
    .put("/api/branding")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .set("X-Admin-Elevation", normalAdminElevationToken)
    .field("institutionName", "Blocked Institution")
    .field("institutionCode", "BLOCKED")
    .field("campusName", "Blocked")
    .field("confirmation", "UPDATE BRANDING")
    .field("removeSecondary", "false")
    .expect(403);

  await request(app)
    .put("/api/branding")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Admin-Elevation", adminElevationToken)
    .field("institutionName", "AttendX Test Institute")
    .field("institutionCode", "ATI")
    .field("campusName", "Test Campus")
    .field("confirmation", "UPDATE BRANDING")
    .field("removeSecondary", "true")
    .field("removeFavicon", "false")
    .attach("primaryLogo", logoPath)
    .attach("favicon", logoPath)
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.institutionName, "AttendX Test Institute");
      assert.equal(response.body.secondaryLogoUrl, null);
      assert.match(response.body.primaryLogoUrl, /\/api\/branding\/logo\/primary/);
      assert.match(response.body.faviconUrl, /\/api\/branding\/logo\/favicon/);
    });

  const publicBranding = await request(app).get("/api/branding").expect(200);
  assert.equal(publicBranding.body.institutionCode, "ATI");
  assert.equal(publicBranding.body.secondaryLogoUrl, null);
  await request(app)
    .get(publicBranding.body.primaryLogoUrl)
    .expect("Content-Type", /image\/png/)
    .expect(200);
  await request(app)
    .get(publicBranding.body.faviconUrl)
    .expect("Content-Type", /image\/png/)
    .expect(200);
  const stored = await db.BrandingAsset.findByPk("PRIMARY");
  assert.ok(stored.byteSize > 0);
  assert.equal(stored.checksum.length, 64);
  assert.ok(await db.BrandingAsset.findByPk("FAVICON"));
  assert.ok(
    await db.AuditLog.findOne({
      where: { action: "INSTITUTION_BRANDING_UPDATED" },
    }),
  );
});

test("disabling CR correction blocks open-session overrides", async () => {
  const session = await db.AttendanceSession.findOne({
    where: { status: "OPEN" },
  });
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
    AcademicClassId: defaultClass.id,
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
  await request(app)
    .put("/api/admin/settings/late-credit")
    .set("Authorization", `Bearer ${normalAdminToken}`)
    .send({ credit: 0.5 })
    .expect(403);
  const halfCredit = await request(app)
    .put("/api/admin/settings/late-credit")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ credit: 0.5 })
    .expect(200);
  assert.equal(halfCredit.body.lateAttendanceCredit, 0.5);
  assert.equal(
    JSON.parse((await db.Setting.findByPk("lateAttendanceCredit")).value),
    0.5,
  );
  assert.ok(
    await db.AuditLog.findOne({
      where: { action: "LATE_ATTENDANCE_CREDIT_CHANGED" },
    }),
  );
});

test("roll selection marks present or late, close assigns absence, and only elevated Admin++ deletes history", async () => {
  const live = await db.AttendanceSession.create({
    AcademicClassId: defaultClass.id,
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
    .patch(
      `/api/attendance/sessions/${live.id}/students/${rollOne.id}/selection`,
    )
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
    .patch(
      `/api/attendance/sessions/${live.id}/students/${rollOne.id}/selection`,
    )
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
    .patch(
      `/api/attendance/sessions/${live.id}/students/${rollOne.id}/selection`,
    )
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
  crToken = (
    await authSessions.createAuthSession(cr, {
      userAgent: "CR replacement browser",
    })
  ).accessToken;
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

test("database restore replaces live mutations and verifies the copied file", async () => {
  const snapshot = await backup.createBackup({ label: "restore-proof" });
  await db.Setting.upsert({ key: "restoreProofMutation", value: "remove-me" });
  assert.ok(await db.Setting.findByPk("restoreProofMutation"));

  const stagedPath = path.join(tempDir, "backups", ".restore-proof.sqlite");
  await fs.copyFile(backup.backupPath(snapshot.filename), stagedPath);
  const result = await backup.restoreStagedBackup({
    stagedPath,
    userId: admin.id,
    sourceName: snapshot.filename,
  });

  assert.equal(result.restored.valid, true);
  assert.equal(result.restored.sourceName, snapshot.filename);
  await assert.rejects(fs.access(stagedPath));

  const raw = new sqlite3.Database(
    process.env.SQLITE_PATH,
    sqlite3.OPEN_READONLY,
  );
  const get = (sql, parameters = []) =>
    new Promise((resolve, reject) =>
      raw.get(sql, parameters, (error, row) =>
        error ? reject(error) : resolve(row),
      ),
    );
  try {
    const mutation = await get(
      "SELECT COUNT(*) AS count FROM settings WHERE key = ?",
      ["restoreProofMutation"],
    );
    assert.equal(mutation.count, 0);
    const audit = await get(
      "SELECT new_value AS newValue FROM audit_logs WHERE action = 'DATABASE_RESTORED' ORDER BY id DESC LIMIT 1",
    );
    assert.equal(JSON.parse(audit.newValue).sourceName, snapshot.filename);
  } finally {
    await new Promise((resolve) => raw.close(() => resolve()));
  }
});
