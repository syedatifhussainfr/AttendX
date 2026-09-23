import { DataTypes, QueryTypes } from "sequelize";

const ownedTables = ["students", "timetables", "attendance_sessions"];

async function rebuildLegacySqliteStudents(queryInterface, transaction) {
  const [definition] = await queryInterface.sequelize.query(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'students'`,
    { type: QueryTypes.SELECT, transaction },
  );
  if (!/roll_number[^,]+unique/i.test(definition?.sql || "")) return;

  await queryInterface.sequelize.query("PRAGMA defer_foreign_keys = ON", {
    transaction,
  });
  await queryInterface.sequelize.query(
    `CREATE TEMP TABLE attendx_v119_student_links AS
     SELECT id, student_id FROM attendance_records
      WHERE student_id IS NOT NULL`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `CREATE TABLE students_v119 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_number VARCHAR(20) NOT NULL,
      name VARCHAR(255) NOT NULL,
      active TINYINT(1) DEFAULT 1,
      card_token VARCHAR(255),
      photo_url VARCHAR(255),
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      enrollment_number VARCHAR(50),
      section VARCHAR(80),
      phone_number VARCHAR(20),
      guardian_phone VARCHAR(20),
      notes TEXT,
      admission_date DATE,
      academic_class_id INTEGER NOT NULL REFERENCES academic_classes(id) ON DELETE RESTRICT
    )`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `INSERT INTO students_v119
      SELECT id, roll_number, name, active, card_token, photo_url,
             created_at, updated_at, enrollment_number, section, phone_number,
             guardian_phone, notes, admission_date, academic_class_id
        FROM students`,
    { transaction },
  );
  await queryInterface.dropTable("students", { transaction });
  await queryInterface.renameTable("students_v119", "students", {
    transaction,
  });
  await queryInterface.sequelize.query(
    `UPDATE attendance_records
        SET student_id = (
          SELECT link.student_id
            FROM attendx_v119_student_links link
           WHERE link.id = attendance_records.id
        )
      WHERE id IN (SELECT id FROM attendx_v119_student_links)`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    "DROP TABLE attendx_v119_student_links",
    { transaction },
  );
  await queryInterface.addIndex("students", ["card_token"], {
    name: "students_card_token_unique",
    unique: true,
    transaction,
  });
  await queryInterface.addIndex("students", ["enrollment_number"], {
    name: "students_enrollment_number_unique",
    unique: true,
    transaction,
  });
  await queryInterface.addIndex(
    "students",
    ["academic_class_id", "roll_number"],
    { name: "students_class_roll_unique", unique: true, transaction },
  );
}

async function enforceSqliteOwnership(queryInterface, table, transaction) {
  for (const operation of ["INSERT", "UPDATE"]) {
    const trigger = `${table}_require_class_${operation.toLowerCase()}`;
    await queryInterface.sequelize.query(
      `CREATE TRIGGER IF NOT EXISTS ${trigger}
       BEFORE ${operation} ON ${table}
       WHEN NEW.academic_class_id IS NULL
       BEGIN
         SELECT RAISE(ABORT, 'academic_class_id is required');
       END`,
      { transaction },
    );
  }
}

export const migration009 = {
  id: "009-class-ownership",
  async up({ queryInterface, transaction }) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "postgres")
      await queryInterface.sequelize.query(
        'ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS \'FACULTY\'',
        { transaction },
      );

    for (const table of ownedTables) {
      const columns = await queryInterface.describeTable(table);
      if (!columns.academic_class_id)
        throw new Error(`${table} is missing academic_class_id.`);
      const [missing] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) AS count FROM ${table} WHERE academic_class_id IS NULL`,
        { type: QueryTypes.SELECT, transaction },
      );
      if (Number(missing.count))
        throw new Error(`${table} contains records without a class.`);
    }

    if (dialect === "sqlite") {
      await rebuildLegacySqliteStudents(queryInterface, transaction);
      for (const table of ownedTables)
        await enforceSqliteOwnership(queryInterface, table, transaction);
      return;
    }

    for (const table of ownedTables) {
      const columns = await queryInterface.describeTable(table);
      if (columns.academic_class_id.allowNull)
        await queryInterface.changeColumn(
          table,
          "academic_class_id",
          {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "academic_classes", key: "id" },
            onDelete: "RESTRICT",
          },
          { transaction },
        );
    }
  },
};
