import { DataTypes } from "sequelize";

export const migration007 = {
  id: "007-late-attendance-credit",
  async up({ queryInterface, transaction }) {
    const sessionColumns = await queryInterface.describeTable(
      "attendance_sessions",
    );
    if (!sessionColumns.late_attendance_credit)
      await queryInterface.addColumn(
        "attendance_sessions",
        "late_attendance_credit",
        { type: DataTypes.FLOAT, allowNull: true, defaultValue: null },
        { transaction },
      );

    const recordColumns =
      await queryInterface.describeTable("attendance_records");
    if (!recordColumns.attendance_credit_value) {
      await queryInterface.addColumn(
        "attendance_records",
        "attendance_credit_value",
        { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
        { transaction },
      );
      await queryInterface.sequelize.query(
        "UPDATE attendance_records SET attendance_credit_value = CASE WHEN attendance_credit THEN 1.0 ELSE 0.0 END",
        { transaction },
      );
    }
  },
};
