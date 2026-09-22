import { describe, it, expect } from 'vitest';
import {
  buildSkillDraft,
  gateCandidates,
  isEchoOfRule,
  locateSnippet,
  renderSample,
  resolveSampledPath,
  ruleSimilarity,
  slugify,
  toConventionDto,
  truncateFile,
  type ConventionRowLike,
  type SampledFile,
} from '../src/modules/conventions/helpers.js';
import type { ProposedConvention } from '../src/modules/conventions/prompt.js';
import type { ConventionCandidate } from '@devdigest/shared';

/**
 * The evidence gate is the feature: a model that invents a citation must lose
 * the rule that came with it. These run without a database or a model.
 */

const USERS = `import { db } from '../lib/db';

export async function getUser(id: string) {
  const user = await db.users.find(id);
  const posts = await db.posts.findMany({ userId: id });
  return { user, posts };
}
`;

const SAMPLE: SampledFile[] = [{ path: 'src/api/users.ts', content: USERS }];

function proposal(over: Partial<ProposedConvention> = {}): ProposedConvention {
  return {
    rule: 'Always use async/await instead of .then() chains',
    evidence_path: 'src/api/users.ts',
    evidence_line: 4,
    evidence_snippet: 'const user = await db.users.find(id);',
    rationale: 'Flag a .then() chain added to an async function.',
    occurrences: 3,
    category: 'async',
    confidence: 0.9,
    ...over,
  };
}

describe('renderSample', () => {
  it('prefixes every line with a 1-based gutter under a path header', () => {
    const out = renderSample([{ path: 'a.ts', content: 'first\nsecond' }]);
    expect(out).toBe('===== a.ts =====\n   1 | first\n   2 | second');
  });
});

describe('truncateFile', () => {
  it('cuts a long file by lines rather than dropping it', () => {
    const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    expect(truncateFile(long).split('\n')).toHaveLength(220);
  });
});

describe('resolveSampledPath', () => {
  const sampled = ['src/api/users.ts', 'src/lib/db.ts'];

  it('accepts the exact path', () => {
    expect(resolveSampledPath('src/api/users.ts', sampled)).toBe('src/api/users.ts');
  });

  it('accepts a ./-prefixed path', () => {
    expect(resolveSampledPath('./src/api/users.ts', sampled)).toBe('src/api/users.ts');
  });

  it('accepts a unique suffix the model shortened to', () => {
    expect(resolveSampledPath('api/users.ts', sampled)).toBe('src/api/users.ts');
  });

  it('refuses an AMBIGUOUS suffix rather than guessing a file', () => {
    expect(resolveSampledPath('index.ts', ['src/a/index.ts', 'src/b/index.ts'])).toBeNull();
  });

  it('refuses a path that was never sampled', () => {
    expect(resolveSampledPath('src/nope.ts', sampled)).toBeNull();
  });
});

describe('locateSnippet', () => {
  it('corrects a wrong line number instead of failing the citation', () => {
    const found = locateSnippet(USERS, 'const user = await db.users.find(id);', 40);
    expect(found?.line).toBe(4);
  });

  it('matches through re-indentation and case', () => {
    const found = locateSnippet(USERS, '    CONST user = await db.users.find(id);', 4);
    expect(found?.line).toBe(4);
  });

  it('returns the snippet as the FILE has it, not as the model typed it', () => {
    const found = locateSnippet(USERS, 'CONST   user = await db.users.find(id);', 4);
    expect(found?.snippet).toBe('const user = await db.users.find(id);');
  });

  it('picks the occurrence nearest the claimed line when a line repeats', () => {
    const content = 'return null;\na\nb\nc\nreturn null;\n';
    expect(locateSnippet(content, 'return null;', 5)?.line).toBe(5);
    expect(locateSnippet(content, 'return null;', 1)?.line).toBe(1);
  });

  it('rejects a snippet too trivial to identify anything', () => {
    expect(locateSnippet(USERS, '}', 6)).toBeNull();
  });

  it('rejects a snippet that is not in the file', () => {
    expect(locateSnippet(USERS, 'const user = db.users.find(id).then(u => u);', 4)).toBeNull();
  });
});

describe('gateCandidates', () => {
  it('keeps a grounded candidate and reports the corrected line', () => {
    const res = gateCandidates([proposal({ evidence_line: 99 })], SAMPLE, []);
    expect(res.kept).toHaveLength(1);
    expect(res.kept[0]!.evidenceLine).toBe(4);
    expect(res.droppedUngrounded).toBe(0);
  });

  it('DROPS a candidate whose snippet is not in the cited file', () => {
    const res = gateCandidates(
      [proposal({ evidence_snippet: 'const user = db.users.find(id).then(fn);' })],
      SAMPLE,
      [],
    );
    expect(res.kept).toHaveLength(0);
    expect(res.droppedUngrounded).toBe(1);
  });

  it('DROPS a candidate citing a file that was never sampled', () => {
    const res = gateCandidates([proposal({ evidence_path: 'src/ghost.ts' })], SAMPLE, []);
    expect(res.kept).toHaveLength(0);
    expect(res.droppedUngrounded).toBe(1);
  });

  it('drops a restatement of a rule it already kept', () => {
    const res = gateCandidates(
      [proposal(), proposal({ rule: 'Always use async await instead of then chains' })],
      SAMPLE,
      [],
    );
    expect(res.kept).toHaveLength(1);
    expect(res.droppedDuplicate).toBe(1);
  });

  it('drops a rule the user already decided on, so a re-scan cannot resurrect it', () => {
    const res = gateCandidates([proposal()], SAMPLE, [
      'Always use async/await instead of .then() chains',
    ]);
    expect(res.kept).toHaveLength(0);
    expect(res.droppedDuplicate).toBe(1);
  });

  it('gates strongest first, so the survivor of a duplicate pair is the confident one', () => {
    const res = gateCandidates(
      [proposal({ confidence: 0.5 }), proposal({ confidence: 0.95 })],
      SAMPLE,
      [],
    );
    expect(res.kept[0]!.confidence).toBe(0.95);
  });
});

describe('ruleSimilarity', () => {
  it('scores a reworded rule as the same rule', () => {
    expect(
      ruleSimilarity('Use async/await over .then()', 'Use async await over then'),
    ).toBeGreaterThan(0.8);
  });

  it('scores unrelated rules apart', () => {
    expect(
      ruleSimilarity('Use async/await over .then()', 'Route handlers return a typed Result'),
    ).toBeLessThan(0.3);
  });
});

describe('slugify', () => {
  it('caps a long rule at six words', () => {
    expect(slugify('Always use async/await instead of .then() chains everywhere')).toBe(
      'always-use-async-await-instead-of',
    );
  });

  it('falls back rather than returning an empty heading', () => {
    expect(slugify('!!!')).toBe('convention');
  });
});

describe('toConventionDto', () => {
  const row: ConventionRowLike = {
    id: 'c1',
    category: 'async',
    rule: 'Use async/await',
    rationale: null,
    evidencePath: 'src/api/users.ts',
    evidenceLine: 4,
    evidenceSnippet: 'await db.users.find(id)',
    confidence: 0.91,
    status: 'pending',
    createdAt: new Date('2026-09-21T10:00:00Z'),
  };

  it('maps a row to the snake_case wire DTO', () => {
    expect(toConventionDto(row)).toEqual({
      id: 'c1',
      category: 'async',
      rule: 'Use async/await',
      rationale: null,
      evidence_path: 'src/api/users.ts',
      evidence_line: 4,
      evidence_snippet: 'await db.users.find(id)',
      confidence: 0.91,
      status: 'pending',
      created_at: '2026-09-21T10:00:00.000Z',
    });
  });
});

describe('buildSkillDraft', () => {
  const accepted: ConventionCandidate[] = [
    {
      id: 'c1',
      category: 'async',
      rule: 'Always use async/await instead of .then() chains',
      rationale: 'Flag a .then() chain added to an async function.',
      evidence_path: 'src/api/users.ts',
      evidence_line: 4,
      evidence_snippet: 'const user = await db.users.find(id);',
      confidence: 0.91,
      status: 'accepted',
      created_at: '2026-09-21T10:00:00.000Z',
    },
  ];

  it('names the skill after the repo and counts the rules in the description', () => {
    const draft = buildSkillDraft('payments-api', accepted);
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.description).toBe('1 house convention extracted from payments-api');
    expect(draft.type).toBe('convention');
  });

  it('keeps every rule CITED in the body, so a reader can check it', () => {
    const body = buildSkillDraft('payments-api', accepted).body;
    expect(body).toContain('## always-use-async-await-instead-of');
    expect(body).toContain('`src/api/users.ts:4`');
    expect(body).toContain('const user = await db.users.find(id);');
  });

  it('carries the source ids and the deduped evidence files', () => {
    const draft = buildSkillDraft('payments-api', [...accepted, { ...accepted[0]!, id: 'c2' }]);
    expect(draft.convention_ids).toEqual(['c1', 'c2']);
    expect(draft.evidence_files).toEqual(['src/api/users.ts']);
  });
});

describe('isEchoOfRule', () => {
  const rule = 'Always use async/await instead of .then() chains';

  it('treats a verbatim restatement as an echo', () => {
    expect(isEchoOfRule(rule, rule)).toBe(true);
  });

  it('ignores casing and punctuation when comparing', () => {
    expect(isEchoOfRule(rule, 'always use async await instead of then chains!')).toBe(true);
  });

  it('keeps a rationale that says something the rule did not', () => {
    expect(isEchoOfRule(rule, 'Flag a .then() chain added to an async function.')).toBe(false);
  });
});

describe('buildSkillDraft — rationale echo', () => {
  const base: ConventionCandidate = {
    id: 'c1',
    category: 'async',
    rule: 'Always use async/await instead of .then() chains',
    rationale: 'Always use async/await instead of .then() chains',
    evidence_path: 'src/api/users.ts',
    evidence_line: 4,
    evidence_snippet: 'const user = await db.users.find(id);',
    confidence: 0.91,
    status: 'accepted',
    created_at: '2026-09-21T10:00:00.000Z',
  };

  it('states a rule ONCE when the rationale only echoes it', () => {
    const body = buildSkillDraft('payments-api', [base]).body;
    expect(body.split(base.rule).length - 1).toBe(1);
  });

  it('keeps a rationale that adds something', () => {
    const body = buildSkillDraft('payments-api', [
      { ...base, rationale: 'Flag a .then() chain in an async function.' },
    ]).body;
    expect(body).toContain('Flag a .then() chain in an async function.');
  });
});
