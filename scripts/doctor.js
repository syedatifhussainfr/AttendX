import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath;
const steps = [
  ["Configuration", ["run", "config-check"]],
  ["Timetable", ["run", "timetable-check"]],
  ["Database", ["run", "verify-data"]],
  ["Tests", ["test"]],
  ["Frontend build", ["run", "build"]],
];

console.log("\n◆ AttendX doctor · full safety check");
console.log("═".repeat(52));
for (const [label, args] of steps) {
  console.log(`\n› ${label}`);
  const result = spawnSync(
    npmCli ? process.execPath : npm,
    npmCli ? [npmCli, ...args] : args,
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
    },
  );
  if (result.status !== 0) {
    if (result.error) console.error(`  ${result.error.message}`);
    console.error(`\n✗ AttendX doctor stopped at ${label}.`);
    process.exit(result.status || 1);
  }
}
console.log(
  "\n✓ AttendX passed configuration, timetable, data, tests, and build.\n",
);
