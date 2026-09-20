# AttendX

> A service-operated attendance platform for educational institutions.

AttendX replaces slow roll calls with a controlled attendance workflow for class representatives, administrators, and service operators. It combines timetable-aware session creation, server-authoritative attendance rules, accountable corrections, human-readable reports, backup tooling, and tiered administration in one responsive application.

![Version](https://img.shields.io/badge/version-1.1.6-0a4a7f)
![Status](https://img.shields.io/badge/status-stable-2f855a)
![Runtime](https://img.shields.io/badge/node-20%2B-43853d)
![Database](https://img.shields.io/badge/database-SQLite%20%7C%20PostgreSQL-315b7d)

## Product position

AttendX is designed for a managed-service model: an operator deploys and maintains an isolated instance for an institution, configures its academic data, protects backups, and manages privileged access. Version 1.1.6 is single-institution per deployment. A shared multi-tenant control plane, billing, and institution self-provisioning are future product work and are not falsely represented as existing features.

Brand assets, institution name, class name, academic session, subjects, timetable, and administrator accounts are deployment configuration—not hard-coded product identity.

## Release status

| Version | Status | Summary |
| --- | --- | --- |
| `v1.0.0` | Released baseline | Core attendance workflow, basic administration, CSV onboarding, exports, and audit history. |
| `v1.1.6` | Current release | Reliability, reporting, secure sessions, responsive UX, Admin++ controls, database visibility, self-healing permissions, and operational tooling. |
| `v1.2.0` | Planned | Faculty, programme/semester/section modelling, academic calendar, alerting, and service-management foundations. |

The published [`v1.0.0` release](https://github.com/syedatifhussainfr/AttendX/releases/tag/v1.0.0) remains the reproducible baseline for the comparison below.

## V1.0 compared with V1.1.6

| Area | V1.0 | V1.1.6 |
| --- | --- | --- |
| Authentication | JWT login | Short-lived in-memory access tokens plus rotating, hashed refresh sessions in `HttpOnly`, `SameSite=Strict` cookies |
| Logout | Client sign-out | Server-side session revocation, trusted-origin validation, popup flow, and dedicated `/logout` route |
| Passwords | Hashed passwords | Strong-password policy, forced temporary-password replacement, self-service changes, CR resets, and session invalidation |
| Administration | `ADMIN` / `CR` | `CR`, `ADMIN`, and elevated `ADMIN++` authority with five-minute password elevation for destructive tools |
| User management | Basic account controls | ADMIN account management; ADMIN++ permanent deletion and per-user device-session control |
| Database visibility | Local SQLite file | ADMIN/ADMIN++ read-only browser with redacted credentials and validated management links |
| Student import | Direct CSV import | Preview and reconciliation for additions, changes, duplicates, invalid rows, and missing students |
| Attendance safety | Standard session flow | Duplicate/overlap detection, opener/closer ownership, reopen reasons, and race-safe operations |
| Corrections | Basic edits | Mandatory reason, before/after state, actor, time, and permanent audit history |
| Reporting | Basic export | Machine export and organized review workbook with overall and subject-level student percentages |
| Backups | Manual file handling | Managed SQLite snapshots, validation, guarded restore, pre-restore backup, download, and audit logging |
| Development workflow | Concurrent npm scripts | Colored unified console, scoped API watcher, strict ports, and clean Windows shutdown |
| Responsive UI | Basic responsiveness | Persistent/resizable desktop sidebar, mobile drawer scroll lock, route progress, and confirmation flows |
| Permission policy | Fixed role checks | Explicit CR/ADMIN/ADMIN++ capability matrix with startup repair, protected ceilings, dependency repair, and backend enforcement |

## V1.1 patch history

### V1.1.0 — data safety foundation

- Versioned, idempotent database migrations recorded in `app_migrations`.
- Managed SQLite backup/download/restore with validation and automatic pre-restore snapshot.
- Transactional CSV reconciliation and optional deactivation of missing students.
- Duplicate and overlapping attendance-session protection.
- Reason-backed reopening and correction audit history.
- Stronger password lifecycle and temporary-password enforcement.

### V1.1.1 — reporting and test-data operations

- Human-review `.xlsx` workbook in addition to machine-oriented export.
- Per-student identity, roll number, class totals, subject totals, attended counts, rounded percentage, and precise percentage.
- Secure, validated export filters and predictable `attendance_YYYY-MM-DD.xlsx` naming.
- Backup-aware demo-attendance generator that uses existing students and never creates dummy student records.
- Roll-number normalization utility for data imported by older versions.

### V1.1.2 — secure browser sessions

- High-entropy rotating refresh tokens stored only as hashes.
- Short-lived access tokens stored only in memory.
- Active-device list, individual revocation, and revoke-all-other-devices.
- Refresh-token reuse detection and global account-session invalidation.
- Protection against SQLite authentication writes causing refresh-time lockouts.
- Password changes, resets, account disabling, restores, and logout revoke affected sessions.

### V1.1.3 — responsive product interface

- Reworked glass interface with restrained branded background treatment.
- Persistent desktop sidebar visibility and bounded resizing.
- Scrollable mobile navigation with background scroll lock.
- Route progress indicator and consistent confirmation dialogs.
- Improved login, password, attendance, dashboard, and report interactions.
- Dedicated `/logout` page while preserving the quick sidebar confirmation dialog.

### V1.1.4 — Admin++ and protected data operations

- CLI promotion, creation, and revocation of Admin++ authority.
- Configurable administrator mobile-number validation.
- Five-minute in-memory password elevation for destructive browser actions.
- Safe permanent deletion for unused users, students, and subjects.
- Deletion blocked when audit, timetable, attendance, self-lockout, or last-Admin++ rules require preservation.
- Per-user device-session inspection and revocation for Admin++.
- Read-only database browser that never exposes password hashes, token hashes, arbitrary SQL, or editable raw cells.

### V1.1.5 — role hierarchy and release operations

- ADMIN access restored to Users and Database without granting destructive authority.
- ADMIN can create accounts, reset CR passwords, and enable or disable ordinary managed accounts.
- ADMIN cannot modify Admin++ accounts, permanently delete protected data, or control another user’s sessions.
- ADMIN++ retains password-confirmed deletion and privileged session controls.
- Trusted-origin logout endpoint and separate URL/button logout experiences.
- Scoped API watcher prevents dependency or sync-client changes from restarting the backend.
- Colored cross-platform development console with strict ports and clean shutdown.
- Repeatable `npm run verify-data` integrity report.
- Product-oriented documentation and V1.0-to-V1.1 comparison.

### V1.1.6 — self-healing permission configuration

- Complete capability matrix for CR, ADMIN, and ADMIN++ in `config/config.yml`.
- Backend authorization uses named permissions instead of scattered role checks.
- Frontend routes, navigation, and management actions follow server-issued capabilities.
- Missing `default.yml`, `config.example.yml`, or `config.yml` files are regenerated automatically.
- Malformed YAML is preserved with a timestamp and replaced with secure defaults.
- Missing keys and invalid value types are repaired; unknown keys are removed.
- Valid operator choices remain unchanged during normalization.
- Permission dependencies are repaired automatically, such as enabling view access when management is enabled.
- Privilege ceilings prevent CR/ADMIN from receiving Admin++ deletion or session-control authority.
- Read-only in-memory defaults keep startup safe if the configuration directory cannot be written.
- `npm run config-check` validates and reports the effective policy before deployment.

## Permission model

| Capability | CR | ADMIN | ADMIN++ |
| --- | :---: | :---: | :---: |
| View dashboard, students, history, and reports | ✓ | ✓ | ✓ |
| Open and close attendance sessions | ✓ | ✓ | ✓ |
| Correct an active session where policy permits | ✓ | ✓ | ✓ |
| Correct/reopen closed attendance with a reason | — | ✓ | ✓ |
| Manage students, subjects, timetable, and settings | — | ✓ | ✓ |
| Create users and reset CR passwords | — | ✓ | ✓ |
| Enable/disable ordinary managed accounts | — | ✓ | ✓ |
| View the redacted, read-only database browser | — | ✓ | ✓ |
| Modify an Admin++ account | — | — | ✓ |
| Inspect/revoke another user’s browser sessions | — | — | ✓ |
| Permanently delete eligible users/students/subjects | — | — | ✓ |
| Promote or revoke Admin++ | — | — | CLI only |

Raw database records remain read-only for both ADMIN and ADMIN++. Data changes go through validated API workflows so authorization, relationships, and audit rules cannot be bypassed.

## Architecture

```text
AttendX/
├── client/                  React 19 + Vite interface
│   ├── public/brand/        Replaceable deployment brand assets
│   └── src/                 Pages, layout, auth state, and API client
├── server/
│   ├── src/cli/             Admin, backup, demo, normalization, verification tools
│   ├── src/db/              Sequelize models, migrations, and development seed
│   ├── src/middleware/      Authentication, authorization, and error handling
│   ├── src/routes/          Auth, attendance, administration, and backup APIs
│   └── src/services/        Session, attendance, import, export, and backup rules
├── scripts/dev.js           Unified local development runner
└── README.md
```

### Technology

- React 19, React Router, Vite, and Lucide icons.
- Node.js, Express 5, Sequelize, and Zod.
- SQLite for portable deployments; PostgreSQL/Supabase for managed hosting.
- ExcelJS for machine and human-review workbooks.
- bcrypt for password hashing and signed JWT access/elevation tokens.

## Quick start

### Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- PowerShell, Bash, or another standard terminal.
- PostgreSQL is optional; SQLite is the default.

### Recommended clean installation

```bash
git clone https://github.com/syedatifhussainfr/AttendX.git
cd AttendX
npm install
```

Create the server configuration:

```powershell
Copy-Item server/.env.example server/.env
```

On Bash-compatible shells:

```bash
cp server/.env.example server/.env
```

Create the first permanent administrator without dummy students or attendance:

```bash
npm run create-admin
npm run dev
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/api/health`.

After signing in:

1. Update institution, academic-session, class, timezone, and attendance settings.
2. Configure subjects and the weekly timetable.
3. Import the real roster from **Students → Import CSV**.
4. Create the CR and any additional administrator accounts.
5. Take the first backup before recording attendance.

### Development seed

`npm run seed` is intended only for local evaluation. It creates bundled development accounts, subjects, timetable entries, and settings; it never creates students or attendance records. Production/service deployments should use `npm run create-admin` and configure their own academic data.

## Configuration

### Permission configuration

AttendX creates and validates three files in `config/` whenever the API starts or `npm run config-check` runs:

| File | Purpose |
| --- | --- |
| `default.yml` | Generated secure baseline; automatically restored if changed, broken, or deleted. |
| `config.example.yml` | Generated complete reference containing every supported capability. |
| `config.yml` | Local deployment policy. It is ignored by Git and preserves valid `true`/`false` changes. |

Edit only `config/config.yml`, run the validator, and restart AttendX:

```bash
npm run config-check
npm run dev
```

Each role has a complete independent permission matrix. Missing files are recreated, malformed files are preserved as timestamped `.broken-*` copies, and structurally invalid files are preserved as `.repaired-*` copies before normalization. Missing keys use secure defaults, unknown keys are removed, invalid types are replaced, and required permission dependencies are restored.

Permanent deletion, other-user session control, and Admin++ modification remain protected security boundaries. Configuration may disable these capabilities for Admin++, but cannot grant them to CR or ordinary ADMIN. Self-disable, self-delete, last-active-Admin++, secret-redaction, elevation, and audit safeguards are enforced in code and are not YAML switches.

Secrets never belong in YAML. Keep JWT, database, SMTP, and provider credentials in environment variables.

### Environment configuration

Important values in `server/.env`:

```dotenv
PORT=4000
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-a-long-random-production-secret

DB_DIALECT=sqlite
SQLITE_PATH=./data/attendx.sqlite
BACKUP_DIR=./backups

ADMIN_PHONE_COUNTRY_CODE=+91
ADMIN_PHONE_LOCAL_DIGITS=10
```

For PostgreSQL:

```dotenv
DB_DIALECT=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DB_SSL=true
```

Production requirements:

- Use HTTPS and a unique high-entropy `JWT_SECRET` of at least 32 characters.
- Set `CLIENT_URL` to the exact public application origin.
- Store database and backup volumes outside ephemeral application storage.
- Restrict database/network access to the service operator.
- Use provider snapshots or `pg_dump`/`pg_restore` for PostgreSQL.
- Keep one tested off-machine backup according to the customer’s retention agreement.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API and web app in the unified colored development console. |
| `npm run build` | Produce the production frontend bundle. |
| `npm test` | Run backend business, authorization, session, export, and integrity tests. |
| `npm run create-admin` | Create a clean permanent ADMIN account and essential settings. |
| `npm run admin-pp` | Promote an ADMIN, create Admin++, or revoke Admin++ authority. |
| `npm run backup` | Create and validate a timestamped SQLite snapshot. |
| `npm run verify-data` | Run read-only integrity, foreign-key, duplicate-roll, administrator, and count checks. |
| `npm run config-check` | Repair and validate YAML policy files, then print effective permission counts. |
| `npm run demo-attendance -- 12` | Create deterministic closed sessions for existing students after a backup. |
| `npm run normalize-rolls` | Normalize numeric rolls imported by older builds. |
| `npm run seed` | Populate local development accounts and academic configuration; never students. |
| `npm start` | Start only the backend without watch mode. |

## Operational workflows

### Create or promote Admin++

```bash
npm run admin-pp
```

Choose the CLI action, select or create the administrator, verify the account password, provide the configured mobile number, and confirm. Privilege changes revoke existing sessions so the account must sign in again. Admin++ can also be revoked back to ordinary ADMIN from the same command.

### Import students

Use a UTF-8 CSV with headers:

```csv
rollNumber,name
01,Student One
02,Student Two
```

The preview separates new, changed, unchanged, invalid, duplicate, and missing rows. Nothing is written until an administrator confirms the reconciliation. Numeric rolls are normalized (`1` becomes `01`) and naturally sorted.

### Backup and restore

Create a backup from **Backup & restore** or:

```bash
npm run backup
```

Restoration requires an ADMIN password plus the exact confirmation phrase. AttendX validates the upload, creates a pre-restore snapshot, restores the database, revokes sessions, and stops the API. Restart the service only after the restore response completes.

### Verify live data

Stop write-heavy maintenance jobs, then run:

```bash
npm run backup
npm run verify-data
```

A release-ready SQLite database must pass `PRAGMA integrity_check`, have zero foreign-key violations, contain no duplicate roll numbers, and retain at least one active ADMIN. Admin++ is recommended for service operation but is reported as a warning rather than corrupting otherwise-valid data.

### Reports

- **Machine data:** normalized workbook for downstream processing.
- **Review report:** human-readable workbook containing student identity, rolls, session status, total held/recorded/attended classes, overall percentages, and subject-level metrics.
- Filters support date range, subject, or individual attendance session.
- Review exports include closed sessions only so unfinished classes do not distort percentages.

## Attendance rules

The default late threshold is 15 minutes and is configurable. Its value is copied into each attendance session when opened, so later configuration changes cannot rewrite history.

For a class beginning at `09:30` with a 15-minute threshold:

- `09:30:00`–`09:44:59`: `PRESENT`, attendance credit granted.
- `09:45:00` onward: `LATE`, no attendance credit.
- Unmarked when the session closes: `ABSENT`, no attendance credit.

Credited attendance percentage is `PRESENT / classes conducted × 100`. Physical appearance may be reported as `PRESENT + LATE`, but a late arrival never increases credited attendance.

## Security model

- Passwords are bcrypt hashes and are never returned by the API.
- Access tokens are short-lived and memory-only.
- Refresh tokens are high entropy, rotated, sent only as secure cookies, and stored only as hashes.
- Reusing a rotated refresh token revokes the account’s sessions.
- Login and Admin++ password elevation are rate limited.
- Helmet security headers and exact-origin credentialed CORS are enabled.
- Logout is POST-only, checks request origin, clears the cookie, and revokes the database session.
- Admin++ elevation is password-confirmed, memory-only, tied to the current session, and expires after five minutes.
- Database browsing redacts password, refresh-token, token-history, and IP-hash material.
- Destructive deletion is refused when historical relationships require deactivation instead.
- Self-disable, self-delete, and last-active-Admin++ protections prevent avoidable lockout.

## V1.1.6 verification

- 26 backend tests cover attendance rules, imports, exports, sessions, authorization, backups, Admin++, and self-healing configuration.
- Production frontend compilation succeeds with Vite.
- `npm run config-check` validates YAML parsing, structural repair, permission dependencies, and protected privilege ceilings.
- `npm run verify-data` checks SQLite integrity, foreign keys, duplicate rolls, administrator availability, and record totals without modifying data.

Deployment owners should still perform browser role checks, export review, a restore rehearsal on a disposable copy, HTTPS configuration, secret rotation, monitoring, and backup-retention validation in their own environment.

## Repository privacy

This repository contains application source, example configuration, migrations, and automated tests only. Git excludes live SQLite databases, database journals, managed backups, CSV/XLSX exports, uploads, generated output, local YAML policy overrides, environment files, logs, and coverage artifacts.

Never commit real student rosters, attendance exports, production backups, access tokens, passwords, administrator phone numbers, or populated `.env` files. Test identities and credentials in the automated suite are synthetic and must not be reused in a deployment.

## Roadmap

Planned product work includes:

- Institution onboarding and operator control plane.
- Programme, semester, class, section, and academic-year modelling.
- Faculty accounts and substitution history.
- Holidays, closures, cancelled lectures, and special working days.
- Attendance thresholds, alerts, and scheduled customer reports.
- Customer-specific branding and domain configuration.
- Multi-tenant isolation, subscriptions, billing, and support operations.
- QR/card attendance using random revocable tokens rather than personal data.

## Important scope statement

V1.1.6 is suitable for controlled pilot evaluation and service-operated deployment after the final checklist passes. It is not yet a self-service multi-tenant SaaS platform. Each institution should receive an isolated deployment and database until tenant isolation, provisioning, billing, and operator tooling are deliberately implemented and independently reviewed.
