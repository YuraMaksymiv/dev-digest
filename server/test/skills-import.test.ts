import { describe, it, expect } from 'vitest';
import { assertFetchableUrl, skillNameFromUrl } from '../src/modules/skills/import.js';

/**
 * `/skills/import` fetches an address the user typed, from the server. That is
 * an SSRF primitive, so the guard is the part worth testing: every case below
 * uses a literal address or `localhost`, so none of them touch the network.
 */

describe('assertFetchableUrl', () => {
  it('accepts an ordinary https URL', async () => {
    await expect(assertFetchableUrl('https://8.8.8.8/skill.md')).resolves.toBeInstanceOf(URL);
  });

  it('refuses a non-http scheme', async () => {
    await expect(assertFetchableUrl('file:///etc/passwd')).rejects.toThrow(/http and https/);
    await expect(assertFetchableUrl('ftp://8.8.8.8/x')).rejects.toThrow(/http and https/);
  });

  it('refuses text that is not a URL', async () => {
    await expect(assertFetchableUrl('not a url')).rejects.toThrow(/valid URL/);
  });

  it('refuses loopback, by name and by address', async () => {
    await expect(assertFetchableUrl('http://localhost:3001/skills')).rejects.toThrow(/private or loopback/);
    await expect(assertFetchableUrl('http://127.0.0.1/x')).rejects.toThrow(/private or loopback/);
    await expect(assertFetchableUrl('http://127.1.2.3/x')).rejects.toThrow(/private or loopback/);
  });

  it('refuses the cloud metadata address', async () => {
    await expect(assertFetchableUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private or loopback/,
    );
  });

  it('refuses every private v4 range', async () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.1', '100.64.0.1']) {
      await expect(assertFetchableUrl(`http://${ip}/x`), ip).rejects.toThrow(/private or loopback/);
    }
  });

  it('allows a public address that merely looks adjacent to a private range', async () => {
    // 172.32.x and 192.169.x are OUTSIDE the private blocks — a guard that
    // matched on the first octet alone would wrongly reject these.
    await expect(assertFetchableUrl('http://172.32.0.1/x')).resolves.toBeInstanceOf(URL);
    await expect(assertFetchableUrl('http://192.169.0.1/x')).resolves.toBeInstanceOf(URL);
  });

  it('refuses IPv6 loopback and unique-local', async () => {
    await expect(assertFetchableUrl('http://[::1]/x')).rejects.toThrow(/private or loopback/);
    await expect(assertFetchableUrl('http://[fd00::1]/x')).rejects.toThrow(/private or loopback/);
  });
});

describe('skillNameFromUrl', () => {
  it('takes the file name without its markdown extension', () => {
    expect(skillNameFromUrl('https://example.com/skills/no-then-chains.md')).toBe('no-then-chains');
  });

  it('ignores the query string and fragment', () => {
    expect(skillNameFromUrl('https://example.com/a/b.md?raw=1#top')).toBe('b');
  });

  it('falls back rather than returning an empty name', () => {
    expect(skillNameFromUrl('https://example.com/')).toBe('imported-skill');
  });
});
