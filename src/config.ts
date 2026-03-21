import "dotenv/config";

export const SECRET = process.env.LUFFA_SECRET ?? "";
export const CHATGPT_API_KEY = process.env.CHATGPT_API_KEY ?? "";
export const PORT = process.env.PORT ?? 3000;
export const POLL_INTERVAL_MS = 1000;
export const BASE_URL = "https://apibot.luffa.im/robot";
export const MAX_HISTORY = 20;
export const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
export const TFL_API_KEY = process.env.TFL_API_KEY ?? "";
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? "";

// ─── AI Provider Configuration ────────────────────────────────────────────────
export const AI_PROVIDER = process.env.AI_PROVIDER ?? "openrouter"; // "openai" or "openrouter"
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
export const AI_MODEL = process.env.AI_MODEL ?? "deepseek/deepseek-chat"; // Default to DeepSeek V3

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
