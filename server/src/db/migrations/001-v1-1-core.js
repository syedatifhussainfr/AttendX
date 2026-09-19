import { DataTypes } from "sequelize";

export const migration001 = {
  id: "001-v1.1-core-safety",
  async up({ queryInterface, transaction }) {
    const addIfMissing = async (table, column, definition) => {
      const columns = await queryInterface.describeTable(table);
      if (!columns[column])
        await queryInterface.addColumn(table, column, definition, {
          transaction,
        });
    };

    await addIfMissing("users", "must_change_password", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await addIfMissing("users", "token_version", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await addIfMissing("attendance_sessions", "scheduled_subject_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "subjects", key: "id" },
      onDelete: "SET NULL",
    });
    await addIfMissing("attendance_sessions", "reopened_at", {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await addIfMissing("attendance_sessions", "reopened_by_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
    });
    await addIfMissing("attendance_sessions", "reopen_reason", {
      type: DataTypes.STRING(250),
      allowNull: true,
    });

    await addIfMissing("attendance_records", "corrected_from_status", {
      type: DataTypes.STRING(20),
      allowNull: true,
    });
    await addIfMissing("attendance_records", "correction_reason", {
      type: DataTypes.STRING(250),
      allowNull: true,
    });
    await addIfMissing("attendance_records", "corrected_at", {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await addIfMissing("attendance_records", "corrected_by_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
    });
  },
};
