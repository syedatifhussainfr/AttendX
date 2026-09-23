import { QueryTypes } from "sequelize";
import {
  AttendanceRecord,
  AttendanceSession,
  AuditLog,
  AuthSession,
  Student,
  Subject,
  Timetable,
  User,
  sequelize,
} from "../db/index.js";
import { config } from "../config.js";

const colorEnabled = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const color = (code, value) =>
  colorEnabled ? `\u001b[${code}m${value}\u001b[0m` : value;
const ok = (value) => color("1;32", value);
const info = (value) => color("1;36", value);
const warn = (value) => color("1;33", value);
const fail = (value) => color("1;31", value);

function row(label, value) {
  console.log(`  ${label.padEnd(24)} ${value}`);
}

let exitCode = 0;

try {
  await sequelize.authenticate();
  console.log(`\n${info("AttendX V1.1.8 · Data verification")}`);
  console.log("─".repeat(48));
  row("Database engine", config.dialect.toUpperCase());

  if (config.dialect === "sqlite") {
    const integrity = await sequelize.query("PRAGMA integrity_check", {
      type: QueryTypes.SELECT,
    });
    const integrityOk = integrity.every(
      (entry) => String(entry.integrity_check).toLowerCase() === "ok",
    );
    row("SQLite integrity", integrityOk ? ok("PASS") : fail("FAIL"));
    if (!integrityOk) {
      console.error(integrity);
      exitCode = 1;
    }

    const foreignKeyIssues = await sequelize.query("PRAGMA foreign_key_check", {
      type: QueryTypes.SELECT,
    });
    row(
      "Foreign-key check",
      foreignKeyIssues.length
        ? fail(`${foreignKeyIssues.length} issue(s)`)
        : ok("PASS"),
    );
    if (foreignKeyIssues.length) {
      console.error(foreignKeyIssues);
      exitCode = 1;
    }
  } else {
    row("Structural checks", warn("Provider-managed PostgreSQL"));
  }

  const [
    users,
    activeAdmins,
    activeAdminPlus,
    students,
    activeStudents,
    subjects,
    timetableEntries,
    attendanceSessions,
    attendanceRecords,
    auditEntries,
    activeBrowserSessions,
  ] = await Promise.all([
    User.count(),
    User.count({ where: { role: "ADMIN", active: true } }),
    User.count({ where: { adminPlus: true, active: true } }),
    Student.count(),
    Student.count({ where: { active: true } }),
    Subject.count(),
    Timetable.count(),
    AttendanceSession.count(),
    AttendanceRecord.count(),
    AuditLog.count(),
    AuthSession.count({ where: { revokedAt: null } }),
  ]);

  const duplicateRolls = await sequelize.query(
    `SELECT roll_number, COUNT(*) AS count
       FROM students
      GROUP BY roll_number
     HAVING COUNT(*) > 1`,
    { type: QueryTypes.SELECT },
  );
  const duplicateEnrollments = await sequelize.query(
    `SELECT enrollment_number, COUNT(*) AS count
       FROM students
      WHERE enrollment_number IS NOT NULL AND TRIM(enrollment_number) <> ''
      GROUP BY enrollment_number
     HAVING COUNT(*) > 1`,
    { type: QueryTypes.SELECT },
  );

  row(
    "Active administrator",
    activeAdmins ? ok(`${activeAdmins} found`) : fail("MISSING"),
  );
  if (!activeAdmins) exitCode = 1;
  row(
    "Active Admin++",
    activeAdminPlus ? ok(String(activeAdminPlus)) : warn("0"),
  );
  row(
    "Duplicate roll numbers",
    duplicateRolls.length ? fail(String(duplicateRolls.length)) : ok("0"),
  );
  if (duplicateRolls.length) exitCode = 1;
  row(
    "Duplicate enrolments",
    duplicateEnrollments.length
      ? fail(String(duplicateEnrollments.length))
      : ok("0"),
  );
  if (duplicateEnrollments.length) exitCode = 1;

  console.log(`\n${info("Record summary")}`);
  row("Users", users);
  row("Students", `${students} total · ${activeStudents} active`);
  row("Subjects", subjects);
  row("Timetable entries", timetableEntries);
  row("Attendance sessions", attendanceSessions);
  row("Attendance records", attendanceRecords);
  row("Audit entries", auditEntries);
  row("Unrevoked sessions", activeBrowserSessions);

  console.log("─".repeat(48));
  console.log(
    exitCode
      ? fail(
          "Data verification failed. Resolve the reported issues before release.\n",
        )
      : ok("Data verification passed. No integrity blockers found.\n"),
  );
} catch (error) {
  exitCode = 1;
  console.error(fail(`Data verification could not complete: ${error.message}`));
} finally {
  await sequelize.close();
}

process.exitCode = exitCode;
