import express from "express";
import cors from "cors";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import attendanceRoutes from "./routes/attendance.js";
import adminRoutes from "./routes/admin.js";
import { errorHandler, notFound } from "./middleware/error.js";

export const app = express();
app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (req, res) =>
  res.json({ ok: true, serverTime: new Date().toISOString() }),
);
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin", adminRoutes);
app.use(notFound);
app.use(errorHandler);
