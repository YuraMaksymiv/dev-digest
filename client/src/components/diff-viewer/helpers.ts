/** Pure helpers for the DiffViewer. */
import { HUNK_HEADER_RE } from "./constants";
import type { PrFile } from "@/lib/types";
import type { SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";

/** Deep-link target inside the diff: a file and, optionally, a line in its new version. */
export interface FocusTarget {
  file: string;
  line: number | null;
}

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}

export interface FileGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

export type OrderedFiles = { kind: "flat"; files: PrFile[] } | { kind: "grouped"; groups: FileGroup[] };

/**
 * Order the "Files changed" list either flat (GitHub order) or by Smart Diff
 * role. `order === 'original'`, or `groups` not yet loaded, always falls back
 * to flat. In `'smart'` mode, each `SmartDiffGroup.files[].path` is joined back
 * to the matching `PrFile` from the flat `files` prop — groups with no
 * matching file (the server always returns all 5, decision §2) are dropped.
 */
export function orderFiles(
  files: PrFile[],
  groups: SmartDiffGroup[] | undefined,
  order: "smart" | "original",
): OrderedFiles {
  if (order === "original" || !groups) return { kind: "flat", files };
  const byPath = new Map(files.map((f) => [f.path, f]));
  const result: FileGroup[] = [];
  for (const g of groups) {
    const matched = g.files.map((f) => byPath.get(f.path)).filter((f): f is PrFile => !!f);
    if (matched.length > 0) result.push({ role: g.role, files: matched });
  }
  return { kind: "grouped", groups: result };
}
