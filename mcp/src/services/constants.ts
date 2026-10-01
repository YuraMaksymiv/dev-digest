/** How long run_agent_on_pr blocks before handing back a run_id to poll. */
export const RUN_WAIT_MS = 120_000;

/** Shown outside the untrusted block when the PR's changed files were not loaded yet (`pr_files` fills on first open in the UI). */
export const BLAST_NO_DATA_HINT =
  'No index data for this PR yet. Open the PR in DevDigest once so its changed files are loaded, resync the repo index there, then call get_blast_radius again.';
