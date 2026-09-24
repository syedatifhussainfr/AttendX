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
const server = app.listen(config.port, () =>
  console.log(
    `AttendX API ready at http://localhost:${config.port} · permission policy v${policyStartupReport.policy.version}`,
  ),
);

// Keep an explicit module-level reference to the HTTP server. This prevents
// newer Node runtimes from treating an otherwise unreferenced listener as
// collectible while the development supervisor is managing the process.
server.ref();
server.on("error", (error) => {
  console.error(`AttendX API listener failed: ${error.message}`);
  process.exitCode = 1;
});
