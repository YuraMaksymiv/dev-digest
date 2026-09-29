/**
 * Demo-only fixture for the Smart Diff test PR — deliberately naive N+1 query
 * pattern (one `findMany` call per file, inside the loop, instead of a single
 * batched `IN` query) so a review run has a real `core` finding to show.
 * Not wired into any route; safe to delete once the demo is recorded.
 */
export interface FindingsLookup {
  findMany(args: { where: { file: string } }): Promise<unknown[]>;
}

export async function loadFindingsPerFile(
  db: { findings: FindingsLookup },
  filePaths: string[],
): Promise<unknown[][]> {
  const results: unknown[][] = [];
  for (const file of filePaths) {
    results.push(await db.findings.findMany({ where: { file } }));
  }
  return results;
}
