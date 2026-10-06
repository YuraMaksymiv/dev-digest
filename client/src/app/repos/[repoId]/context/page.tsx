/* Route: /repos/:repoId/context — read-only browser for the repo's project docs. */
"use client";

import { ContextView } from "./_components/ContextView";

export default function ProjectContextPage() {
  return <ContextView />;
}
