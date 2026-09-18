import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../db/index.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.post("/login", async (req, res) => {
  const { email, password } = z
    .object({ email: z.string().email(), password: z.string().min(6) })
    .parse(req.body);
  const user = await User.findOne({ where: { email: email.toLowerCase() } });
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ message: "Invalid email or password." });
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});
router.get("/me", requireAuth, (req, res) => res.json(req.user));
export default router;
