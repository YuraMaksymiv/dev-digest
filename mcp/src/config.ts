export interface Config {
  apiUrl: string;
  requestTimeoutMs: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

const LEVELS = ['error', 'warn', 'info', 'debug'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const timeout = Number(env.DEVDIGEST_REQUEST_TIMEOUT_MS);
  const level = LEVELS.find((l) => l === env.MCP_LOG_LEVEL);
  return {
    apiUrl: env.DEVDIGEST_API_URL?.trim() || 'http://127.0.0.1:3001',
    requestTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000,
    logLevel: level ?? 'info',
  };
}
