import { lookup } from 'node:dns/promises';
import { ValidationError } from '../../platform/errors.js';
import {
  IMPORT_MAX_BYTES,
  IMPORT_TIMEOUT_MS,
  IMPORT_MAX_REDIRECTS,
} from './constants.js';

/**
 * Fetching a skill body from a URL the user typed.
 *
 * This is a server-side fetch of a user-supplied address, i.e. an SSRF
 * primitive: without checks it would let anyone in the studio read the cloud
 * metadata endpoint, an internal admin panel, or `localhost:3001` itself, and
 * have the response handed back to them as a "skill body". The guards below are
 * the point of this file — the fetch itself is three lines.
 */

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
  // IPv4-mapped (::ffff:127.0.0.1) — judge the embedded v4 address.
  const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isBlockedV4(m[1]!);
  return false;
}

/**
 * Resolve the host and refuse anything that is not a public address. Resolution
 * happens HERE rather than being left to fetch, because a hostname that looks
 * external can resolve to 127.0.0.1 — `http://localtest.me` is the classic case.
 */
function refuse(host: string): never {
  throw new ValidationError(
    `Refusing to fetch ${host}: it resolves to a private or loopback address`,
  );
}

async function assertPublicHost(rawHost: string): Promise<void> {
  // `URL.hostname` keeps the brackets on an IPv6 literal (`[::1]`), and neither
  // dns.lookup nor the range checks understand that form — strip them first, or
  // an IPv6 literal is never actually checked.
  const host = rawHost.replace(/^\[|\]$/g, '');

  // A literal address needs no DNS: resolving it would be a pointless round
  // trip, and on some resolvers a failed lookup would mask the check entirely.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isBlockedV4(host)) refuse(host);
    return;
  }
  if (host.includes(':')) {
    if (isBlockedV6(host)) refuse(host);
    return;
  }

  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new ValidationError(`Could not resolve ${host}`);
  }
  for (const a of addrs) {
    if (a.family === 6 ? isBlockedV6(a.address) : isBlockedV4(a.address)) refuse(host);
  }
}

/** Parse + vet a URL. Throws a 422 rather than letting a bad one reach fetch. */
export async function assertFetchableUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Only http and https URLs can be imported');
  }
  await assertPublicHost(url.hostname);
  return url;
}

/**
 * Fetch the body of a skill. Redirects are followed manually so every hop is
 * re-vetted — `redirect: 'follow'` would let a public URL bounce to localhost
 * with no second check.
 */
export async function fetchSkillBody(raw: string): Promise<{ text: string; finalUrl: string }> {
  let url = await assertFetchableUrl(raw);

  for (let hop = 0; hop <= IMPORT_MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
      headers: { accept: 'text/markdown, text/plain, text/*;q=0.9, */*;q=0.1' },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new ValidationError('The URL redirected without a destination');
      url = await assertFetchableUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) {
      throw new ValidationError(`The URL answered ${res.status}`);
    }

    // Trust the declared length when present, and still cap what we read —
    // a lying or absent Content-Length must not let an endless body through.
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > IMPORT_MAX_BYTES) {
      throw new ValidationError('That file is too large to import');
    }
    const text = await readCapped(res);
    if (text.trim().length === 0) throw new ValidationError('The URL returned an empty body');
    return { text, finalUrl: url.toString() };
  }
  throw new ValidationError('Too many redirects');
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, IMPORT_MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > IMPORT_MAX_BYTES) {
      await reader.cancel();
      throw new ValidationError('That file is too large to import');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** `https://…/skills/no-then-chains.md` → `no-then-chains`. */
export function skillNameFromUrl(url: string): string {
  let path: string;
  try {
    // Parse rather than split the raw string: splitting `https://host/` on "/"
    // yields the HOST as the last segment, naming the skill after the domain.
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return 'imported-skill';
  return last.replace(/\.(md|markdown|txt)$/i, '') || 'imported-skill';
}
