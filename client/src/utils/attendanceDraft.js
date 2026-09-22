const activeSyncs = new Map();

const keyOf = (sessionId) => `attendx_attendance_draft_${sessionId}`;

export function readAttendanceDrafts(sessionId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyOf(sessionId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAttendanceDrafts(sessionId, drafts) {
  if (drafts.length)
    localStorage.setItem(keyOf(sessionId), JSON.stringify(drafts));
  else localStorage.removeItem(keyOf(sessionId));
  return drafts;
}

export function queueAttendanceDraft(sessionId, operation) {
  const draft = {
    ...operation,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  const current = readAttendanceDrafts(sessionId);
  const next =
    draft.kind === "SELECTION"
      ? [
          ...current.filter(
            (item) =>
              item.kind !== "SELECTION" || item.studentId !== draft.studentId,
          ),
          draft,
        ]
      : [...current, draft];
  writeAttendanceDrafts(sessionId, next);
  return draft;
}

export function removeAttendanceDraft(sessionId, draftId) {
  return writeAttendanceDrafts(
    sessionId,
    readAttendanceDrafts(sessionId).filter((item) => item.id !== draftId),
  );
}

export function clearAttendanceDrafts(sessionId) {
  localStorage.removeItem(keyOf(sessionId));
}

export function syncAttendanceDrafts(sessionId, execute) {
  if (activeSyncs.has(sessionId)) return activeSyncs.get(sessionId);
  const sync = (async () => {
    for (const draft of readAttendanceDrafts(sessionId)) {
      const result = await execute(draft);
      if (result === "RETRY") break;
      removeAttendanceDraft(sessionId, draft.id);
    }
    return readAttendanceDrafts(sessionId);
  })().finally(() => activeSyncs.delete(sessionId));
  activeSyncs.set(sessionId, sync);
  return sync;
}
