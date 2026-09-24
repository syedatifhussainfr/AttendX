import { DataTypes } from "sequelize";
import { migration001 } from "./migrations/001-v1-1-core.js";
import { migration002 } from "./migrations/002-auth-sessions.js";
import { migration003 } from "./migrations/003-admin-plus.js";
import { migration004 } from "./migrations/004-late-mode.js";
import { migration005 } from "./migrations/005-normalize-sqlite-timestamps.js";
import { migration006 } from "./migrations/006-student-profile.js";
import { migration007 } from "./migrations/007-late-attendance-credit.js";
import { migration008 } from "./migrations/008-academic-classes.js";
import { migration009 } from "./migrations/009-class-ownership.js";
import { migration010 } from "./migrations/010-attendance-record-ownership.js";
import { migration011 } from "./migrations/011-subject-course-category.js";
import { migration012 } from "./migrations/012-institution-branding.js";
import { migration013 } from "./migrations/013-remove-legacy-class-settings.js";

const migrations = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
];

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
