import { DataTypes } from "sequelize";

export const migration004 = {
  id: "004-session-late-mode",
  async up({ queryInterface, transaction }) {
    const columns = await queryInterface.describeTable("attendance_sessions");
    if (!columns.late_mode_enabled)
      await queryInterface.addColumn(
        "attendance_sessions",
        "late_mode_enabled",
        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        { transaction },
      );
  },
};
