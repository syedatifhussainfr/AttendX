import { watch } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const serverDirectory = join(root, "server");
const sourceDirectory = join(serverDirectory, "src");
const entryFile = join(sourceDirectory, "index.js");
const RESTORE_RESTART_CODE = 75;

let application = null;
let restartTimer = null;
let stopping = false;
let sourceRestartPending = false;

function stopApplication() {
  if (!application?.pid || application.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(application.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else application.kill("SIGTERM");
}

function scheduleLaunch(delayMs = 120) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(launchApplication, delayMs);
}

function launchApplication() {
  if (stopping || application) return;
  application = spawn(process.execPath, [entryFile], {
    cwd: serverDirectory,
    env: { ...process.env, ATTENDX_DEV_SUPERVISED: "1" },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  application.on("error", (error) => {
    console.error(`AttendX API failed to start: ${error.message}`);
  });

  application.on("exit", (code, signal) => {
    application = null;
    if (stopping) return;

    if (sourceRestartPending) {
      sourceRestartPending = false;
      scheduleLaunch();
      return;
    }

    if (code === RESTORE_RESTART_CODE) {
      console.log("Database restore complete. Relaunching AttendX API…");
      scheduleLaunch(180);
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    console.error(
      `AttendX API stopped unexpectedly (${reason}). Retrying automatically…`,
    );
    scheduleLaunch(750);
  });
}

const sourceWatcher = watch(
  sourceDirectory,
  { recursive: true },
  (eventType, filename) => {
    if (stopping || !filename || !/\.(?:js|json)$/i.test(filename)) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (!application) return scheduleLaunch(0);
      sourceRestartPending = true;
      console.log(`Change detected in '${join(sourceDirectory, filename)}'`);
      stopApplication();
    }, 120);
  },
);

function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  sourceWatcher.close();
  stopApplication();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

launchApplication();
