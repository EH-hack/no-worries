import { getState, saveState } from "../store";
import { ensureGroup, Bill } from "../billing/types";
import { splitEqual, splitPerItem, billTotal, recalculateGroupDebts } from "../billing/engine";
import crypto from "crypto";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ─── Tool definitions (JSON Schema) ────────────────────────────────────────

export const createBillDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "create_bill",
    description: "Start a new bill for the group. Returns the bill ID.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "The group chat ID" },
        description: { type: "string", description: "What the bill is for" },
        paidBy: { type: "string", description: "UID of the person who paid" },
      },
      required: ["groupId", "description", "paidBy"],
    },
  },
};

export const addItemsDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "add_items",
    description: "Add line items to an existing bill. Price is in cents (e.g. $12.50 = 1250).",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        billId: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              priceCents: { type: "number", description: "Price in cents" },
              quantity: { type: "number", description: "Defaults to 1" },
              assignedTo: {
                type: "array",
                items: { type: "string" },
                description: "UIDs this item is for. Empty = all members.",
              },
            },
            required: ["name", "priceCents"],
          },
        },
      },
      required: ["groupId", "billId", "items"],
    },
  },
};

export const setTaxAndTipDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "set_tax_and_tip",
    description: "Set the tax and/or tip on a bill (in cents).",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        billId: { type: "string" },
        taxCents: { type: "number", description: "Tax in cents" },
        tipCents: { type: "number", description: "Tip in cents" },
      },
      required: ["groupId", "billId"],
    },
  },
};

export const splitBillDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "split_bill",
    description: "Calculate the split for a bill and finalize it. Returns each person's share.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        billId: { type: "string" },
        strategy: { type: "string", enum: ["equal", "per-item"], description: "Defaults to equal" },
        members: {
          type: "array",
          items: { type: "string" },
          description: "UIDs to split among. Defaults to all group members.",
        },
      },
      required: ["groupId", "billId"],
    },
  },
};

// ─── Tool implementations ──────────────────────────────────────────────────

export async function createBill(args: { groupId: string; description: string; paidBy: string }): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  if (!group.members.includes(args.paidBy)) {
    group.members.push(args.paidBy);
  }

  const bill: Bill = {
    id: crypto.randomUUID().slice(0, 8),
    description: args.description,
    paidBy: args.paidBy,
    items: [],
    taxCents: 0,
    tipCents: 0,
    splitStrategy: "equal",
    splits: {},
    createdAt: new Date().toISOString(),
    finalized: false,
  };

  group.bills.push(bill);
  await saveState();
  return JSON.stringify({ billId: bill.id, description: args.description, paidBy: args.paidBy });
}

export async function addItems(args: {
  groupId: string;
  billId: string;
  items: Array<{ name: string; priceCents: number; quantity?: number; assignedTo?: string[] }>;
}): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);
  const bill = group.bills.find((b) => b.id === args.billId);
  if (!bill) return JSON.stringify({ error: "Bill not found" });
  if (bill.finalized) return JSON.stringify({ error: "Bill already finalized" });

  for (const item of args.items) {
    for (const uid of item.assignedTo ?? []) {
      if (!group.members.includes(uid)) group.members.push(uid);
    }
    bill.items.push({
      name: item.name,
      priceCents: item.priceCents,
      quantity: item.quantity ?? 1,
      assignedTo: item.assignedTo ?? [],
    });
  }

  await saveState();
  return JSON.stringify({
    billId: args.billId,
    itemCount: bill.items.length,
    items: bill.items.map((i) => ({ name: i.name, price: `$${(i.priceCents / 100).toFixed(2)}`, qty: i.quantity })),
  });
}

export async function setTaxAndTip(args: {
  groupId: string;
  billId: string;
  taxCents?: number;
  tipCents?: number;
}): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);
  const bill = group.bills.find((b) => b.id === args.billId);
  if (!bill) return JSON.stringify({ error: "Bill not found" });
  if (bill.finalized) return JSON.stringify({ error: "Bill already finalized" });

  bill.taxCents = args.taxCents ?? 0;
  bill.tipCents = args.tipCents ?? 0;
  await saveState();
  return JSON.stringify({
    billId: args.billId,
    tax: `$${(bill.taxCents / 100).toFixed(2)}`,
    tip: `$${(bill.tipCents / 100).toFixed(2)}`,
    total: `$${(billTotal(bill) / 100).toFixed(2)}`,
  });
}

export async function splitBillFn(args: {
  groupId: string;
  billId: string;
  strategy?: string;
  members?: string[];
}): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);
  const bill = group.bills.find((b) => b.id === args.billId);
  if (!bill) return JSON.stringify({ error: "Bill not found" });
  if (bill.items.length === 0) return JSON.stringify({ error: "Bill has no items" });

  const members = args.members && args.members.length > 0 ? args.members : group.members;
  if (members.length === 0) return JSON.stringify({ error: "No members to split among" });

  for (const uid of members) {
    if (!group.members.includes(uid)) group.members.push(uid);
  }

  const strategy = (args.strategy === "per-item" ? "per-item" : "equal") as "equal" | "per-item";
  bill.splitStrategy = strategy;
  bill.splits = strategy === "equal" ? splitEqual(bill, members) : splitPerItem(bill, members);
  bill.finalized = true;

  recalculateGroupDebts(group);
  await saveState();

  const total = billTotal(bill);
  const splitDisplay: Record<string, string> = {};
  for (const [uid, cents] of Object.entries(bill.splits)) {
    splitDisplay[uid] = `$${(cents / 100).toFixed(2)}`;
  }

  return JSON.stringify({
    billId: args.billId,
    description: bill.description,
    total: `$${(total / 100).toFixed(2)}`,
    strategy,
    paidBy: bill.paidBy,
    splits: splitDisplay,
  });
}
