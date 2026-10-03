import type { ContextDoc } from "@devdigest/shared";

export function splitPath(path: string): { name: string; folder: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, folder: "" } : { name: path.slice(i + 1), folder: path.slice(0, i + 1) };
}

export function filterDocs(docs: ContextDoc[], query: string): ContextDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => d.path.toLowerCase().includes(q));
}

/** The selected doc if it is still listed, else the first visible one. */
export function pickSelected(visible: ContextDoc[], selected: string | null): ContextDoc | null {
  return visible.find((d) => d.path === selected) ?? visible[0] ?? null;
}
