import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const children = [];
let stopping = false;
const colorEnabled = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);

const ansi = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  white: "\u001b[37m",
};

const paint = (value, ...styles) =>
  colorEnabled ? `${styles.join("")}${value}${ansi.reset}` : value;

const labelStyle = {
  API: [ansi.bold, ansi.blue],
  WEB: [ansi.bold, ansi.cyan],
};

function writeWelcome() {
  const title = paint("AttendX", ansi.bold, ansi.white);
  const version = paint("V1.1.6 development", ansi.cyan);
  const line = paint("─".repeat(48), ansi.dim, ansi.blue);
  process.stdout.write(`\n${line}\n`);
  process.stdout.write(`  ${paint("◆", ansi.blue)}  ${title}  ${version}\n`);
  process.stdout.write(`${line}\n`);
  process.stdout.write(
    `  ${paint("API", ansi.bold, ansi.blue)}  http://localhost:4000\n`,
  );
  process.stdout.write(
    `  ${paint("WEB", ansi.bold, ansi.cyan)}  http://localhost:5173\n`,
  );
  process.stdout.write(
    `  ${paint("TIP", ansi.bold, ansi.yellow)}  Press Ctrl+C once to stop everything cleanly.\n\n`,
  );
}

function pipeWithLabel(stream, label, target) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const lines = `${pending}${chunk}`.split(/\r?\n/);
    pending = lines.pop() || "";
    const prefix = paint(`[${label}]`, ...(labelStyle[label] || []));
    for (const line of lines)
      target.write(line ? `${prefix} ${line}\n` : "\n");
  });
  stream.on("end", () => {
    if (pending) {
      const prefix = paint(`[${label}]`, ...(labelStyle[label] || []));
      target.write(`${prefix} ${pending}\n`);
    }
  });
}

function run(label, cwd, args) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: process.env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: true,
  });
  children.push({ label, child });
  pipeWithLabel(child.stdout, label, process.stdout);
  pipeWithLabel(child.stderr, label, process.stderr);
  child.on("error", (error) => {
    process.stderr.write(
      `${paint(`[${label}]`, ansi.bold, ansi.red)} Failed to start: ${error.message}\n`,
    );
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    process.stderr.write(
      `${paint(`[${label}]`, ansi.bold, ansi.red)} Development process exited with ${reason}.\n`,
    );
    shutdown(code || 1);
  });
}

function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }
  spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
}

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(
    `\n${paint("◆ Closing AttendX development servers cleanly…", ansi.bold, ansi.yellow)}\n`,
  );
  for (const { child } of children) stopChild(child);
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

writeWelcome();
run("API", join(root, "server"), ["--watch-path=src", "src/index.js"]);
run("WEB", join(root, "client"), [
  join(root, "node_modules", "vite", "bin", "vite.js"),
  "--strictPort",
]);
