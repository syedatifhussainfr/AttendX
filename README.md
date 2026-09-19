# AttendX

AttendX is a working attendance-management foundation for EIILM Kolkata. It replaces full-class roll call with rapid roll-number entry, preserves `PRESENT`, `LATE`, and `ABSENT` as distinct states, and gives administrators control of students, subjects, the weekly routine, user access, settings, history, exports, and audit logs.

## Version status

| Version | Status | Purpose |
| ------- | ------ | ------- |
| **V1.0.0** | Released | Stable attendance workflow, administration, CSV onboarding, exports, audit history, and the EIILM glass interface. |
| **V1.1.0** | Implemented locally — not released | Reliability and administration upgrade: safe backup/restore, reviewed student imports, safer sessions, password management, and accountable corrections. |
| **V1.2.0** | Planned | Reports, faculty management, academic calendar, semester/section foundations, and richer dashboard insights. |

The [`v1.0.0` GitHub release](https://github.com/syedatifhussainfr/AttendX/releases/tag/v1.0.0) is the reproducible stable baseline. V1.1 development happens separately and must not be treated as a production release until its migration, data-preservation, authorization, and regression checks pass.

## V1.0.0 — stable release

- JWT authentication, bcrypt password hashing, protected routes, and `ADMIN` / `CR` permissions.
- CSV/manual student onboarding with normalized roll numbers and no dummy-student seeding.
- Timetable-aware CR dashboard. Its suggested lecture is never forced.
- Scheduled, replacement, and extra attendance sessions with an optional adjustment reason.
- Server-authoritative marking. Fast roll entry clears and refocuses after every submission.
- Live roll grid, search, counts, missing-roll list, duplicate rejection, review, and confirmed closure.
- Closure atomically marks every remaining student `ABSENT` and locks normal editing.
- ADMIN correction of closed history with a permanent audit trail.
- Student-ready relational schema, including nullable unique `card_token` and `photo_url` fields.
- CSV student import with a browser-side preview. Format: `rollNumber,name`.
- Excel `.xlsx` export for one session or a filtered date range / subject.
- SQLite zero-setup development mode and PostgreSQL/Supabase mode through the same Sequelize models and services.
- Responsive React interface using the supplied EIILM brand assets.

### V1.0 data behavior

- The local SQLite file lives at `server/data/attendx.sqlite` and is intentionally excluded from Git.
- `npm run seed` is idempotent and never creates dummy students.
- `npm run create-admin` creates a clean administrator account without student or attendance data.
- Numeric student rolls are normalized (`1` becomes `01`) and listed in natural numeric order.
- The Admin++ database browser is read-only and never exposes password hashes or arbitrary SQL execution. Account management uses validated, audited controls instead of raw table edits.

## V1.1.0 — current local branch (unreleased)

V1.1 is a safety-focused upgrade built on the V1.0 architecture. Priorities 1–5 below are implemented on the local `v1.1.0` branch but have deliberately not been pushed, tagged, or released. The existing SQLite database was backed up before migration and all 78 imported students were verified intact afterward.

1. **Backup and restore:** consistent timestamped SQLite backups, ADMIN-only download and guarded restore, automatic pre-restore backup, CLI backup support, validation, and audit logging.
2. **Student import reconciliation:** preview additions, name changes, unchanged rows, duplicates, invalid rows, and missing students before a single transactional apply; optionally deactivate missing students and download an error CSV.
3. **Attendance session safety:** duplicate/open-session and overlap protection, explicit overlap confirmation, opener/closer tracking, actual versus scheduled subject, ADMIN-only reopening with a reason, and race-safe marking/closure.
4. **Password management:** self-service password changes, current-password verification, stronger passwords, ADMIN reset for CR accounts, forced temporary-password change, session invalidation, login rate limiting, and secure HTTP headers.
5. **Attendance corrections:** mandatory reasons, immutable before/after history, correction metadata, ADMIN correction for any session, and CR correction only while a session is active.

An ADMIN may enable or disable other accounts but can never disable the account they are currently signed in with. This rule is enforced by the API and reflected in the interface so a UI bypass cannot cause self-lockout.

### Planned for V1.2.0

- Student, class, subject, and monthly reports with threshold views and filtered Excel exports.
- Faculty records with scheduled and replacement faculty history.
- Academic holidays, closures, cancellations, and special working days.
- Academic session, semester, course/class, and section foundations with safe default-section migration.
- Dashboard warnings for open sessions, attendance completion, recent corrections, backup freshness, and students below the configured threshold.

These items remain deliberately unimplemented until the V1.1 safety work is complete; there are no non-working placeholder controls for them.

### Using the V1.1 features

- **Backup:** ADMIN → **Backup & restore** → **Create backup**, or run `npm run backup`. Managed files are stored in `server/backups` and excluded from Git.
- **Restore:** upload a SQLite backup, enter the signed-in ADMIN password, and type `RESTORE ATTENDX`. AttendX validates the file, creates a pre-restore safety backup, restores it, and stops the API. Run `npm run dev` again afterward.
- **Temporary attendance data:** after creating a backup, run `npm run demo-attendance -- 12` to generate 12 closed sessions for the existing active students. It never creates students or users and refuses to create a second demo set until the clean backup is restored.
- **Reviewed import:** ADMIN → **Students** → **Import CSV**. AttendX understands quoted fields, normalizes numeric rolls, and displays additions, name changes, unchanged rows, duplicates, invalid rows, and missing students before applying anything. Choose whether missing students stay active or are deactivated.
- **Session conflicts:** starting an identical open session is blocked. An overlapping/open-session warning requires a second explicit action and records the override as an extra or replacement class.
- **Reopen:** only ADMIN can reopen a closed session, and a reason is mandatory. Reopening and re-closing are audited.
- **Secure exports:** authenticated users can download raw machine data from `GET /api/attendance/export` or an organized human-review workbook from `GET /api/attendance/export/review`. Both accept validated `from`, `to`, `subjectId`, and `sessionId` filters. Review reports use closed sessions only. They identify every student by roll number and full name, show every session status, and calculate overall plus subject-level held classes, recorded classes, attended counts, rounded percentages, precise percentages, and class totals.
- **Passwords:** every account can use **Change password**. New/reset accounts must replace their temporary password; a password change revokes previous tokens. ADMIN can reset CR passwords but cannot view passwords.
- **Device sessions:** browser access tokens are short-lived and kept only in memory. A rotating high-entropy refresh token is stored as a hash in the database and sent only through an `HttpOnly`, `SameSite=Strict` cookie. **Change password** lists active devices, supports individual revocation and **Sign out all other devices**, and password changes, account deactivation, password resets, database restores, refresh-token reuse, and explicit logout revoke server-side sessions.
- **Security navigation:** voluntary password changes show a confirmation dialog with a per-account **Don't show again** preference. Forced temporary-password changes cannot be skipped. A slim progress bar confirms every page transition.
- **Corrections:** a reason is mandatory. The roll grid marks edited records and preserves original status, current status, reason, administrator/CR, and correction time.
- **Self-lockout protection:** the current ADMIN account cannot be disabled, even by calling the API directly. Other accounts can still be enabled or disabled.
- **Admin++ protected management:** run `npm run admin-pp` to promote an existing ADMIN or create a new Admin++. The CLI verifies the account password, requires a unique mobile number, revokes existing sessions after promotion, and uses the configurable `ADMIN_PHONE_COUNTRY_CODE` and `ADMIN_PHONE_LOCAL_DIGITS` settings. Browser access to Users and Database requires Admin++ plus a fresh password confirmation that expires after five minutes and is never written to browser storage.
- **Safe account deletion:** Admin++ can permanently delete an unused account after confirmation. AttendX blocks self-deletion, deletion of the last active Admin++, and deletion of accounts attached to attendance or audit history; those accounts must be disabled instead.

## Attendance rule

The default late threshold is 15 minutes and is configurable by ADMIN. The value is copied onto a session when it opens so a later setting change cannot rewrite history.

For a lecture starting at 09:30:

- `09:30:00` through `09:44:59`: `PRESENT`, `attendance_credit = true`.
- `09:45:00` onward: `LATE`, `attendance_credit = false`.
- Still unmarked when the session closes: `ABSENT`, `attendance_credit = false`.

Attendance percentage is `PRESENT / classes conducted × 100`. A physical appearance is `PRESENT + LATE`; a late arrival never increases the credited percentage and is never rewritten as absent.

## Windows setup from zero (SQLite — recommended first run)

Prerequisites: Node.js 20+ (Node 24 is supported), npm, and PowerShell. PostgreSQL is not required for the first run.

```powershell
cd "C:\Users\v4t3r\OneDrive\Desktop\PROJECTS\AttendX\AttendX - V1"
Copy-Item ".\server\.env.example" ".\server\.env"
npm install
npm run seed
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`; its health check is `http://localhost:4000/api/health`.

The SQLite database is created at `server/data/attendx.sqlite`. Running `npm run seed` again is safe: it does not duplicate the seeded records.

## Clean installation without dummy students

`npm run seed` creates the initial subjects, timetable, settings, and local test accounts, but it does not create students. For a clean installation with only your own ADMIN account:

```powershell
cd "C:\Users\v4t3r\OneDrive\Desktop\PROJECTS\AttendX\AttendX - V1"
Copy-Item ".\server\.env.example" ".\server\.env"
npm install
npm run create-admin
```

The command asks for the administrator's name, email, password, and password confirmation. Password input is hidden. It creates the database schema, the ADMIN account, and essential system settings only. It does not add dummy students, subjects, timetable entries, or attendance records.

Then run `npm run dev`, sign in as the new ADMIN, and import the real student CSV from **Students → Import CSV**. Configure Subjects and Timetable from their respective ADMIN pages.

Numeric roll numbers are normalized during import (`1` becomes `01`) and displayed in natural numeric order. To repair roll numbers imported by an older AttendX build, run `npm run normalize-rolls` once while the server is stopped.

For automation, arguments are also supported, although putting a password directly on the command line can leave it in shell history:

```powershell
npm run create-admin -- --name "System Administrator" --email "admin@example.com" --password "ChangeThisPassword"
```

### Test accounts

| Role  | Email                 | Password    |
| ----- | --------------------- | ----------- |
| ADMIN | `admin@attendx.local` | `Admin@12345` |
| CR    | `cr@attendx.local`    | `CR@123456`   |

These credentials apply only when those accounts are first created by the V1.1 seed. Seeded accounts must change the temporary password after login. Existing accounts and passwords are never overwritten by another seed. Passwords stored in the database are bcrypt hashes, never plaintext.

## PostgreSQL / Supabase setup

Create a PostgreSQL database, then edit `server/.env`:

```dotenv
DB_DIALECT=postgres
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/attendx
DB_SSL=false
JWT_SECRET=use-a-long-random-production-secret
```

For a hosted Supabase connection, use its PostgreSQL connection string and normally set `DB_SSL=true`. Then run:

```powershell
npm run seed
npm run dev
```

AttendX creates the base tables and then applies versioned, idempotent migrations recorded in `app_migrations`. The V1.1 SQLite web backup/restore page is intentionally unavailable for PostgreSQL. Use the provider's managed backup tools or `pg_dump`/`pg_restore`, for example:

```powershell
pg_dump --format=custom --file=attendx.backup $env:DATABASE_URL
pg_restore --clean --if-exists --dbname=$env:DATABASE_URL attendx.backup
```

Run PostgreSQL restoration only during a maintenance window and take a provider snapshot first.

## Useful commands

```powershell
npm run dev       # frontend + backend
npm run backup    # safe timestamped SQLite backup
npm run demo-attendance -- 12 # temporary sessions/records for analytics testing
npm run create-admin    # create a clean permanent ADMIN account
npm run admin-pp        # promote an ADMIN or create a protected ADMIN++
npm run normalize-rolls # repair numeric rolls imported by an older build
npm test          # backend business-rule tests
npm run build     # production frontend build
npm run seed      # subjects, timetable, settings and local test accounts (no students)
npm start         # backend without watch mode
```

## Verification walkthrough

1. Sign in as CR, confirm today's routine, and choose **Start attendance**.
2. Accept the suggested subject or select the class actually being conducted.
3. Enter `01` and press Enter. The API assigns status from its own timestamp.
4. Enter more rolls; entering `01` again returns its existing state and creates no duplicate.
5. For deterministic late-boundary testing run `npm test`; the test explicitly checks `09:44:59` versus `09:45:00`. In the UI, a session whose scheduled start is already 15+ minutes ago produces `LATE` with zero credit.
6. Review the roll grid and the **Missing** strip, then choose **Review & close**.
7. Confirm closure; all unmarked active students become `ABSENT` in one transaction.
8. Open Attendance History, view totals, and export the session to `.xlsx`.
9. Sign in as ADMIN to edit the timetable/settings, correct closed records with a reason, and inspect Audit Logs.

## Project structure

```text
AttendX - V1/
├── client/                 React + Vite UI
│   ├── public/brand/       Supplied EIILM assets
│   └── src/                pages, layout, state and API client
├── server/
│   ├── src/db/             Sequelize schema and idempotent seed
│   ├── src/middleware/     authentication, authorization, errors
│   ├── src/routes/         focused API route modules
│   └── src/services/       attendance rules and Excel export
└── README.md
```

## V2 plan (intentionally deferred)

Camera scanning, card design, PWA/offline mode, official-register workbook layout, and full XLSX student import are not half-implemented placeholders in V1. The next QR version should generate a random, revocable `card_token`; it must not encode a roll number or sensitive personal information. A lost card can then have its token revoked and replaced. A scanner will resolve the token to a student and call the existing `markAttendance(...)` service, preserving the exact same timing, duplicate, credit, and audit rules.

## Troubleshooting

- **`npm install` fails on `sqlite3`:** install current Node.js LTS and the Visual Studio C++ build tools, then retry. Node 20/22 LTS usually has a matching prebuilt binary.
- **Port already in use:** change `PORT` in `server/.env` and the `/api` proxy target in `client/vite.config.js` together.
- **Login fails after editing the database:** rerun `npm run seed`, then use the exact test credentials above.
- **PostgreSQL SSL error:** hosted services commonly require `DB_SSL=true`; local PostgreSQL commonly uses `false`.
- **Times look wrong:** keep `timezone` set to `Asia/Kolkata`. Attendance classification is performed on the server, not from the browser clock.
- **Reset local data:** stop the servers, preserve or remove only `server/data/attendx.sqlite`, then run `npm run create-admin` or `npm run seed` and import the roster CSV.
