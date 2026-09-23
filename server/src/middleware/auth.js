import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { validateAccessSession } from "../services/authSessionService.js";
import { hasPermission } from "../policy/policyService.js";

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
export const requirePermission = (capability) => (req, res, next) =>
  hasPermission(req.user, capability)
    ? next()
    : res.status(403).json({
        code: "PERMISSION_REQUIRED",
        permission: capability,
        message: `Permission ${capability} is required for this action.`,
      });

export function requireAdminPlus(req, res, next) {
  if (req.user.role === "ADMIN" && req.user.adminPlus) return next();
  return res.status(403).json({
    code: "ADMIN_PLUS_REQUIRED",
    message: "Admin++ permission is required for this action.",
  });
}

export function requireAdminElevation(req, res, next) {
  const token = req.get("x-admin-elevation");
  if (!token)
    return res.status(403).json({
      code: "ADMIN_ELEVATION_REQUIRED",
      message: "Confirm your password to open protected management tools.",
    });
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
    const valid =
      payload.type === "admin-elevation" &&
      payload.scope === "database-management" &&
      String(payload.sub) === String(req.user.id) &&
      payload.sid === req.authSession.id &&
      payload.gen === req.authSession.generation &&
      Number(payload.ver || 0) === Number(req.user.tokenVersion || 0);
    if (!valid) throw new Error("Invalid elevation");
    return next();
  } catch {
    return res.status(403).json({
      code: "ADMIN_ELEVATION_REQUIRED",
      message: "Protected access expired. Confirm your password again.",
    });
  }
}
