import { Op } from "sequelize";
import {
  AcademicClass,
  ClassAssignment,
  ClassSubject,
  Student,
  Subject,
  Timetable,
  User,
} from "../db/index.js";

export const isInstitutionAdmin = (user) => user?.role === "ADMIN";

export async function accessibleClassIds(user) {
  if (isInstitutionAdmin(user))
    return (await AcademicClass.findAll({ attributes: ["id"] })).map(
      (row) => row.id,
    );
  return (
    await ClassAssignment.findAll({
      where: { UserId: user.id },
      attributes: ["AcademicClassId"],
    })
  ).map((row) => row.AcademicClassId);
}

export async function assertClassAccess(
  user,
  classId,
  { manage = false } = {},
) {
  const id = Number(classId);
  if (!Number.isInteger(id) || id < 1) {
    const error = new Error("Choose a valid class.");
    error.status = 400;
    error.code = "CLASS_REQUIRED";
    throw error;
  }
  const academicClass = await AcademicClass.findByPk(id);
  if (!academicClass) {
    const error = new Error("Class not found.");
    error.status = 404;
    throw error;
  }
  if (isInstitutionAdmin(user)) return academicClass;
  const assignment = await ClassAssignment.findOne({
    where: { AcademicClassId: id, UserId: user.id },
  });
  const allowed =
    assignment &&
    (!manage ||
      (user.role === "FACULTY" &&
        ["MENTOR", "FACULTY"].includes(assignment.assignmentRole)));
  if (!allowed) {
    const error = new Error(
      manage
        ? "Faculty or mentor access to this class is required."
        : "You are not assigned to this class.",
    );
    error.status = 403;
    error.code = "CLASS_ACCESS_REQUIRED";
    throw error;
  }
  return academicClass;
}

export async function resolveClassId(user, requestedClassId) {
  if (requestedClassId != null && requestedClassId !== "") {
    const academicClass = await assertClassAccess(user, requestedClassId);
    return academicClass.id;
  }
  const ids = await accessibleClassIds(user);
  if (ids.length === 1) return ids[0];
  const migratedDefault = await AcademicClass.findOne({
    where: {
      id: { [Op.in]: ids },
      code: "ANASUYA-BCA-AI-3B-UG",
    },
  });
  if (migratedDefault) return migratedDefault.id;
  const error = new Error("Choose a class before continuing.");
  error.status = 400;
  error.code = "CLASS_REQUIRED";
  throw error;
}

export async function classDirectory(user) {
  const ids = await accessibleClassIds(user);
  if (!ids.length) return [];
  const classes = await AcademicClass.findAll({
    where: { id: { [Op.in]: ids } },
    include: [
      {
        model: ClassAssignment,
        include: [{ model: User, attributes: ["id", "name", "email", "role"] }],
      },
      {
        model: ClassSubject,
        where: { active: true },
        required: false,
        include: [
          { model: Subject, attributes: ["id", "code", "name", "active"] },
        ],
      },
    ],
    order: [["displayName", "ASC"]],
  });
  const counts = await Promise.all(
    classes.map(async (academicClass) => ({
      studentCount: await Student.count({
        where: { AcademicClassId: academicClass.id, active: true },
      }),
      timetableCount: await Timetable.count({
        where: { AcademicClassId: academicClass.id, active: true },
      }),
    })),
  );
  return classes.map((academicClass, index) => {
    const value = academicClass.toJSON();
    const assignments = value.ClassAssignments || [];
    return {
      ...value,
      assignments,
      mentor:
        assignments.find((row) => row.assignmentRole === "MENTOR")?.User ||
        null,
      subjects: (value.ClassSubjects || [])
        .map((row) => row.Subject)
        .filter(Boolean),
      ...counts[index],
    };
  });
}
