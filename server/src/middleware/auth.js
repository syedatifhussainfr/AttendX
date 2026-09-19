import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { validateAccessSession } from "../services/authSessionService.js";

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token)
    return res.status(401).json({ message: "Authentication required." });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
  } catch {
    return res.status(401).json({ message: "Session expired or invalid." });
  }
  try {
    const authenticated = await validateAccessSession(payload);
    if (!authenticated)
      return res.status(401).json({ message: "Session expired or revoked." });
    req.user = authenticated.user;
    req.authSession = authenticated.session;
    if (
      authenticated.user.mustChangePassword &&
      !req.originalUrl.startsWith("/api/auth/change-password") &&
      !req.originalUrl.startsWith("/api/auth/me")
    )
      return res.status(403).json({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "Change the temporary password before continuing.",
      });
    return next();
  } catch (error) {
    return next(error);
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
