import { describe, it, expect } from 'vitest';
import {
  toSkillDto,
  toSkillVersionDto,
  isSkillConfigChange,
  type SkillRowLike,
} from '../src/modules/skills/helpers.js';
import { toSkillPromptBlock } from '../src/modules/reviews/helpers.js';

const ROW: SkillRowLike = {
  id: 'sk1',
  name: 'no-then-chains',
  description: 'When the diff adds a .then() chain, require async/await instead.',
  type: 'convention',
  source: 'manual',
  body: 'Use async/await.',
  enabled: true,
  version: 3,
  evidenceFiles: null,
};

describe('toSkillDto', () => {
  it('maps a row to the wire DTO, renaming evidenceFiles', () => {
    expect(toSkillDto({ ...ROW, evidenceFiles: ['src/a.ts'] })).toEqual({
      id: 'sk1',
      name: 'no-then-chains',
      description: ROW.description,
      type: 'convention',
      source: 'manual',
      body: 'Use async/await.',
      enabled: true,
      version: 3,
      evidence_files: ['src/a.ts'],
    });
  });

  it('normalises a missing evidence list to null rather than undefined', () => {
    expect(toSkillDto(ROW).evidence_files).toBeNull();
  });
});

describe('toSkillVersionDto', () => {
  it('ISO-formats created_at and snake_cases the skill id', () => {
    const dto = toSkillVersionDto({
      skillId: 'sk1',
      version: 2,
      body: 'Older body.',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
    });
    expect(dto).toEqual({
      skill_id: 'sk1',
      version: 2,
      body: 'Older body.',
      created_at: '2026-01-02T03:04:05.000Z',
    });
  });
});

describe('isSkillConfigChange', () => {
  it.each([
    ['name', { name: 'renamed' }],
    ['description', { description: 'When X, do Y.' }],
    ['type', { type: 'rubric' as const }],
    ['body', { body: 'Different body.' }],
  ])('is true when %s actually changes', (_field, patch) => {
    expect(isSkillConfigChange(ROW, patch)).toBe(true);
  });

  it('is false when the patch repeats the existing values', () => {
    expect(
      isSkillConfigChange(ROW, {
        name: ROW.name,
        description: ROW.description,
        type: 'convention',
        body: ROW.body,
      }),
    ).toBe(false);
  });

  it('is false for an empty patch', () => {
    expect(isSkillConfigChange(ROW, {})).toBe(false);
  });

  it('ignores `enabled`: muting a skill must not spawn an identical version', () => {
    // `enabled` is not part of SkillConfigChangePatch at all — the type is the
    // first guard, this asserts the runtime behaviour behind it.
    expect(isSkillConfigChange(ROW, { enabled: false } as never)).toBe(false);
  });
});

describe('toSkillPromptBlock', () => {
  it('prefixes the body with an h3 of the skill name', () => {
    expect(toSkillPromptBlock({ name: 'no-then-chains', body: 'Use async/await.' })).toBe(
      '### no-then-chains\nUse async/await.',
    );
  });

  it('trims the body so blocks join with exactly one blank line', () => {
    expect(toSkillPromptBlock({ name: 'a', body: '\n\nRule.\n\n' })).toBe('### a\nRule.');
  });
});
