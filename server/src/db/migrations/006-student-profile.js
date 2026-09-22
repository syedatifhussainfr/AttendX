import { DataTypes } from "sequelize";

export const migration006 = {
  id: "006-student-profile",
  async up({ queryInterface, transaction }) {
    const columns = await queryInterface.describeTable("students");
    const additions = [
      ["enrollment_number", { type: DataTypes.STRING(50), allowNull: true }],
      ["section", { type: DataTypes.STRING(80), allowNull: true }],
      ["phone_number", { type: DataTypes.STRING(20), allowNull: true }],
      ["guardian_phone", { type: DataTypes.STRING(20), allowNull: true }],
      ["notes", { type: DataTypes.TEXT, allowNull: true }],
      ["admission_date", { type: DataTypes.DATEONLY, allowNull: true }],
    ];
    for (const [name, definition] of additions)
      if (!columns[name])
        await queryInterface.addColumn("students", name, definition, {
          transaction,
        });

    const indexes = await queryInterface.showIndex("students");
    if (
      !indexes.some(
        (index) => index.name === "students_enrollment_number_unique",
      )
    )
      await queryInterface.addIndex("students", ["enrollment_number"], {
        name: "students_enrollment_number_unique",
        unique: true,
        transaction,
      });
  },
};
