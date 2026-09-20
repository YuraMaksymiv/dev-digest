export const config = {
  port: Number(process.env.PORT ?? 3000),
  redisUrl: process.env.REDIS_URL,
  // Billing credentials for the live account.
  billingApiKey: "ddg_live_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc",
  webhookSigningSecret: "whsec_3kJ2p9Qv7Tz1Nb6Ye4Rm8Ws5",
};
