import { describe, it, expect } from 'vitest';
import type { Container } from '../src/platform/container.js';
import type { PullRow, RepoRow, ReviewRepository } from '../src/modules/reviews/repository.js';
import { RunLogger } from '../src/platform/run-logger.js';
import {
  loadIntent,
  resolveLinkedIssueSignal,
  resolveLinkedContentSignal,
} from '../src/modules/reviews/intent-loader.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { GitHubClient, IssueMeta, UnifiedDiff } from '@devdigest/shared';

/**
 * A3 — intent-loader unit tests (hermetic, no Docker/Postgres).
 *
 * `resolveLinkedIssueSignal`/`resolveLinkedContentSignal` distinguish 3 states
 * (fetched / unavailable / absent) — `null`/`undefined` alone couldn't tell
 * "nothing was linked" apart from "something was linked but couldn't be
 * fetched". `loadIntent` merges the server-known `sources` in AFTER the LLM
 * call — the model is never asked about it.
 */

function fakeContainer(overrides: Partial<Container> = {}): Container {
  return {
    db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
    ...overrides,
  } as unknown as Container;
}

const REPO_ROW = { owner: 'acme', name: 'widgets' } as unknown as RepoRow;

function pull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr-1',
    title: 'Add rate limiting',
    body: null,
    branch: 'feat/rl',
    number: 1,
    ...overrides,
  } as unknown as PullRow;
}

describe('resolveLinkedIssueSignal', () => {
  it('absent — no issue reference anywhere in title/body/branch', async () => {
    const container = fakeContainer();
    const res = await resolveLinkedIssueSignal(container, REPO_ROW, pull({ body: 'no reference here' }));
    expect(res.state).toBe('absent');
  });

  it('fetched — an issue reference resolves via github().getIssue', async () => {
    const container = fakeContainer({
      github: async () =>
        ({
          getIssue: async (_repo, n: number) =>
            ({ number: n, title: 'Rate limit spec', body: 'details' }) as IssueMeta,
        }) as unknown as GitHubClient,
    });
    const res = await resolveLinkedIssueSignal(container, REPO_ROW, pull({ body: 'Closes #471' }));
    expect(res.state).toBe('fetched');
    if (res.state === 'fetched') {
      expect(res.issue.number).toBe(471);
      expect(res.issue.title).toBe('Rate limit spec');
    }
  });

  it('unavailable — an issue reference is found but the fetch fails', async () => {
    const container = fakeContainer({
      github: async () =>
        ({
          getIssue: async () => {
            throw new Error('404');
          },
        }) as unknown as GitHubClient,
    });
    const res = await resolveLinkedIssueSignal(container, REPO_ROW, pull({ body: 'Closes #471' }));
    expect(res.state).toBe('unavailable');
  });
});

describe('resolveLinkedContentSignal', () => {
  it('absent — no URL in the PR body', async () => {
    const container = fakeContainer();
    const res = await resolveLinkedContentSignal(container, pull({ body: 'plain text, no links' }));
    expect(res.state).toBe('absent');
  });

  it('fetched — a URL is present and linkFetch resolves content', async () => {
    const container = fakeContainer({ linkFetch: async () => 'spec content' });
    const res = await resolveLinkedContentSignal(container, pull({ body: 'see https://example.com/spec' }));
    expect(res.state).toBe('fetched');
    if (res.state === 'fetched') expect(res.content).toBe('spec content');
  });

  it('unavailable — a URL is present but linkFetch throws', async () => {
    const container = fakeContainer({
      linkFetch: async () => {
        throw new Error('timeout');
      },
    });
    const res = await resolveLinkedContentSignal(container, pull({ body: 'see https://example.com/spec' }));
    expect(res.state).toBe('unavailable');
  });

  it('unavailable — a URL is present but linkFetch resolves undefined (unfetchable content type)', async () => {
    const container = fakeContainer({ linkFetch: async () => undefined });
    const res = await resolveLinkedContentSignal(container, pull({ body: 'see https://example.com/spec' }));
    expect(res.state).toBe('unavailable');
  });
});

describe('loadIntent — sources merge', () => {
  it("merges the server-computed 'sources' in after the LLM call — never part of the LLM-facing schema", async () => {
    const llm = new MockLLMProvider('openrouter', {
      structured: {
        intent: 'Adds rate limiting to the public API.',
        in_scope: ['src/rate-limit.ts'],
        out_of_scope: ['auth'],
        confidence: 0.4,
        category: 'feat',
      },
    });
    const container = fakeContainer({ llm: async () => llm });

    const repo = {
      getPrCommits: async () => [],
      createAgentRun: async () => 'run-1',
      completeAgentRun: async () => undefined,
      upsertIntent: async () => undefined,
    } as unknown as ReviewRepository;

    const diff: UnifiedDiff = { raw: '', files: [] };
    const runLog = new RunLogger({} as never, [], undefined, {});

    const intent = await loadIntent(
      container,
      repo,
      'ws-1',
      pull({ body: 'no links here' }),
      REPO_ROW,
      diff,
      runLog,
    );

    expect(intent).toBeDefined();
    // Merged in server-side: both signals were absent (no linked issue/URL).
    expect(intent!.sources).toEqual({ linked_issue: 'absent', linked_content: 'absent' });

    // The schema sent to the LLM never declared a `sources` field.
    const call = llm.calls.find((c) => c.method === 'completeStructured');
    expect(call).toBeDefined();
    const schema = (call!.req as { schema: { shape?: Record<string, unknown> } }).schema;
    expect(schema.shape ? 'sources' in schema.shape : false).toBe(false);
  });
});
