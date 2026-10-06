/** Strict positive-integer `?line=` value; anything else (0, -1, 1.5, "x", empty) is ignored. */
export function parseLineParam(raw: string | null): number | null {
  return raw != null && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}
