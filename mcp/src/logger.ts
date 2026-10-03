import type { Logger } from './ports.js';

const ORDER = { error: 0, warn: 1, info: 2, debug: 3 } as const;

/** stdout is the JSON-RPC channel, so every log line goes to stderr. */
export function createLogger(level: keyof typeof ORDER = 'info'): Logger {
  const write = (lvl: keyof typeof ORDER, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] > ORDER[level]) return;
    process.stderr.write(`${JSON.stringify({ level: lvl, msg, ...fields })}\n`);
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}
