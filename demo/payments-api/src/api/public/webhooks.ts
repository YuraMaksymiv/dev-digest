import type { Req, Res } from "../../_platform";
import { db } from "../../_platform";

/** Forward an incoming event to the caller-supplied callback for this account. */
export async function webhookHandler(req: Req, res: Res) {
  const target = req.body.callback_url;
  const account = await db.accounts.find(req.accountId);
  const token = account.apiToken;

  await fetch(target, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });

  return res.status(202).end();
}
