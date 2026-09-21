import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const children = [];
let stopping = false;
let startupComplete = false;
const startupOutput = [];
const colorEnabled = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);

const ansi = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
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

function writeLabeledLine(label, line, target) {
  const prefix = paint(`[${label}]`, ...(labelStyle[label] || []));
  target.write(line ? `${prefix} ${line}\n` : "\n");
}

function flushStartupOutput({ all = false } = {}) {
  for (const item of startupOutput) {
    const important =
      item.target === process.stderr ||
      /\b(config|warn|error|failed)\b/i.test(item.line);
    if (all || important)
      writeLabeledLine(item.label, item.line, item.target);
  }
  startupOutput.length = 0;
}

function pipeWithLabel(stream, label, target) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const lines = `${pending}${chunk}`.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) {
      if (startupComplete) writeLabeledLine(label, line, target);
      else startupOutput.push({ label, line, target });
    }
  });
  stream.on("end", () => {
    if (pending) {
      if (startupComplete) writeLabeledLine(label, pending, target);
      else startupOutput.push({ label, line: pending, target });
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
    if (!startupComplete) flushStartupOutput({ all: true });
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    process.stderr.write(
      `${paint(`[${label}]`, ansi.bold, ansi.red)} Development process exited with ${reason}.\n`,
    );
    shutdown(code || 1);
  });
  return child;
}

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForUrl(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(900),
      });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await pause(150);
  }
  throw new Error(
    `Timed out waiting for ${url}${lastError ? ` (${lastError.message})` : ""}`,
  );
}

function startSpinner(initialMessage) {
  const frames = ["◐", "◓", "◑", "◒"];
  let message = initialMessage;
  let frame = 0;
  let width = 0;
  const render = () => {
    const value = `  ${paint(frames[frame++ % frames.length], ansi.bold, ansi.cyan)}  ${message}`;
    width = Math.max(width, message.length + 5);
    process.stdout.write(`\r${value}${" ".repeat(Math.max(0, width - message.length - 5))}`);
  };
  if (!colorEnabled) process.stdout.write(`  ◆  ${message}\n`);
  else render();
  const timer = colorEnabled ? setInterval(render, 90) : null;
  return {
    update(nextMessage) {
      message = nextMessage;
      if (colorEnabled) render();
      else process.stdout.write(`  ◆  ${message}\n`);
    },
    done(finalMessage) {
      if (timer) clearInterval(timer);
      if (colorEnabled)
        process.stdout.write(
          `\r${" ".repeat(width + 8)}\r  ${paint("✓", ansi.bold, ansi.green)}  ${finalMessage}\n`,
        );
      else process.stdout.write(`  ✓  ${finalMessage}\n`);
    },
    fail(finalMessage) {
      if (timer) clearInterval(timer);
      if (colorEnabled)
        process.stderr.write(
          `\r${" ".repeat(width + 8)}\r  ${paint("✕", ansi.bold, ansi.red)}  ${finalMessage}\n`,
        );
      else process.stderr.write(`  ✕  ${finalMessage}\n`);
    },
  };
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
  process.stdout.write(
    `${paint("✓ AttendX stopped cleanly.", ansi.bold, ansi.green)}\n`,
  );
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function startDevelopment() {
  process.stdout.write("\n");
  let activeSpinner = startSpinner(
    "Initialising secure configuration and database…",
  );
  run("API", join(root, "server"), ["--watch-path=src", "src/index.js"]);
  try {
    await pause(350);
    activeSpinner.update("Connecting to AttendX API health check…");
    await waitForUrl("http://127.0.0.1:4000/api/health");
    activeSpinner.done("API initialised and running");

    activeSpinner = startSpinner("Starting the AttendX web interface…");
    run("WEB", join(root, "client"), [
      join(root, "node_modules", "vite", "bin", "vite.js"),
      "--strictPort",
    ]);
    await waitForUrl("http://localhost:5173");
    activeSpinner.done("Web interface ready");

    startupComplete = true;
    writeWelcome();
    flushStartupOutput();
  } catch (error) {
    activeSpinner.fail(`AttendX could not start: ${error.message}`);
    flushStartupOutput({ all: true });
    shutdown(1);
  }
}

startDevelopment();
