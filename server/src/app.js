import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import attendanceRoutes from "./routes/attendance.js";
import adminRoutes from "./routes/admin.js";
import backupRoutes from "./routes/backups.js";
import { errorHandler, notFound } from "./middleware/error.js";

export const app = express();
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet());
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (req, res) =>
  res.json({ ok: true, serverTime: new Date().toISOString() }),
);
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/backups", backupRoutes);
app.use(notFound);
app.use(errorHandler);
