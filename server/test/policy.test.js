import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import {
  initializePolicyFiles,
  normalizePolicy,
} from "../src/policy/policyService.js";
import { defaultPolicy } from "../src/policy/defaultPolicy.js";

test("missing policy files are generated with secure defaults", () => {
  const directory = mkdtempSync(join(tmpdir(), "attendx-policy-missing-"));
  const result = initializePolicyFiles({ directory });
  assert.deepEqual(readdirSync(directory).sort(), [
    "config.example.yml",
    "config.yml",
    "default.yml",
  ]);
  assert.deepEqual(result.policy, defaultPolicy);
  assert.equal(result.events.length, 3);
});

test("broken YAML is preserved and replaced without stopping startup", () => {
  const directory = mkdtempSync(join(tmpdir(), "attendx-policy-broken-"));
  initializePolicyFiles({ directory });
  writeFileSync(join(directory, "config.yml"), "permissions: [broken", "utf8");
  const result = initializePolicyFiles({ directory });
  assert.deepEqual(result.policy, defaultPolicy);
  assert.ok(
    readdirSync(join(directory, "archive", "broken")).some((name) =>
      name.startsWith("config.yml.broken-"),
    ),
  );
  assert.deepEqual(
    readdirSync(directory).filter((name) => name.includes(".broken-")),
    [],
  );
  assert.doesNotThrow(() =>
    parse(readFileSync(join(directory, "config.yml"), "utf8")),
  );
});

test("loose legacy recovery files are organized into archive subfolders", () => {
  const directory = mkdtempSync(join(tmpdir(), "attendx-policy-archive-"));
  initializePolicyFiles({ directory });
  const files = [
    "default.yml.broken-2026-01-01T00-00-00-000Z",
    "config.yml.repaired-2026-01-01T00-00-00-000Z",
    "config.example.yml.replaced-2026-01-01T00-00-00-000Z",
  ];
  for (const filename of files)
    writeFileSync(join(directory, filename), "archived content", "utf8");
  const result = initializePolicyFiles({ directory });
  for (const filename of files) {
    const kind = filename.match(/\.(broken|repaired|replaced)-/)[1];
    assert.equal(existsSync(join(directory, filename)), false);
    assert.equal(existsSync(join(directory, "archive", kind, filename)), true);
  }
  assert.equal(
    result.events.filter((event) =>
      event.includes("archived legacy recovery file"),
    ).length,
    3,
  );
});

test("repair keeps valid choices while restoring structure and boundaries", () => {
  const edited = structuredClone(defaultPolicy);
  edited.permissions.CR.attendance.reopen = true;
  edited.permissions.CR.students.delete = true;
  edited.permissions.ADMIN.settings.view = false;
  edited.permissions.ADMIN.settings.manage = true;
  delete edited.permissions.CR.students.view;
  edited.permissions.CR.unknownArea = { surprise: true };

  const { policy, repairs } = normalizePolicy(edited);
  assert.equal(policy.permissions.CR.attendance.reopen, true);
  assert.equal(policy.permissions.CR.students.delete, false);
  assert.equal(policy.permissions.CR.students.view, true);
  assert.equal(policy.permissions.ADMIN.settings.view, true);
  assert.equal("unknownArea" in policy.permissions.CR, false);
  assert.ok(repairs.length >= 4);
});

test("a valid custom configuration remains stable", () => {
  const directory = mkdtempSync(join(tmpdir(), "attendx-policy-custom-"));
  initializePolicyFiles({ directory });
  const custom = structuredClone(defaultPolicy);
  custom.permissions.CR.reports.export = false;
  writeFileSync(join(directory, "config.yml"), stringify(custom), "utf8");
  const result = initializePolicyFiles({ directory });
  assert.equal(result.policy.permissions.CR.reports.export, false);
  assert.equal(result.repairs.length, 0);
});
