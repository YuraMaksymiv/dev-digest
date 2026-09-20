import type { Req, Res } from "../_platform";
import { db } from "../_platform";

export async function listUsers(_req: Req, res: Res) {
  const users = await db.users.all();
  const out = [];
  for (const user of users) {
    const orders = await db.orders.byUser(user.id);
    out.push({ ...user, orders, orderTotal: orders.reduce((n, o) => n + o.total, 0) });
  }
  res.json(out);
}
