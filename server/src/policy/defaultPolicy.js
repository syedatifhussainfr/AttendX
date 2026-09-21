export const POLICY_VERSION = 1;

const crPermissions = {
  dashboard: { view: true },
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
  settings: { view: false, manage: false },
  users: {
    view: false,
    create: false,
    update: false,
    resetCrPassword: false,
    delete: false,
    manageSessions: false,
    modifyAdminPlus: false,
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
  database: { view: true },
  audit: { view: true },
  backups: { view: true, create: true, download: true, restore: true },
});

const adminPlusPermissions = rolePermissions(adminPermissions, {
  attendance: { delete: true },
  students: { delete: true },
  subjects: { delete: true },
  users: { delete: true, manageSessions: true, modifyAdminPlus: true },
  backups: { delete: true },
});

export const defaultPolicy = {
  version: POLICY_VERSION,
  permissions: {
    CR: crPermissions,
    ADMIN: adminPermissions,
    ADMIN_PLUS: adminPlusPermissions,
  },
};

// Privilege ceilings: protected permissions may be disabled, but cannot be
// granted to a lower-trust role.
export const protectedPermissions = {
  "attendance.delete": { CR: false, ADMIN: false },
  "students.delete": { CR: false, ADMIN: false },
  "subjects.delete": { CR: false, ADMIN: false },
  "users.create": { CR: false },
  "users.update": { CR: false },
  "users.resetCrPassword": { CR: false },
  "users.delete": { CR: false, ADMIN: false },
  "users.manageSessions": { CR: false, ADMIN: false },
  "users.modifyAdminPlus": { CR: false, ADMIN: false },
  "backups.delete": { CR: false, ADMIN: false },
};

export const permissionDependencies = {
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
  "users.create": ["users.view"],
  "users.update": ["users.view"],
  "users.resetCrPassword": ["users.view"],
  "users.delete": ["users.view"],
  "users.manageSessions": ["users.view"],
  "backups.create": ["backups.view"],
  "backups.download": ["backups.view"],
  "backups.restore": ["backups.view"],
  "backups.delete": ["backups.view"],
};
