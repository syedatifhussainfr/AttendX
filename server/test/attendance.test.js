import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import bcrypt from "bcryptjs";

process.env.DB_DIALECT = "sqlite";
process.env.SQLITE_PATH = ":memory:";
process.env.JWT_SECRET = "test-secret";
const db = await import("../src/db/index.js");
const service = await import("../src/services/attendanceService.js");
const rolls = await import("../src/utils/rollNumber.js");
let user, subject, students, session;

before(async () => {
  await db.initDatabase({ force: true });
  user = await db.User.create({
    name: "CR Test",
    email: "cr@test.local",
    passwordHash: await bcrypt.hash("testing123", 4),
    role: "CR",
  });
  subject = await db.Subject.create({ code: "TEST", name: "Test Subject" });
  students = await db.Student.bulkCreate([
    { rollNumber: "01", name: "Student 01" },
    { rollNumber: "02", name: "Student 02" },
    { rollNumber: "03", name: "Student 03" },
  ]);
  session = await db.AttendanceSession.create({
    sessionDate: "2026-09-18",
    scheduledStartTime: "09:30",
    scheduledEndTime: "10:45",
    openedAt: new Date(),
    lateThresholdMinutes: 15,
    SubjectId: subject.id,
    createdById: user.id,
  });
});
after(async () => db.sequelize.close());

test("15-minute boundary is exact: 09:44:59 present, 09:45:00 late", () => {
  const at = (iso) =>
    DateTime.fromISO(iso, { zone: "Asia/Kolkata" }).toJSDate();
  assert.equal(
    service.deriveAttendanceStatus({
      sessionDate: "2026-09-18",
      scheduledStartTime: "09:30",
      thresholdMinutes: 15,
      markedAt: at("2026-09-18T09:44:59+05:30"),
    }),
    "PRESENT",
  );
  assert.equal(
    service.deriveAttendanceStatus({
      sessionDate: "2026-09-18",
      scheduledStartTime: "09:30",
      thresholdMinutes: 15,
      markedAt: at("2026-09-18T09:45:00+05:30"),
    }),
    "LATE",
  );
});

test("roll numbers normalize and sort naturally", () => {
  assert.equal(rolls.normalizeRollNumber("1"), "01");
  assert.equal(rolls.normalizeRollNumber("001"), "01");
  assert.equal(rolls.normalizeRollNumber("78"), "78");
  assert.deepEqual(["10", "2", "01"].sort(rolls.compareRollNumbers), [
    "01",
    "2",
    "10",
  ]);
});

test("marking stores present credit and rejects duplicate attendance", async () => {
  const now = DateTime.fromISO("2026-09-18T09:35:00+05:30").toJSDate();
  const result = await service.markAttendance({
    sessionId: session.id,
    studentId: students[0].id,
    markedById: user.id,
    now,
  });
  assert.equal(result.record.status, "PRESENT");
  assert.equal(result.record.attendanceCredit, true);
  await assert.rejects(
    () =>
      service.markAttendance({
        sessionId: session.id,
        studentId: students[0].id,
        markedById: user.id,
        now,
      }),
    /already marked PRESENT/,
  );
});

test("late appearance is permanent LATE with zero credit", async () => {
  const now = DateTime.fromISO("2026-09-18T09:45:00+05:30").toJSDate();
  const result = await service.markAttendance({
    sessionId: session.id,
    studentId: students[1].id,
    markedById: user.id,
    now,
  });
  assert.equal(result.record.status, "LATE");
  assert.equal(result.record.attendanceCredit, false);
});

test("closing assigns absent, locks session, and creates an audit log", async () => {
  const closed = await service.closeSession({
    sessionId: session.id,
    userId: user.id,
  });
  assert.equal(closed.status, "CLOSED");
  const absent = await db.AttendanceRecord.findOne({
    where: { AttendanceSessionId: session.id, StudentId: students[2].id },
  });
  assert.equal(absent.status, "ABSENT");
  assert.equal(absent.attendanceCredit, false);
  assert.equal(
    await db.AuditLog.count({ where: { action: "SESSION_CLOSED" } }),
    1,
  );
  await assert.rejects(
    () =>
      service.markAttendance({
        sessionId: session.id,
        studentId: students[2].id,
        markedById: user.id,
      }),
    /closed/,
  );
});

test("analytics percentage uses credited present only while physical appearance includes late", () => {
  assert.deepEqual(
    service.summarize([
      { status: "PRESENT" },
      { status: "LATE" },
      { status: "ABSENT" },
    ]),
    {
      total: 3,
      present: 1,
      late: 1,
      absent: 1,
      credited: 1,
      physicalAppearances: 2,
      attendancePercentage: 33.33,
    },
  );
});
