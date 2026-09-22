import type { Req, Res, Next } from "../_platform";
import { redis } from "../_platform";

function bucketKey(req: Req): string {
  return `rl:${req.ip}:${req.path}`;
}

function limitFor(req: Req): number {
  return req.accountId ? 1000 : 60;
}

export async function rateLimit(req: Req, res: Res, next: Next) {
  const key = bucketKey(req);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);

  if (count > limitFor(req)) {
    return res.status(429).end();
  }
  return next();
}
