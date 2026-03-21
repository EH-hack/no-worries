import "dotenv/config";

export const SECRET = process.env.LUFFA_SECRET ?? "";
export const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY ?? "";
export const PORT = process.env.PORT ?? 3000;
export const POLL_INTERVAL_MS = 1000;
export const BASE_URL = "https://apibot.luffa.im/robot";
export const MAX_HISTORY = 20;
export const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

if (!SECRET) {
  console.error("LUFFA_SECRET env var is required");
  process.exit(1);
}

if (!CHATGPT_API_KEY) {
  console.error("CHATGPT_API_KEY env var is required");
  process.exit(1);
}

// Log master wallet on startup
if (process.env.ENDLESS_MASTER_KEY) {
  try {
    const { Account, Ed25519PrivateKey } = require("@endlesslab/endless-ts-sdk");
    const pk = new Ed25519PrivateKey(process.env.ENDLESS_MASTER_KEY);
    const acct = Account.fromPrivateKey({ privateKey: pk });
    console.log(`Master wallet address: ${acct.accountAddress.toBs58String?.() ?? acct.accountAddress.toString()}`);
  } catch { /* ignore */ }
}
