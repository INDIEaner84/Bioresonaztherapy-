import test from "node:test";
import assert from "node:assert/strict";
import { parseStoredLogs, serializeLogs } from "../src/session-log.js";

const current = {
  id: 42,
  time: "12:34:56",
  timestamp: "2026-11-22T12:34:56.000Z",
  action: "Preview complete",
  detail: "Simulation only",
  type: "success",
};

test("empty and legacy browser storage produce an empty, non-warning state", () => {
  assert.deepEqual(parseStoredLogs(null), { logs: [], warning: false });
  assert.deepEqual(parseStoredLogs("[]"), { logs: [], warning: false });
});

test("valid current and legacy log records survive parsing and serialization", () => {
  const records = [
    current,
    {
      id: 3,
      time: "08:00:00",
      action: "Old entry",
      detail: "Legacy local entry",
      type: "info",
    },
  ];
  const parsed = parseStoredLogs(JSON.stringify(records));
  assert.equal(parsed.warning, false);
  assert.deepEqual(parsed.logs, records);
  assert.deepEqual(parseStoredLogs(serializeLogs(parsed.logs)).logs, records);
});

test("corrupt JSON and non-array storage are rejected without throwing", () => {
  assert.deepEqual(parseStoredLogs("{broken"), { logs: [], warning: true });
  assert.deepEqual(parseStoredLogs('{"id":1}'), { logs: [], warning: true });
});

test("invalid entries are filtered and flagged, while valid neighboring records remain", () => {
  const parsed = parseStoredLogs(
    JSON.stringify([
      current,
      { ...current, id: NaN },
      { ...current, type: "unknown" },
    ]),
  );
  assert.equal(parsed.warning, true);
  assert.deepEqual(parsed.logs, [current]);
});

test("oversized history is capped at 100 records and flagged", () => {
  const records = Array.from({ length: 102 }, (_, index) => ({
    ...current,
    id: index,
  }));
  const parsed = parseStoredLogs(JSON.stringify(records));
  assert.equal(parsed.logs.length, 100);
  assert.equal(parsed.warning, true);
});
