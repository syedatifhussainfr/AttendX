import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { config } from "./config.js";
import { initDatabase } from "./db/index.js";
import { app } from "./app.js";

if (config.dialect === "sqlite")
  await mkdir(dirname(config.sqlitePath), { recursive: true });
await initDatabase();
app.listen(config.port, () =>
  console.log(`AttendX API ready at http://localhost:${config.port}`),
);
