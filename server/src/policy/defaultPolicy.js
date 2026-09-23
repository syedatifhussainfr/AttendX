export const POLICY_VERSION = 3;

const crPermissions = {
  dashboard: { view: true },
  classes: {
    view: true,
    create: false,
    manage: false,
    assignStaff: false,
    assignSubjects: false,
    archive: false,
    delete: false,
  },
  attendance: {
    view: true,
    open: true,
    mark: true,
    close: true,
    correctOpen: true,
    correctClosed: false,
    reopen: false,
    delete: false,
  },
  students: {
    view: true,
    create: false,
    update: false,
    import: false,
    delete: false,
  },
  subjects: { view: true, manage: false, delete: false },
  timetable: { view: true, manage: false },
  reports: { view: true, export: true },
  settings: {
    view: false,
    manage: false,
    manageLateMode: false,
    managePermissions: false,
  },
  users: {
    view: false,
    create: false,
    update: false,
    resetCrPassword: false,
    delete: false,
    manageSessions: false,
    modifyAdminPlus: false,
    changeRole: false,
  },
  database: { view: false },
  audit: { view: false },
  backups: {
    view: false,
    create: false,
    download: false,
    restore: false,
    delete: false,
  },
};

function rolePermissions(base, overrides) {
  return Object.fromEntries(
    Object.entries(base).map(([area, permissions]) => [
      area,
      { ...permissions, ...(overrides[area] || {}) },
    ]),
  );
}

const adminPermissions = rolePermissions(crPermissions, {
  classes: {
    create: true,
    manage: true,
    assignStaff: true,
    assignSubjects: true,
  },
  attendance: { correctClosed: true, reopen: true },
  students: { create: true, update: true, import: true },
  subjects: { manage: true },
  timetable: { manage: true },
  settings: { view: true, manage: true },
  users: {
    view: true,
    create: true,
    update: true,
    resetCrPassword: true,
  },
  database: { view: false },
  audit: { view: true },
  backups: { view: false, create: false, download: false, restore: false },
});

const facultyPermissions = rolePermissions(crPermissions, {
  classes: {
    create: true,
    manage: true,
    assignStaff: true,
    assignSubjects: true,
  },
  attendance: { correctClosed: true, reopen: true },
  students: { create: true, update: true, import: true },
  subjects: { manage: true },
  timetable: { manage: true },
});

const adminPlusPermissions = rolePermissions(adminPermissions, {
  classes: { archive: true, delete: true },
  attendance: { delete: true },
  students: { delete: true },
  subjects: { delete: true },
  users: {
    delete: true,
    manageSessions: true,
    modifyAdminPlus: true,
    changeRole: true,
  },
  database: { view: true },
  backups: {
    view: true,
    create: true,
    download: true,
    restore: true,
    delete: true,
  },
  settings: { manageLateMode: true, managePermissions: true },
});

export const defaultPolicy = {
  version: POLICY_VERSION,
  permissions: {
    CR: crPermissions,
    FACULTY: facultyPermissions,
    ADMIN: adminPermissions,
    ADMIN_PLUS: adminPlusPermissions,
  },
};

// Privilege ceilings: protected permissions may be disabled, but cannot be
// granted to a lower-trust role.
export const protectedPermissions = {
  "classes.create": { CR: false },
  "classes.manage": { CR: false },
  "classes.assignStaff": { CR: false },
  "classes.assignSubjects": { CR: false },
  "classes.archive": { CR: false, FACULTY: false, ADMIN: false },
  "classes.delete": { CR: false, FACULTY: false, ADMIN: false },
  "attendance.delete": { CR: false, FACULTY: false, ADMIN: false },
  "students.delete": { CR: false, FACULTY: false, ADMIN: false },
  "subjects.delete": { CR: false, FACULTY: false, ADMIN: false },
  "users.create": { CR: false, FACULTY: false },
  "users.update": { CR: false, FACULTY: false },
  "users.resetCrPassword": { CR: false, FACULTY: false },
  "users.delete": { CR: false, FACULTY: false, ADMIN: false },
  "users.manageSessions": { CR: false, FACULTY: false, ADMIN: false },
  "users.modifyAdminPlus": { CR: false, FACULTY: false, ADMIN: false },
  "backups.delete": { CR: false, FACULTY: false, ADMIN: false },
  "settings.manageLateMode": { CR: false, FACULTY: false, ADMIN: false },
  "settings.managePermissions": { CR: false, FACULTY: false, ADMIN: false },
  "users.changeRole": { CR: false, FACULTY: false, ADMIN: false },
  "database.view": { CR: false, FACULTY: false, ADMIN: false },
  "backups.view": { CR: false, FACULTY: false, ADMIN: false },
  "backups.create": { CR: false, FACULTY: false, ADMIN: false },
  "backups.download": { CR: false, FACULTY: false, ADMIN: false },
  "backups.restore": { CR: false, FACULTY: false, ADMIN: false },
};

export const permissionDependencies = {
  "classes.create": ["classes.view"],
  "classes.manage": ["classes.view"],
  "classes.assignStaff": ["classes.view"],
  "classes.assignSubjects": ["classes.view", "subjects.view"],
  "classes.archive": ["classes.view"],
  "classes.delete": ["classes.view"],
  "attendance.open": ["attendance.view", "subjects.view"],
  "attendance.mark": ["attendance.view"],
  "attendance.close": ["attendance.view"],
  "attendance.correctOpen": ["attendance.view"],
  "attendance.correctClosed": ["attendance.view"],
  "attendance.reopen": ["attendance.view"],
  "attendance.delete": ["attendance.view"],
  "students.create": ["students.view"],
  "students.update": ["students.view"],
  "students.import": ["students.view"],
  "students.delete": ["students.view"],
  "subjects.manage": ["subjects.view"],
  "subjects.delete": ["subjects.view"],
  "timetable.manage": ["timetable.view", "subjects.view"],
  "reports.export": ["reports.view"],
  "settings.manage": ["settings.view"],
  "settings.manageLateMode": ["settings.view"],
  "settings.managePermissions": ["settings.view"],
  "users.create": ["users.view"],
  "users.update": ["users.view"],
  "users.resetCrPassword": ["users.view"],
  "users.delete": ["users.view"],
  "users.manageSessions": ["users.view"],
  "users.changeRole": ["users.view"],
  "backups.create": ["backups.view"],
  "backups.download": ["backups.view"],
  "backups.restore": ["backups.view"],
  "backups.delete": ["backups.view"],
};
