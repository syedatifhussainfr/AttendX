import { Op } from "sequelize";
import { sequelize, Student, AuditLog } from "../db/index.js";
import {
  compareRollNumbers,
  normalizeRollNumber,
} from "../utils/rollNumber.js";

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

export async function reconcileStudentRows(
  rawRows,
  { transaction, classId } = {},
) {
  const prepared = rawRows.map((raw, index) => {
    const rollNumber = normalizeRollNumber(cleanText(raw.rollNumber));
    const name = cleanText(raw.name);
    const errors = [];
    if (!rollNumber || rollNumber.length > 20)
      errors.push(
        "Roll number is required and must be 20 characters or fewer.",
      );
    if (name.length < 2)
      errors.push("Name must contain at least 2 characters.");
    return { rowNumber: raw.rowNumber || index + 2, rollNumber, name, errors };
  });
  const counts = new Map();
  for (const row of prepared)
    if (row.rollNumber)
      counts.set(row.rollNumber, (counts.get(row.rollNumber) || 0) + 1);

  const duplicateRolls = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([rollNumber, count]) => ({ rollNumber, count }))
    .sort(compareRollNumbers);
  const duplicateSet = new Set(duplicateRolls.map((item) => item.rollNumber));
  const invalidRows = prepared
    .filter((row) => row.errors.length || duplicateSet.has(row.rollNumber))
    .map((row) => ({
      ...row,
      errors: duplicateSet.has(row.rollNumber)
        ? [...row.errors, "Duplicate roll number in this CSV."]
        : row.errors,
    }));
  const validRows = prepared.filter(
    (row) => !row.errors.length && !duplicateSet.has(row.rollNumber),
  );
  const existing = await Student.findAll({
    where: classId ? { AcademicClassId: classId } : {},
    transaction,
  });
  const byRoll = new Map(
    existing.map((student) => [student.rollNumber, student]),
  );
  const incomingRolls = new Set(validRows.map((row) => row.rollNumber));
  const newStudents = [];
  const nameChanges = [];
  const unchanged = [];
  for (const row of validRows) {
    const student = byRoll.get(row.rollNumber);
    if (!student) newStudents.push(row);
    else if (student.name !== row.name)
      nameChanges.push({
        ...row,
        studentId: student.id,
        oldName: student.name,
        wasInactive: !student.active,
      });
    else
      unchanged.push({
        ...row,
        studentId: student.id,
        wasInactive: !student.active,
      });
  }
  const missingStudents = existing
    .filter(
      (student) => student.active && !incomingRolls.has(student.rollNumber),
    )
    .map((student) => ({
      id: student.id,
      rollNumber: student.rollNumber,
      name: student.name,
    }))
    .sort(compareRollNumbers);
  for (const group of [newStudents, nameChanges, unchanged])
    group.sort(compareRollNumbers);
  return {
    normalizedRows: validRows,
    newStudents,
    nameChanges,
    unchanged,
    duplicateRolls,
    invalidRows,
    missingStudents,
    canApply: invalidRows.length === 0 && validRows.length > 0,
    summary: {
      received: rawRows.length,
      valid: validRows.length,
      new: newStudents.length,
      changed: nameChanges.length,
      unchanged: unchanged.length,
      invalid: invalidRows.length,
      missing: missingStudents.length,
    },
  };
}

export async function applyStudentImport({
  rawRows,
  missingAction,
  userId,
  classId,
}) {
  return sequelize.transaction(async (transaction) => {
    const review = await reconcileStudentRows(rawRows, {
      transaction,
      classId,
    });
    if (!review.canApply) {
      const error = new Error(
        "Resolve duplicate or invalid CSV rows before importing.",
      );
      error.status = 400;
      error.details = review;
      throw error;
    }

    for (const item of review.newStudents) {
      const student = await Student.create(
        {
          rollNumber: item.rollNumber,
          name: item.name,
          active: true,
          ...(classId && { AcademicClassId: classId }),
        },
        { transaction },
      );
      await AuditLog.create(
        {
          entityType: "STUDENT",
          entityId: student.id,
          action: "STUDENT_IMPORTED",
          newValue: JSON.stringify({
            rollNumber: student.rollNumber,
            name: student.name,
          }),
          UserId: userId,
          StudentId: student.id,
        },
        { transaction },
      );
    }
    for (const item of [...review.nameChanges, ...review.unchanged]) {
      const student = await Student.findByPk(item.studentId, { transaction });
      const updates = { active: true };
      if (student.name !== item.name) updates.name = item.name;
      const oldValue = { name: student.name, active: student.active };
      await student.update(updates, { transaction });
      if (student.name !== oldValue.name || !oldValue.active)
        await AuditLog.create(
          {
            entityType: "STUDENT",
            entityId: student.id,
            action:
              student.name !== oldValue.name
                ? "STUDENT_IMPORT_UPDATED"
                : "STUDENT_REACTIVATED",
            oldValue: JSON.stringify(oldValue),
            newValue: JSON.stringify({
              name: student.name,
              active: student.active,
            }),
            UserId: userId,
            StudentId: student.id,
          },
          { transaction },
        );
    }
    let deactivated = 0;
    if (missingAction === "DEACTIVATE" && review.missingStudents.length) {
      const ids = review.missingStudents.map((student) => student.id);
      await Student.update(
        { active: false },
        { where: { id: { [Op.in]: ids } }, transaction },
      );
      for (const student of review.missingStudents)
        await AuditLog.create(
          {
            entityType: "STUDENT",
            entityId: student.id,
            action: "STUDENT_DEACTIVATED_BY_IMPORT",
            oldValue: JSON.stringify({ active: true }),
            newValue: JSON.stringify({ active: false }),
            UserId: userId,
            StudentId: student.id,
          },
          { transaction },
        );
      deactivated = ids.length;
    }
    return {
      added: review.newStudents.length,
      updated: review.nameChanges.length,
      reactivated: [...review.nameChanges, ...review.unchanged].filter(
        (item) => item.wasInactive,
      ).length,
      unchanged: review.unchanged.length,
      deactivated,
    };
  });
}
