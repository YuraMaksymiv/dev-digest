/* Minimal stand-ins for the service's runtime, so the sample files below read
   as ordinary application code. */

export interface Req {
  accountId: string;
  ip: string;
  path: string;
  body: Record<string, any>;
  headers: Record<string, string>;
}

export interface Res {
  status(code: number): Res;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

export type Next = () => void;

export declare const db: {
  accounts: { find(id: string): Promise<{ id: string; plan: string; apiToken: string }> };
  users: { all(): Promise<{ id: string; email: string }[]> };
  orders: { byUser(userId: string): Promise<{ id: string; total: number }[]> };
};

export declare const redis: {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
};
