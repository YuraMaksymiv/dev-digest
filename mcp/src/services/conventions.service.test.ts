import { beforeEach, describe, expect, it } from 'vitest';
import { FakeApi } from '../test-support/fake-api.js';
import { ConventionsService } from './conventions.service.js';

describe('ConventionsService', () => {
  let api: FakeApi;
  let service: ConventionsService;
  beforeEach(() => {
    api = new FakeApi();
    api.conventions = [
      { category: 'typing', rule: 'No any', confidence: 0.9 },
      { category: 'naming', rule: 'camelCase vars', confidence: 0.8 },
      { category: 'naming', rule: 'PascalCase types', confidence: 0.95 },
    ];
    service = new ConventionsService(api);
  });

  it('prints one line per rule, grouped by category, strongest first', async () => {
    const { text, isError } = await service.getConventions('acme/widgets', undefined);
    expect(isError).toBe(false);
    expect(text.split('\n')).toEqual([
      '- [naming] PascalCase types',
      '- [naming] camelCase vars',
      '- [typing] No any',
    ]);
  });

  it('narrows by section', async () => {
    const { text } = await service.getConventions('acme/widgets', 'typing');
    expect(text).toBe('- [typing] No any');
  });

  it('explains an empty result', async () => {
    const { text } = await service.getConventions('acme/widgets', 'testing');
    expect(text).toContain('No accepted conventions in section "testing"');
  });

  it('matches the repo case-insensitively', async () => {
    await service.getConventions('ACME/Widgets', undefined);
    expect(api.calls).toContain('listConventions repo-1');
  });

  it('tells the model to import an unknown repo', async () => {
    await expect(service.getConventions('acme/other', undefined)).rejects.toThrow('not imported into DevDigest');
  });
});
