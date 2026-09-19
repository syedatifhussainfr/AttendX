import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { User } from "../db/index.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { passwordSchema, publicUser } from "../utils/password.js";
import {
  createAuthSession,
  listUserSessions,
  resumeAuthSession,
  revokeRefreshSession,
  revokeSessionById,
  revokeUserSessions,
} from "../services/authSessionService.js";

const router = Router();
export const REFRESH_COOKIE = "attendx_refresh";
const DUMMY_PASSWORD_HASH = "$2b$12$4b2dQ4eZoFeYEav9ogPMt.z/j5h3z1fPvq43sPGIRH53uwoihg7em";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many session requests. Sign in again shortly." },
});

function requestMetadata(req) {
  return { userAgent: req.get("user-agent"), ip: req.ip };
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const item of cookies) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(parts.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: config.refreshSessionDays * 86_400_000,
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, cookieOptions());
}

function clearRefreshCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

function authResponse(res, result) {
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  });
}

router.post("/session", refreshLimiter, async (req, res) => {
  try {
    const result = await resumeAuthSession(
      readCookie(req, REFRESH_COOKIE),
      requestMetadata(req),
    );
    return authResponse(res, result);
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  try {
    const result = await resumeAuthSession(
      readCookie(req, REFRESH_COOKIE),
      requestMetadata(req),
      { rotate: true },
    );
    setRefreshCookie(res, result.refreshToken);
    return authResponse(res, result);
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = z
    .object({ email: z.string().email(), password: z.string().min(6) })
    .parse(req.body);
  const user = await User.findOne({ where: { email: email.toLowerCase() } });
  const validPassword = await bcrypt.compare(
    password,
    user?.passwordHash || DUMMY_PASSWORD_HASH,
  );
  if (!user?.active || !validPassword)
    return res.status(401).json({ message: "Invalid email or password." });
  await revokeRefreshSession(readCookie(req, REFRESH_COOKIE));
  const result = await createAuthSession(user, requestMetadata(req));
  setRefreshCookie(res, result.refreshToken);
  return authResponse(res, result);
});

router.post("/logout", async (req, res) => {
  await revokeRefreshSession(readCookie(req, REFRESH_COOKIE));
  clearRefreshCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => res.json(publicUser(req.user)));

router.get("/sessions", requireAuth, async (req, res) =>
  res.json({
    sessions: await listUserSessions(req.user.id, req.authSession.id),
  }),
);

router.post("/sessions/revoke-others", requireAuth, async (req, res) => {
  await revokeUserSessions(req.user.id, {
    exceptSessionId: req.authSession.id,
  });
  res.json({ message: "All other devices were signed out." });
});

router.delete("/sessions/:sessionId", requireAuth, async (req, res) => {
  const sessionId = z.string().uuid().parse(req.params.sessionId);
  await revokeSessionById(req.user.id, sessionId, req.authSession.id);
  res.status(204).end();
});

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
  await revokeUserSessions(user.id);
  clearRefreshCookie(res);
  res.json({ message: "Password changed. Every device has been signed out." });
});

export default router;
