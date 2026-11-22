const VALID_TYPES = new Set(["success", "info", "warning"]);
const MAX_ENTRIES = 100;

/**
 * Parse and validate browser-local activity data. Invalid JSON is never trusted
 * as application state; a valid subset of older records is preserved.
 * @param {string | null} raw
 * @returns {{ logs: Array<{ id: number, time: string, timestamp?: string, action: string, detail: string, type: 'success' | 'info' | 'warning' }>, warning: boolean }}
 */
export function parseStoredLogs(raw) {
  if (raw === null) return { logs: [], warning: false };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { logs: [], warning: true };
  }
  if (!Array.isArray(value)) return { logs: [], warning: true };

  let warning = false;
  const logs = [];
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !Number.isSafeInteger(entry.id) ||
      entry.id < 0 ||
      typeof entry.time !== "string" ||
      entry.time.length > 32 ||
      typeof entry.action !== "string" ||
      entry.action.length > 256 ||
      typeof entry.detail !== "string" ||
      entry.detail.length > 1000 ||
      !VALID_TYPES.has(entry.type) ||
      (entry.timestamp !== undefined &&
        (typeof entry.timestamp !== "string" ||
          !Number.isFinite(Date.parse(entry.timestamp))))
    ) {
      warning = true;
      continue;
    }
    logs.push({
      id: entry.id,
      time: entry.time,
      ...(entry.timestamp === undefined ? {} : { timestamp: entry.timestamp }),
      action: entry.action,
      detail: entry.detail,
      type: entry.type,
    });
  }
  if (value.length > MAX_ENTRIES) warning = true;
  return { logs: logs.slice(0, MAX_ENTRIES), warning };
}

/** @param {Array<{ id: number, time: string, timestamp?: string, action: string, detail: string, type: 'success' | 'info' | 'warning' }>} logs */
export function serializeLogs(logs) {
  return JSON.stringify(logs.slice(0, MAX_ENTRIES));
}
