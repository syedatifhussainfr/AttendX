let databaseMaintenance = false;

export const isDatabaseMaintenanceActive = () => databaseMaintenance;

export function beginDatabaseMaintenance() {
  if (databaseMaintenance) {
    const error = new Error("A database maintenance operation is already running.");
    error.status = 409;
    error.code = "DATABASE_MAINTENANCE_ACTIVE";
    throw error;
  }
  databaseMaintenance = true;
}

export function endDatabaseMaintenance() {
  databaseMaintenance = false;
}

export function databaseMaintenanceGuard(req, res, next) {
  if (!databaseMaintenance) return next();
  return res.status(503).json({
    code: "DATABASE_RESTORE_IN_PROGRESS",
    message: "AttendX is applying a verified database restore. Try again shortly.",
  });
}
