import { initDatabase, sequelize } from "../db/index.js";
import { createBackup } from "../services/backupService.js";

try {
  await initDatabase();
  const backup = await createBackup({ label: "cli" });
  console.log(`Backup created: ${backup.filename}`);
  console.log(`Size: ${backup.size} bytes; students: ${backup.students}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
