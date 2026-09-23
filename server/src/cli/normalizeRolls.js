import { initDatabase, sequelize, Student } from "../db/index.js";
import { normalizeRollNumber } from "../utils/rollNumber.js";

try {
  await initDatabase();
  const students = await Student.findAll();
  const changes = students
    .map((student) => ({
      student,
      oldRoll: student.rollNumber,
      newRoll: normalizeRollNumber(student.rollNumber),
    }))
    .filter(({ oldRoll, newRoll }) => oldRoll !== newRoll);

  const finalRolls = new Map();
  for (const student of students) {
    const normalized = normalizeRollNumber(student.rollNumber);
    const classRoll = `${student.AcademicClassId}:${normalized}`;
    if (finalRolls.has(classRoll)) {
      throw new Error(
        `Cannot normalize class ${student.AcademicClassId}: ${student.rollNumber} conflicts with ${finalRolls.get(classRoll)}.`,
      );
    }
    finalRolls.set(classRoll, student.rollNumber);
  }

  await sequelize.transaction(async (transaction) => {
    for (const { student, newRoll } of changes) {
      await student.update({ rollNumber: newRoll }, { transaction });
    }
  });

  console.log(`Normalized ${changes.length} roll number(s).`);
  for (const { oldRoll, newRoll } of changes)
    console.log(`  ${oldRoll} -> ${newRoll}`);
} catch (error) {
  console.error(`Could not normalize roll numbers: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
