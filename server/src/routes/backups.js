import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  requireAdminElevation,
  requireAdminPlus,
  requireAuth,
  requirePermission,
} from "../middleware/auth.js";
import { User, AuditLog } from "../db/index.js";
import {
  backupPath,
  backupDirectory,
  createBackup,
  deleteBackup,
  listBackups,
  restoreStagedBackup,
  stageUploadedBackupFile,
} from "../services/backupService.js";
import { scheduleApiRestart } from "../services/apiRestartService.js";
import {
  beginDatabaseMaintenance,
  endDatabaseMaintenance,
} from "../services/databaseMaintenanceService.js";

const router = Router();
const SECURE_RESTORE_WINDOW_MS = 10_000;
const restoreLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `restore-${req.user.id}`,
  message: { message: "Too many restore uploads. Try again in 15 minutes." },
});
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) =>
      fs.mkdir(backupDirectory(), { recursive: true }, (error) =>
        callback(error, backupDirectory()),
      ),
    filename: (req, file, callback) =>
      callback(null, `.restore-upload-${crypto.randomUUID()}.sqlite`),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
  fileFilter: (req, file, callback) => {
    const validName = path.extname(file.originalname).toLowerCase() === ".sqlite";
    const validMime = [
      "application/x-sqlite3",
      "application/vnd.sqlite3",
      "application/octet-stream",
    ].includes(file.mimetype);
    if (!validName || !validMime)
      return callback(
        Object.assign(
          new Error("Only AttendX .sqlite backup files are allowed."),
          { status: 415 },
        ),
      );
    callback(null, true);
  },
});

function waitForSecureRestoreCommit(res, startedAt) {
  if (process.env.NODE_ENV === "test") return Promise.resolve();
  const remaining = Math.max(
    0,
    SECURE_RESTORE_WINDOW_MS - (Date.now() - startedAt),
  );
  return new Promise((resolve, reject) => {
    let complete = false;
    const onClose = () => {
      if (complete || res.writableEnded) return;
      clearTimeout(timer);
      reject(
        Object.assign(
          new Error("Backup verification was cancelled before database replacement."),
          { status: 499, code: "UPLOAD_CANCELLED" },
        ),
      );
    };
    const timer = setTimeout(() => {
      complete = true;
      res.off("close", onClose);
      resolve();
    }, remaining);
    res.once("close", onClose);
  });
}
router.use(requireAuth);
router.use(requireAdminPlus, requireAdminElevation);

router.get("/", requirePermission("backups.view"), async (req, res) =>
  res.json(await listBackups()),
);
router.post("/", requirePermission("backups.create"), async (req, res) => {
  const backup = await createBackup({ label: "manual" });
  await AuditLog.create({
    entityType: "DATABASE",
    entityId: 0,
    action: "DATABASE_BACKUP_CREATED",
    newValue: JSON.stringify({ filename: backup.filename, size: backup.size }),
    UserId: req.user.id,
  });
  res.status(201).json(backup);
});
router.get(
  "/:filename/download",
  requirePermission("backups.download"),
  async (req, res, next) => {
    try {
      res.download(backupPath(req.params.filename), req.params.filename);
    } catch (error) {
      next(error);
    }
  },
);
router.delete(
  "/:filename",
  requirePermission("backups.delete"),
  requireAdminPlus,
  requireAdminElevation,
  async (req, res) => {
    const { confirmation, reason } = z
      .object({
        confirmation: z.literal("DELETE BACKUP"),
        reason: z.string().trim().min(5).max(250),
      })
      .parse(req.body);
    const removed = await deleteBackup(req.params.filename);
    await AuditLog.create({
      entityType: "DATABASE_BACKUP",
      entityId: 0,
      action: "DATABASE_BACKUP_DELETED",
      oldValue: JSON.stringify(removed),
      reason,
      UserId: req.user.id,
    });
    res.status(204).end();
  },
);
router.post(
  "/restore",
  requirePermission("backups.restore"),
  restoreLimiter,
  (req, res, next) => {
    req.restoreUploadStartedAt = Date.now();
    next();
  },
  upload.single("backup"),
  async (req, res, next) => {
    try {
      const data = z
        .object({
          password: z.string().min(1),
          confirmation: z.literal("RESTORE ATTENDX"),
        })
        .parse(req.body);
      if (!req.file)
        return res
          .status(400)
          .json({ message: "Choose a SQLite backup file." });
      const user = await User.findByPk(req.user.id);
      if (!(await bcrypt.compare(data.password, user.passwordHash)))
        return res
          .status(400)
          .json({ message: "Administrator password is incorrect." });
      const staged = await stageUploadedBackupFile(req.file.path);
      await waitForSecureRestoreCommit(res, req.restoreUploadStartedAt);
      beginDatabaseMaintenance();
      let result;
      try {
        result = await restoreStagedBackup({
          stagedPath: staged.stagedPath,
          userId: user.id,
          sourceName: req.file.originalname,
        });
      } finally {
        endDatabaseMaintenance();
      }
      res.json({
        message:
          "Database restored and reopened safely. Sign in again to use the restored workspace.",
        validation: staged.validation,
        ...result,
      });
      if (result.restartRequired) scheduleApiRestart(0);
    } catch (error) {
      if (req.file?.path)
        await fs.promises.rm(req.file.path, { force: true }).catch(() => {});
      if (error.restartRequired) scheduleApiRestart(1);
      next(error);
    }
  },
);

export default router;
