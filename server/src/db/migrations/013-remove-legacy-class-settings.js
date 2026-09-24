export const migration013 = {
  id: "013-remove-legacy-class-settings",
  async up({ queryInterface, transaction }) {
    const tables = await queryInterface.showAllTables({ transaction });
    const names = new Set(tables.map((table) => String(table).toLowerCase()));
    if (!names.has("settings")) return;
    await queryInterface.bulkDelete(
      "settings",
      { key: ["className", "academicSession"] },
      { transaction },
    );
  },
};
