export interface SessionLogRecord {
  id: number;
  time: string;
  timestamp?: string;
  action: string;
  detail: string;
  type: "success" | "info" | "warning";
}

export interface ParsedSessionLog {
  logs: SessionLogRecord[];
  warning: boolean;
}

export function parseStoredLogs(raw: string | null): ParsedSessionLog;
export function serializeLogs(logs: SessionLogRecord[]): string;
