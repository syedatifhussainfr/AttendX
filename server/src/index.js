import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { config } from "./config.js";
import { initDatabase } from "./db/index.js";
import { app } from "./app.js";
import { policyStartupReport } from "./policy/policyService.js";

for (const event of policyStartupReport.events)
  console.warn(`[CONFIG] ${event}`);
for (const repair of policyStartupReport.repairs)
  console.warn(`[CONFIG] ${repair}`);

if (config.dialect === "sqlite")
  await mkdir(dirname(config.sqlitePath), { recursive: true });
await initDatabase();
app.listen(config.port, () =>
  console.log(
    `AttendX API ready at http://localhost:${config.port} · permission policy v${policyStartupReport.policy.version}`,
  ),
);
