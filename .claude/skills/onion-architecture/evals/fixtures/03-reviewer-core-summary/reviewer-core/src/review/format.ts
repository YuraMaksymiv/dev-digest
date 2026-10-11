import type { Finding } from '@devdigest/shared';

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

export function formatFindingsForSummary(findings: Finding[]): string {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  return sorted
    .map((f) => `- [${f.severity}] ${f.file}:${f.start_line} ${f.title}`)
    .join('\n');
}
