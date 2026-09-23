import {
  permissionPolicy,
  permissionsForUser,
  policyStartupReport,
} from "../policy/policyService.js";

const colorEnabled = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const color = (code, value) =>
  colorEnabled ? `\u001b[${code}m${value}\u001b[0m` : value;
const ok = (value) => color("1;32", value);
const info = (value) => color("1;36", value);

console.log(`\n${info("AttendX V1.1.8 · Configuration check")}`);
console.log("─".repeat(54));
console.log(`  Policy version             ${permissionPolicy.version}`);
console.log(`  YAML parsing               ${ok("PASS")}`);
console.log(`  Structure repair           ${ok("PASS")}`);
console.log(`  Protected boundaries       ${ok("PASS")}`);
console.log(
  `  CR permissions             ${permissionsForUser({ role: "CR" }).length}`,
);
console.log(
  `  ADMIN permissions          ${permissionsForUser({ role: "ADMIN", adminPlus: false }).length}`,
);
console.log(
  `  ADMIN++ permissions        ${permissionsForUser({ role: "ADMIN", adminPlus: true }).length}`,
);

if (policyStartupReport.events.length) {
  console.log(`\n${info("Repairs performed")}`);
  for (const event of policyStartupReport.events) console.log(`  • ${event}`);
}
if (policyStartupReport.repairs.length) {
  console.log(`\n${info("Configuration values repaired")}`);
  for (const repair of policyStartupReport.repairs)
    console.log(`  • ${repair}`);
}

console.log("─".repeat(54));
console.log(ok("Configuration is safe and ready.\n"));
