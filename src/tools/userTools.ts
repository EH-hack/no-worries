import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getState, saveState } from "../store";

// ─── Tool definitions ────────────────────────────────────────────────────────

export const registerUserDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "register_user",
    description:
      "Register or update a user's profile. Use when someone shares their wallet address, display name, or location. Can update one or more fields at a time.",
    parameters: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "Luffa UID of the user",
        },
        display_name: {
          type: "string",
          description: "User's display name or nickname",
        },
        wallet_address: {
          type: "string",
          description: "User's Endless wallet address (Base58 format)",
        },
        location: {
          type: "string",
          description: "User's physical location or area (e.g. 'Shoreditch', 'East London')",
        },
      },
      required: ["uid"],
    },
  },
};

export const lookupUserDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "lookup_user",
    description:
      "Look up a user's stored profile (wallet address, display name, location). Use when you need someone's wallet address for a transfer or want to check their info.",
    parameters: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          description: "Luffa UID of the user to look up",
        },
      },
      required: ["uid"],
    },
  },
};

export const listUsersDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "list_users",
    description:
      "List all registered users and their profiles. Use when someone asks who's registered, where everyone lives, or wants a group overview.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

// ─── Tool implementations ────────────────────────────────────────────────────

export async function registerUser(args: {
  uid: string;
  display_name?: string;
  wallet_address?: string;
  location?: string;
}): Promise<string> {
  const state = getState();
  const existing = state.users[args.uid];

  const profile = existing ?? {
    uid: args.uid,
    registeredAt: new Date().toISOString(),
  };

  if (args.display_name) profile.displayName = args.display_name;
  if (args.wallet_address) profile.walletAddress = args.wallet_address;
  if (args.location) profile.location = args.location;

  state.users[args.uid] = profile;
  await saveState();

  console.log(`Registered user ${args.uid}:`, JSON.stringify(profile));

  return JSON.stringify({
    success: true,
    profile,
  });
}

export async function lookupUser(args: { uid: string }): Promise<string> {
  const state = getState();
  const profile = state.users[args.uid];

  if (!profile) {
    return JSON.stringify({
      found: false,
      uid: args.uid,
      message: "User not registered yet. Ask them to share their wallet address and location.",
    });
  }

  return JSON.stringify({
    found: true,
    profile,
  });
}

export async function listUsers(): Promise<string> {
  const state = getState();
  const users = Object.values(state.users);

  if (users.length === 0) {
    return JSON.stringify({
      count: 0,
      message: "No users registered yet.",
    });
  }

  return JSON.stringify({
    count: users.length,
    users,
  });
}
