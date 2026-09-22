import { initDatabase, sequelize } from "../db/index.js";
import { listBackups } from "../services/backupService.js";

try {
  await initDatabase();
  const rows = await listBackups();
  console.log("\nAttendX managed backups");
  console.log("─".repeat(72));
  if (!rows.length) console.log("No managed backups found.");
  for (const row of rows)
    console.log(
      `${new Date(row.createdAt).toLocaleString("en-IN")}  ${String(row.size).padStart(10)} B  ${row.filename}`,
    );
  console.log();
} catch (error) {
  console.error(`Could not list backups: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
