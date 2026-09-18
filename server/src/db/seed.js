import bcrypt from "bcryptjs";
import {
  initDatabase,
  User,
  Subject,
  Timetable,
  Setting,
} from "./index.js";

const subjects = [
  ["UI", "Understanding India"],
  ["C", "Programming with C"],
  ["MATH", "Mathematics and Statistics"],
  ["FI", "Financial Inclusion"],
  ["ICAIT", "Introduction to Computer Applications & IT"],
  ["BEN", "Bengali"],
  ["BC", "Business Communication"],
  ["ECOM", "E-Commerce"],
  ["SAN", "Sanskrit"],
  ["MENTOR", "Mentor Session"],
  ["PY", "Python Programming"],
  ["PYLAB", "Python Programming Lab"],
];
const routine = [
  [1, "09:30", "10:45", "UI"],
  [1, "11:00", "12:15", "C"],
  [1, "13:15", "14:30", "MATH"],
  [1, "14:45", "16:00", "FI"],
  [2, "09:30", "10:45", "ICAIT"],
  [2, "11:00", "12:15", "BEN"],
  [2, "13:15", "14:30", "C"],
  [2, "14:45", "16:00", "BC"],
  [3, "09:30", "10:45", "MATH"],
  [3, "11:00", "12:15", "ECOM"],
  [3, "13:15", "14:30", "SAN"],
  [3, "14:45", "16:00", "PY"],
  [4, "09:30", "10:45", "FI"],
  [4, "11:00", "12:15", "ICAIT"],
  [4, "13:15", "14:30", "PYLAB"],
  [4, "14:45", "16:00", "PYLAB"],
  [5, "09:30", "10:45", "BC"],
  [5, "11:00", "12:15", "MENTOR"],
  [5, "13:15", "14:30", "PY"],
  [5, "14:45", "16:00", "ECOM"],
];

export async function seed() {
  await initDatabase();
  const adminHash = await bcrypt.hash("Admin@123", 12),
    crHash = await bcrypt.hash("CR@12345", 12);
  await User.findOrCreate({
    where: { email: "admin@attendx.local" },
    defaults: {
      name: "AttendX Administrator",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  await User.findOrCreate({
    where: { email: "cr@attendx.local" },
    defaults: {
      name: "Class Representative",
      passwordHash: crHash,
      role: "CR",
    },
  });
  const subjectMap = {};
  for (const [code, name] of subjects) {
    const [subject] = await Subject.findOrCreate({
      where: { code },
      defaults: { name },
    });
    subjectMap[code] = subject;
  }
  if ((await Timetable.count()) === 0)
    for (const [dayOfWeek, startTime, endTime, code] of routine)
      await Timetable.create({
        dayOfWeek,
        startTime,
        endTime,
        SubjectId: subjectMap[code].id,
        faculty: null,
      });
  const settings = {
    lateThresholdMinutes: 15,
    institutionName: "EIILM Kolkata",
    className: "Semester I",
    academicSession: "2026–27",
    timezone: "Asia/Kolkata",
    crCanCorrectRecent: true,
  };
  for (const [key, value] of Object.entries(settings))
    await Setting.findOrCreate({
      where: { key },
      defaults: { value: JSON.stringify(value) },
    });
  console.log(
    "AttendX seed complete: subjects, timetable, settings and local test accounts. No students were created.",
  );
}

if (process.argv[1]?.endsWith("seed.js"))
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
