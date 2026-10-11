import { MAX_LABELS, MAX_LABEL_LENGTH } from './constants.js';

export function normalizeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of labels) {
    const name = raw.trim().toLowerCase().slice(0, MAX_LABEL_LENGTH);
    if (name) seen.add(name);
  }
  return [...seen].sort().slice(0, MAX_LABELS);
}
