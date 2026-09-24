import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const restartTriggerPath = fileURLToPath(new URL("../index.js", import.meta.url));

export function restartStrategy(environment = process.env) {
  if (environment.NODE_ENV === "test") return "disabled";
  return environment.ATTENDX_DEV_WATCH === "1" ? "watch-trigger" : "exit";
}

export async function restartApiProcess(exitCode = 0) {
  const strategy = restartStrategy();
  if (strategy === "disabled") return;

  if (strategy === "watch-trigger") {
    try {
      const now = new Date();
      await fs.utimes(restartTriggerPath, now, now);
      console.log("AttendX API restart requested after database restore.");
      return;
    } catch (error) {
      console.error(
        `Could not signal the development watcher; exiting instead: ${error.message}`,
      );
    }
  }

  process.exit(exitCode);
}

export function scheduleApiRestart(exitCode = 0, delayMs = 750) {
  if (restartStrategy() === "disabled") return null;
  return setTimeout(() => void restartApiProcess(exitCode), delayMs);
}
