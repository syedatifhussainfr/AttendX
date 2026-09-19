import fs from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { config } from "../config.js";
import { sequelize } from "../db/index.js";

const requiredTables = [
  "users",
  "students",
  "subjects",
  "attendance_sessions",
  "attendance_records",
  "settings",
  "audit_logs",
];

function sqliteOnly() {
  if (sequelize.getDialect() !== "sqlite") {
    const error = new Error(
      "Web backup and restore are available only for SQLite. Use pg_dump/pg_restore for PostgreSQL.",
    );
    error.status = 501;
    throw error;
  }
}

const liveDatabasePath = () => path.resolve(config.sqlitePath);
export const backupDirectory = () => path.resolve(config.backupDir);

function openSqlite(filename, mode = sqlite3.OPEN_READONLY) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, mode, (error) =>
      error ? reject(error) : resolve(db),
    );
  });
}

const get = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row))),
  );
const all = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (error, rows) =>
      error ? reject(error) : resolve(rows),
    ),
  );
const run = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function callback(error) {
      error ? reject(error) : resolve(this);
    }),
  );
const close = (db) =>
  new Promise((resolve, reject) =>
    db.close((error) => (error ? reject(error) : resolve())),
  );

export async function validateBackup(filename) {
  const stat = await fs.stat(filename);
  if (!stat.isFile() || stat.size < 100)
    throw Object.assign(new Error("The uploaded backup is empty or invalid."), {
      status: 400,
    });
  const db = await openSqlite(filename);
  try {
    const integrity = await get(db, "PRAGMA integrity_check");
    if (integrity?.integrity_check !== "ok")
      throw new Error("SQLite integrity check failed.");
    const tables = await all(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const names = new Set(tables.map((row) => row.name));
    const missing = requiredTables.filter((table) => !names.has(table));
    if (missing.length)
      throw new Error(
        `Backup is missing required tables: ${missing.join(", ")}.`,
      );
    const students = await get(db, "SELECT COUNT(*) AS count FROM students");
    return { valid: true, size: stat.size, students: students.count };
  } catch (error) {
    error.status = 400;
    throw error;
  } finally {
    await close(db);
  }
}

export async function createBackup({ label = "manual" } = {}) {
  sqliteOnly();
  const directory = backupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = `attendx-${safeLabel}-${stamp}.sqlite`;
  const destination = path.join(directory, filename);
  await sequelize.query("PRAGMA wal_checkpoint(FULL)");
  await sequelize.query(`VACUUM INTO ${sequelize.escape(destination)}`);
  const validation = await validateBackup(destination);
  const stat = await fs.stat(destination);
  return { filename, createdAt: stat.birthtime.toISOString(), ...validation };
}

export async function listBackups() {
  sqliteOnly();
  const directory = backupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const rows = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          /^attendx-[a-z0-9.-]+-\d{4}-.*\.sqlite$/i.test(entry.name),
      )
      .map(async (entry) => {
        const stat = await fs.stat(path.join(directory, entry.name));
        return {
          filename: entry.name,
          createdAt: stat.birthtime.toISOString(),
          size: stat.size,
        };
      }),
  );
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function backupPath(filename) {
  if (
    path.basename(filename) !== filename ||
    !/^attendx-.*\.sqlite$/i.test(filename)
  ) {
    const error = new Error("Backup file is unavailable.");
    error.status = 404;
    throw error;
  }
  return path.join(backupDirectory(), filename);
}

export async function stageUploadedBackup(buffer) {
  sqliteOnly();
  const directory = backupDirectory();
  await fs.mkdir(directory, { recursive: true });
  const filename = `.restore-${crypto.randomUUID()}.sqlite`;
  const stagedPath = path.join(directory, filename);
  await fs.writeFile(stagedPath, buffer, { flag: "wx" });
  try {
    const validation = await validateBackup(stagedPath);
    return { stagedPath, validation };
  } catch (error) {
    await fs.rm(stagedPath, { force: true });
    throw error;
  }
}

export async function restoreStagedBackup({ stagedPath, userId, sourceName }) {
  sqliteOnly();
  await validateBackup(stagedPath);
  const safetyBackup = await createBackup({ label: "pre-restore" });
  const livePath = liveDatabasePath();
  const oldPath = `${livePath}.restore-old`;
  await sequelize.close();
  try {
    await fs.rm(oldPath, { force: true });
    await fs.rename(livePath, oldPath);
    await fs.copyFile(stagedPath, livePath);
    await fs.rm(`${livePath}-wal`, { force: true });
    await fs.rm(`${livePath}-shm`, { force: true });
    const db = await openSqlite(livePath, sqlite3.OPEN_READWRITE);
    try {
      const user = await get(db, "SELECT id FROM users WHERE id = ?", [userId]);
      const now = new Date().toISOString();
      const tables = await all(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
      if (tables.some((table) => table.name === "auth_sessions"))
        await run(db, "UPDATE auth_sessions SET revoked_at = ?, updated_at = ? WHERE revoked_at IS NULL", [now, now]);
      await run(
        db,
        `INSERT INTO audit_logs
          (entity_type, entity_id, action, new_value, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "DATABASE",
          0,
          "DATABASE_RESTORED",
          JSON.stringify({ sourceName, safetyBackup: safetyBackup.filename }),
          user?.id || null,
          now,
          now,
        ],
      );
    } finally {
      await close(db);
    }
    await fs.rm(oldPath, { force: true });
    await fs.rm(stagedPath, { force: true });
    return { safetyBackup: safetyBackup.filename, restartRequired: true };
  } catch (error) {
    const liveExists = await fs.access(livePath).then(
      () => true,
      () => false,
    );
    const oldExists = await fs.access(oldPath).then(
      () => true,
      () => false,
    );
    if (oldExists) {
      if (liveExists) await fs.rm(livePath, { force: true });
      await fs.rename(oldPath, livePath);
    }
    throw error;
  }
}
