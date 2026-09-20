import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import {
  defaultPolicy,
  permissionDependencies,
  POLICY_VERSION,
  protectedPermissions,
} from "./defaultPolicy.js";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const policyDirectory = resolve(
  process.env.ATTENDX_CONFIG_DIR || join(sourceRoot, "config"),
);

const clone = (value) => structuredClone(value);
const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function repairAgainstTemplate(input, template, path, repairs) {
  if (!isObject(template)) {
    if (typeof input === typeof template) return input;
    repairs.push(`${path}: restored invalid value`);
    return template;
  }

  const candidate = isObject(input) ? input : {};
  if (!isObject(input)) repairs.push(`${path}: restored missing object`);
  const result = {};
  for (const [key, defaultValue] of Object.entries(template)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (!(key in candidate)) {
      repairs.push(`${nextPath}: restored missing key`);
      result[key] = clone(defaultValue);
    } else {
      result[key] = repairAgainstTemplate(
        candidate[key],
        defaultValue,
        nextPath,
        repairs,
      );
    }
  }
  for (const key of Object.keys(candidate))
    if (!(key in template)) repairs.push(`${path}.${key}: removed unknown key`);
  return result;
}

function getPath(target, path) {
  return path.split(".").reduce((value, key) => value?.[key], target);
}

function setPath(target, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const owner = keys.reduce((value, key) => (value[key] ||= {}), target);
  owner[last] = value;
}

export function normalizePolicy(input) {
  const repairs = [];
  const normalized = repairAgainstTemplate(
    input,
    defaultPolicy,
    "policy",
    repairs,
  );
  if (normalized.version !== POLICY_VERSION) {
    normalized.version = POLICY_VERSION;
    repairs.push(`policy.version: restored ${POLICY_VERSION}`);
  }

  for (const [capability, roleValues] of Object.entries(protectedPermissions))
    for (const [role, requiredValue] of Object.entries(roleValues)) {
      const path = `permissions.${role}.${capability}`;
      if (getPath(normalized, path) !== requiredValue) {
        setPath(normalized, path, requiredValue);
        repairs.push(`${path}: enforced protected value ${requiredValue}`);
      }
    }

  for (const role of Object.keys(normalized.permissions))
    for (const [capability, dependencies] of Object.entries(
      permissionDependencies,
    )) {
      if (!getPath(normalized, `permissions.${role}.${capability}`)) continue;
      for (const dependency of dependencies) {
        const path = `permissions.${role}.${dependency}`;
        if (getPath(normalized, path) !== true) {
          setPath(normalized, path, true);
          repairs.push(`${path}: enabled because ${capability} requires it`);
        }
      }
    }

  return { policy: normalized, repairs };
}

function policyText(policy, description) {
  return `# ${description}\n# Re-run npm run config-check after editing.\n${stringify(policy, {
    indent: 2,
    lineWidth: 100,
  })}`;
}

function writeCanonicalFile(path, description) {
  writeFileSync(path, policyText(defaultPolicy, description), "utf8");
}

function ensureCanonicalFile(path, description, events) {
  if (!existsSync(path)) {
    writeCanonicalFile(path, description);
    events.push(`created ${path}`);
    return;
  }
  try {
    const parsed = parse(readFileSync(path, "utf8"));
    if (!sameValue(parsed, defaultPolicy)) {
      const saved = `${path}.replaced-${timestamp()}`;
      copyFileSync(path, saved);
      writeCanonicalFile(path, description);
      events.push(`restored ${path}; previous file saved as ${saved}`);
    }
  } catch {
    const saved = `${path}.broken-${timestamp()}`;
    renameSync(path, saved);
    writeCanonicalFile(path, description);
    events.push(`repaired ${path}; broken file saved as ${saved}`);
  }
}

function repairPolicyFiles(directory) {
  mkdirSync(directory, { recursive: true });
  const events = [];
  const defaultPath = join(directory, "default.yml");
  const examplePath = join(directory, "config.example.yml");
  const configPath = join(directory, "config.yml");

  ensureCanonicalFile(
    defaultPath,
    "AttendX secure permission defaults. This file is automatically restored.",
    events,
  );
  ensureCanonicalFile(
    examplePath,
    "AttendX permission configuration example.",
    events,
  );

  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      policyText(defaultPolicy, "AttendX local permission configuration."),
      "utf8",
    );
    events.push(`created ${configPath}`);
  }

  let parsed;
  try {
    parsed = parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    const saved = `${configPath}.broken-${timestamp()}`;
    renameSync(configPath, saved);
    writeFileSync(
      configPath,
      policyText(defaultPolicy, "AttendX local permission configuration."),
      "utf8",
    );
    events.push(`repaired invalid YAML; broken file saved as ${saved}`);
    parsed = clone(defaultPolicy);
  }

  const { policy, repairs } = normalizePolicy(parsed);
  if (repairs.length) {
    const saved = `${configPath}.repaired-${timestamp()}`;
    copyFileSync(configPath, saved);
    writeFileSync(
      configPath,
      policyText(policy, "AttendX local permission configuration."),
      "utf8",
    );
    events.push(`normalized ${configPath}; previous file saved as ${saved}`);
  }
  return { policy, repairs, events, paths: { defaultPath, examplePath, configPath } };
}

export function initializePolicyFiles({ directory = policyDirectory } = {}) {
  try {
    return repairPolicyFiles(directory);
  } catch (error) {
    return {
      policy: clone(defaultPolicy),
      repairs: [],
      events: [
        `could not read or repair ${directory}; using secure in-memory defaults (${error.message})`,
      ],
      paths: {
        defaultPath: join(directory, "default.yml"),
        examplePath: join(directory, "config.example.yml"),
        configPath: join(directory, "config.yml"),
      },
      error,
    };
  }
}

function flattenPermissions(value, prefix = "", output = {}) {
  for (const [key, setting] of Object.entries(value || {})) {
    if (key === "inherits") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof setting === "boolean") output[path] = setting;
    else if (isObject(setting)) flattenPermissions(setting, path, output);
  }
  return output;
}

function resolveRolePermissions(policy, roleName, seen = new Set()) {
  if (seen.has(roleName)) return {};
  seen.add(roleName);
  const definition = policy.permissions[roleName] || {};
  const inherited = definition.inherits
    ? resolveRolePermissions(policy, definition.inherits, seen)
    : {};
  return { ...inherited, ...flattenPermissions(definition) };
}

const initialized = initializePolicyFiles();
export const permissionPolicy = initialized.policy;
export const policyStartupReport = initialized;

export function roleNameForUser(user) {
  return user?.role === "ADMIN" && user?.adminPlus ? "ADMIN_PLUS" : user?.role;
}

export function permissionMapForUser(user) {
  return resolveRolePermissions(permissionPolicy, roleNameForUser(user));
}

export function permissionsForUser(user) {
  return Object.entries(permissionMapForUser(user))
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort();
}

export function hasPermission(user, capability) {
  return permissionMapForUser(user)[capability] === true;
}
