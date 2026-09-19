import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  jwtSecret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production"
      ? ""
      : "attendx-local-development-secret-change-me"),
  jwtIssuer: process.env.JWT_ISSUER || "attendx",
  jwtAudience: process.env.JWT_AUDIENCE || "attendx-web",
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  refreshSessionDays: Number(process.env.REFRESH_SESSION_DAYS || 14),
  dialect: process.env.DB_DIALECT || "sqlite",
  databaseUrl: process.env.DATABASE_URL,
  sqlitePath: process.env.SQLITE_PATH || "./data/attendx.sqlite",
  backupDir: process.env.BACKUP_DIR || "./backups",
  timezone: "Asia/Kolkata",
};

if (!config.jwtSecret) throw new Error("JWT_SECRET is required in production");
if (process.env.NODE_ENV === "production" && config.jwtSecret.length < 32)
  throw new Error(
    "JWT_SECRET must contain at least 32 characters in production",
  );
if (
  !Number.isInteger(config.refreshSessionDays) ||
  config.refreshSessionDays < 1 ||
  config.refreshSessionDays > 90
)
  throw new Error("REFRESH_SESSION_DAYS must be an integer between 1 and 90");
