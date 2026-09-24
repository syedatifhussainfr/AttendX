<div align="center">

# AttendX

### Secure, class-aware attendance operations for educational institutions

Timetable-aware sessions · rapid marking · accountable corrections · student intelligence · protected administration

[![Latest release](https://img.shields.io/github/v/release/syedatifhussainfr/AttendX?style=for-the-badge&label=release&color=0b4a71)](https://github.com/syedatifhussainfr/AttendX/releases/latest)
[![Tests](https://img.shields.io/badge/tests-46%20passing-247253?style=for-the-badge)](#verification)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-43853d?style=for-the-badge&logo=node.js&logoColor=white)](#requirements)
[![Database](https://img.shields.io/badge/SQLite%20%7C%20PostgreSQL-315b7d?style=for-the-badge&logo=postgresql&logoColor=white)](#technology)

[![Stars](https://img.shields.io/github/stars/syedatifhussainfr/AttendX?style=flat-square)](https://github.com/syedatifhussainfr/AttendX/stargazers)
[![Forks](https://img.shields.io/github/forks/syedatifhussainfr/AttendX?style=flat-square)](https://github.com/syedatifhussainfr/AttendX/forks)
[![Issues](https://img.shields.io/github/issues/syedatifhussainfr/AttendX?style=flat-square)](https://github.com/syedatifhussainfr/AttendX/issues)
[![Last commit](https://img.shields.io/github/last-commit/syedatifhussainfr/AttendX?style=flat-square)](https://github.com/syedatifhussainfr/AttendX/commits/main)

</div>

AttendX replaces slow roll calls with a controlled attendance workflow for class representatives, faculty, administrators, and service operators. It combines timetable-aware session creation, server-authoritative attendance rules, accountable corrections, human-readable reports, backup tooling, and tiered administration in one responsive application.

## Why AttendX

| Operate | Understand | Protect |
| --- | --- | --- |
| Run multiple database-backed class workspaces, timetables, live sessions, and rapid attendance tools. | Review class and student performance through subject analytics, histories, and structured Excel reports. | Enforce scoped roles, password-confirmed privileged actions, audit trails, validated backups, and hardened sessions. |

```text
Class workspace → Timetable → Live attendance → Review & close → Analytics & reports
                              ↘ crash-safe recovery ↗
```

## Product position

AttendX is designed for a managed-service model: an operator deploys and maintains an isolated instance for an institution, configures its academic data, protects backups, and manages privileged access. Version 1.1.9 supports multiple isolated class workspaces inside one institution deployment. A shared multi-tenant control plane, billing, and institution self-provisioning are future product work and are not falsely represented as existing features.

Operational records, credentials, local policy, institution settings, subjects, timetables, and administrator accounts belong to each deployment and are not source-controlled. Replace the bundled presentation assets and labels when preparing a differently branded deployment.

## Release status

| Version | Status | Summary |
| --- | --- | --- |
| `v1.0.0` | Released baseline | Core attendance workflow, basic administration, CSV onboarding, exports, and audit history. |
| `v1.1.6` | Previous release | Secure sessions, Admin++ controls, database visibility, self-healing permissions, reporting, and responsive operations. |
| `v1.1.7` | Previous release | Recoverable live attendance, stronger privilege boundaries, safer token rotation, configurable permissions, validated timetables, and refined operational UX. |
| `v1.1.8` | Previous release | Student intelligence workspace, profiles, subject analytics, weighted Late credit, privacy-safe administration, and additional recovery hardening. |
| `v1.1.9` | Previous release | Database-backed class workspaces, faculty and mentor assignments, class-scoped rosters, subjects, timetables, attendance, and reports. |
| `v1.1.9.1` | Current release | Protected institution identity, secure media and restore uploads, relationship-aware database inspection, tighter password-manager boundaries, and refined glass UI. |
| `v1.2.0` | Planned | Academic calendar, alerting, programme templates, and service-management foundations. |

The published [`v1.1.9.1` release](https://github.com/syedatifhussainfr/AttendX/releases/tag/v1.1.9.1) is the current stable release. [`v1.1.9`](https://github.com/syedatifhussainfr/AttendX/releases/tag/v1.1.9) is its direct upgrade baseline, and [`v1.0.0`](https://github.com/syedatifhussainfr/AttendX/releases/tag/v1.0.0) remains the original stable baseline.

## V1.1.9 compared with V1.1.9.1

| Area | V1.1.9 | V1.1.9.1 |
| --- | --- | --- |
| Institution identity | Bundled deployment branding | Admin++ managed institution name, campus, primary logo, optional secondary logo, and optional favicon override |
| Upload handling | General protected restore workflow | Signature, MIME, extension, dimension, size, rate-limit, cancellation, progress, and staged-write checks |
| Database inspection | Safe table browsing with redacted secrets | Human-readable class, student, subject, timetable, attendance, user, assignment, audit, and session relationships |
| Password managers | Browser behavior varied across protected forms | Credential autofill remains intentional on Login and is blocked from protected manual-entry controls |
| Class settings | Legacy global class labels could remain | Obsolete global settings are migrated away; `academic_classes` is the single class identity source |
| Interface | Class workspace glass UI | Cleaner sticky glass layering and live institution identity across application surfaces |
| Verification | 42 automated tests | 46 automated tests plus production build, live-data integrity checks, and a real database replacement test |

## V1.1.8 compared with V1.1.9

| Area | V1.1.8 | V1.1.9 |
| --- | --- | --- |
| Academic structure | One shared roster, timetable, and attendance workspace | Any number of database-defined classes with display name, code, course, specialization, semester, section, academic year, and batch |
| Initial workspaces | No class catalogue | `ANASUYA BCA AI 3A.UG`, `3B.UG`, and `3C.UG`; existing operational data migrates safely to 3B |
| Students | Globally unique roll numbers | Every student belongs to one class; roll numbers are unique inside that class and may repeat in another class |
| Subjects | One global operational list | Course-organized catalogue (BCA by default) with explicit per-class assignments |
| Timetable and attendance | Institution-wide | Strictly class-scoped schedules, sessions, marking, closure, history, analytics, and exports |
| Staff access | CR, ADMIN, and ADMIN++ | New FACULTY role plus per-class Mentor, Faculty, and CR assignments |
| Faculty authority | Not available | Operational management within assigned classes without global backup, database, user-role, or Admin++ authority |
| Navigation | One fixed workspace | Persistent glass class selector and class-management workspace |
| Data integrity | Global roll constraint | Composite class/roll constraint, preserved attendance ownership, class ownership enforcement, migration checks, and orphan detection |
| Verification | 40 automated tests | 42 automated tests including faculty isolation, cross-class roll behavior, and protected empty-class deletion |

### Upgrade from V1.1.8

```bash
npm run backup
git pull origin main
npm install
npm run config-check
npm run doctor
npm run dev
```

Migrations `008-academic-classes` through `011-subject-course-category` run automatically. They preserve existing records, create the three initial Semester 1 section workspaces, move existing students, timetable entries, attendance sessions, CR access, and subject assignments into 3B, replace the global roll-number constraint with a per-class constraint, protect attendance-to-student ownership during the table rebuild, and categorize the existing subject catalogue as BCA. Keep the pre-upgrade backup until class counts, timetables, student analytics, and reports have been reviewed.

## V1.1.7 compared with V1.1.8

| Area | V1.1.7 | V1.1.8 |
| --- | --- | --- |
| Student directory | Searchable roster and CSV reconciliation | Card/table workspace, natural roll sorting, filters, attendance standing, absence streaks, and persistent view preference |
| Student profiles | Basic student identity | Dedicated profile with subject performance, monthly calendar, recent timeline, recovery guidance, and individual workbook export |
| Student data | Roll, name, photo, card token | Optional enrolment number, section, admission date, phone, guardian contact, and administrative notes |
| Privacy boundary | Role-filtered student reads | Backend-enforced private-field reads and writes; delegated CR permissions cannot expose or overwrite sensitive fields |
| Attendance analytics | Present/Late/Absent totals | Credited attendance, physical appearance, overall/subject percentages, target standing, risk labels, and classes needed to recover |
| Late attendance | Status recorded with fixed credit behavior | Admin++ policy grants `1`, `0.5`, or `0` credit, snapshotted into each session and record |
| Reports | Institution review and machine workbooks | Individual student review exports and weighted-credit calculations across reports |
| Data model | Core student and attendance fields | Additive profile and weighted-credit migrations with duplicate-enrolment protection |
| Reliability | Recoverable marking and hardened operations | Stale-search protection, validated history filters, corrupt-setting fallbacks, and safer failed-restore recovery |
| Verification | 36 automated tests | 40 automated tests plus config, timetable, SQLite integrity, foreign-key, and production-build checks |

### Upgrade from V1.1.7

```bash
npm run backup
git pull origin main
npm install
npm run config-check
npm run doctor
npm run dev
```

The additive `006-student-profile` and `007-late-attendance-credit` migrations run automatically. Existing student and attendance rows are preserved, while historical boolean attendance credit is copied into the numeric credit field. Review the attendance target and Late credit policy in Settings after upgrading, and keep a tested backup before every deployment update.

## V1.0 compared with V1.1.8

| Area | V1.0 | V1.1.8 |
| --- | --- | --- |
| Authentication | JWT login | Short-lived in-memory access tokens plus rotating, hashed refresh sessions in `HttpOnly`, `SameSite=Strict` cookies |
| Logout | Client sign-out | Server-side session revocation, trusted-origin validation, popup flow, and dedicated `/logout` route |
| Passwords | Hashed passwords | Strong-password policy, forced temporary-password replacement, self-service changes, CR resets, and session invalidation |
| Administration | `ADMIN` / `CR` | `CR`, `ADMIN`, and elevated `ADMIN++` authority with five-minute password elevation for destructive tools |
| User management | Basic account controls | ADMIN account management; ADMIN++ permanent deletion and per-user device-session control |
| Database visibility | Local SQLite file | Password-gated Admin++ read-only browser with redacted credentials and validated management links |
| Student import | Direct CSV import | Preview and reconciliation for additions, changes, duplicates, invalid rows, and missing students |
| Attendance safety | Standard session flow | Explicit roll-click Present/Late marking, crash-safe local autosave/replay, pending-to-Absent closure, duplicate/overlap detection, opener/closer ownership, reopen reasons, and race-safe operations |
| Corrections | Basic edits | Mandatory reason, before/after state, actor, time, and permanent audit history |
| Student insight | Roster-oriented records | Individual profiles, attendance standing, subject risk, calendar history, absence streaks, and recovery guidance |
| Reporting | Basic export | Machine, organized review, and individual student workbooks with overall/subject weighted percentages |
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

### V1.1.7 — recoverable attendance and hardened operations

- Present, Late, and Remove tools support rapid roll-card marking and clean live overrides.
- Unmarked students remain pending until reviewed; confirmation converts them to Absent when the session closes.
- A browser-local write-ahead queue preserves attendance changes before network transmission and replays them after refresh, reconnection, or browser recovery.
- Session closure is blocked while local attendance changes remain unsynchronized.
- Same-browser refresh races recover safely without weakening cross-device refresh-token reuse detection.
- Settings includes a glass permission editor for CR and ADMIN after Admin++ password verification.
- ADMIN++ capabilities are always enabled in backend policy and cannot be reduced by YAML or browser edits.
- Users requires an ADMIN password check; Database and Backup & restore require an Admin++ password check.
- Admin++ can promote ordinary CR/ADMIN accounts between those roles; Admin++ assignment and revocation remain CLI-only.
- Timetable writes reject invalid clock values, inactive subjects, and overlapping active entries.
- Late Mode is inherited by new sessions; disabling it also disables the irrelevant threshold control.
- Backup restore validation now checks SQLite integrity, foreign keys, required user schema, and active administrator availability.
- Managed backup deletion, attendance-history deletion, and audit-log text export retain accountable reasons and snapshots.
- Modal focus trapping, focus restoration, keyboard containment, and background scroll locking prevent overlapping protected dialogs.
- Legacy audit timestamps are normalized without losing readable historical records.
- Configuration recovery artifacts are organized under ignored `archive/broken`, `archive/repaired`, and `archive/replaced` folders.
- `npm run timetable-check`, `npm run backup:list`, and `npm run doctor` provide repeatable operator checks.

### V1.1.8 — student intelligence and weighted attendance

- Redesigned roster with glass cards, compact table mode, natural roll ordering, search, filters, and persistent view preference.
- Backend-calculated attendance standing using a configurable target: Good, Needs attention, Critical, or No data.
- Present, Late, Absent, recorded-class, physical-appearance, recovery, and absence-streak summaries.
- Dedicated student profiles with subject-level percentages, monthly attendance calendar, recent timeline, and individual review workbook export.
- Optional enrolment number, section, admission date, contact, guardian contact, and administrative notes.
- Phone, guardian, notes, and card-token fields are omitted from CR API responses and exposed only to administrators.
- Additive `006-student-profile` migration, duplicate-enrolment protection, and integrity verification.
- Polished table actions, CSV affordances, vertically constrained administrator notes, and request-aware navigation progress.
- Admin++ Late credit policy with full (`1`), half (`0.5`), or zero (`0`) credit snapshotted into each new session.
- Additive `007-late-attendance-credit` migration preserves existing credited records while enabling weighted reports and student analytics.
- CR accounts with delegated student-management capabilities still cannot read or write private contact, guardian, note, or card-token fields.
- Attendance-history filters reject malformed dates, invalid subject identifiers, and reversed ranges before reaching the database.
- Invalid stored attendance settings fall back to secure operational defaults instead of interrupting session creation.
- Failed restore attempts clean staged uploads, recover the original SQLite file, and trigger a controlled API restart when required.

### V1.1.9 — database-backed class workspaces

- Class records contain display name, unique code, course, specialization, semester, section, academic year, batch, and active state.
- Initial A, B, and C workspaces are database rows rather than hardcoded frontend choices.
- Existing V1.1.8 students, timetable entries, sessions, subjects, and CR access migrate to `ANASUYA BCA AI 3B.UG` without recreating data.
- Students, timetables, attendance sessions, dashboard totals, history, analytics, and exports are scoped to the active class.
- Roll numbers are unique per class, allowing the same roll number in separate sections while rejecting duplicates inside one class.
- The subject catalogue is organized by course (BCA for the initial workspaces) and supports explicit class assignment before a subject can appear in a timetable or attendance session.
- FACULTY accounts can be assigned as a class Mentor or Faculty; CR accounts receive explicit per-class assignments.
- Faculty can manage assigned-class rosters, imports, subjects, timetables, live attendance, corrections, reopening, and reports while remaining outside global Admin++ tools.
- ADMIN accounts retain institution-wide visibility; Admin++ alone can archive classes or permanently delete an empty class after password verification. Classes containing students, timetable entries, or attendance history must be archived so their records remain intact.
- The glass class workspace supports creation, metadata editing, staff assignment/removal, mentor replacement, subject selection, and active-class switching.
- Migrations enforce class ownership, preserve attendance-to-student links while rebuilding the roster table, reject future unowned attendance rows, and safely replace the legacy global roll-number uniqueness constraint.
- Data verification and backup validation now reject attendance rows that have lost either their student or session owner.
- Settings owns institution-wide identity and attendance policy; class metadata is edited in the dedicated glass Classes workspace.
- The centered glass class switcher keeps the selected workspace and academic metadata balanced across desktop and responsive layouts.
- Password-manager autofill is limited to Login. Protected password and destructive-confirmation fields require manual typing, reject clipboard paste/drop, and confirmation phrases show live match progress.
- Development startup waits for API health before launching the browser interface, preventing initial login requests from racing API initialization.

### V1.1.9.1 — protected institution identity (local development)

- Admin++-only institution identity editor with session-bound password elevation and manual `UPDATE BRANDING` confirmation.
- Database-backed primary and optional secondary logos, preserved by normal SQLite backups.
- Primary logo drives navigation, login, security pages, dashboard watermark, live preview, and the favicon by default.
- An optional dedicated favicon can override the browser icon without changing either visible institution logo; removing it falls back to the primary logo.
- Secondary branding renders only when configured and disappears cleanly when removed.
- Institution name, short code, and campus update immediately throughout the active browser and in generated workbook metadata.
- PNG/JPEG extension, MIME, signature, structure, dimensions, megapixel, size, file-count, and rate-limit enforcement.
- Server-enforced, cancellable ten-second upload/verification window with Upload, Signature, Dimensions, and Apply stages plus live progress and ETA before any branding change is committed.
- Atomic profile/logo writes and an audit record without storing passwords or image bytes in audit history.
- Backup restore now accepts `.sqlite` files only, validates the SQLite signature before opening the database, streams uploads to staged storage instead of holding 100 MB in memory, and rate-limits restore attempts.
- Google/browser password-manager autofill and credential-save discovery are restricted to Login; protected modals and password-change fields use unnamed masked-text surfaces with manager-specific ignore hints and a hidden submission bridge, so no real password input exists for Google Password Manager to fill or save outside Login.
- The database console is relationship-aware: users show assigned classes (`ADMIN`/`ADMIN++` show `All classes`), students show class plus roll number, subjects list consuming classes, timetable/sessions/records resolve class and subject context, and audits/login sessions identify their related users. Class, staff-assignment, class-subject, and branding-metadata tables are also available without exposing credential hashes, phone numbers, IP hashes, token material, or logo bytes.
- Migration `013-remove-legacy-class-settings` removes obsolete global `className` and `academicSession` settings; class identity now comes exclusively from database-defined academic-class workspaces.
- 44 automated tests include Admin++ branding authorization, persistence, public delivery, optional-logo behavior, and audit coverage.

## Permission model

| Capability | CR | FACULTY | ADMIN | ADMIN++ |
| --- | :---: | :---: | :---: | :---: |
| View assigned class dashboard, students, history, and reports | ✓ | ✓ | All classes | All classes |
| Open and close attendance sessions | ✓ | ✓ | ✓ | ✓ |
| Correct an active session where policy permits | ✓ | ✓ | ✓ | ✓ |
| Correct/reopen closed attendance with a reason | — | Assigned classes | ✓ | ✓ |
| Manage students, subjects, and timetable | — | Assigned classes | ✓ | ✓ |
| Create and manage class workspaces | — | Assigned classes | ✓ | ✓ |
| Archive a class workspace | — | — | — | ✓ |
| Manage institution settings | — | — | ✓ | ✓ |
| Create users and reset staff passwords | — | — | ✓ | ✓ |
| Enable/disable ordinary managed accounts | — | — | ✓ | ✓ |
| View the redacted, read-only database browser | — | — | — | ✓ |
| View, create, download, restore, or delete managed backups | — | — | — | ✓ |
| Change an ordinary account role | — | — | — | ✓ |
| Modify an Admin++ account | — | — | — | CLI only |
| Inspect/revoke another user’s browser sessions | — | — | — | ✓ |
| Permanently delete protected records or attendance history | — | — | — | ✓ |
| Enable or disable Late Mode for new sessions | — | — | — | ✓ |
| Promote or revoke Admin++ | — | — | — | CLI only |

The Admin++ database browser remains strictly read-only. Data changes go through validated API workflows so authorization, relationships, and audit rules cannot be bypassed.

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

1. Update the institution profile, timezone, and attendance policy in Settings.
2. Create or review class metadata in Classes, then assign the BCA subjects and weekly timetable for each class.
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

Each role has a complete independent permission matrix. Missing files are recreated, malformed files are preserved as timestamped `.broken-*` copies, and structurally invalid files are preserved as `.repaired-*` copies before normalization. Recovery artifacts are kept out of the active config root under `config/archive/broken/`, `config/archive/repaired/`, and `config/archive/replaced/`; older loose artifacts are migrated there automatically. Missing keys use secure defaults, unknown keys are removed, invalid types are replaced, and required permission dependencies are restored.

Permanent deletion, database access, backup management, role changes, other-user session control, and Admin++ modification remain protected security boundaries. They cannot be granted to CR, FACULTY, or ordinary ADMIN. Every Admin++ capability is forced on by the backend, while the Settings matrix may configure valid CR/FACULTY/ADMIN choices below their security ceilings. Self-disable, self-delete, last-active-Admin++, secret-redaction, elevation, and audit safeguards are enforced in code and are not YAML switches.

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
| `npm run timetable-check` | Validate the live timetable, subjects, clock windows, and overlaps without changing data. |
| `npm run backup:list` | List managed backups with size, creation time, and validation state. |
| `npm run doctor` | Run config repair, timetable/data validation, all tests, and the production build. |
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

Opening **Backup & restore** requires an Admin++ password check. Restoration also requires the exact confirmation phrase. AttendX validates the upload, checks database integrity and required schema, confirms an active administrator remains, creates a pre-restore snapshot, restores the database, revokes sessions, and stops the API. Restart the service only after the restore response completes.

Admin++ may remove obsolete managed backup files from **Backup & restore** after password elevation, an exact confirmation phrase, and a mandatory reason. File deletion is restricted to validated filenames inside the configured backup directory and creates a permanent audit entry. Keep at least one tested off-machine recovery point before cleaning local backups.

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

The default late threshold is 15 minutes and is configurable. Its value is copied into each attendance session when opened, so later configuration changes cannot rewrite history. The threshold control is disabled in Settings while Late Mode is off because it has no effect in that mode.

The student attendance target defaults to 75% and is configurable in Settings. Student standing, recovery guidance, subject risk labels, and exports are calculated by the backend from closed attendance records using each record's numeric credit value.

Admin++ can enable or disable **Late Mode** from Settings. When enabled, its Advanced section lets Admin++ choose whether a Late mark earns full (`1`), half (`0.5`), or zero (`0`) attendance credit. Both the mode and credit value are copied into each newly opened session: enabled sessions classify arrivals after the threshold as Late, while disabled sessions record every marked arrival as Present. Existing sessions and historical records retain the rules under which they were created.

For a class beginning at `09:30` with a 15-minute threshold:

- `09:30:00`–`09:44:59`: `PRESENT`, attendance credit granted.
- `09:45:00` onward: `LATE`, with the session's snapshotted full, half, or zero credit.
- Unmarked when the session closes: `ABSENT`, no attendance credit.

During an open session, choose the persistent **Present**, **Late**, or **Remove mark** tool and then select as many roll cards as needed. Present and Late can overwrite one another, while Remove mark returns a roll to pending; those live changes preserve actor, time, and before/after audit history. Each selection is written to a browser-local recovery queue before its API request. Pending changes replay after reconnect or reload, duplicate replay is safe, and AttendX refuses to close the session while unsynced changes remain. Leaving a roll untouched keeps it pending, and AttendX does not silently mark it absent while the session is live. The close review lists all pending rolls, and only confirmation converts them to **Absent**. Authorized closed-session corrections still require an explicit reason.

Admin++ may permanently delete a closed attendance session from **Attendance history**. This destructive workflow requires fresh password elevation, the exact confirmation phrase, and a reason. Open sessions cannot be deleted, ordinary ADMIN cannot use the action, and a permanent audit snapshot of the deleted session and its totals remains available.

Credited attendance percentage is `sum of attendance credit values / classes conducted × 100`. A Present mark contributes `1`; a Late mark contributes the session's snapshotted `1`, `0.5`, or `0`; and an Absent mark contributes `0`. Physical appearance remains `PRESENT + LATE` regardless of credit policy.

## Security model

- Passwords are bcrypt hashes and are never returned by the API.
- Access tokens are short-lived and memory-only.
- Refresh tokens are high entropy, rotated, sent only as secure cookies, and stored only as hashes.
- Same-browser parallel refreshes receive a short race-safe recovery window; reuse from another device still revokes the account’s sessions.
- Login and administrator password elevation are rate limited.
- Helmet security headers and exact-origin credentialed CORS are enabled.
- Logout is POST-only, checks request origin, clears the cookie, and revokes the database session.
- Administrator elevation is password-confirmed, memory-only, tied to the current session, and expires after five minutes. Users uses ADMIN elevation; Database and Backups require Admin++ elevation.
- Database browsing redacts password, refresh-token, token-history, and IP-hash material.
- Destructive deletion is refused when historical relationships require deactivation instead.
- Closed attendance deletion preserves an audit snapshot even after its detailed records are removed.
- Audit logs can be downloaded as a human-readable `.txt` record from the Audit page.
- Self-disable, self-delete, and last-active-Admin++ protections prevent avoidable lockout.

## Verification

- 46 automated tests cover attendance rules and recovery queues, weighted Late credit, student profiles and privacy, imports, exports, refresh races, authorization gates, backup retention, verified live-database replacement and automatic restore restart, audit export, Admin++, faculty/class isolation, relationship-aware database inspection, password-confirmed staff removal, protected empty-class deletion, per-class roll numbers, role changes, timetable validation, destructive history controls, archive migration, filter validation, settings fallback, and self-healing configuration.
- Production frontend compilation succeeds with Vite.
- `npm run config-check` validates YAML parsing, structural repair, permission dependencies, and protected privilege ceilings.
- `npm run verify-data` checks SQLite integrity, foreign keys, attendance ownership, duplicate rolls, administrator availability, and record totals without modifying data.
- `npm run timetable-check` validates the current database timetable without changing it; `npm run doctor` runs the complete release check.

Deployment owners should still perform browser role checks, export review, a restore rehearsal on a disposable copy, HTTPS configuration, secret rotation, monitoring, and backup-retention validation in their own environment.

## Repository privacy

This repository contains application source, example configuration, migrations, and automated tests only. Git excludes live SQLite databases, database journals, managed backups, CSV/XLSX exports, uploads, generated output, local YAML policy overrides, environment files, logs, and coverage artifacts.

Never commit real student rosters, attendance exports, production backups, access tokens, passwords, administrator phone numbers, or populated `.env` files. Test identities and credentials in the automated suite are synthetic and must not be reused in a deployment.

## Roadmap

Planned product work includes:

- Institution onboarding and operator control plane.
- Programme templates, semester progression, and academic-year rollover tooling.
- Faculty substitution history and workload views.
- Holidays, closures, cancelled lectures, and special working days.
- Attendance thresholds, alerts, and scheduled customer reports.
- Customer-specific branding and domain configuration.
- Multi-tenant isolation, subscriptions, billing, and support operations.
- QR/card attendance using random revocable tokens rather than personal data.

## Important scope statement

V1.1.9.1 is a stable, service-operated release suitable for controlled pilot evaluation after deployment-specific backup, restore, role, browser, and export checks. It is not a self-service multi-tenant SaaS platform; each institution should receive an isolated deployment and database until tenant isolation, provisioning, billing, and operator tooling are deliberately implemented and independently reviewed.
