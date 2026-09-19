import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { AuthSession, User, sequelize } from "../db/index.js";
import { config } from "../config.js";
import { publicUser } from "../utils/password.js";

const REFRESH_BYTES = 48;
const MAX_TOKEN_HISTORY = 8;
const MAX_ACTIVE_SESSIONS = 10;

function sessionError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
const newRefreshToken = () => randomBytes(REFRESH_BYTES).toString("base64url");
const expiresAt = () =>
  new Date(Date.now() + config.refreshSessionDays * 86_400_000);

function tokenHistory(session) {
  try {
    const parsed = JSON.parse(session.tokenHistory || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function issueAccessToken(user, session) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      type: "access",
      sid: session.id,
      gen: session.generation,
      ver: user.tokenVersion || 0,
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      expiresIn: config.accessTokenExpiresIn,
    },
  );
}

function metadataOf(metadata = {}) {
  const forwarded = String(metadata.ip || "").trim();
  return {
    userAgent: String(metadata.userAgent || "Unknown device").slice(0, 300),
    ipHash: forwarded
      ? createHash("sha256")
          .update(`${config.jwtSecret}:${forwarded}`)
          .digest("hex")
      : null,
  };
}

export async function createAuthSession(user, metadata = {}) {
  const refreshToken = newRefreshToken();
  const now = new Date();
  await AuthSession.destroy({ where: { expiresAt: { [Op.lt]: now } } });
  const session = await AuthSession.create({
    currentTokenHash: hashToken(refreshToken),
    tokenHistory: "[]",
    generation: 0,
    ...metadataOf(metadata),
    lastUsedAt: now,
    expiresAt: expiresAt(),
    UserId: user.id,
  });
  const activeSessions = await AuthSession.findAll({
    where: { UserId: user.id, revokedAt: null, expiresAt: { [Op.gt]: now } },
    order: [["lastUsedAt", "DESC"]],
  });
  const overflow = activeSessions.slice(MAX_ACTIVE_SESSIONS);
  if (overflow.length)
    await AuthSession.update(
      { revokedAt: now },
      { where: { id: { [Op.in]: overflow.map((item) => item.id) } } },
    );
  return {
    accessToken: issueAccessToken(user, session),
    refreshToken,
    expiresIn: config.accessTokenExpiresIn,
    user: publicUser(user),
  };
}

async function resolveRefreshSession(rawToken, transaction) {
  if (!rawToken)
    throw sessionError(401, "SESSION_REQUIRED", "Sign in to continue.");
  const tokenHash = hashToken(rawToken);
  const current = await AuthSession.findOne({
    where: { currentTokenHash: tokenHash },
    transaction,
  });
  if (current) return { session: current, reused: false };
  const sessions = await AuthSession.findAll({
    attributes: ["id", "UserId", "tokenHistory"],
    transaction,
  });
  const reused = sessions.find((session) =>
    tokenHistory(session).some((entry) => entry.hash === tokenHash),
  );
  return reused ? { session: reused, reused: true } : null;
}

async function enabledUser(session, transaction) {
  const user = await User.findByPk(session.UserId, { transaction });
  if (!user?.active)
    throw sessionError(
      401,
      "SESSION_INVALID",
      "This session is no longer active.",
    );
  return user;
}

async function resumeWithoutRotation(rawToken, metadata) {
  const resolved = await resolveRefreshSession(rawToken);
  if (!resolved)
    throw sessionError(
      401,
      "SESSION_INVALID",
      "This session is invalid. Sign in again.",
    );
  const { session, reused } = resolved;
  if (reused) {
    await revokeUserSessions(session.UserId);
    throw sessionError(
      401,
      "REFRESH_TOKEN_REUSED",
      "Session reuse was detected. Sign in again.",
    );
  }
  if (session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now())
    throw sessionError(
      401,
      "SESSION_EXPIRED",
      "This session has expired. Sign in again.",
    );
  const user = await enabledUser(session);

  // Session bootstrap is deliberately read-mostly. React development mode can
  // request it twice, and making both requests write the same SQLite row causes
  // SQLITE_BUSY. Activity timestamps are approximate and must never break auth.
  if (Date.now() - new Date(session.lastUsedAt).getTime() > 5 * 60_000) {
    try {
      await session.update({ lastUsedAt: new Date(), ...metadataOf(metadata) });
    } catch (error) {
      if (
        error.name !== "SequelizeTimeoutError" &&
        error.original?.code !== "SQLITE_BUSY"
      )
        throw error;
    }
  }
  return {
    accessToken: issueAccessToken(user, session),
    refreshToken: rawToken,
    expiresIn: config.accessTokenExpiresIn,
    user: publicUser(user),
  };
}

export async function resumeAuthSession(
  rawToken,
  metadata = {},
  { rotate = false } = {},
) {
  if (!rotate) return resumeWithoutRotation(rawToken, metadata);
  const result = await sequelize.transaction(async (transaction) => {
    const resolved = await resolveRefreshSession(rawToken, transaction);
    if (!resolved)
      throw sessionError(
        401,
        "SESSION_INVALID",
        "This session is invalid. Sign in again.",
      );
    const { session, reused } = resolved;
    if (reused) {
      await AuthSession.update(
        { revokedAt: new Date() },
        { where: { UserId: session.UserId, revokedAt: null }, transaction },
      );
      return { compromised: true };
    }
    if (
      session.revokedAt ||
      new Date(session.expiresAt).getTime() <= Date.now()
    )
      throw sessionError(
        401,
        "SESSION_EXPIRED",
        "This session has expired. Sign in again.",
      );
    const user = await enabledUser(session, transaction);
    let refreshToken = rawToken;
    const updates = { lastUsedAt: new Date(), ...metadataOf(metadata) };
    if (rotate) {
      refreshToken = newRefreshToken();
      const history = tokenHistory(session)
        .filter((entry) => new Date(entry.expiresAt).getTime() > Date.now())
        .slice(-(MAX_TOKEN_HISTORY - 1));
      history.push({
        hash: session.currentTokenHash,
        expiresAt: session.expiresAt,
      });
      Object.assign(updates, {
        currentTokenHash: hashToken(refreshToken),
        tokenHistory: JSON.stringify(history),
        generation: session.generation + 1,
        expiresAt: expiresAt(),
      });
    }
    await session.update(updates, { transaction });
    return {
      accessToken: issueAccessToken(user, session),
      refreshToken,
      expiresIn: config.accessTokenExpiresIn,
      user: publicUser(user),
    };
  });
  if (result.compromised)
    throw sessionError(
      401,
      "REFRESH_TOKEN_REUSED",
      "Session reuse was detected. Sign in again.",
    );
  return result;
}

export async function revokeRefreshSession(rawToken) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  const sessions = await AuthSession.findAll({ where: { revokedAt: null } });
  const session = sessions.find(
    (item) =>
      item.currentTokenHash === tokenHash ||
      tokenHistory(item).some((entry) => entry.hash === tokenHash),
  );
  if (session) await session.update({ revokedAt: new Date() });
}

export async function revokeUserSessions(
  userId,
  { exceptSessionId = null } = {},
) {
  const where = { UserId: userId, revokedAt: null };
  if (exceptSessionId) where.id = { [Op.ne]: exceptSessionId };
  return AuthSession.update({ revokedAt: new Date() }, { where });
}

export async function listUserSessions(userId, currentSessionId) {
  const rows = await AuthSession.findAll({
    where: {
      UserId: userId,
      revokedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [["lastUsedAt", "DESC"]],
  });
  return rows.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    current: session.id === currentSessionId,
  }));
}

export async function revokeSessionById(userId, sessionId, currentSessionId) {
  if (sessionId === currentSessionId)
    throw sessionError(
      400,
      "CURRENT_SESSION",
      "Use Sign out to end the current session.",
    );
  const session = await AuthSession.findOne({
    where: { id: sessionId, UserId: userId },
  });
  if (!session)
    throw sessionError(404, "SESSION_NOT_FOUND", "That session was not found.");
  if (!session.revokedAt) await session.update({ revokedAt: new Date() });
}

export async function validateAccessSession(payload) {
  if (
    payload.type !== "access" ||
    typeof payload.sid !== "string" ||
    !Number.isInteger(payload.gen) ||
    !Number.isInteger(Number(payload.ver))
  )
    return null;
  const session = await AuthSession.findByPk(payload.sid);
  if (
    !session ||
    session.revokedAt ||
    new Date(session.expiresAt).getTime() <= Date.now() ||
    Number(session.UserId) !== Number(payload.sub) ||
    session.generation !== payload.gen
  )
    return null;
  const user = await User.findByPk(payload.sub, {
    attributes: { exclude: ["passwordHash"] },
  });
  if (
    !user?.active ||
    Number(user.tokenVersion || 0) !== Number(payload.ver || 0)
  )
    return null;
  if (Date.now() - new Date(session.lastUsedAt).getTime() > 5 * 60_000)
    await session.update({ lastUsedAt: new Date() });
  return { user, session };
}
