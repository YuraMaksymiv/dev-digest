import { lookup } from 'node:dns/promises';
import { withTimeout } from '../../platform/resilience.js';

/**
 * Best-effort fetch of a URL the PR author supplied (a linked spec/ticket in
 * the PR description). This is a server-side fetch of attacker-influenced
 * (PR-author-controlled) input — an SSRF primitive: without the checks below
 * it would let a PR description make the server read the cloud metadata
 * endpoint, an internal admin panel, or `localhost:3001` itself, and feed the
 * response into the intent prompt as "linked content".
 *
 * NEVER throws — every failure mode (bad URL, blocked host, timeout, non-2xx,
 * oversized body) resolves to `undefined`, since this is enrichment, not a
 * requirement for intent classification to proceed.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 100_000;
const MAX_REDIRECTS = 3;

/** Blocked v4 ranges: loopback, private, link-local (incl. 169.254.169.254), CGNAT. */
function isBlockedV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;
  if (s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd')) return true;
  const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isBlockedV4(m[1]!);
  return false;
}

/** Resolve the host and refuse anything that is not a public address. */
async function isPublicHost(rawHost: string): Promise<boolean> {
  const host = rawHost.replace(/^\[|\]$/g, '');

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !isBlockedV4(host);
  if (host.includes(':')) return !isBlockedV6(host);

  try {
    const addrs = await lookup(host, { all: true });
    return addrs.every((a) => (a.family === 6 ? !isBlockedV6(a.address) : !isBlockedV4(a.address)));
  } catch {
    return false;
  }
}

/** Parse + vet a URL: http(s) only, not a private/loopback/link-local host. */
async function assertFetchableUrl(raw: string): Promise<URL | undefined> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (!(await isPublicHost(url.hostname))) return undefined;
  return url;
}

/** Strip HTML/markup down to plain, whitespace-collapsed text. */
function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function readCapped(res: Response): Promise<string | undefined> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return text.length > MAX_BYTES ? undefined : text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetch `url` and return its plain-text content, or `undefined` on any
 * failure — invalid protocol, blocked host, timeout, non-2xx, oversized body.
 * Redirects are followed manually so every hop is re-vetted.
 */
export async function fetchLinkedContent(url: string): Promise<string | undefined> {
  try {
    let target = await assertFetchableUrl(url);
    if (!target) return undefined;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await withTimeout(
        fetch(target, { redirect: 'manual', headers: { accept: 'text/html, text/plain, text/*;q=0.9, */*;q=0.1' } }),
        FETCH_TIMEOUT_MS,
      );

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return undefined;
        const next = await assertFetchableUrl(new URL(loc, target).toString());
        if (!next) return undefined;
        target = next;
        continue;
      }
      if (!res.ok) return undefined;

      const body = await readCapped(res);
      if (!body) return undefined;
      const text = stripHtml(body);
      return text.length > 0 ? text.slice(0, MAX_BYTES) : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
