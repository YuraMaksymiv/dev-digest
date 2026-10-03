import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { mapBlastResult, refineBlastReason } from '../src/modules/blast/helpers.js';

const caller = (file: string, symbol: string, viaSymbol: string, line: number, rank: number) => ({
  file,
  symbol,
  viaSymbol,
  line,
  rank,
});

describe('mapBlastResult', () => {
  it('groups callers by changed symbol, ordered by rank, with endpoints from caller-file facts', () => {
    const out = mapBlastResult({
      changedSymbols: [
        { file: 'b.ts', name: 'zed', kind: 'function' },
        { file: 'a.ts', name: 'alpha', kind: 'function' },
      ],
      callers: [
        caller('r2.ts', 'low', 'alpha', 9, 0.1),
        caller('r1.ts', 'hi', 'alpha', 3, 0.9),
        caller('r3.ts', 'other', 'zed', 1, 0.5),
      ],
      factsByFile: {
        'r1.ts': { endpoints: ['GET /x', 'GET /a'], crons: ['nightly'] },
        'r2.ts': { endpoints: ['GET /x'], crons: [] },
      },
    });
    expect(() => BlastRadius.parse(out)).not.toThrow();
    expect(out.changed_symbols.map((s) => s.name)).toEqual(['alpha', 'zed']);
    expect(out.downstream.map((d) => d.symbol)).toEqual(['alpha', 'zed']);
    expect(out.downstream[0]!.callers.map((c) => c.name)).toEqual(['hi', 'low']);
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /a', 'GET /x']);
    expect(out.downstream[0]!.crons_affected).toEqual(['nightly']);
    expect(out.downstream[1]!.endpoints_affected).toEqual([]);
    expect(out.degraded).toBeUndefined();
    expect(out.summary).toBe('2 changed symbols reach 3 callers, 2 endpoints, 1 cron job.');
  });

  it('omits symbols without callers from downstream and says so in the summary', () => {
    const out = mapBlastResult({
      changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
      callers: [],
    });
    expect(out.downstream).toEqual([]);
    expect(out.summary).toBe('1 changed symbol, no downstream callers found.');
  });

  it('flags a possibly truncated caller list', () => {
    const callers = Array.from({ length: 20 }, (_, i) => caller(`f${i}.ts`, 's', 'alpha', i + 1, 0));
    const out = mapBlastResult({
      changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
      callers,
    });
    expect(out.summary).toContain('(top 20 callers shown)');
  });

  it('passes degraded + reason through, defaulting the reason', () => {
    const out = mapBlastResult({ changedSymbols: [], callers: [], degraded: true });
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
    expect(out.summary).toBe('No changed symbols were found in this PR.');
  });
});

describe('refineBlastReason', () => {
  const ok = { degraded: false };
  it('flag off wins over everything', () => {
    expect(refineBlastReason({ degraded: true, reason: 'no_data' }, { status: 'full' }, false)).toBe(
      'flag_off',
    );
  });
  it('failed index → index_failed (or the recorded reason)', () => {
    expect(refineBlastReason({ degraded: true, reason: 'no_data' }, { status: 'failed' }, true)).toBe(
      'index_failed',
    );
    expect(
      refineBlastReason(
        { degraded: true },
        { status: 'failed', degradedReason: 'repo_too_large' },
        true,
      ),
    ).toBe('repo_too_large');
  });
  it('degraded index uses its recorded reason, but a synthesised no_data defers to the facade', () => {
    expect(
      refineBlastReason({ degraded: true }, { status: 'degraded', degradedReason: 'index_failed' }, true),
    ).toBe('index_failed');
    expect(
      refineBlastReason(
        { degraded: true, reason: 'no_data' },
        { status: 'degraded', degradedReason: 'no_data' },
        true,
      ),
    ).toBe('no_data');
  });
  it('partial index surfaces index_partial even when the facade said healthy', () => {
    expect(refineBlastReason(ok, { status: 'partial' }, true)).toBe('index_partial');
  });
  it('healthy result + healthy index → nothing to flag', () => {
    expect(refineBlastReason(ok, { status: 'full' }, true)).toBeNull();
  });
  it('degraded result with no index state keeps the facade reason', () => {
    expect(refineBlastReason({ degraded: true, reason: 'no_data' }, null, true)).toBe('no_data');
  });
});
