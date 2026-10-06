import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationsDir = fileURLToPath(new URL('../src/db/migrations/', import.meta.url));

describe('onboarding migration', () => {
  it('NFR-8: migration is generated (journaled), additive and nullable', () => {
    const journal = JSON.parse(readFileSync(`${migrationsDir}meta/_journal.json`, 'utf8')) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((e) => e.tag)).toContain('0017_eager_toxin');

    const statements = readFileSync(`${migrationsDir}0017_eager_toxin.sql`, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(7);
    for (const stmt of statements) {
      expect(stmt).toMatch(/^ALTER TABLE "onboarding" ADD COLUMN "\w+" [\w ]+;$/);
      expect(stmt).not.toMatch(/NOT NULL|DROP|RENAME/i);
    }
  });
});
