import { DataTypes } from "sequelize";

export const migration012 = {
  id: "012-institution-branding",
  async up({ queryInterface, transaction }) {
    const tables = await queryInterface.showAllTables({ transaction });
    const names = new Set(tables.map((table) => String(table).toLowerCase()));
    if (names.has("branding_assets")) return;
    await queryInterface.createTable(
      "branding_assets",
      {
        slot: {
          type: DataTypes.STRING(20),
          allowNull: false,
          primaryKey: true,
        },
        mime_type: { type: DataTypes.STRING(40), allowNull: false },
        original_name: { type: DataTypes.STRING(180), allowNull: false },
        byte_size: { type: DataTypes.INTEGER, allowNull: false },
        width: { type: DataTypes.INTEGER, allowNull: false },
        height: { type: DataTypes.INTEGER, allowNull: false },
        checksum: { type: DataTypes.STRING(64), allowNull: false },
        data: { type: DataTypes.BLOB("long"), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      },
      { transaction },
    );
  },
};
