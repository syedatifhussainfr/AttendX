import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { User } from "../db/index.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token)
      return res.status(401).json({ message: "Authentication required." });
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findByPk(payload.sub, {
      attributes: { exclude: ["passwordHash"] },
    });
    if (!user?.active)
      return res.status(401).json({ message: "Account is unavailable." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Session expired or invalid." });
  }
}
export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res
          .status(403)
          .json({ message: "You do not have permission for this action." });
