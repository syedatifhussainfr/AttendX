import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../db/index.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import { passwordSchema, publicUser } from "../utils/password.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
});
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = z
    .object({ email: z.string().email(), password: z.string().min(6) })
    .parse(req.body);
  const user = await User.findOne({ where: { email: email.toLowerCase() } });
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ message: "Invalid email or password." });
  const token = jwt.sign(
    { sub: user.id, role: user.role, ver: user.tokenVersion || 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
  res.json({
    token,
    user: publicUser(user),
  });
});
router.get("/me", requireAuth, (req, res) => res.json(publicUser(req.user)));
router.post("/change-password", requireAuth, async (req, res) => {
  const data = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: passwordSchema,
    })
    .refine((value) => value.currentPassword !== value.newPassword, {
      path: ["newPassword"],
      message: "Choose a password different from the current password.",
    })
    .parse(req.body);
  const user = await User.findByPk(req.user.id);
  if (!(await bcrypt.compare(data.currentPassword, user.passwordHash)))
    return res.status(400).json({ message: "Current password is incorrect." });
  await user.update({
    passwordHash: await bcrypt.hash(data.newPassword, 12),
    mustChangePassword: false,
    tokenVersion: (user.tokenVersion || 0) + 1,
  });
  res.json({ message: "Password changed. Sign in again on this device." });
});
export default router;
