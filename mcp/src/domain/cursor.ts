import { ToolError } from './errors.js';
import type { Severity } from './types.js';

// Payload is ASCII-only (uuids, enum), so btoa/atob are safe without UTF-8 handling.
interface CursorPayload {
  r: string;
  s: Severity | null;
  o: number;
}

export interface CursorScope {
  runId: string;
  severity: Severity | undefined;
}

export function encodeCursor(scope: CursorScope, offset: number): string {
  const payload: CursorPayload = { r: scope.runId, s: scope.severity ?? null, o: offset };
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Rejects a cursor minted for a different run/filter: its offset would index another list. */
export function decodeCursor(cursor: string, scope: CursorScope): number {
  const invalid = new ToolError(
    'Invalid cursor. Omit `cursor` to start from the first page, or pass the one from the previous response unchanged.',
  );
  let payload: Partial<CursorPayload>;
  try {
    payload = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))) as Partial<CursorPayload>;
  } catch {
    throw invalid;
  }
  if (
    payload.r !== scope.runId ||
    (payload.s ?? null) !== (scope.severity ?? null) ||
    typeof payload.o !== 'number' ||
    !Number.isInteger(payload.o) ||
    payload.o < 0
  ) {
    throw invalid;
  }
  return payload.o;
}
