import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { HttpDevDigestApi } from './adapters/http/client.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createServer } from './server.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const api = new HttpDevDigestApi({
  baseUrl: config.apiUrl,
  requestTimeoutMs: config.requestTimeoutMs,
  logger,
});

const handle = serveStdio(() => createServer({ api, logger }), {
  onerror: (err) => logger.error('transport error', { error: err.message }),
});

const shutdown = (signal: string) => {
  logger.info('shutting down', { signal });
  handle.close().finally(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

logger.info('devdigest MCP server ready', { apiUrl: config.apiUrl });
