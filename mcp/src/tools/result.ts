import type { CallToolResult } from '@modelcontextprotocol/server';
import { ToolError } from '../domain/errors.js';
import type { ToolOutput } from '../domain/types.js';
import { ApiError, type Logger } from '../ports.js';

export function toResult(output: ToolOutput): CallToolResult {
  return { content: [{ type: 'text', text: output.text }], ...(output.isError ? { isError: true } : {}) };
}

export function errorResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Runs a service call and maps its failures to an isError result the model can act on. */
export async function guard(logger: Logger, call: () => Promise<ToolOutput>): Promise<CallToolResult> {
  try {
    return toResult(await call());
  } catch (err) {
    if (err instanceof ToolError || err instanceof ApiError) return errorResult(err.message);
    logger.error('unexpected tool failure', { error: err instanceof Error ? err.stack : String(err) });
    return errorResult('Unexpected internal error in the DevDigest MCP server. Retry once; if it persists, check the MCP server stderr log.');
  }
}
