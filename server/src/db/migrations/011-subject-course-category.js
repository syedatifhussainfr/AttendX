import { DataTypes } from "sequelize";

export const migration011 = {
  id: "011-subject-course-category",
  async up({ queryInterface, transaction }) {
    const columns = await queryInterface.describeTable("subjects");
    if (!columns.course_category)
      await queryInterface.addColumn(
        "subjects",
        "course_category",
        {
          type: DataTypes.STRING(100),
          allowNull: false,
          defaultValue: "BCA",
        },
        { transaction },
      );
  },
};
