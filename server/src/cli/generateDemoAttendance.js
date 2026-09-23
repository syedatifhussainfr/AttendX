import { DateTime } from "luxon";
import {
  AttendanceRecord,
  AttendanceSession,
  AcademicClass,
  AuditLog,
  ClassSubject,
  Student,
  Subject,
  User,
  initDatabase,
  sequelize,
} from "../db/index.js";
import { config } from "../config.js";

const DEMO_REASON = "AttendX generated demo attendance";
const requestedSessions = Number.parseInt(process.argv[2] || "12", 10);
const requestedClassCode = String(
  process.argv[3] || "ANASUYA-BCA-AI-3B-UG",
).toUpperCase();

if (
  !Number.isInteger(requestedSessions) ||
  requestedSessions < 1 ||
  requestedSessions > 60
) {
  console.error("Session count must be an integer from 1 to 60.");
  process.exit(1);
}

function pseudoRandom(studentId, sessionIndex, salt = 0) {
  const value =
    Math.sin(studentId * 12.9898 + sessionIndex * 78.233 + salt) * 43758.5453;
  return value - Math.floor(value);
}

function demoDates(count) {
  const dates = [];
  let cursor = DateTime.now()
    .setZone(config.timezone)
    .startOf("day")
    .minus({ days: 1 });
  while (dates.length < count) {
    if (cursor.weekday <= 5) dates.push(cursor);
    cursor = cursor.minus({ days: 1 });
  }
  return dates.reverse();
}

function statusFor(studentId, sessionIndex) {
  const studentBias = (((studentId * 17) % 21) - 10) / 100;
  const presentLimit = Math.max(0.55, Math.min(0.9, 0.76 + studentBias));
  const value = pseudoRandom(studentId, sessionIndex);
  if (value < presentLimit) return "PRESENT";
  if (value < presentLimit + 0.1) return "LATE";
  return "ABSENT";
}

function markedTime(date, status, studentId, sessionIndex) {
  const sessionStart = date.set({ hour: 10, minute: 0 });
  if (status === "ABSENT")
    return sessionStart.plus({ hours: 1, minutes: 5 }).toJSDate();
  const offset =
    status === "PRESENT"
      ? Math.floor(pseudoRandom(studentId, sessionIndex, 1) * 14) - 3
      : 16 + Math.floor(pseudoRandom(studentId, sessionIndex, 2) * 25);
  return sessionStart.plus({ minutes: offset }).toJSDate();
}

try {
  await initDatabase();
  const academicClass = await AcademicClass.findOne({
    where: { code: requestedClassCode, active: true },
  });
  if (!academicClass)
    throw new Error(`Active class ${requestedClassCode} was not found.`);
  const [students, subjects, user, existingDemoSessions] = await Promise.all([
    Student.findAll({
      where: { active: true, AcademicClassId: academicClass.id },
      order: [["id", "ASC"]],
    }),
    ClassSubject.findAll({
      where: { active: true, AcademicClassId: academicClass.id },
      include: [{ model: Subject, where: { active: true } }],
      order: [[Subject, "name", "ASC"]],
    }).then((rows) => rows.map((row) => row.Subject)),
    User.findOne({
      where: { active: true },
      order: [
        ["role", "ASC"],
        ["id", "ASC"],
      ],
    }),
    AttendanceSession.count({
      where: { reason: DEMO_REASON, AcademicClassId: academicClass.id },
    }),
  ]);

  if (!students.length)
    throw new Error(
      "No active students exist. Import students before generating demo attendance.",
    );
  if (!subjects.length)
    throw new Error(
      "No active subjects exist. Seed subjects before generating demo attendance.",
    );
  if (!user)
    throw new Error(
      "No active ADMIN or CR account exists to own the demo records.",
    );
  if (existingDemoSessions) {
    throw new Error(
      `${existingDemoSessions} generated demo session(s) already exist. Restore the clean backup before generating another set.`,
    );
  }

  const dates = demoDates(requestedSessions);
  const totals = { PRESENT: 0, LATE: 0, ABSENT: 0 };

  await sequelize.transaction(async (transaction) => {
    for (let index = 0; index < dates.length; index += 1) {
      const date = dates[index];
      const subject = subjects[index % subjects.length];
      const openedAt = date.set({ hour: 9, minute: 55 }).toJSDate();
      const closedAt = date.set({ hour: 11, minute: 5 }).toJSDate();
      const session = await AttendanceSession.create(
        {
          SubjectId: subject.id,
          AcademicClassId: academicClass.id,
          sessionDate: date.toISODate(),
          scheduledStartTime: "10:00",
          scheduledEndTime: "11:00",
          openedAt,
          closedAt,
          status: "CLOSED",
          sessionType: "SCHEDULED",
          reason: DEMO_REASON,
          faculty: "Demo dataset",
          lateThresholdMinutes: 15,
          lateAttendanceCredit: 0,
          createdById: user.id,
          closedById: user.id,
        },
        { transaction },
      );

      const records = students.map((student) => {
        const status = statusFor(student.id, index);
        totals[status] += 1;
        return {
          AttendanceSessionId: session.id,
          StudentId: student.id,
          status,
          attendanceCredit: status === "PRESENT",
          attendanceCreditValue: status === "PRESENT" ? 1 : 0,
          markedAt: markedTime(date, status, student.id, index),
          markedById: user.id,
          method: "MANUAL",
          createdAt: openedAt,
          updatedAt: closedAt,
        };
      });
      await AttendanceRecord.bulkCreate(records, { transaction });
    }

    await AuditLog.create(
      {
        entityType: "DATABASE",
        entityId: 0,
        action: "DEMO_ATTENDANCE_GENERATED",
        newValue: JSON.stringify({
          sessions: requestedSessions,
          students: students.length,
          records: requestedSessions * students.length,
          totals,
          classId: academicClass.id,
          classCode: academicClass.code,
        }),
        reason: "Temporary analytics and student-history testing",
        UserId: user.id,
      },
      { transaction },
    );
  });

  console.log(
    `Generated ${requestedSessions} closed attendance sessions for ${academicClass.displayName}.`,
  );
  console.log(
    `Used ${students.length} existing students and ${subjects.length} active subjects.`,
  );
  console.log(
    `Created ${requestedSessions * students.length} records: ${totals.PRESENT} present, ${totals.LATE} late, ${totals.ABSENT} absent.`,
  );
  console.log("No students or users were created.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
