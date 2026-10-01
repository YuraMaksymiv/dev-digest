import { z } from 'zod';
import type { AgentInfo, Convention, PrRef, RepoRef, Review, RunDetail, StartedRun } from '../../domain/types.js';
import { ApiError, type DevDigestApi, type Logger, type WaitForRunOptions } from '../../ports.js';
import { mapHttpError, mapNetworkError } from './errors.js';
import {
  AgentsResponse,
  ConventionsResponse,
  ErrorBody,
  PrRefResponse,
  ReposResponse,
  ReviewsResponse,
  RunDetailResponse,
  SseEventData,
  StartReviewResponse,
} from './schemas.js';
import { SseParser } from './sse.js';

export interface HttpApiOptions {
  baseUrl: string;
  requestTimeoutMs: number;
  logger: Logger;
  fetch?: typeof fetch;
}

export class HttpDevDigestApi implements DevDigestApi {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: HttpApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.doFetch = options.fetch ?? fetch;
  }

  async listAgents(): Promise<AgentInfo[]> {
    const rows = await this.get('/agents', AgentsResponse);
    return rows.map((a) => ({ id: a.id, name: a.name, description: a.description ?? '', enabled: a.enabled }));
  }

  async listRepos(): Promise<RepoRef[]> {
    const rows = await this.get('/repos', ReposResponse);
    return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
  }

  async lookupPull(repo: string, number: number): Promise<PrRef> {
    const query = new URLSearchParams({ repo, number: String(number) });
    const r = await this.get(`/pulls/lookup?${query}`, PrRefResponse);
    return { prId: r.pr_id, repo: r.repo, number: r.number, title: r.title };
  }

  async startReview(prId: string, agentId: string): Promise<StartedRun> {
    const r = await this.request(
      'POST',
      `/pulls/${encodeURIComponent(prId)}/review`,
      StartReviewResponse,
      { agentId },
    );
    const run = r.runs[0]!;
    return { runId: run.run_id, agentId: run.agent_id, agentName: run.agent_name };
  }

  async getRun(runId: string): Promise<RunDetail> {
    const r = await this.get(`/runs/${encodeURIComponent(runId)}`, RunDetailResponse);
    return {
      runId: r.run_id,
      status: r.status,
      agentName: r.agent_name ?? null,
      prId: r.pr_id,
      prNumber: r.pr_number,
      repo: r.repo,
      durationMs: r.duration_ms ?? null,
      findingsCount: r.findings_count ?? null,
      score: r.score ?? null,
      error: r.error ?? null,
    };
  }

  async listReviews(prId: string): Promise<Review[]> {
    const rows = await this.get(`/pulls/${encodeURIComponent(prId)}/reviews`, ReviewsResponse);
    return rows.map((r) => ({
      runId: r.run_id,
      kind: r.kind,
      verdict: r.verdict ?? null,
      summary: r.summary ?? null,
      score: r.score ?? null,
      findings: r.findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        file: f.file,
        startLine: f.start_line,
        endLine: f.end_line,
        rationale: f.rationale,
        suggestion: f.suggestion ?? null,
      })),
    }));
  }

  async listConventions(repoId: string): Promise<Convention[]> {
    const rows = await this.get(`/repos/${encodeURIComponent(repoId)}/conventions`, ConventionsResponse);
    return rows
      .filter((c) => c.status === 'accepted')
      .map((c) => ({ category: c.category, rule: c.rule, confidence: c.confidence }));
  }

  async waitForRun(runId: string, { signal, onEvent }: WaitForRunOptions): Promise<'ended' | 'aborted'> {
    const path = `/runs/${encodeURIComponent(runId)}/events`;
    try {
      const res = await this.doFetch(`${this.baseUrl}${path}`, {
        headers: { accept: 'text/event-stream' },
        signal,
      });
      if (!res.ok || !res.body) throw await this.httpError(res, path);

      const parser = new SseParser();
      const decoder = new TextDecoder();
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        for (const message of parser.push(decoder.decode(chunk, { stream: true }))) {
          const text = this.eventText(message.data);
          if (text) onEvent?.({ message: text });
        }
      }
      return 'ended';
    } catch (err) {
      if (signal.aborted) return 'aborted';
      if (err instanceof ApiError) throw err;
      throw mapNetworkError(err, this.baseUrl, this.options.requestTimeoutMs);
    }
  }

  private eventText(data: string): string | undefined {
    try {
      return SseEventData.parse(JSON.parse(data)).msg;
    } catch {
      this.options.logger.debug('ignoring unparseable SSE event');
      return undefined;
    }
  }

  private get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    return this.request('GET', path, schema);
  }

  private async request<S extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch (err) {
      throw mapNetworkError(err, this.baseUrl, this.options.requestTimeoutMs);
    }
    if (!res.ok) throw await this.httpError(res, path);

    const parsed = schema.safeParse(await res.json().catch(() => undefined));
    if (!parsed.success) {
      this.options.logger.error('response failed schema parse', { path, issues: parsed.error.issues });
      const issue = parsed.error.issues[0];
      throw new ApiError(
        'invalid_response',
        `Unexpected response from DevDigest API for ${method} ${path} (${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}). The API and the MCP server may be out of sync; update both.`,
      );
    }
    return parsed.data;
  }

  private async httpError(res: Response, path: string): Promise<ApiError> {
    const raw = await res.json().catch(() => undefined);
    const body = ErrorBody.safeParse(raw);
    let message: string | undefined;
    if (body.success) {
      const e = body.data.error;
      message = typeof e === 'string' ? e : (e?.message ?? body.data.message);
    }
    return mapHttpError(res.status, message, path);
  }
}
