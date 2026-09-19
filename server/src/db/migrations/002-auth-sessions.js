import { DataTypes } from "sequelize";

export const migration002 = {
  id: "002-secure-auth-sessions",
  async up({ queryInterface, transaction }) {
    const tables = (await queryInterface.showAllTables()).map((table) =>
      typeof table === "string"
        ? table.toLowerCase()
        : String(table.tableName || table.name).toLowerCase(),
    );
    if (!tables.includes("auth_sessions")) {
      await queryInterface.createTable(
        "auth_sessions",
        {
          id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
          current_token_hash: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true,
          },
          token_history: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: "[]",
          },
          generation: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          user_agent: {
            type: DataTypes.STRING(300),
            allowNull: false,
            defaultValue: "Unknown device",
          },
          ip_hash: { type: DataTypes.STRING(64), allowNull: true },
          last_used_at: { type: DataTypes.DATE, allowNull: false },
          expires_at: { type: DataTypes.DATE, allowNull: false },
          revoked_at: { type: DataTypes.DATE, allowNull: true },
          user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "users", key: "id" },
            onDelete: "CASCADE",
          },
          created_at: { type: DataTypes.DATE, allowNull: false },
          updated_at: { type: DataTypes.DATE, allowNull: false },
        },
        { transaction },
      );
    }
  },
};
