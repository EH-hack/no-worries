import {
  Endless,
  EndlessConfig,
  Network,
  Account,
  Ed25519PrivateKey,
  AccountAddress,
} from "@endlesslab/endless-ts-sdk";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ─── Endless config ──────────────────────────────────────────────────────────
const MASTER_PRIVATE_KEY = process.env.ENDLESS_MASTER_KEY ?? "";
if (!MASTER_PRIVATE_KEY) {
  console.warn("ENDLESS_MASTER_KEY not set — crypto payments will be unavailable");
}

const USDT_ADDRESS = "USDH437BQjeVRzACuLiJQ6Bc9WaBSe1tWxcaNtJoa1s";
const USDT_DECIMALS = 6;
const EXPLORER_BASE = "https://explorer.endless.link/txn";

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
      "Send USDT tokens to another group member on the Endless testnet. Use when someone says 'send @user 5' or 'pay @user 10 USDT'.",
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
          description: "Amount of USDT to send (e.g. 5 for 5 USDT)",
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
      "Check a user's USDT and EDS balance on the Endless testnet. Use when someone asks about their crypto balance or wallet.",
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
      "Fund a user's wallet with USDT from the bot's master wallet. Use when a new user needs testnet tokens to start sending payments.",
    parameters: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "Luffa UID of the user to fund",
        },
        amount: {
          type: "number",
          description: "Amount of USDT to send (default 10)",
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
    const amountSmallest = Math.round(args.amount * 10 ** USDT_DECIMALS);

    const usdtMetadata = AccountAddress.fromBs58String(USDT_ADDRESS);

    const transaction = await e.transferFungibleAsset({
      sender: fromWallet.account,
      fungibleAssetMetadataAddress: usdtMetadata,
      recipient: toWallet.account.accountAddress,
      amount: amountSmallest,
    });

    const pending = await e.signAndSubmitTransaction({
      signer: fromWallet.account,
      transaction,
    });

    const result = await e.waitForTransaction({ transactionHash: pending.hash });

    return JSON.stringify({
      success: true,
      from: args.from_uid,
      to: args.to_uid,
      amount: args.amount,
      currency: "USDT",
      txHash: pending.hash,
      explorerUrl: `${EXPLORER_BASE}/${pending.hash}?network=testnet`,
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
    const usdtMetadata = AccountAddress.fromBs58String(USDT_ADDRESS);

    let usdtBalance = 0;
    let edsBalance = 0;

    try {
      const usdtRaw = await e.getAccountCoinAmount({
        accountAddress: wallet.account.accountAddress,
        coinId: usdtMetadata.toString(),
      });
      usdtBalance = Number(usdtRaw) / 10 ** USDT_DECIMALS;
    } catch {
      // Account may not exist on-chain yet
    }

    try {
      edsBalance = Number(await e.getAccountEDSAmount({
        accountAddress: wallet.account.accountAddress,
      })) / 10 ** 8;
    } catch {
      // Account may not exist on-chain yet
    }

    return JSON.stringify({
      uid: args.uid,
      address: wallet.address,
      usdt: usdtBalance,
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
    const amount = args.amount ?? 10;
    const amountSmallest = Math.round(amount * 10 ** USDT_DECIMALS);
    const usdtMetadata = AccountAddress.fromBs58String(USDT_ADDRESS);

    // First send some EDS for gas
    try {
      const edsTx = await e.transferEDS({
        sender: master,
        recipient: userWallet.account.accountAddress,
        amount: 10000000, // 0.1 EDS for gas
      });
      const edsPending = await e.signAndSubmitTransaction({ signer: master, transaction: edsTx });
      await e.waitForTransaction({ transactionHash: edsPending.hash });
      console.log(`Funded ${args.uid} with 0.1 EDS for gas`);
    } catch (err) {
      console.error("EDS funding error:", err instanceof Error ? err.message : err);
    }

    // Then send USDT
    const transaction = await e.transferFungibleAsset({
      sender: master,
      fungibleAssetMetadataAddress: usdtMetadata,
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
      currency: "USDT",
      address: userWallet.address,
      txHash: pending.hash,
      explorerUrl: `${EXPLORER_BASE}/${pending.hash}?network=testnet`,
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
