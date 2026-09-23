import { DataTypes, QueryTypes } from "sequelize";

export const migration010 = {
  id: "010-attendance-record-ownership",
  async up({ queryInterface, transaction }) {
    const [missing] = await queryInterface.sequelize.query(
      `SELECT COUNT(*) AS count
         FROM attendance_records
        WHERE student_id IS NULL OR attendance_session_id IS NULL`,
      { type: QueryTypes.SELECT, transaction },
    );
    if (Number(missing.count))
      throw new Error(
        "Attendance records contain missing student or session ownership.",
      );

    if (queryInterface.sequelize.getDialect() === "sqlite") {
      for (const [column, label] of [
        ["student_id", "student"],
        ["attendance_session_id", "session"],
      ])
        for (const operation of ["INSERT", "UPDATE"])
          await queryInterface.sequelize.query(
            `CREATE TRIGGER IF NOT EXISTS attendance_records_require_${label}_${operation.toLowerCase()}
             BEFORE ${operation} ON attendance_records
             WHEN NEW.${column} IS NULL
             BEGIN
               SELECT RAISE(ABORT, '${column} is required');
             END`,
            { transaction },
          );
      return;
    }

    for (const column of ["student_id", "attendance_session_id"])
      await queryInterface.changeColumn(
        "attendance_records",
        column,
        { type: DataTypes.INTEGER, allowNull: false },
        { transaction },
      );
  },
};
