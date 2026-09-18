import ExcelJS from "exceljs";
import { Op } from "sequelize";
import {
  AttendanceSession,
  AttendanceRecord,
  Student,
  Subject,
} from "../db/index.js";
import { compareRollNumbers } from "../utils/rollNumber.js";

export async function buildAttendanceWorkbook({
  sessionId,
  from,
  to,
  subjectId,
}) {
  const where = {};
  if (sessionId) where.id = sessionId;
  if (from || to)
    where.sessionDate = {
      ...(from && { [Op.gte]: from }),
      ...(to && { [Op.lte]: to }),
    };
  if (subjectId) where.SubjectId = subjectId;
  const sessions = await AttendanceSession.findAll({
    where,
    order: [
      ["sessionDate", "ASC"],
      ["scheduledStartTime", "ASC"],
    ],
    include: [Subject, { model: AttendanceRecord, include: [Student] }],
  });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AttendX";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Attendance", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    ["Date", 13],
    ["Subject", 36],
    ["Roll", 10],
    ["Student", 28],
    ["Status", 12],
    ["Credit", 10],
    ["Attendance Time", 23],
  ].map(([header, width]) => ({
    header,
    key: header.toLowerCase().replaceAll(" ", "_"),
    width,
  }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B3B68" },
  };
  for (const session of sessions)
    for (const record of [...session.AttendanceRecords].sort((a, b) =>
      compareRollNumbers(a.Student, b.Student),
    ))
      sheet.addRow({
        date: session.sessionDate,
        subject: session.Subject.name,
        roll: record.Student.rollNumber,
        student: record.Student.name,
        status: record.status[0],
        credit: record.attendanceCredit ? 1 : 0,
        attendance_time: record.markedAt,
      });
  sheet.autoFilter = { from: "A1", to: "G1" };
  sheet.getColumn("attendance_time").numFmt = "dd-mmm-yyyy hh:mm:ss";
  return workbook;
}
