export const RESTORE_RESTART_EXIT_CODE = 75;

export function restartStrategy(environment = process.env) {
  if (environment.NODE_ENV === "test") return "disabled";
  return environment.ATTENDX_DEV_SUPERVISED === "1"
    ? "supervisor-exit"
    : "exit";
}

export async function restartApiProcess(exitCode = 0) {
  const strategy = restartStrategy();
  if (strategy === "disabled") return;

  process.exit(
    strategy === "supervisor-exit" ? RESTORE_RESTART_EXIT_CODE : exitCode,
  );
}

export function scheduleApiRestart(exitCode = 0, delayMs = 750) {
  if (restartStrategy() === "disabled") return null;
  return setTimeout(() => void restartApiProcess(exitCode), delayMs);
}
