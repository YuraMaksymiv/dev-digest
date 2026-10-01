import { ApiError } from '../../ports.js';

const RATE_LIMIT_WAIT_S = 30;

function causeCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: unknown; errors?: { code?: unknown }[] } }).cause;
  const code = cause?.code ?? cause?.errors?.[0]?.code;
  return typeof code === 'string' ? code : undefined;
}

const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

export function mapNetworkError(err: unknown, baseUrl: string, timeoutMs: number): ApiError {
  const name = (err as { name?: string }).name;
  if (name === 'TimeoutError') {
    return new ApiError(
      'timeout',
      `DevDigest API at ${baseUrl} did not answer within ${Math.round(timeoutMs / 1000)}s. Check the API is healthy (./scripts/dev.sh logs), then retry once.`,
    );
  }
  const code = causeCode(err);
  if (code && UNREACHABLE_CODES.has(code)) {
    return new ApiError('unreachable', `DevDigest API not reachable at ${baseUrl}; run ./scripts/dev.sh`);
  }
  if (err instanceof TypeError) {
    return new ApiError('unreachable', `DevDigest API not reachable at ${baseUrl}; run ./scripts/dev.sh`);
  }
  throw err;
}

export function mapHttpError(status: number, serverMessage: string | undefined, path: string): ApiError {
  const detail = serverMessage ? `: ${serverMessage}` : '';
  if (status === 404) return new ApiError('not_found', `Not found${detail || ` (${path})`}`);
  if (status === 400 || status === 422) {
    return new ApiError('bad_request', `Invalid request${detail || ` (${path})`}. Fix the arguments and retry.`);
  }
  if (status === 429) {
    return new ApiError('rate_limited', `DevDigest API rate limited; wait ${RATE_LIMIT_WAIT_S}s, then retry.`);
  }
  if (status >= 500) {
    return new ApiError(
      'server',
      `DevDigest API error (HTTP ${status})${detail}. This is a server-side failure; check the ./scripts/dev.sh logs, then retry once.`,
    );
  }
  return new ApiError('server', `Unexpected HTTP ${status} from DevDigest API (${path})${detail}.`);
}
