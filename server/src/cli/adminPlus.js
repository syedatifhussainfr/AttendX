import { Writable } from "node:stream";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { initDatabase, sequelize, User } from "../db/index.js";
import { config } from "../config.js";
import { revokeUserSessions } from "../services/authSessionService.js";
import { passwordSchema } from "../utils/password.js";

class HiddenOutput extends Writable {
  muted = false;
  _write(chunk, encoding, callback) {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  }
}

const output = new HiddenOutput();
const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
const ask = (question) =>
  new Promise((resolve) =>
    rl.question(question, (answer) => resolve(answer.trim())),
  );
const askPassword = async (question) => {
  if (!process.stdin.isTTY) return ask(question);
  process.stdout.write(question);
  output.muted = true;
  const answer = await ask("");
  output.muted = false;
  process.stdout.write("\n");
  return answer;
};

function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, "");
  const countryDigits = config.adminPhoneCountryCode.replace(/\D/g, "");
  const local =
    digits.length === config.adminPhoneLocalDigits
      ? digits
      : digits.startsWith(countryDigits)
        ? digits.slice(countryDigits.length)
        : "";
  if (!new RegExp(`^\\d{${config.adminPhoneLocalDigits}}$`).test(local))
    throw new Error(
      `Enter exactly ${config.adminPhoneLocalDigits} local digits for ${config.adminPhoneCountryCode}.`,
    );
  return `${config.adminPhoneCountryCode}${local}`;
}

async function askPhone() {
  return normalizePhone(
    await ask(
      `Mobile number (${config.adminPhoneCountryCode}, ${config.adminPhoneLocalDigits} digits): `,
    ),
  );
}

async function ensurePhoneAvailable(phoneNumber, exceptUserId = null) {
  const existing = await User.findOne({ where: { phoneNumber } });
  if (existing && existing.id !== exceptUserId)
    throw new Error("That mobile number is already assigned to another account.");
}

async function promoteExistingAdmin() {
  const admins = await User.findAll({
    where: { role: "ADMIN" },
    order: [["name", "ASC"]],
  });
  if (!admins.length) throw new Error("No existing ADMIN accounts were found.");
  console.log("\nExisting ADMIN accounts:");
  admins.forEach((admin, index) =>
    console.log(
      `  [${index + 1}] ${admin.name} <${admin.email}>${admin.adminPlus ? " · ADMIN++" : ""}`,
    ),
  );
  const selection = Number(await ask("Select account number: "));
  const user = admins[selection - 1];
  if (!user) throw new Error("Invalid ADMIN selection.");
  const password = await askPassword(`Password for ${user.email}: `);
  if (!(await bcrypt.compare(password, user.passwordHash)))
    throw new Error("Password verification failed.");
  const phoneNumber = await askPhone();
  await ensurePhoneAvailable(phoneNumber, user.id);
  await sequelize.transaction(async (transaction) => {
    await user.update(
      {
        adminPlus: true,
        phoneNumber,
        tokenVersion: (user.tokenVersion || 0) + 1,
      },
      { transaction },
    );
  });
  await revokeUserSessions(user.id);
  console.log(`\nADMIN++ enabled for ${user.email}.`);
  console.log("Existing browser sessions were revoked for security.");
}

async function createAdminPlus() {
  const name = await ask("Full name: ");
  const email = (await ask("Email: ")).toLowerCase();
  if (name.length < 2) throw new Error("Name must contain at least 2 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  if (await User.findOne({ where: { email } }))
    throw new Error(`A user with ${email} already exists.`);
  const phoneNumber = await askPhone();
  await ensurePhoneAvailable(phoneNumber);
  const password = await askPassword(
    "Password (10+ chars, mixed case, number and symbol): ",
  );
  const confirmation = await askPassword("Confirm password: ");
  passwordSchema.parse(password);
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const user = await User.create({
    name,
    email,
    phoneNumber,
    passwordHash: await bcrypt.hash(password, 12),
    role: "ADMIN",
    adminPlus: true,
    active: true,
    mustChangePassword: false,
  });
  console.log(`\nADMIN++ created successfully: ${user.email}`);
}

async function revokeAdminPlus() {
  const admins = await User.findAll({
    where: { role: "ADMIN", adminPlus: true },
    order: [["name", "ASC"]],
  });
  if (!admins.length) throw new Error("No ADMIN++ accounts were found.");
  console.log("\nExisting ADMIN++ accounts:");
  admins.forEach((admin, index) =>
    console.log(`  [${index + 1}] ${admin.name} <${admin.email}>`),
  );
  const selection = Number(await ask("Select account number: "));
  const user = admins[selection - 1];
  if (!user) throw new Error("Invalid ADMIN++ selection.");
  const password = await askPassword(`Password for ${user.email}: `);
  if (!(await bcrypt.compare(password, user.passwordHash)))
    throw new Error("Password verification failed.");
  console.log(
    "\nThis removes protected Users and Database access but keeps the account as a normal ADMIN.",
  );
  if (admins.length === 1)
    console.log(
      "Warning: this is the final ADMIN++ account. Protected browser tools will be unavailable until another account is promoted.",
    );
  const confirmation = await ask('Type "REVOKE ADMIN++" to continue: ');
  if (confirmation !== "REVOKE ADMIN++")
    throw new Error("Confirmation did not match. No changes were made.");
  await sequelize.transaction(async (transaction) => {
    await user.update(
      {
        adminPlus: false,
        phoneNumber: null,
        tokenVersion: (user.tokenVersion || 0) + 1,
      },
      { transaction },
    );
  });
  await revokeUserSessions(user.id);
  console.log(`\nADMIN++ revoked for ${user.email}.`);
  console.log("The account remains an ADMIN. Existing sessions were revoked.");
}

try {
  await initDatabase();
  console.log("\nAttendX ADMIN++ management");
  console.log("  [1] Promote an existing ADMIN");
  console.log("  [2] Create a new ADMIN++");
  console.log("  [3] Revoke ADMIN++ from an account");
  console.log("  [0] Cancel");
  const action = await ask("Choose an option: ");
  if (action === "1") await promoteExistingAdmin();
  else if (action === "2") await createAdminPlus();
  else if (action === "3") await revokeAdminPlus();
  else if (action === "0") console.log("Cancelled. No changes were made.");
  else throw new Error("Choose 0, 1, 2, or 3.");
} catch (error) {
  const message = error.issues?.map((issue) => issue.message).join(" ") || error.message;
  console.error(`\nADMIN++ setup failed: ${message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await sequelize.close();
}
