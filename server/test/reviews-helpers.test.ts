import { describe, it, expect } from 'vitest';
import { taskLine, summarizePromptSections } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/**
 * Unit coverage for the prompt-assembly log manifest. The key invariant:
 * this NEVER carries a section's actual text — only its name, source, and
 * size — so it stays safe to log even when a section holds a secret, the
 * full diff, or private spec/ticket content.
 */
describe('summarizePromptSections', () => {
  const countChars = (text: string) => text.length; // stand-in tokenizer for these tests

  it('omits empty/absent sections instead of logging a zero-length row', () => {
    const out = summarizePromptSections(
      [
        { section: 'diff', source: 'diff', content: 'some diff text' },
        { section: 'pr-description', source: 'pr-description', content: undefined },
        { section: 'intent', source: 'intent', content: '   ' },
      ],
      countChars,
    );
    expect(out.map((s) => s.section)).toEqual(['diff']);
  });

  it('never includes the section content itself, only its size', () => {
    const secret = 'sk-super-secret-api-key-do-not-log-me';
    const out = summarizePromptSections(
      [{ section: 'pr-description', source: 'pr-description', content: `token=${secret}` }],
      countChars,
    );
    expect(out).toHaveLength(1);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(secret);
    expect(out[0]).toMatchObject({ section: 'pr-description', source: 'pr-description', chars: 6 + secret.length });
  });

  it('omits the hash field by default (non-verbose)', () => {
    const out = summarizePromptSections([{ section: 'diff', source: 'diff', content: 'x'.repeat(50) }], countChars);
    expect(out[0].hash).toBeUndefined();
  });

  it('adds a one-way hash, never the content, only when a hashSection fn is supplied', () => {
    const content = 'private spec content that must never be logged verbatim';
    const out = summarizePromptSections(
      [{ section: 'specs', source: 'specs', content }],
      countChars,
      (text) => `fakehash-${text.length}`,
    );
    expect(out[0].hash).toBe(`fakehash-${content.length}`);
    expect(JSON.stringify(out)).not.toContain(content);
  });
});
