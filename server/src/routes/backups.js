import { Router } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { User, AuditLog } from "../db/index.js";
import {
  backupPath,
  createBackup,
  listBackups,
  restoreStagedBackup,
  stageUploadedBackup,
} from "../services/backupService.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});
router.use(requireAuth);

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
router.post(
  "/restore",
  requirePermission("backups.restore"),
  upload.single("backup"),
  async (req, res) => {
  const data = z
    .object({
      password: z.string().min(1),
      confirmation: z.literal("RESTORE ATTENDX"),
    })
    .parse(req.body);
  if (!req.file)
    return res.status(400).json({ message: "Choose a SQLite backup file." });
  const user = await User.findByPk(req.user.id);
  if (!(await bcrypt.compare(data.password, user.passwordHash)))
    return res
      .status(400)
      .json({ message: "Administrator password is incorrect." });
  const staged = await stageUploadedBackup(req.file.buffer);
  const result = await restoreStagedBackup({
    stagedPath: staged.stagedPath,
    userId: user.id,
    sourceName: req.file.originalname,
  });
  res.json({
    message:
      "Database restored. The API will stop so it can be restarted safely.",
    validation: staged.validation,
    ...result,
  });
  if (process.env.NODE_ENV !== "test") setTimeout(() => process.exit(0), 750);
  },
);

export default router;
