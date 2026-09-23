import { DataTypes, QueryTypes } from "sequelize";

const classRows = [
  ["ANASUYA-BCA-AI-3A-UG", "ANASUYA BCA AI 3A.UG", "A"],
  ["ANASUYA-BCA-AI-3B-UG", "ANASUYA BCA AI 3B.UG", "B"],
  ["ANASUYA-BCA-AI-3C-UG", "ANASUYA BCA AI 3C.UG", "C"],
];

export const migration008 = {
  id: "008-academic-classes",
  async up({ queryInterface, transaction }) {
    const tables = new Set(
      (await queryInterface.showAllTables({ transaction })).map((table) =>
        typeof table === "string" ? table : table.tableName,
      ),
    );
    if (!tables.has("academic_classes"))
      await queryInterface.createTable(
        "academic_classes",
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          display_name: { type: DataTypes.STRING(160), allowNull: false },
          code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
          course: { type: DataTypes.STRING(100), allowNull: false },
          specialization: { type: DataTypes.STRING(120), allowNull: true },
          semester: { type: DataTypes.STRING(30), allowNull: true },
          section: { type: DataTypes.STRING(30), allowNull: true },
          academic_year: { type: DataTypes.STRING(30), allowNull: true },
          batch: { type: DataTypes.STRING(50), allowNull: true },
          active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
          created_at: { type: DataTypes.DATE, allowNull: false },
          updated_at: { type: DataTypes.DATE, allowNull: false },
        },
        { transaction },
      );
    if (!tables.has("class_assignments"))
      await queryInterface.createTable(
        "class_assignments",
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          assignment_role: { type: DataTypes.STRING(20), allowNull: false },
          academic_class_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "academic_classes", key: "id" },
            onDelete: "CASCADE",
          },
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
    if (!tables.has("class_subjects"))
      await queryInterface.createTable(
        "class_subjects",
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
          active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
          academic_class_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "academic_classes", key: "id" },
            onDelete: "CASCADE",
          },
          subject_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "subjects", key: "id" },
            onDelete: "CASCADE",
          },
          created_at: { type: DataTypes.DATE, allowNull: false },
          updated_at: { type: DataTypes.DATE, allowNull: false },
        },
        { transaction },
      );

    for (const table of ["students", "timetables", "attendance_sessions"]) {
      const columns = await queryInterface.describeTable(table);
      if (!columns.academic_class_id)
        await queryInterface.addColumn(
          table,
          "academic_class_id",
          {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: "academic_classes", key: "id" },
            onDelete: "RESTRICT",
          },
          { transaction },
        );
    }

    const now = new Date();
    for (const [code, displayName, section] of classRows)
      await queryInterface.bulkInsert(
        "academic_classes",
        [
          {
            code,
            display_name: displayName,
            course: "BCA",
            specialization: "AI",
            semester: "3",
            section,
            academic_year: null,
            batch: null,
            active: true,
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction, ignoreDuplicates: true },
      );

    const [defaultClass] = await queryInterface.sequelize.query(
      "SELECT id FROM academic_classes WHERE code = :code",
      {
        replacements: { code: "ANASUYA-BCA-AI-3B-UG" },
        type: QueryTypes.SELECT,
        transaction,
      },
    );
    if (!defaultClass) throw new Error("Default academic class was not created.");
    for (const table of ["students", "timetables", "attendance_sessions"])
      await queryInterface.sequelize.query(
        `UPDATE ${table} SET academic_class_id = :classId WHERE academic_class_id IS NULL`,
        { replacements: { classId: defaultClass.id }, transaction },
      );
    await queryInterface.changeColumn(
      "students",
      "roll_number",
      { type: DataTypes.STRING(20), allowNull: false },
      { transaction },
    );
    const studentIndexes = await queryInterface.showIndex("students", {
      transaction,
    });
    if (
      !studentIndexes.some(
        (index) => index.name === "students_class_roll_unique",
      )
    )
      await queryInterface.addIndex(
        "students",
        ["academic_class_id", "roll_number"],
        {
          name: "students_class_roll_unique",
          unique: true,
          transaction,
        },
      );
    await queryInterface.sequelize.query(
      `INSERT INTO class_subjects (active, academic_class_id, subject_id, created_at, updated_at)
       SELECT 1, :classId, s.id, :now, :now FROM subjects s
       WHERE NOT EXISTS (
         SELECT 1 FROM class_subjects cs
         WHERE cs.academic_class_id = :classId AND cs.subject_id = s.id
       )`,
      { replacements: { classId: defaultClass.id, now }, transaction },
    );
    await queryInterface.sequelize.query(
      `INSERT INTO class_assignments (assignment_role, academic_class_id, user_id, created_at, updated_at)
       SELECT 'CR', :classId, u.id, :now, :now FROM users u
       WHERE u.role = 'CR' AND NOT EXISTS (
         SELECT 1 FROM class_assignments ca
         WHERE ca.academic_class_id = :classId AND ca.user_id = u.id
       )`,
      { replacements: { classId: defaultClass.id, now }, transaction },
    );
  },
};
