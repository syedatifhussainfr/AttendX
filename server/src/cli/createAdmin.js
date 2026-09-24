import { Writable } from "node:stream";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { initDatabase, Setting, User } from "../db/index.js";
import { passwordSchema } from "../utils/password.js";

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

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

const defaults = {
  lateThresholdMinutes: 15,
  lateModeEnabled: true,
  lateAttendanceCredit: 0,
  institutionName: "EIILM Kolkata",
  timezone: "Asia/Kolkata",
  crCanCorrectRecent: true,
  attendanceTargetPercentage: 75,
};

try {
  const name = getArg("name") || (await ask("Admin name: "));
  const email = (getArg("email") || (await ask("Admin email: "))).toLowerCase();
  const suppliedPassword = getArg("password");
  const password =
    suppliedPassword ||
    (await askPassword(
      "Password (10+ chars, mixed case, number and symbol): ",
    ));
  const confirmation =
    suppliedPassword || (await askPassword("Confirm password: "));

  if (name.length < 2)
    throw new Error("Admin name must contain at least 2 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  passwordSchema.parse(password);
  if (password !== confirmation) throw new Error("Passwords do not match.");

  await initDatabase();
  const existing = await User.findOne({ where: { email } });
  if (existing) throw new Error(`A user with ${email} already exists.`);

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "ADMIN",
    active: true,
  });

  for (const [key, value] of Object.entries(defaults)) {
    await Setting.findOrCreate({
      where: { key },
      defaults: { value: JSON.stringify(value) },
    });
  }

  console.log(`\nADMIN created successfully: ${user.email}`);
  console.log(
    "No dummy students, subjects, timetable entries, or attendance records were added.",
  );
} catch (error) {
  console.error(`\nCould not create ADMIN: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
