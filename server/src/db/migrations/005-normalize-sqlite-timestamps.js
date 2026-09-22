export const migration005 = {
  id: "005-normalize-sqlite-timestamps",
  async up({ queryInterface, transaction }) {
    if (queryInterface.sequelize.getDialect() !== "sqlite") return;

    for (const table of ["audit_logs", "auth_sessions"]) {
      const tables = await queryInterface.showAllTables({ transaction });
      if (!tables.includes(table)) continue;
      const columns = await queryInterface.describeTable(table);
      for (const column of ["created_at", "updated_at", "revoked_at"]) {
        if (!columns[column]) continue;
        await queryInterface.sequelize.query(
          `UPDATE \`${table}\`
             SET \`${column}\` = replace(replace(\`${column}\`, 'T', ' '), 'Z', ' +00:00')
           WHERE \`${column}\` LIKE '%T%Z'`,
          { transaction },
        );
      }
    }
  },
};
