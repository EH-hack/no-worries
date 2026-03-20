import {
  Endless,
  EndlessConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@endlesslab/endless-ts-sdk";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ─── Endless config ──────────────────────────────────────────────────────────
const MASTER_PRIVATE_KEY = process.env.ENDLESS_MASTER_KEY ?? "";
if (!MASTER_PRIVATE_KEY) {
  console.warn("ENDLESS_MASTER_KEY not set — crypto payments will be unavailable");
}

const EDS_DECIMALS = 8;
const EXPLORER_URL = "https://scan.endless.link/account";

let endless: Endless;
let masterAccount: Account;

function getEndless(): Endless {
  if (!endless) {
    const config = new EndlessConfig({
      network: Network.TESTNET,
    });
    endless = new Endless(config);
  }
  return endless;
}

function getMasterAccount(): Account {
  if (!masterAccount) {
    const privateKey = new Ed25519PrivateKey(MASTER_PRIVATE_KEY);
    masterAccount = Account.fromPrivateKey({ privateKey });
    console.log(`Master wallet: ${masterAccount.accountAddress.toString()}`);
  }
  return masterAccount;
}

// ─── User wallet store (in-memory, keyed by Luffa UID) ──────────────────────
interface UserWallet {
  uid: string;
  account: Account;
  address: string;
}

const userWallets = new Map<string, UserWallet>();

function getOrCreateWallet(uid: string): UserWallet {
  if (userWallets.has(uid)) return userWallets.get(uid)!;

  const account = Account.generate();
  const wallet: UserWallet = {
    uid,
    account,
    address: account.accountAddress.toString(),
  };
  userWallets.set(uid, wallet);
  console.log(`Created wallet for ${uid}: ${wallet.address}`);
  return wallet;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

export const sendCryptoDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "send_crypto",
    description:
      "Send EDS tokens to another group member on the Endless testnet. Use when someone says 'send @user 5' or 'pay @user 2 EDS'.",
    parameters: {
      type: "object",
      properties: {
        from_uid: {
          type: "string",
          description: "Luffa UID of the sender (the person requesting the transfer)",
        },
        to_uid: {
          type: "string",
          description: "Luffa UID of the recipient",
        },
        amount: {
          type: "number",
          description: "Amount of EDS to send (e.g. 0.5 for 0.5 EDS)",
        },
      },
      required: ["from_uid", "to_uid", "amount"],
    },
  },
};

export const checkBalanceDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "check_crypto_balance",
    description:
      "Check a user's EDS balance on the Endless testnet. Use when someone asks about their crypto balance or wallet.",
    parameters: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "Luffa UID of the user to check balance for",
        },
      },
      required: ["uid"],
    },
  },
};

export const fundUserDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "fund_user",
    description:
      "Fund a user's wallet with EDS from the bot's master wallet. Use when a new user needs testnet tokens to start sending payments.",
    parameters: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "Luffa UID of the user to fund",
        },
        amount: {
          type: "number",
          description: "Amount of EDS to send (default 1)",
        },
      },
      required: ["uid"],
    },
  },
};

export const getWalletAddressDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_wallet_address",
    description:
      "Get or create a user's Endless wallet address. Use when someone asks for their wallet address.",
    parameters: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "Luffa UID of the user",
        },
      },
      required: ["uid"],
    },
  },
};

// ─── Tool implementations ────────────────────────────────────────────────────

// Ensure a wallet is funded with enough EDS for gas + the transfer amount
async function ensureFunded(wallet: UserWallet, needAmount: number): Promise<void> {
  const e = getEndless();
  const master = getMasterAccount();

  let currentBalance = 0;
  try {
    currentBalance = Number(await e.getAccountEDSAmount({
      accountAddress: wallet.account.accountAddress,
    })) / 10 ** EDS_DECIMALS;
  } catch {
    // Account doesn't exist on-chain yet — needs funding
  }

  // Fund if balance is less than what's needed (amount + 0.1 EDS for gas)
  const needed = needAmount + 0.1;
  if (currentBalance < needed) {
    const fundAmount = Math.max(needed - currentBalance, 0.5); // fund at least 0.5 EDS
    const fundSmallest = Math.round(fundAmount * 10 ** EDS_DECIMALS);
    console.log(`Auto-funding ${wallet.uid}: ${fundAmount} EDS (current: ${currentBalance}, need: ${needed})`);

    const tx = await e.transferEDS({
      sender: master,
      recipient: wallet.account.accountAddress,
      amount: fundSmallest,
    });
    const pending = await e.signAndSubmitTransaction({ signer: master, transaction: tx });
    await e.waitForTransaction({ transactionHash: pending.hash });
    console.log(`Auto-funded ${wallet.uid} with ${fundAmount} EDS`);
  }
}

export async function sendCrypto(args: {
  from_uid: string;
  to_uid: string;
  amount: number;
}): Promise<string> {
  if (!MASTER_PRIVATE_KEY) {
    return JSON.stringify({ error: "Crypto payments not configured" });
  }

  try {
    const e = getEndless();
    const fromWallet = getOrCreateWallet(args.from_uid);
    const toWallet = getOrCreateWallet(args.to_uid);
    const amountSmallest = Math.round(args.amount * 10 ** EDS_DECIMALS);

    // Auto-fund sender if they don't have enough
    await ensureFunded(fromWallet, args.amount);
    // Ensure receiver account exists on-chain (needs some EDS)
    await ensureFunded(toWallet, 0);

    const transaction = await e.transferEDS({
      sender: fromWallet.account,
      recipient: toWallet.account.accountAddress,
      amount: amountSmallest,
    });

    const pending = await e.signAndSubmitTransaction({
      signer: fromWallet.account,
      transaction,
    });

    await e.waitForTransaction({ transactionHash: pending.hash });

    return JSON.stringify({
      success: true,
      from: args.from_uid,
      to: args.to_uid,
      amount: args.amount,
      currency: "EDS",
      txHash: pending.hash,
      explorerUrl: `${EXPLORER_URL}/${fromWallet.address}?network=testnet`,
    });
  } catch (err) {
    console.error("Send crypto error:", err instanceof Error ? err.message : err);
    return JSON.stringify({
      error: `Transfer failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}

export async function checkCryptoBalance(args: { uid: string }): Promise<string> {
  if (!MASTER_PRIVATE_KEY) {
    return JSON.stringify({ error: "Crypto payments not configured" });
  }

  try {
    const e = getEndless();
    const wallet = getOrCreateWallet(args.uid);

    let edsBalance = 0;
    try {
      edsBalance = Number(await e.getAccountEDSAmount({
        accountAddress: wallet.account.accountAddress,
      })) / 10 ** EDS_DECIMALS;
    } catch {
      // Account may not exist on-chain yet
    }

    return JSON.stringify({
      uid: args.uid,
      address: wallet.address,
      eds: edsBalance,
    });
  } catch (err) {
    console.error("Check balance error:", err instanceof Error ? err.message : err);
    return JSON.stringify({ error: `Balance check failed: ${err instanceof Error ? err.message : "unknown error"}` });
  }
}

export async function fundUser(args: { uid: string; amount?: number }): Promise<string> {
  if (!MASTER_PRIVATE_KEY) {
    return JSON.stringify({ error: "Crypto payments not configured" });
  }

  try {
    const e = getEndless();
    const master = getMasterAccount();
    const userWallet = getOrCreateWallet(args.uid);
    const amount = args.amount ?? 1;
    const amountSmallest = Math.round(amount * 10 ** EDS_DECIMALS);

    const transaction = await e.transferEDS({
      sender: master,
      recipient: userWallet.account.accountAddress,
      amount: amountSmallest,
    });

    const pending = await e.signAndSubmitTransaction({
      signer: master,
      transaction,
    });

    await e.waitForTransaction({ transactionHash: pending.hash });

    return JSON.stringify({
      success: true,
      uid: args.uid,
      funded: amount,
      currency: "EDS",
      address: userWallet.address,
      txHash: pending.hash,
      explorerUrl: `${EXPLORER_URL}/${userWallet.address}?network=testnet`,
    });
  } catch (err) {
    console.error("Fund user error:", err instanceof Error ? err.message : err);
    return JSON.stringify({
      error: `Funding failed: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}

export async function getWalletAddress(args: { uid: string }): Promise<string> {
  const wallet = getOrCreateWallet(args.uid);
  return JSON.stringify({
    uid: args.uid,
    address: wallet.address,
    network: "Endless Testnet",
  });
}
