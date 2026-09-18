import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  jwtSecret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production"
      ? ""
      : "attendx-local-development-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  dialect: process.env.DB_DIALECT || "sqlite",
  databaseUrl: process.env.DATABASE_URL,
  sqlitePath: process.env.SQLITE_PATH || "./data/attendx.sqlite",
  timezone: "Asia/Kolkata",
};

if (!config.jwtSecret) throw new Error("JWT_SECRET is required in production");
