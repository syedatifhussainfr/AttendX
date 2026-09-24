import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { AuditLog, BrandingAsset } from "../db/index.js";
import {
  requireAdminElevation,
  requireAdminPlus,
  requireAuth,
  requirePermission,
} from "../middleware/auth.js";
import {
  brandingSnapshot,
  inspectBrandImage,
  MAX_BRAND_IMAGE_BYTES,
  updateBranding,
} from "../services/brandingService.js";

const router = Router();
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `branding-${req.user.id}`,
  message: { message: "Too many branding uploads. Try again in 15 minutes." },
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BRAND_IMAGE_BYTES, files: 3, fields: 9, parts: 12 },
  fileFilter: (req, file, callback) => {
    const validName = /\.(png|jpe?g)$/i.test(file.originalname);
    const validMime = ["image/png", "image/jpeg"].includes(file.mimetype);
    if (!validName || !validMime)
      return callback(
        Object.assign(new Error("Only PNG and JPEG logo files are allowed."), {
          status: 415,
        }),
      );
    callback(null, true);
  },
});

function waitForSecureCommit(res) {
  if (process.env.NODE_ENV === "test") return Promise.resolve();
  return new Promise((resolve, reject) => {
    let complete = false;
    const timer = setTimeout(() => {
      complete = true;
      res.off("close", onClose);
      resolve();
    }, 10_000);
    const onClose = () => {
      if (complete || res.writableEnded) return;
      clearTimeout(timer);
      reject(
        Object.assign(new Error("Branding upload was cancelled before apply."), {
          status: 499,
          code: "UPLOAD_CANCELLED",
        }),
      );
    };
    res.once("close", onClose);
  });
}

router.get("/", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.json(await brandingSnapshot());
});

router.get("/logo/:slot", async (req, res) => {
  const slot = String(req.params.slot).toUpperCase();
  if (!["PRIMARY", "SECONDARY", "FAVICON"].includes(slot))
    return res.status(404).json({ message: "Brand asset not found." });
  const asset = await BrandingAsset.findByPk(slot);
  if (!asset) return res.status(404).json({ message: "Brand asset not found." });
  const etag = `"${asset.checksum}"`;
  if (req.get("if-none-match") === etag) return res.status(304).end();
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", asset.byteSize);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("ETag", etag);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(asset.data);
});

router.put(
  "/",
  requireAuth,
  requirePermission("settings.manage"),
  requireAdminPlus,
  requireAdminElevation,
  uploadLimiter,
  upload.fields([
    { name: "primaryLogo", maxCount: 1 },
    { name: "secondaryLogo", maxCount: 1 },
    { name: "favicon", maxCount: 1 },
  ]),
  async (req, res) => {
    const profile = z
      .object({
        institutionName: z.string().trim().min(2).max(120),
        institutionCode: z.string().trim().max(30).default(""),
        campusName: z.string().trim().max(100).default(""),
        confirmation: z.literal("UPDATE BRANDING"),
        removeSecondary: z.enum(["true", "false"]).default("false"),
        removeFavicon: z.enum(["true", "false"]).default("false"),
      })
      .parse(req.body);
    for (const file of [
      req.files?.primaryLogo?.[0],
      req.files?.secondaryLogo?.[0],
      req.files?.favicon?.[0],
    ])
      if (file) inspectBrandImage(file);
    await waitForSecureCommit(res);
    const before = await brandingSnapshot();
    const updated = await updateBranding({
      profile: {
        institutionName: profile.institutionName,
        institutionCode: profile.institutionCode,
        campusName: profile.campusName,
      },
      primaryFile: req.files?.primaryLogo?.[0],
      secondaryFile: req.files?.secondaryLogo?.[0],
      faviconFile: req.files?.favicon?.[0],
      removeSecondary: profile.removeSecondary === "true",
      removeFavicon: profile.removeFavicon === "true",
    });
    await AuditLog.create({
      entityType: "SETTING",
      entityId: 0,
      action: "INSTITUTION_BRANDING_UPDATED",
      oldValue: JSON.stringify({
        institutionName: before.institutionName,
        institutionCode: before.institutionCode,
        campusName: before.campusName,
        primaryLogo: before.assets.primary?.name || "bundled",
        secondaryLogo: before.secondaryLogoUrl ? before.assets.secondary?.name || "bundled" : null,
        favicon: before.assets.favicon?.name || "primary logo",
      }),
      newValue: JSON.stringify({
        institutionName: updated.institutionName,
        institutionCode: updated.institutionCode,
        campusName: updated.campusName,
        primaryLogo: updated.assets.primary?.name || "bundled",
        secondaryLogo: updated.secondaryLogoUrl ? updated.assets.secondary?.name || "bundled" : null,
        favicon: updated.assets.favicon?.name || "primary logo",
      }),
      reason: "Admin++ confirmed institution branding update",
      UserId: req.user.id,
    });
    res.json(updated);
  },
);

export default router;
