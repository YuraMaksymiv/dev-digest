/** Deep link into the Files changed tab; the file path is encoded as one query value. */
export function diffHref(
  repoId: string,
  number: string,
  file: string,
  line?: number | null,
): string {
  const base = `/repos/${repoId}/pulls/${number}?tab=diff&file=${encodeURIComponent(file)}`;
  return line != null ? `${base}&line=${line}` : base;
}
