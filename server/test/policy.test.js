import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  assert.deepEqual(
    readdirSync(directory).sort(),
    ["config.example.yml", "config.yml", "default.yml"],
  );
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
    readdirSync(directory).some((name) => name.startsWith("config.yml.broken-")),
  );
  assert.doesNotThrow(() => parse(readFileSync(join(directory, "config.yml"), "utf8")));
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
