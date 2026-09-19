import { DataTypes } from "sequelize";
import { migration001 } from "./migrations/001-v1-1-core.js";
import { migration002 } from "./migrations/002-auth-sessions.js";
import { migration003 } from "./migrations/003-admin-plus.js";

const migrations = [migration001, migration002, migration003];

export async function runMigrations(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.createTable("app_migrations", {
    id: { type: DataTypes.STRING(100), primaryKey: true },
    applied_at: { type: DataTypes.DATE, allowNull: false },
  });

  const [rows] = await sequelize.query("SELECT id FROM app_migrations");
  const applied = new Set(rows.map((row) => row.id));
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await sequelize.transaction(async (transaction) => {
      await migration.up({ queryInterface, transaction });
      await queryInterface.bulkInsert(
        "app_migrations",
        [{ id: migration.id, applied_at: new Date() }],
        { transaction },
      );
    });
  }
}
