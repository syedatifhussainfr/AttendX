import { DataTypes } from "sequelize";

export const migration003 = {
  id: "003-admin-plus-security",
  async up({ queryInterface, transaction }) {
    const columns = await queryInterface.describeTable("users");
    if (!columns.admin_plus)
      await queryInterface.addColumn(
        "users",
        "admin_plus",
        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        { transaction },
      );
    if (!columns.phone_number)
      await queryInterface.addColumn(
        "users",
        "phone_number",
        { type: DataTypes.STRING(20), allowNull: true },
        { transaction },
      );

    const indexes = await queryInterface.showIndex("users");
    if (!indexes.some((index) => index.name === "users_phone_number_unique"))
      await queryInterface.addIndex("users", ["phone_number"], {
        name: "users_phone_number_unique",
        unique: true,
        transaction,
      });
  },
};
