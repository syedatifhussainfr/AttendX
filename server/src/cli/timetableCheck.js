import {
  ClassSubject,
  initDatabase,
  sequelize,
  Timetable,
  Subject,
} from "../db/index.js";
import { schedulesOverlap, validateScheduleWindow } from "../utils/schedule.js";

try {
  await initDatabase();
  const [rows, subjectLinks] = await Promise.all([
    Timetable.findAll({
      include: [Subject],
      order: [
        ["AcademicClassId", "ASC"],
        ["dayOfWeek", "ASC"],
        ["startTime", "ASC"],
      ],
    }),
    ClassSubject.findAll({ where: { active: true } }),
  ]);
  const assignedSubjects = new Set(
    subjectLinks.map((row) => `${row.AcademicClassId}:${row.SubjectId}`),
  );
  const issues = [];
  for (const row of rows) {
    const windowError = validateScheduleWindow(row.startTime, row.endTime);
    if (windowError) issues.push(`#${row.id}: ${windowError}`);
    if (!row.Subject) issues.push(`#${row.id}: referenced subject is missing.`);
    else if (!row.Subject.active && row.active)
      issues.push(
        `#${row.id}: active entry uses inactive subject ${row.Subject.code}.`,
      );
    if (
      row.active &&
      !assignedSubjects.has(`${row.AcademicClassId}:${row.SubjectId}`)
    )
      issues.push(
        `#${row.id}: subject ${row.Subject?.code || row.SubjectId} is not assigned to class ${row.AcademicClassId}.`,
      );
  }
  for (let index = 0; index < rows.length; index += 1)
    for (let other = index + 1; other < rows.length; other += 1) {
      const left = rows[index];
      const right = rows[other];
      if (
        left.active &&
        right.active &&
        left.AcademicClassId === right.AcademicClassId &&
        left.dayOfWeek === right.dayOfWeek &&
        schedulesOverlap(
          left.startTime,
          left.endTime,
          right.startTime,
          right.endTime,
        )
      )
        issues.push(
          `#${left.id} overlaps #${right.id} in class ${left.AcademicClassId} on weekday ${left.dayOfWeek}.`,
        );
    }

  console.log("\nAttendX timetable verification");
  console.log("─".repeat(44));
  console.log(`Entries checked: ${rows.length}`);
  if (issues.length) {
    for (const issue of issues) console.error(`  ✗ ${issue}`);
    throw new Error(`${issues.length} timetable issue(s) found.`);
  }
  console.log("✓ Times, subjects, and overlaps are valid.\n");
} catch (error) {
  console.error(`Timetable verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
