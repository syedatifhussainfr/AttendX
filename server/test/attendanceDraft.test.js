import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

const values = new Map();
globalThis.crypto ||= webcrypto;
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const drafts = await import("../../client/src/utils/attendanceDraft.js");

beforeEach(() => values.clear());

test("attendance recovery queue keeps only the newest selection per student", () => {
  drafts.queueAttendanceDraft("session-1", {
    kind: "SELECTION",
    studentId: 7,
    status: "PRESENT",
  });
  drafts.queueAttendanceDraft("session-1", {
    kind: "SELECTION",
    studentId: 7,
    status: "LATE",
  });
  drafts.queueAttendanceDraft("session-1", {
    kind: "SELECTION",
    studentId: 8,
    status: null,
  });
  const queued = drafts.readAttendanceDrafts("session-1");
  assert.equal(queued.length, 2);
  assert.equal(queued.find((row) => row.studentId === 7).status, "LATE");
  assert.equal(queued.find((row) => row.studentId === 8).status, null);
});

test("attendance recovery removes saved work and preserves retryable work", async () => {
  drafts.queueAttendanceDraft("session-2", {
    kind: "ROLL",
    rollNumber: "01",
  });
  drafts.queueAttendanceDraft("session-2", {
    kind: "ROLL",
    rollNumber: "02",
  });
  const seen = [];
  const remaining = await drafts.syncAttendanceDrafts("session-2", async (draft) => {
    seen.push(draft.rollNumber);
    return draft.rollNumber === "02" ? "RETRY" : "SAVED";
  });
  assert.deepEqual(seen, ["01", "02"]);
  assert.deepEqual(remaining.map((row) => row.rollNumber), ["02"]);
});
